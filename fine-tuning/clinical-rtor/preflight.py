"""
preflight.py — Green-light check for the Return-to-OR (RTOR) clinical labs.

Mirrors fine-tuning/preflight.py but targets this track's data files. Hard-fails
on missing local prerequisites (data files, SDKs); Azure checks (endpoint,
az login, base-model reachability) are reported but advisory, since Labs 00's
data path runs fully offline.

Usage:
    python fine-tuning/clinical-rtor/preflight.py

Exit code 0 = local prerequisites OK. A non-zero exit means a hard prerequisite
(data files or SDKs) is missing.
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


def warn(msg: str) -> None:
    print(f"{YELLOW}[WARN]{RESET} {msg}")


def fail(msg: str, hint: str | None = None) -> None:
    print(f"{RED}[FAIL]{RESET} {msg}")
    if hint:
        print(f"       {YELLOW}hint:{RESET} {hint}")
    sys.exit(1)


def step(n: int, msg: str) -> None:
    print(f"\n{CYAN}=== Step {n}: {msg} ==={RESET}")


# Resolve fine-tuning/ regardless of where this is launched from.
here = Path(__file__).resolve().parent      # fine-tuning/clinical-rtor/
ft_dir = here.parent                        # fine-tuning/
data_dir = ft_dir / "data"

# ---------------------------------------------------------------------------
# 1. Local data files (hard requirement)
# ---------------------------------------------------------------------------
step(1, "RTOR data files")
needed = ["rtor_rules.md", "rtor_cases.jsonl", "rtor_tools_schema.json"]
missing = [f for f in needed if not (data_dir / f).exists()]
if missing:
    fail(f"Missing data files: {', '.join(missing)}", "These ship with the repo under fine-tuning/data/.")
import json

cases = [
    json.loads(l)
    for l in (data_dir / "rtor_cases.jsonl").read_text(encoding="utf-8").splitlines()
    if l.strip()
]
pos = sum(1 for c in cases if c.get("is_return_to_or"))
for f in needed:
    ok(f"data/{f}")
ok(f"{len(cases)} labeled cases (RTOR-true: {pos}, RTOR-false: {len(cases) - pos})")

# ---------------------------------------------------------------------------
# 2. SDK imports (hard requirement)
# ---------------------------------------------------------------------------
step(2, "SDK imports")
try:
    import openai  # noqa: F401
    from openai import AzureOpenAI
    from azure.identity import DefaultAzureCredential
except ImportError as e:
    fail(f"Import failed: {e}", "pip install -r fine-tuning/requirements.txt")
ok(f"openai == {openai.__version__}")
ok("azure-identity imported")

# ---------------------------------------------------------------------------
# 3. Endpoint env var (advisory — needed for Labs 01/03/07)
# ---------------------------------------------------------------------------
step(3, "AZURE_OPENAI_ENDPOINT")
try:
    from dotenv import load_dotenv

    load_dotenv(ft_dir / ".env")
except Exception:
    pass
endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT")
if endpoint:
    ok(f"Endpoint: {endpoint}")
else:
    warn("AZURE_OPENAI_ENDPOINT not set — Labs 01/03/07 need it (set it or run setup-foundry.ps1).")

# ---------------------------------------------------------------------------
# 4. AAD token via az login (advisory)
# ---------------------------------------------------------------------------
step(4, "AAD token (az login)")
token_ok = False
cred = None
if endpoint:
    try:
        cred = DefaultAzureCredential()
        cred.get_token("https://cognitiveservices.azure.com/.default")
        ok("AAD token acquired (az login active).")
        token_ok = True
    except Exception as e:
        warn(f"Couldn't acquire AAD token: {str(e)[:140]} — run 'az login'.")
else:
    warn("Skipped (no endpoint set).")

# ---------------------------------------------------------------------------
# 5. Base model reachable (the real green light for inference)
# ---------------------------------------------------------------------------
step(5, "Base model smoke test")
if token_ok:
    dep = os.environ.get("BASE_DEPLOYMENT", "gpt-4o-mini")
    try:
        client = AzureOpenAI(
            azure_endpoint=endpoint,
            azure_ad_token_provider=lambda: cred.get_token(
                "https://cognitiveservices.azure.com/.default"
            ).token,
            api_version=os.environ.get("AZURE_OPENAI_API_VERSION", "2025-04-01-preview"),
        )
        r = client.chat.completions.create(
            model=dep,
            max_tokens=5,
            temperature=0,
            messages=[
                {"role": "system", "content": "Reply with exactly: ready"},
                {"role": "user", "content": "ping"},
            ],
        )
        ok(f"Deployment '{dep}' responded: '{(r.choices[0].message.content or '').strip()}' "
           f"({r.usage.total_tokens} tokens)")
    except Exception as e:
        warn(f"Deployment '{dep}' not reachable: {str(e)[:140]}")
else:
    warn("Skipped (no AAD token).")

# ---------------------------------------------------------------------------
# Verdict
# ---------------------------------------------------------------------------
print()
if token_ok and endpoint:
    print(f"{GREEN}========================================{RESET}")
    print(f"{GREEN} GREEN — ready to run all RTOR labs (00 / 01 / 03 / 07).{RESET}")
    print(f"{GREEN}========================================{RESET}")
else:
    print(f"{YELLOW}========================================{RESET}")
    print(f"{YELLOW} AMBER — local data path is ready (Lab 00 offline).{RESET}")
    print(f"{YELLOW} Set AZURE_OPENAI_ENDPOINT + run 'az login' before Labs 01/03/07.{RESET}")
    print(f"{YELLOW}========================================{RESET}")
