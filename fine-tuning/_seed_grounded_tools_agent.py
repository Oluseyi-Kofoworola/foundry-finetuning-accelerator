"""Seed the Foundry portal with a grounded Acme agent that wraps the
fine-tuned tool-calling deployment.

Why this exists
---------------
The Foundry portal playground for a raw model deployment (`acme-tools-deployment`)
does NOT automatically use the SYSTEM_PROMPT the model was trained with. If the
demo person opens the deployment directly and uses the default
"You are an AI assistant that helps people find information" prompt, the model
behaves out of domain (it was trained ONLY on Acme Member Services
conversations).

This script registers an *Agent* in the Foundry project so that when the demo
person opens **Build > Agents > acme-tools-grounded**, they get:
  - model           : acme-tools-deployment    (the FT model from Lab 03)
  - instructions    : the same SYSTEM_PROMPT used during training
  - function tools  : the 5 Acme tool schemas (verify_member_identity, ...)
  - file_search     : grounded over data/acme_health_kb.md (vector store)

The agent is idempotent: if it already exists with the same name, it is
deleted and recreated so the latest prompt / KB are picked up.

Run from repo root or fine-tuning/:
    python fine-tuning/_seed_grounded_tools_agent.py
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from azure.identity import DefaultAzureCredential
from azure.ai.agents import AgentsClient
from azure.ai.agents.models import FileSearchTool, FilePurpose

# ----------------------------------------------------------------------------
# Resolve paths (works from repo root or fine-tuning/)
# ----------------------------------------------------------------------------
HERE = Path(__file__).resolve().parent  # .../fine-tuning
load_dotenv(HERE / ".env")

DATA_DIR        = HERE / "data"
SCHEMA_PATH     = DATA_DIR / "acme_tools_schema.json"
KB_PATH         = DATA_DIR / "acme_health_kb.md"
AGENT_ID_MARKER = HERE / ".tools_agent_id"

# ----------------------------------------------------------------------------
# Constants
# ----------------------------------------------------------------------------
ACCOUNT  = os.environ.get("AZURE_RESOURCE_NAME", "aif-acme-dev")
PROJECT  = os.environ.get("AZURE_FOUNDRY_PROJECT", "agents")
ENDPOINT = f"https://{ACCOUNT}.services.ai.azure.com/api/projects/{PROJECT}"

# The FT deployment created by Lab 03
TOOLS_DEPLOYMENT = "acme-tools-deployment"
AGENT_NAME       = "acme-tools-grounded"

# Same SYSTEM_PROMPT the FT model saw during training (Lab 03 Step 4)
SYSTEM_PROMPT = (
    "You are a Acme Health Member Services voice assistant. Use the "
    "available tools to verify identity, look up prescriptions, request "
    "refills, find in-network providers, and calculate medication prices. "
    "Always verify identity before disclosing protected health information."
)

# Extra portal-only guidance to tell the demo person why this exists
INSTRUCTIONS = (
    SYSTEM_PROMPT
    + "\n\n"
    + "GROUNDING RULES (read carefully):\n"
    "1. You have a `file_search` tool attached to the Acme Health Member "
    "Services knowledge base (acme_health_kb.md). You MUST call "
    "`file_search` BEFORE answering ANY question about Acme policies, "
    "benefits, copays, formulary tiers, mail-order rules, refill windows, "
    "2FA, financial assistance, plan tiers (Bronze/Silver/Gold/Platinum), "
    "telehealth, identity verification policy, or appointment scheduling. "
    "Do not answer policy questions from memory.\n"
    "2. After `file_search` returns, quote the relevant numbers and policies "
    "verbatim from the retrieved chunks and include the file citation "
    "annotation in your response.\n"
    "3. For personalized actions (refill a specific medication, look up "
    "prescriptions, calculate a price, find a provider, verify identity), "
    "call the appropriate function tool — do NOT use file_search for these.\n"
    "4. Never disclose protected health information until identity is "
    "verified via `verify_member_identity`.\n"
    "5. If the member's question mixes policy and action (e.g. 'what is my "
    "copay and please refill it'), call `file_search` for the policy part "
    "AND the function tool for the action part."
)


def main() -> int:
    # ------------------------------------------------------------------
    # 0. Sanity checks
    # ------------------------------------------------------------------
    if not SCHEMA_PATH.exists():
        print(f"[ERROR] missing {SCHEMA_PATH}", flush=True)
        return 1
    if not KB_PATH.exists():
        print(f"[ERROR] missing {KB_PATH}", flush=True)
        return 1

    acme_tools = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    print(f"endpoint   : {ENDPOINT}", flush=True)
    print(f"deployment : {TOOLS_DEPLOYMENT}", flush=True)
    print(f"agent name : {AGENT_NAME}", flush=True)
    print(f"functions  : {len(acme_tools)}  ({', '.join(t['function']['name'] for t in acme_tools)})", flush=True)
    print(f"kb file    : {KB_PATH.name}  ({KB_PATH.stat().st_size:,} bytes)", flush=True)

    cred   = DefaultAzureCredential()
    client = AgentsClient(endpoint=ENDPOINT, credential=cred)

    # ------------------------------------------------------------------
    # 1. Delete any prior agent with the same name (idempotent)
    # ------------------------------------------------------------------
    print("\n[1/4] Cleaning up prior agent (if any)...", flush=True)
    deleted = 0
    try:
        for a in client.list_agents():
            if a.name == AGENT_NAME:
                client.delete_agent(a.id)
                print(f"  deleted prior agent: {a.id}", flush=True)
                deleted += 1
    except Exception as e:
        print(f"  (warning: list/delete failed: {e})", flush=True)
    if deleted == 0:
        print("  no prior agent found", flush=True)

    # ------------------------------------------------------------------
    # 2. Upload the KB file and build a vector store
    # ------------------------------------------------------------------
    print("\n[2/4] Uploading KB file + creating vector store...", flush=True)
    f = client.files.upload_and_poll(
        file_path=str(KB_PATH),
        purpose=FilePurpose.AGENTS,
    )
    print(f"  file id     : {f.id}", flush=True)

    vs = client.vector_stores.create_and_poll(
        file_ids=[f.id],
        name="acme-health-kb-vs",
    )
    print(f"  vector store: {vs.id}", flush=True)

    file_search = FileSearchTool(vector_store_ids=[vs.id])

    # ------------------------------------------------------------------
    # 3. Build combined tool list: file_search + 5 Acme function tools
    # ------------------------------------------------------------------
    print("\n[3/4] Assembling tool definitions...", flush=True)
    tool_defs = list(file_search.definitions) + list(acme_tools)
    print(f"  total tools on agent: {len(tool_defs)} "
          f"(1 file_search + {len(acme_tools)} functions)", flush=True)

    # ------------------------------------------------------------------
    # 4. Create the agent
    # ------------------------------------------------------------------
    print("\n[4/4] Creating agent...", flush=True)
    agent = client.create_agent(
        model          = TOOLS_DEPLOYMENT,
        name           = AGENT_NAME,
        description    = (
            "Acme Health Member Services agent grounded in the Acme "
            "knowledge base. Uses the fine-tuned tool-calling model from "
            "Lab 03 (acme-tools-deployment)."
        ),
        instructions   = INSTRUCTIONS,
        tools          = tool_defs,
        tool_resources = file_search.resources,
    )
    print(f"  agent id    : {agent.id}", flush=True)

    AGENT_ID_MARKER.write_text(agent.id, encoding="utf-8")
    print(f"  saved id to : {AGENT_ID_MARKER}", flush=True)

    portal_url = (
        f"https://ai.azure.com/build/agents?wsid="
        f"/subscriptions/{os.environ.get('AZURE_SUBSCRIPTION_ID','')}"
        f"/resourceGroups/{os.environ.get('AZURE_RESOURCE_GROUP','')}"
        f"/providers/Microsoft.CognitiveServices/accounts/{ACCOUNT}/projects/{PROJECT}"
    )
    print("\n--- Done. ---")
    print(f"Open the agent in the portal:\n  {portal_url}")
    print(f"Agent name: {AGENT_NAME}    id: {agent.id}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
