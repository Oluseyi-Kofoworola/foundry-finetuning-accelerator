"""
preflight.py — Verify a Microsoft Foundry resource is ready for the fine-tuning labs.

Runs all ten checks and reports a single summary. A check that cannot run because
an earlier one failed is reported as SKIP with the reason, so one broken thing
never hides the rest.

    1. .env present and required vars set
    2. azure-identity + openai SDKs importable
    3. Azure CLI credential can mint a token for Cognitive Services
    4. AzureOpenAI client constructable
    5. Generator deployment responds to a tiny chat completion
    6. Base deployment (fine-tune target) is visible via /models
    7. Files API reachable
    8. Fine-tuning jobs API reachable
    9. ARM control plane: deployments list works (needed by Labs 01-03)
   10. Lab data files present

Usage:
    python fine-tuning/preflight.py
    python fine-tuning/preflight.py --json     # machine-readable, for automation

Exit code 0 = ready to run Lab 00. Warnings do not fail the run.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path

GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
GREY = "\033[90m"
RESET = "\033[0m"

OK, WARN, FAIL, SKIP = "ok", "warn", "fail", "skip"


@dataclass
class Check:
    number: int
    name: str
    status: str = SKIP
    detail: str = ""
    remediation: str = ""
    facts: dict = field(default_factory=dict)


class Preflight:
    def __init__(self) -> None:
        self.checks: list[Check] = []
        self.ctx: dict = {}

    def record(self, number, name, status, detail="", remediation="", **facts) -> Check:
        check = Check(number, name, status, detail, remediation, facts)
        self.checks.append(check)
        return check

    def skip(self, number, name, because) -> Check:
        return self.record(number, name, SKIP, f"requires: {because}")

    @property
    def failed(self) -> list[Check]:
        return [c for c in self.checks if c.status == FAIL]

    @property
    def ready(self) -> bool:
        return not self.failed and not [c for c in self.checks if c.status == SKIP]


pf = Preflight()
script_dir = Path(__file__).resolve().parent

# --- 1. .env ---------------------------------------------------------------
REQUIRED = [
    "AZURE_OPENAI_ENDPOINT",
    "AZURE_OPENAI_API_VERSION",
    "BASE_DEPLOYMENT",
    "GENERATOR_DEPLOYMENT",
    "AZURE_SUBSCRIPTION_ID",
    "AZURE_RESOURCE_GROUP",
    "AZURE_RESOURCE_NAME",
    "AZURE_TENANT_ID",
]
env_path = script_dir / ".env"
if not env_path.exists():
    pf.record(1, "environment file", FAIL, f".env not found at {env_path}",
              "Copy fine-tuning/.env.example to fine-tuning/.env and fill it in.")
else:
    try:
        from dotenv import load_dotenv

        load_dotenv(env_path)
        missing = [k for k in REQUIRED if not os.environ.get(k)]
        if missing:
            pf.record(1, "environment file", FAIL,
                      f"missing: {', '.join(missing)}",
                      "Set these in fine-tuning/.env (see .env.example).")
        else:
            pf.record(1, "environment file", OK,
                      f"{len(REQUIRED)} required vars set",
                      endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
                      resource=os.environ["AZURE_RESOURCE_NAME"],
                      api_version=os.environ["AZURE_OPENAI_API_VERSION"])
            pf.ctx["env"] = True
    except ImportError:
        pf.record(1, "environment file", FAIL, "python-dotenv not installed",
                  "pip install -r fine-tuning/requirements.txt")

# --- 2. SDK imports --------------------------------------------------------
try:
    import openai
    import requests
    from azure.identity import AzureCliCredential, get_bearer_token_provider
    from openai import AzureOpenAI

    pf.record(2, "sdk imports", OK, f"openai {openai.__version__}",
              openai_version=openai.__version__)
    pf.ctx["sdk"] = True
except ImportError as exc:
    pf.record(2, "sdk imports", FAIL, str(exc),
              "pip install -r fine-tuning/requirements.txt")

# --- 3. Credential ---------------------------------------------------------
if not pf.ctx.get("env") or not pf.ctx.get("sdk"):
    pf.skip(3, "azure credential", "environment file and sdk imports")
else:
    tenant = os.environ["AZURE_TENANT_ID"]
    try:
        cred = AzureCliCredential(tenant_id=tenant)
        token = cred.get_token("https://cognitiveservices.azure.com/.default")
        pf.record(3, "azure credential", OK,
                  f"token acquired, expires in {token.expires_on - int(time.time())}s")
        pf.ctx["cred"] = cred
    except Exception as exc:  # noqa: BLE001 - report whatever auth raised
        pf.record(3, "azure credential", FAIL, str(exc),
                  f"Run: az login --tenant {tenant}")

# --- 4. Client -------------------------------------------------------------
if "cred" not in pf.ctx:
    pf.skip(4, "openai client", "azure credential")
else:
    try:
        client = AzureOpenAI(
            azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
            azure_ad_token_provider=get_bearer_token_provider(
                pf.ctx["cred"], "https://cognitiveservices.azure.com/.default"
            ),
            api_version=os.environ["AZURE_OPENAI_API_VERSION"],
        )
        pf.record(4, "openai client", OK, "constructed")
        pf.ctx["client"] = client
    except Exception as exc:  # noqa: BLE001
        pf.record(4, "openai client", FAIL, str(exc),
                  "Check AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_VERSION.")

# --- 5. Chat smoke test ----------------------------------------------------
if "client" not in pf.ctx:
    pf.skip(5, "chat completion", "openai client")
else:
    generator = os.environ["GENERATOR_DEPLOYMENT"]
    try:
        resp = pf.ctx["client"].chat.completions.create(
            model=generator,
            messages=[
                {"role": "system", "content": "Reply with exactly the word: ready"},
                {"role": "user", "content": "ping"},
            ],
            max_tokens=5,
            temperature=0,
        )
        reply = (resp.choices[0].message.content or "").strip().lower()
        pf.record(5, "chat completion", OK,
                  f"'{generator}' replied '{reply}' ({resp.usage.total_tokens} tokens)",
                  deployment=generator)
    except Exception as exc:  # noqa: BLE001
        pf.record(5, "chat completion", FAIL, f"'{generator}': {exc}",
                  "Confirm the deployment exists and you hold Cognitive Services OpenAI User or higher.")

# --- 6. Base deployment visible -------------------------------------------
if "client" not in pf.ctx:
    pf.skip(6, "base deployment", "openai client")
else:
    base = os.environ["BASE_DEPLOYMENT"]
    try:
        names = [m.id for m in pf.ctx["client"].models.list().data]
        if base in names:
            pf.record(6, "base deployment", OK,
                      f"'{base}' visible ({len(names)} total)", deployment=base)
        else:
            pf.record(6, "base deployment", WARN,
                      f"'{base}' not listed; found: {', '.join(names) or '<none>'}",
                      "Deploy a fine-tunable base model, or update BASE_DEPLOYMENT.")
    except Exception as exc:  # noqa: BLE001
        pf.record(6, "base deployment", FAIL, str(exc))

# --- 7. Files API ----------------------------------------------------------
if "client" not in pf.ctx:
    pf.skip(7, "files api", "openai client")
else:
    try:
        files = list(pf.ctx["client"].files.list())
        pf.record(7, "files api", OK, f"reachable ({len(files)} files uploaded)")
    except Exception as exc:  # noqa: BLE001
        pf.record(7, "files api", FAIL, str(exc),
                  "Needs Cognitive Services OpenAI Contributor.")

# --- 8. Fine-tuning jobs API ----------------------------------------------
if "client" not in pf.ctx:
    pf.skip(8, "fine-tuning api", "openai client")
else:
    try:
        jobs = list(pf.ctx["client"].fine_tuning.jobs.list())
        pf.record(8, "fine-tuning api", OK, f"reachable ({len(jobs)} jobs in history)")
    except Exception as exc:  # noqa: BLE001
        pf.record(8, "fine-tuning api", FAIL, str(exc),
                  "Needs Cognitive Services OpenAI Contributor.")

# --- 9. ARM control plane --------------------------------------------------
if "cred" not in pf.ctx:
    pf.skip(9, "arm control plane", "azure credential")
else:
    try:
        arm_token = pf.ctx["cred"].get_token("https://management.azure.com/.default").token
        url = (
            f"https://management.azure.com/subscriptions/{os.environ['AZURE_SUBSCRIPTION_ID']}"
            f"/resourceGroups/{os.environ['AZURE_RESOURCE_GROUP']}"
            f"/providers/Microsoft.CognitiveServices/accounts/{os.environ['AZURE_RESOURCE_NAME']}"
            f"/deployments?api-version=2024-10-01"
        )
        r = requests.get(url, headers={"Authorization": f"Bearer {arm_token}"}, timeout=15)
        if r.status_code == 200:
            deployments = [d["name"] for d in r.json().get("value", [])]
            pf.record(9, "arm control plane", OK,
                      f"{len(deployments)} deployments visible", deployments=deployments)
        else:
            pf.record(9, "arm control plane", FAIL,
                      f"HTTP {r.status_code}: {r.text[:160]}",
                      "Needs Cognitive Services Contributor (or Owner) at account scope.")
    except Exception as exc:  # noqa: BLE001
        pf.record(9, "arm control plane", FAIL, str(exc))

# --- 10. Data files --------------------------------------------------------
EXPECTED_DATA = [
    "acme_health_kb.md",
    "acme_dpo_training_data.json",
    "acme_tools_schema.json",
    "acme_tool_calling_training_data.json",
]
missing_files = [f for f in EXPECTED_DATA if not (script_dir / "data" / f).exists()]
if missing_files:
    pf.record(10, "lab data files", FAIL, f"missing: {', '.join(missing_files)}",
              "Run from a complete clone; see fine-tuning/README.md.")
else:
    pf.record(10, "lab data files", OK, f"all {len(EXPECTED_DATA)} present")


# --- report ----------------------------------------------------------------
def main() -> int:
    parser = argparse.ArgumentParser(description="Foundry lab preflight")
    parser.add_argument("--json", action="store_true", help="emit machine-readable output")
    args = parser.parse_args()

    counts = {s: sum(1 for c in pf.checks if c.status == s) for s in (OK, WARN, FAIL, SKIP)}
    ready = not pf.failed and counts[SKIP] == 0

    if args.json:
        print(json.dumps(
            {"ready": ready, "summary": counts, "checks": [asdict(c) for c in pf.checks]},
            indent=2,
        ))
        return 0 if ready else 1

    badge = {OK: f"{GREEN}[ OK ]{RESET}", WARN: f"{YELLOW}[WARN]{RESET}",
             FAIL: f"{RED}[FAIL]{RESET}", SKIP: f"{GREY}[SKIP]{RESET}"}
    print(f"\n{CYAN}=== Microsoft Foundry preflight ==={RESET}\n")
    for check in pf.checks:
        print(f"{badge[check.status]} {check.number:>2}. {check.name:<20} {check.detail}")
        if check.remediation:
            print(f"        {YELLOW}fix:{RESET} {check.remediation}")

    print(
        f"\n{counts[OK]} passed, {counts[WARN]} warning, "
        f"{counts[FAIL]} failed, {counts[SKIP]} skipped"
    )
    if ready:
        print(f"{GREEN}READY{RESET} - open Lab 00.")
    else:
        print(f"{RED}NOT READY{RESET} - resolve the items above, then re-run.")
    return 0 if ready else 1


if __name__ == "__main__":
    sys.exit(main())
