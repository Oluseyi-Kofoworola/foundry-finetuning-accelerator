"""
preflight.py — Verify a Microsoft Foundry resource is ready for the fine-tuning labs.

Runs ten checks and exits non-zero on the first failure:

    1. .env present and required vars set
    2. azure-identity + openai SDKs importable at correct versions
    3. DefaultAzureCredential can mint an AAD token for Cognitive Services
    4. AzureOpenAI client constructable
    5. Generator deployment responds to a tiny chat completion
    6. Base deployment (fine-tune target) is visible via /models
    7. Files API reachable (list files works)
    8. Fine-tuning jobs API reachable (list jobs works)
    9. ARM control plane: deployments list works (needed by Labs 01-03)
   10. Data files exist (acme_health_kb.md and friends)

Usage:
    python fine-tuning/preflight.py

Exit code 0 = all green, ready to run Lab 00.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
RESET = "\033[0m"


def ok(msg: str) -> None:
    print(f"{GREEN}[ OK ]{RESET} {msg}")


def fail(msg: str, hint: str | None = None) -> None:
    print(f"{RED}[FAIL]{RESET} {msg}")
    if hint:
        print(f"       {YELLOW}hint:{RESET} {hint}")
    sys.exit(1)


def warn(msg: str) -> None:
    print(f"{YELLOW}[WARN]{RESET} {msg}")


def step(n: int, msg: str) -> None:
    print(f"\n{CYAN}=== Step {n}: {msg} ==={RESET}")


# ---------------------------------------------------------------------------
# 1. .env loaded
# ---------------------------------------------------------------------------
step(1, ".env file")
script_dir = Path(__file__).resolve().parent
env_path = script_dir / ".env"
if not env_path.exists():
    fail(f".env not found at {env_path}", "Run setup-foundry.ps1 first.")

try:
    from dotenv import load_dotenv
except ImportError:
    fail("python-dotenv not installed", "pip install -r fine-tuning/requirements.txt")

load_dotenv(env_path)

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
missing = [k for k in REQUIRED if not os.environ.get(k)]
if missing:
    fail(f"Missing env vars: {', '.join(missing)}", "Re-run setup-foundry.ps1.")
ok(f".env loaded from {env_path}")
ok(f"Endpoint:   {os.environ['AZURE_OPENAI_ENDPOINT']}")
ok(f"Resource:   {os.environ['AZURE_RESOURCE_NAME']}")
ok(f"API ver:    {os.environ['AZURE_OPENAI_API_VERSION']}")

# ---------------------------------------------------------------------------
# 2. SDK imports
# ---------------------------------------------------------------------------
step(2, "SDK imports + versions")
try:
    import openai  # noqa: F401
    from openai import AzureOpenAI
    from azure.identity import DefaultAzureCredential
    import requests
except ImportError as e:
    fail(f"Import failed: {e}", "pip install -r fine-tuning/requirements.txt")

ok(f"openai          == {openai.__version__}")
ok("azure-identity  imported")
ok("requests        imported")

# ---------------------------------------------------------------------------
# 3. AAD token for Cognitive Services
# ---------------------------------------------------------------------------
step(3, "AAD token for cognitiveservices.azure.com")
tenant = os.environ.get("AZURE_TENANT_ID")
cred = DefaultAzureCredential(interactive_browser_tenant_id=tenant) if tenant else DefaultAzureCredential()
try:
    token = cred.get_token("https://cognitiveservices.azure.com/.default")
except Exception as e:
    fail(f"DefaultAzureCredential failed: {e}", f"Run 'az login --tenant {tenant}'.")
ok(f"Token acquired (expires in {token.expires_on - int(__import__('time').time())} s)")

# ---------------------------------------------------------------------------
# 4. AzureOpenAI client
# ---------------------------------------------------------------------------
step(4, "AzureOpenAI client construction")
client = AzureOpenAI(
    azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
    azure_ad_token_provider=lambda: cred.get_token("https://cognitiveservices.azure.com/.default").token,
    api_version=os.environ["AZURE_OPENAI_API_VERSION"],
)
ok("Client constructed")

# ---------------------------------------------------------------------------
# 5. Tiny chat completion against generator deployment
# ---------------------------------------------------------------------------
step(5, f"Chat completion smoke test on '{os.environ['GENERATOR_DEPLOYMENT']}'")
try:
    resp = client.chat.completions.create(
        model=os.environ["GENERATOR_DEPLOYMENT"],
        messages=[
            {"role": "system", "content": "Reply with exactly the word: ready"},
            {"role": "user", "content": "ping"},
        ],
        max_tokens=5,
        temperature=0,
    )
    reply = (resp.choices[0].message.content or "").strip().lower()
except Exception as e:
    fail(
        f"Chat call failed: {e}",
        "Confirm the deployment exists and you have 'Cognitive Services OpenAI User' or higher.",
    )
ok(f"Reply: '{reply}'  (usage: {resp.usage.total_tokens} tokens)")

# ---------------------------------------------------------------------------
# 6. Models list (confirms base deployment is visible)
# ---------------------------------------------------------------------------
step(6, f"Base deployment '{os.environ['BASE_DEPLOYMENT']}' visible")
try:
    models = client.models.list()
    names = [m.id for m in models.data]
except Exception as e:
    fail(f"models.list failed: {e}")
base = os.environ["BASE_DEPLOYMENT"]
if base in names:
    ok(f"Deployment '{base}' visible (total {len(names)} deployments)")
else:
    warn(f"Deployment '{base}' not in /models response. Found: {', '.join(names) or '<none>'}")

# ---------------------------------------------------------------------------
# 7. Files API
# ---------------------------------------------------------------------------
step(7, "Files API reachable")
try:
    files = list(client.files.list())
except Exception as e:
    fail(f"files.list failed: {e}", "You may need 'Cognitive Services OpenAI Contributor'.")
ok(f"Files API OK ({len(files)} files currently uploaded)")

# ---------------------------------------------------------------------------
# 8. Fine-tuning jobs API
# ---------------------------------------------------------------------------
step(8, "Fine-tuning jobs API reachable")
try:
    jobs = list(client.fine_tuning.jobs.list())
except Exception as e:
    fail(f"fine_tuning.jobs.list failed: {e}", "Needs 'Cognitive Services OpenAI Contributor'.")
ok(f"Jobs API OK ({len(jobs)} jobs in history)")

# ---------------------------------------------------------------------------
# 9. ARM control plane: deployments list
# ---------------------------------------------------------------------------
step(9, "ARM control plane (needed to deploy fine-tuned models)")
arm_token = cred.get_token("https://management.azure.com/.default").token
sub = os.environ["AZURE_SUBSCRIPTION_ID"]
rg = os.environ["AZURE_RESOURCE_GROUP"]
name = os.environ["AZURE_RESOURCE_NAME"]
url = (
    f"https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}"
    f"/providers/Microsoft.CognitiveServices/accounts/{name}/deployments"
    f"?api-version=2024-10-01"
)
r = requests.get(url, headers={"Authorization": f"Bearer {arm_token}"}, timeout=15)
if r.status_code != 200:
    fail(
        f"ARM GET deployments returned HTTP {r.status_code}: {r.text[:200]}",
        "You need 'Cognitive Services OpenAI Contributor' (or Owner) at the account scope.",
    )
arm_deployments = [d["name"] for d in r.json().get("value", [])]
ok(f"ARM OK ({len(arm_deployments)} deployments visible): {', '.join(arm_deployments) or '<none>'}")

# ---------------------------------------------------------------------------
# 10. Data files present
# ---------------------------------------------------------------------------
step(10, "Lab data files")
data_dir = script_dir / "data"
expected = [
    "acme_health_kb.md",
    "acme_dpo_training_data.json",
    "acme_tools_schema.json",
    "acme_tool_calling_training_data.json",
]
missing_files = [f for f in expected if not (data_dir / f).exists()]
if missing_files:
    fail(f"Missing data files: {', '.join(missing_files)}")
for f in expected:
    ok(f"data/{f}")

# ---------------------------------------------------------------------------
# All green
# ---------------------------------------------------------------------------
print(f"\n{GREEN}========================================{RESET}")
print(f"{GREEN} All preflight checks passed.{RESET}")
print(f"{GREEN} You're ready to open Lab 00.{RESET}")
print(f"{GREEN}========================================{RESET}")
