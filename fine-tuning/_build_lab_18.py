"""One-shot builder for Lab 18 (Multi-Agent Flow / Agent Workflows).

Emits `18_agent_flow.ipynb` into BOTH pre-demo/ and live-demo/.
The only per-folder difference is the Foundry tracing `service_name`.

Run:
    python fine-tuning/_build_lab_18.py

What this lab teaches
---------------------
Lab 11 promoted a model into ONE agent that calls tools. A real Member
Services org is a *team*: a front-desk triage agent routes each member
to the right specialist (Prescriptions, Coverage & Billing). This lab
builds that team two ways:

  1. LIVE today  -> the Connected Agents pattern (azure-ai-agents 1.1.0,
     already installed): a triage agent fans out to specialist agents via
     `ConnectedAgentTool`; we read the run steps to visualize the handoff.

  2. PRODUCTION  -> the Foundry portal **Workflow** (visual agent-flow
     designer) invoked with `azure-ai-projects>=2.1.0` via
     `get_openai_client().responses.create(agent_reference=...)`, streaming
     `workflow_action` events. Shown as a clearly-marked, graceful-skip
     reference until 2.1.0 + a designed workflow are present.

Convention notes (match Labs 00-17):
  * cell 0 = chdir guard (works from fine-tuning/ or fine-tuning/<folder>/)
  * Step 0 = Foundry tracing (service_name differs per folder)
  * every live call degrades gracefully when az login / role / SDK is missing
  * created agents are ALWAYS deleted in cleanup so the project stays tidy
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent

NB_META = {
    "kernelspec": {"display_name": ".venv", "language": "python", "name": "python3"},
    "language_info": {
        "codemirror_mode": {"name": "ipython", "version": 3},
        "file_extension": ".py",
        "mimetype": "text/x-python",
        "name": "python",
        "nbconvert_exporter": "python",
        "pygments_lexer": "ipython3",
        "version": "3.13.14",
    },
}

CHDIR_GUARD = (
    "# Make this notebook work from either fine-tuning/ or fine-tuning/pre-demo/\n"
    "# (idempotent: re-running is safe)\n"
    "import os\n"
    "from pathlib import Path\n"
    "_here = Path.cwd()\n"
    "if _here.name in ('pre-demo', 'live-demo'):\n"
    "    os.chdir(_here.parent)\n"
    "print('cwd:', Path.cwd())\n"
)

TRACING_CODE = (
    "from dotenv import load_dotenv\n"
    "load_dotenv(override=True)\n"
    "\n"
    "import sys, pathlib\n"
    "sys.path.insert(0, str(pathlib.Path('.').resolve()))\n"
    "from _tracing import enable_foundry_tracing\n"
    "\n"
    "enable_foundry_tracing(service_name='__SERVICE__')\n"
)

TRACING_MD = (
    "---\n"
    "## Step 0 — Enable Foundry tracing\n"
    "\n"
    "*Wire OpenTelemetry to Application Insights so every agent call below shows "
    "up live in the Microsoft Foundry portal under **your project → Tracing**. "
    "For a multi-agent flow this is essential — the trace is how you see which "
    "specialist handled each member turn.*\n"
)


def _cid(prefix: str, text: str) -> str:
    return prefix + hashlib.md5(text.encode("utf-8")).hexdigest()[:10]


def md(text: str) -> dict:
    return {
        "cell_type": "markdown",
        "id": _cid("md-", text),
        "metadata": {},
        "source": text.splitlines(keepends=True),
    }


def code(src: str) -> dict:
    return {
        "cell_type": "code",
        "id": _cid("code-", src),
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": src.splitlines(keepends=True),
    }


# --------------------------------------------------------------------------- #
# LAB 18 · Multi-Agent Flow (Agent Workflows / Connected Agents)
# --------------------------------------------------------------------------- #
def lab18() -> list[dict]:
    return [
        code(CHDIR_GUARD),
        md(
            "# Lab 18 · Multi-Agent Flow (Agent Workflows)\n\n"
            "Lab 11 gave us **one** agent that calls tools. But a real Member "
            "Services organisation is a **team**: a front-desk *triage* agent listens "
            "to the member, then routes the conversation to the right specialist — "
            "**Prescriptions** for a refill, **Coverage & Billing** for a copay "
            "question — and stitches the answers back together.\n\n"
            "This lab builds that team as a genuine **multi-agent flow**, two ways:\n\n"
            "1. **Live today — Connected Agents.** A triage agent fans out to "
            "specialist agents via `ConnectedAgentTool` (azure-ai-agents, already "
            "installed). Foundry plans the routing; we read the run steps to *see* "
            "the handoff.\n"
            "2. **Production — Foundry portal Workflow.** The same flow, designed "
            "visually in the Foundry **Agent Flow / Workflows** canvas and invoked by "
            "name with `azure-ai-projects>=2.1.0`, streaming `workflow_action` events. "
            "Shown as a drop-in reference at the end.\n\n"
            "*This is the orchestration layer most teams can't build alone — Foundry "
            "ships it as a managed service.*\n"
        ),
        md(TRACING_MD),
        code(TRACING_CODE),
        md(
            "---\n## Step 1 — Connect to the Foundry Agent Service (LIVE)\n\n"
            "Same project (`agents`) and the same managed-identity / `az login` "
            "credential used by the seeded production agents. Degrades gracefully if "
            "the SDK or the `Azure AI Developer` role isn't present.\n"
        ),
        code(
            "import os\n"
            "from _advisor import get_credential\n"
            "\n"
            "ACCT    = os.environ.get('AZURE_RESOURCE_NAME', 'aif-acme-dev')\n"
            "PROJECT = os.environ.get('AZURE_FOUNDRY_PROJECT', 'agents')\n"
            "PROJECT_ENDPOINT = f'https://{ACCT}.services.ai.azure.com/api/projects/{PROJECT}'\n"
            "MODEL = os.environ.get('BASE_DEPLOYMENT', 'gpt-4o-mini')\n"
            "\n"
            "# Track every agent we create so cleanup (Step 5) never leaks resources.\n"
            "created_agent_ids: list[str] = []\n"
            "\n"
            "agents = None\n"
            "try:\n"
            "    from azure.ai.agents import AgentsClient\n"
            "    agents = AgentsClient(endpoint=PROJECT_ENDPOINT, credential=get_credential())\n"
            "    print('Agents client ready ->', PROJECT_ENDPOINT)\n"
            "except Exception as e:\n"
            "    print('[skip] Foundry Agent Service unavailable:', type(e).__name__, e)\n"
        ),
        md(
            "---\n## Step 2 — Create the specialist agents\n\n"
            "Two domain experts, each with a tight scope. They are ordinary Foundry "
            "agents — what makes them a *team* is Step 3, where the triage agent "
            "connects to them.\n\n"
            "- **Prescriptions specialist** — refills, status, mail-order.\n"
            "- **Coverage & Billing specialist** — copays, formulary tiers, "
            "deductibles.\n\n"
            "> **Why no client-side `FunctionTool`s here?** A connected sub-agent runs "
            "**server-side** inside the orchestrator's run. Client-side function tools "
            "need *your process* to submit their outputs — a signal the orchestrator "
            "run never surfaces, so the flow would hang. So inside a flow, specialists "
            "use **server-side capabilities** (instructions, `file_search`, Azure AI "
            "Search, code interpreter). Client-side function orchestration lives on a "
            "**single** agent — that's [Lab 11](11_agents_orchestration.ipynb). Here we "
            "keep specialists instruction-driven so the live flow completes.\n"
        ),
        code(
            "rx_agent = coverage_agent = None\n"
            "if agents is not None:\n"
            "    try:\n"
            "        rx_agent = agents.create_agent(\n"
            "            model=MODEL, name='acme-rx-specialist',\n"
            "            instructions=(\n"
            "                'You are the Acme Prescriptions specialist. You handle refills, '\n"
            "                'prescription status and mail-order. Member M-10293 has one expired '\n"
            "                'prescription on file: lisinopril 10mg (0 refills left). When asked '\n"
            "                'to refill, confirm the refill is submitted with a 2-day mail-order '\n"
            "                'ETA. Be concise (one or two sentences). Do not answer billing '\n"
            "                'questions.'))\n"
            "        created_agent_ids.append(rx_agent.id)\n"
            "        print('Prescriptions specialist:', rx_agent.id)\n"
            "\n"
            "        coverage_agent = agents.create_agent(\n"
            "            model=MODEL, name='acme-coverage-specialist',\n"
            "            instructions=(\n"
            "                'You are the Acme Coverage & Billing specialist. You answer copay, '\n"
            "                'formulary-tier and deductible questions. Lisinopril 10mg is a Tier 1 '\n"
            "                'generic with a $10 copay for this member. Be concise (one or two '\n"
            "                'sentences). Do not refill medications.'))\n"
            "        created_agent_ids.append(coverage_agent.id)\n"
            "        print('Coverage specialist   :', coverage_agent.id)\n"
            "    except Exception as e:\n"
            "        print('[skip] could not create specialists:', type(e).__name__, e)\n"
            "else:\n"
            "    print('[skip] no agents client - see Step 1.')\n"
        ),
        md(
            "---\n## Step 3 — Create the triage agent that connects the team\n\n"
            "`ConnectedAgentTool(id, name, description)` turns each specialist into a "
            "**tool** the triage agent can call. The `description` is the routing "
            "signal — Foundry reads it to decide which specialist a member turn "
            "belongs to. No glue code: the platform owns the fan-out.\n"
        ),
        code(
            "orchestrator = None\n"
            "if rx_agent is not None and coverage_agent is not None:\n"
            "    try:\n"
            "        from azure.ai.agents.models import ConnectedAgentTool\n"
            "\n"
            "        rx_conn = ConnectedAgentTool(\n"
            "            id=rx_agent.id, name='prescriptions_specialist',\n"
            "            description='Refills, prescription status and mail-order for a member.')\n"
            "        cov_conn = ConnectedAgentTool(\n"
            "            id=coverage_agent.id, name='coverage_specialist',\n"
            "            description='Copays, formulary tiers, deductibles and billing questions.')\n"
            "\n"
            "        connected_defs = list(rx_conn.definitions) + list(cov_conn.definitions)\n"
            "        orchestrator = agents.create_agent(\n"
            "            model=MODEL, name='acme-triage-orchestrator',\n"
            "            instructions=('You are the Acme Member Services triage agent. For each '\n"
            "                          'member request, route the relevant part to the right '\n"
            "                          'connected specialist (prescriptions vs coverage). A single '\n"
            "                          'message may need BOTH. Combine their answers into one clear, '\n"
            "                          'friendly reply for the member.'),\n"
            "            tools=connected_defs)\n"
            "        created_agent_ids.append(orchestrator.id)\n"
            "        print('Triage orchestrator   :', orchestrator.id)\n"
            "        print('Connected specialists :', 'prescriptions_specialist, coverage_specialist')\n"
            "    except Exception as e:\n"
            "        print('[skip] could not create orchestrator:', type(e).__name__, e)\n"
            "else:\n"
            "    print('[skip] specialists missing - see Step 2.')\n"
        ),
        md(
            "---\n## Step 4 — Run a member turn that needs the whole team (LIVE)\n\n"
            "One message, two specialties: *refill my expired med* (Prescriptions) "
            "**and** *what's my copay* (Coverage). The triage agent fans out to both "
            "connected agents, then merges the result. We read the **run steps** to "
            "visualise the flow — each connected-agent call is a node in the trace.\n"
        ),
        code(
            "import time\n"
            "if orchestrator is not None:\n"
            "    try:\n"
            "        thread = agents.threads.create()\n"
            "        agents.messages.create(thread_id=thread.id, role='user', content=(\n"
            "            'Hi, this is member M-10293. Please refill my expired lisinopril, '\n"
            "            'and also tell me what my copay will be for it.'))\n"
            "        # Poll explicitly with a hard timeout so the flow can never hang the notebook.\n"
            "        run = agents.runs.create(thread_id=thread.id, agent_id=orchestrator.id)\n"
            "        t0 = time.time()\n"
            "        while run.status in ('queued', 'in_progress') and time.time() - t0 < 120:\n"
            "            time.sleep(2)\n"
            "            run = agents.runs.get(thread_id=thread.id, run_id=run.id)\n"
            "        if run.status in ('queued', 'in_progress'):\n"
            "            agents.runs.cancel(thread_id=thread.id, run_id=run.id)\n"
            "        print('Run status:', run.status, f'({int(time.time() - t0)}s)')\n"
            "        if getattr(run, 'last_error', None):\n"
            "            print('last_error:', run.last_error)\n"
            "\n"
            "        print('\\n--- agent-flow trace (run steps) ---')\n"
            "        for s in agents.run_steps.list(thread_id=thread.id, run_id=run.id):\n"
            "            det = getattr(s, 'step_details', None)\n"
            "            calls = getattr(det, 'tool_calls', None) or []\n"
            "            if calls:\n"
            "                for tc in calls:\n"
            "                    name = getattr(getattr(tc, 'connected_agent', None), 'name', None) \\\n"
            "                           or getattr(getattr(tc, 'function', None), 'name', None) \\\n"
            "                           or getattr(tc, 'type', '?')\n"
            "                    print(f'  step {getattr(s, \"type\", \"?\"):<16} -> routed to: {name}')\n"
            "            else:\n"
            "                print(f'  step {getattr(s, \"type\", \"?\"):<16} -> {getattr(det, \"type\", \"?\")}')\n"
            "\n"
            "        print('\\n--- member-facing answer ---')\n"
            "        for m in agents.messages.list(thread_id=thread.id):\n"
            "            if m.role == 'assistant':\n"
            "                for c in m.content:\n"
            "                    if getattr(c, 'text', None):\n"
            "                        print('ASSISTANT:', c.text.value)\n"
            "                break\n"
            "    except Exception as e:\n"
            "        print('[skip] flow run failed:', type(e).__name__, e)\n"
            "else:\n"
            "    print('[skip] no orchestrator - see Step 3.')\n"
        ),
        md(
            "---\n## Step 5 — Clean up the whole team\n\n"
            "Every agent we created — triage **and** both specialists — is a "
            "persistent resource. Delete them all so only the seeded production agents "
            "remain. (We tracked each id in `created_agent_ids` precisely for this.)\n"
        ),
        code(
            "if agents is not None and created_agent_ids:\n"
            "    for aid in created_agent_ids:\n"
            "        try:\n"
            "            agents.delete_agent(aid)\n"
            "            print('Deleted agent', aid)\n"
            "        except Exception as e:\n"
            "            print('[warn] cleanup', aid, ':', e)\n"
            "else:\n"
            "    print('Nothing to clean up.')\n"
        ),
        md(
            "---\n## Step 6 — Production path: the Foundry portal Workflow (reference)\n\n"
            "The Connected-Agents flow above is built **in code**. In production you "
            "usually design the same flow **visually** in the Foundry **Agent Flow / "
            "Workflows** canvas (drag agents, draw the routing edges, version it), then "
            "invoke it by name. That uses the `azure-ai-projects>=2.1.0` Responses API "
            "(`get_openai_client().responses.create(...)`) and streams the workflow's "
            "`workflow_action` items so you can watch each actor fire in real time.\n\n"
            "This cell is a **drop-in reference**: design a workflow in the portal, then "
            "set `ACME_WORKFLOW_NAME` to its name (or edit below). Until a workflow "
            "name is provided it skips cleanly. Note: in newer SDKs the stream events "
            "are plain strings (e.g. `response.output_text.done`), so we match "
            "`event.type` directly rather than importing an enum.\n"
        ),
        code(
            "# Replace-in-production: design the flow in the Foundry Workflows canvas,\n"
            "# publish it, then set ACME_WORKFLOW_NAME to invoke it by reference.\n"
            "WORKFLOW_NAME = os.environ.get('ACME_WORKFLOW_NAME', '')  # e.g. 'acme-member-services-flow'\n"
            "\n"
            "try:\n"
            "    from azure.ai.projects import AIProjectClient\n"
            "    _has_workflows = hasattr(AIProjectClient, 'get_openai_client')\n"
            "except Exception:\n"
            "    _has_workflows = False\n"
            "\n"
            "if not _has_workflows:\n"
            "    print('[skip] portal Workflows need azure-ai-projects>=2.1.0 '\n"
            "          '(installed build lacks get_openai_client).')\n"
            "    print('       pip install \"azure-ai-projects>=2.1.0\"  then design a flow in the portal.')\n"
            "elif not WORKFLOW_NAME:\n"
            "    print('[skip] set ACME_WORKFLOW_NAME (or edit this cell) to a published workflow name.')\n"
            "else:\n"
            "    project_client = AIProjectClient(endpoint=PROJECT_ENDPOINT, credential=get_credential())\n"
            "    with project_client:\n"
            "        oai = project_client.get_openai_client()\n"
            "        conv = oai.conversations.create()\n"
            "        print('conversation:', conv.id)\n"
            "        stream = oai.responses.create(\n"
            "            conversation=conv.id,\n"
            "            extra_body={'agent_reference': {'name': WORKFLOW_NAME, 'type': 'agent_reference'}},\n"
            "            input='Refill my lisinopril and tell me the copay.',\n"
            "            stream=True,\n"
            "            metadata={'x-ms-debug-mode-enabled': '1'},\n"
            "        )\n"
            "        for event in stream:\n"
            "            etype = getattr(event, 'type', '')\n"
            "            item = getattr(event, 'item', None)\n"
            "            is_wf = getattr(item, 'type', None) == 'workflow_action'\n"
            "            if etype == 'response.output_text.done':\n"
            "                print('TEXT:', getattr(event, 'text', ''))\n"
            "            elif etype == 'response.output_item.added' and is_wf:\n"
            "                print(f\"ACTOR -> {item.action_id} ({item.status})\")\n"
            "            elif etype == 'response.output_item.done' and is_wf:\n"
            "                print(f\"DONE  -> {item.action_id} ({item.status})\")\n"
            "        oai.conversations.delete(conversation_id=conv.id)\n"
            "        print('conversation deleted')\n"
        ),
        md(
            "---\n## Takeaways\n\n"
            "- A **multi-agent flow** turns one assistant into a coordinated team: a "
            "triage agent routes each member turn to the right specialist and merges "
            "the answers.\n"
            "- `ConnectedAgentTool` makes the wiring **declarative** — the specialist's "
            "`description` is the routing signal; Foundry owns the fan-out and retries.\n"
            "- The **run steps** are your flow trace: every connected-agent call is a "
            "node you can replay in the Foundry **Tracing** tab (Step 0).\n"
            "- For production, design the same flow **visually** in the Foundry "
            "**Workflows** canvas and invoke it by name (`azure-ai-projects>=2.1.0`, "
            "Step 6) — version-controlled, no glue code.\n"
            "- Always **clean up** created agents (Step 5) so the project stays tidy.\n\n"
            "*← The Decision Advisor (Lab 09) routes the `needs_agents` flag to the "
            "agent track: Lab 11 (single agent + tools) → Lab 18 (multi-agent flow).*\n"
        ),
    ]


# --------------------------------------------------------------------------- #
# Emit
# --------------------------------------------------------------------------- #
FOLDERS = {
    "pre-demo": "acme-agentflow-lab",
    "live-demo": "acme-live-demo",
}


def _apply_service(cells: list[dict], service: str) -> list[dict]:
    out = []
    for i, c in enumerate(cells):
        src = "".join(c["source"]).replace("__SERVICE__", service)
        out.append({**c, "id": f"{c['id']}-{i}", "source": src.splitlines(keepends=True)})
    return out


def main() -> None:
    for folder, service in FOLDERS.items():
        target_dir = HERE / folder
        target_dir.mkdir(exist_ok=True)
        cells = _apply_service(lab18(), service)
        nb = {"cells": cells, "metadata": NB_META, "nbformat": 4, "nbformat_minor": 5}
        (target_dir / "18_agent_flow.ipynb").write_text(
            json.dumps(nb, indent=1, ensure_ascii=False), encoding="utf-8")
        print(f"wrote {folder}/18_agent_flow.ipynb  (service={service})")


if __name__ == "__main__":
    main()
