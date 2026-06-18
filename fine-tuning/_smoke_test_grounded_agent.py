"""Smoke-test the grounded sutter-tools agent end-to-end.

1. PHI/action prompt -> expect a verify_member_identity function tool call
   (proves the FT model + SYSTEM_PROMPT + function tools are wired correctly).
2. Policy/KB prompt  -> expect a grounded answer with at least one
   file_citation annotation (proves file_search + vector store work).
"""
import json
import os
import sys
import time
from pathlib import Path
from dotenv import load_dotenv
from azure.identity import DefaultAzureCredential
from azure.ai.agents import AgentsClient
from azure.ai.agents.models import (
    MessageRole,
    MessageTextContent,
    SubmitToolOutputsAction,
    ToolOutput,
)

HERE = Path(__file__).resolve().parent
load_dotenv(HERE / ".env")

ACCOUNT  = os.environ.get("AZURE_RESOURCE_NAME", "aif-acme-dev")
PROJECT  = os.environ.get("AZURE_FOUNDRY_PROJECT", "agents")
ENDPOINT = f"https://{ACCOUNT}.services.ai.azure.com/api/projects/{PROJECT}"

AGENT_ID = (HERE / ".tools_agent_id").read_text(encoding="utf-8").strip()
print(f"agent id: {AGENT_ID}", flush=True)

cred   = DefaultAzureCredential()
client = AgentsClient(endpoint=ENDPOINT, credential=cred)


def run_turn(label: str, user_msg: str, fake_tool_outputs: dict[str, str] | None = None) -> None:
    print(f"\n=== {label} ===", flush=True)
    print(f"USER: {user_msg}", flush=True)

    thread = client.threads.create()
    client.messages.create(thread_id=thread.id, role=MessageRole.USER, content=user_msg)
    run = client.runs.create(thread_id=thread.id, agent_id=AGENT_ID)

    t0 = time.time()
    tool_calls_seen: list[dict] = []
    while True:
        time.sleep(1.5)
        run = client.runs.get(thread_id=thread.id, run_id=run.id)
        status = run.status
        elapsed = int(time.time() - t0)

        if status == "requires_action" and isinstance(run.required_action, SubmitToolOutputsAction):
            outputs: list[ToolOutput] = []
            for tc in run.required_action.submit_tool_outputs.tool_calls:
                fn_name = tc.function.name
                fn_args = tc.function.arguments
                tool_calls_seen.append({"name": fn_name, "args": fn_args})
                print(f"  [+{elapsed:>3}s] TOOL_CALL: {fn_name}({fn_args})", flush=True)
                if fake_tool_outputs and fn_name in fake_tool_outputs:
                    outputs.append(ToolOutput(tool_call_id=tc.id, output=fake_tool_outputs[fn_name]))
                else:
                    outputs.append(ToolOutput(tool_call_id=tc.id, output=json.dumps({"status": "ok"})))
            client.runs.submit_tool_outputs(thread_id=thread.id, run_id=run.id, tool_outputs=outputs)
            continue

        if status in ("completed", "failed", "cancelled", "expired"):
            print(f"  [+{elapsed:>3}s] run status: {status}", flush=True)
            err = getattr(run, "last_error", None)
            if err:
                print(f"  last_error: {err}", flush=True)
            break

        if elapsed > 90:
            print(f"  [+{elapsed:>3}s] TIMEOUT (last status: {status})", flush=True)
            break

    msgs = list(client.messages.list(thread_id=thread.id, order="asc"))
    final_text = ""
    citations = 0
    for m in msgs:
        if m.role != "assistant":
            continue
        for c in m.content:
            if isinstance(c, MessageTextContent):
                final_text = c.text.value
                anns = getattr(c.text, "annotations", []) or []
                for a in anns:
                    if getattr(a, "type", None) == "file_citation":
                        citations += 1
    print(f"ASSISTANT: {final_text[:600]}{'...' if len(final_text) > 600 else ''}", flush=True)
    print(f"  tool_calls : {len(tool_calls_seen)}", flush=True)
    print(f"  citations  : {citations}", flush=True)


# 1. Action prompt — should trigger verify_member_identity
run_turn(
    label="Test 1 — PHI/action prompt -> expect verify_member_identity tool call",
    user_msg="Hi this is Maria Rodriguez, DOB 7/12/1982, member MEM-099. Can you refill my metformin and ship it mail order?",
    fake_tool_outputs={
        "verify_member_identity": json.dumps({"verified": True, "memberId": "MEM-099", "fullName": "Maria Rodriguez"}),
        "lookup_prescriptions": json.dumps({
            "prescriptions": [
                {"prescriptionId": "RX-7781", "drug": "metformin 500 mg", "refillsRemaining": 3, "lastFilled": "2026-04-15"},
            ]
        }),
        "request_refill": json.dumps({"status": "submitted", "eta": "5-7 business days via USPS Priority Mail"}),
    },
)

# 2. KB prompt — should answer from sutter_health_kb.md with citations
run_turn(
    label="Test 2 — Policy/KB prompt -> expect grounded answer + file citation",
    user_msg="What are the Sutter Health Plus formulary tiers and what is my Tier 1 generic 30-day copay?",
)

print("\nDone.")
