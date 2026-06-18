"""One-shot builder for Lab 18b (Multimodal Imaging Multi-Agent Flow).

Emits `18b_imaging_agent_flow.ipynb` into BOTH pre-demo/ and live-demo/.
The only per-folder difference is the Foundry tracing `service_name`.

Run:
    python fine-tuning/_build_lab_18b.py

What this lab teaches (cancer-imaging variant of Lab 18)
-------------------------------------------------------
Lab 18 built a *triage -> specialists* team for a pharmacy scenario. This
variant retargets the SAME pattern at an imaging-heavy oncology workflow —
a lightweight "virtual tumor board":

  PERCEPTION (multimodal):  a vision model (gpt-4o) reads an actual scan
      image and produces a radiology-style impression in text.
  REASONING TEAM (flow):    a case-coordinator agent fans the case out to
      two server-side specialist agents via `ConnectedAgentTool` —
        * imaging-findings specialist  (confirms the measurable target lesion)
        * prior-comparison specialist  (RECIST 1.1 response vs a baseline)
      then merges their answers into a tumor-board-style draft.

Why this split?  Connected sub-agents run SERVER-SIDE; passing raw image
bytes into them is fragile and client-side function tools make the run
HANG (see Lab 18). So we do the multimodal "perception" once, up front,
and feed its TEXT output into an instruction-driven, server-side flow.
That mirrors real systems: a segmentation/PACS tool supplies measurements;
the LLM team reasons about them.

Safety: the scan here is fully SYNTHETIC (numpy/PIL, no PHI). Vision LLMs
are research / decision-SUPPORT — not a diagnostic device. Keep a human in
the loop for anything patient-facing.

Convention notes (match Labs 00-18):
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
    "For a tumor-board flow the trace is your audit trail — *which* specialist "
    "saw *what*, in what order — exactly the record clinical / IRB reviewers ask "
    "for.*\n"
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
# LAB 18b · Multimodal Imaging Multi-Agent Flow (virtual tumor board)
# --------------------------------------------------------------------------- #
def lab18b() -> list[dict]:
    return [
        code(CHDIR_GUARD),
        md(
            "# Lab 18b · Multimodal Imaging Flow (virtual tumor board)\n\n"
            "Lab 18 wired a *triage → specialists* **team** for a pharmacy "
            "scenario. Oncology research is imaging-heavy, so this variant retargets "
            "the **same pattern** at a lightweight **virtual tumor board**:\n\n"
            "- **Perception (multimodal).** A vision model (`gpt-4o`) reads an actual "
            "scan image and writes a radiology-style impression.\n"
            "- **Reasoning team (flow).** A **case-coordinator** agent fans the case "
            "out to two server-side specialists via `ConnectedAgentTool` — an "
            "**imaging-findings** specialist and a **prior-comparison** specialist "
            "(RECIST 1.1 response vs a baseline) — then merges a tumor-board draft.\n\n"
            "**Why split perception from the team?** Connected sub-agents run "
            "**server-side**; feeding raw image bytes into them is fragile, and "
            "client-side function tools make the run *hang* (Lab 18's hard-won "
            "lesson). So we run the multimodal read **once, up front**, and feed its "
            "**text** into an instruction-driven, server-side flow — exactly how real "
            "systems work: a segmentation / PACS tool supplies the measurement; the "
            "LLM team reasons about it.\n\n"
            "> ⚠️ **Safety & scope.** The scan below is **synthetic** (numpy/PIL — no "
            "PHI). Vision LLMs here are **research / decision-support, not a "
            "diagnostic device**. Keep a clinician in the loop for anything "
            "patient-facing.\n"
        ),
        md(TRACING_MD),
        code(TRACING_CODE),
        md(
            "---\n## Step 1 — Connect: Agent Service + a vision model\n\n"
            "We need two clients: the **Foundry Agent Service** (to build the "
            "specialist team) and an **Azure OpenAI** client pointed at a "
            "vision-capable deployment (`gpt-4o`) for the multimodal read. Both use "
            "the same `az login` / managed-identity credential and degrade gracefully "
            "if a piece is missing.\n"
        ),
        code(
            "import os\n"
            "from _advisor import get_credential, try_build_client\n"
            "\n"
            "ACCT    = os.environ.get('AZURE_RESOURCE_NAME', 'aif-acme-dev')\n"
            "PROJECT = os.environ.get('AZURE_FOUNDRY_PROJECT', 'agents')\n"
            "PROJECT_ENDPOINT = f'https://{ACCT}.services.ai.azure.com/api/projects/{PROJECT}'\n"
            "MODEL = os.environ.get('BASE_DEPLOYMENT', 'gpt-4o-mini')        # text agents\n"
            "VISION_MODEL = os.environ.get('VISION_DEPLOYMENT', 'gpt-4o')    # multimodal read\n"
            "\n"
            "# Track every agent we create so cleanup (Step 6) never leaks resources.\n"
            "created_agent_ids: list[str] = []\n"
            "\n"
            "agents = None\n"
            "try:\n"
            "    from azure.ai.agents import AgentsClient\n"
            "    agents = AgentsClient(endpoint=PROJECT_ENDPOINT, credential=get_credential())\n"
            "    print('Agents client ready ->', PROJECT_ENDPOINT)\n"
            "except Exception as e:\n"
            "    print('[skip] Foundry Agent Service unavailable:', type(e).__name__, e)\n"
            "\n"
            "# Vision-capable Azure OpenAI client (reused from the advisor helper).\n"
            "vision = try_build_client()\n"
            "print('Vision client:', 'ready ->' if vision is not None else 'unavailable (mock)',\n"
            "      VISION_MODEL if vision is not None else '')\n"
        ),
        md(
            "---\n## Step 2 — Synthesize a PHI-free sample scan\n\n"
            "Real oncology images are PHI and can't ship in a demo repo. So we "
            "**generate** a CT-like slice: soft-tissue background, a body ellipse, "
            "and one bright **simulated lesion**. No patient data, fully "
            "reproducible. (In production this is a real DICOM slice pulled from PACS "
            "/ a segmentation pipeline.)\n"
        ),
        code(
            "import base64\n"
            "SAMPLE_PNG = Path('data/samples/sample_ct_slice.png')\n"
            "SAMPLE_PNG.parent.mkdir(parents=True, exist_ok=True)\n"
            "\n"
            "img_b64 = None\n"
            "try:\n"
            "    import numpy as np\n"
            "    from PIL import Image, ImageFilter\n"
            "\n"
            "    rng = np.random.default_rng(42)\n"
            "    H = W = 256\n"
            "    yy, xx = np.mgrid[0:H, 0:W]\n"
            "    img = rng.normal(38, 7, (H, W))                      # background noise\n"
            "    body = (((xx - 128) / 110) ** 2 + ((yy - 128) / 95) ** 2) <= 1\n"
            "    img[body] = rng.normal(95, 9, int(body.sum()))       # soft tissue\n"
            "    # simulated target lesion (bright, well-circumscribed)\n"
            "    cx, cy, r = 158, 104, 12\n"
            "    lesion = np.exp(-(((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * r ** 2)))\n"
            "    img = np.clip(img + lesion * 125, 0, 255).astype('uint8')\n"
            "    im = Image.fromarray(img, mode='L').filter(ImageFilter.GaussianBlur(0.6))\n"
            "    im.save(SAMPLE_PNG)\n"
            "    img_b64 = base64.b64encode(SAMPLE_PNG.read_bytes()).decode()\n"
            "    print('Wrote synthetic scan ->', SAMPLE_PNG, f'({len(img_b64)} b64 chars)')\n"
            "except Exception as e:\n"
            "    print('[skip] could not synthesize image:', type(e).__name__, e)\n"
            "\n"
            "# Structured measurement a segmentation/PACS tool would supply alongside the pixels.\n"
            "CURRENT_LONGEST_DIAMETER_MM = 20   # this scan\n"
            "BASELINE_LONGEST_DIAMETER_MM = 30  # prior study (for RECIST comparison)\n"
        ),
        md(
            "---\n## Step 3 — Multimodal perception: read the scan (LIVE)\n\n"
            "`gpt-4o` looks at the **actual pixels** and writes a short, "
            "radiology-style impression (location, margins, enhancement). This is the "
            "one genuinely *multimodal* step — its **text** output becomes the input "
            "to the agent team. If the vision model or content filter blocks, we fall "
            "back to a canned impression so the flow still runs.\n"
        ),
        code(
            "FALLBACK_IMPRESSION = (\n"
            "    'Single well-circumscribed hyperdense focus in the right upper quadrant '\n"
            "    'with smooth margins and mild homogeneous enhancement; no satellite '\n"
            "    'lesions on this slice. Appearances are of a discrete measurable target lesion.'\n"
            ")\n"
            "\n"
            "impression = None\n"
            "if vision is not None and img_b64:\n"
            "    try:\n"
            "        data_uri = f'data:image/png;base64,{img_b64}'\n"
            "        resp = vision.chat.completions.create(\n"
            "            model=VISION_MODEL,\n"
            "            max_tokens=300,\n"
            "            messages=[{\n"
            "                'role': 'user',\n"
            "                'content': [\n"
            "                    {'type': 'text', 'text': (\n"
            "                        'You are a radiology research assistant. This is a SYNTHETIC '\n"
            "                        'CT-like slice (no patient data). Describe the single bright '\n"
            "                        'focus: location, margins, enhancement, and whether it reads '\n"
            "                        'as a discrete measurable target lesion. 3-4 sentences. '\n"
            "                        'Do NOT give a diagnosis or clinical advice.')},\n"
            "                    {'type': 'image_url', 'image_url': {'url': data_uri}},\n"
            "                ],\n"
            "            }],\n"
            "        )\n"
            "        impression = resp.choices[0].message.content.strip()\n"
            "        print('--- vision impression (gpt-4o) ---')\n"
            "    except Exception as e:\n"
            "        print('[fallback] vision read unavailable:', type(e).__name__, e)\n"
            "\n"
            "if not impression:\n"
            "    impression = FALLBACK_IMPRESSION\n"
            "    print('--- vision impression (fallback) ---')\n"
            "print(impression)\n"
        ),
        md(
            "---\n## Step 4 — Create the specialist agents (server-side)\n\n"
            "Two domain experts, each a plain Foundry agent with a tight scope:\n\n"
            "- **Imaging-findings specialist** — turns the impression + measurement "
            "into a structured target-lesion summary.\n"
            "- **Prior-comparison specialist** — computes the change vs the baseline "
            "and assigns a **RECIST 1.1** response category.\n\n"
            "> **Why no client-side `FunctionTool`s here?** A connected sub-agent runs "
            "**server-side** inside the coordinator's run. Client-side function tools "
            "need *your process* to submit their outputs — a signal the coordinator "
            "run never surfaces, so the flow would hang. Inside a flow, specialists "
            "use **server-side capabilities** (instructions, `file_search`, Azure AI "
            "Search, code interpreter). The RECIST arithmetic is simple enough to bake "
            "into instructions; in production you'd hand it to the **code "
            "interpreter** tool for audited math.\n"
        ),
        code(
            "findings_agent = compare_agent = None\n"
            "if agents is not None:\n"
            "    try:\n"
            "        findings_agent = agents.create_agent(\n"
            "            model=MODEL, name='acme-imaging-findings-specialist',\n"
            "            instructions=(\n"
            "                'You are an oncology imaging-findings specialist. You receive a '\n"
            "                'radiology impression and a measured longest-diameter (mm) for a '\n"
            "                'target lesion. Produce a tight structured summary: lesion location, '\n"
            "                'margins/enhancement (from the impression), and the current longest '\n"
            "                'diameter in mm. Confirm whether it qualifies as a measurable RECIST '\n"
            "                'target lesion (>= 10 mm). Be concise. Do NOT give a diagnosis or '\n"
            "                'treatment advice; this is research decision-support.'))\n"
            "        created_agent_ids.append(findings_agent.id)\n"
            "        print('Imaging-findings specialist:', findings_agent.id)\n"
            "\n"
            "        compare_agent = agents.create_agent(\n"
            "            model=MODEL, name='acme-prior-comparison-specialist',\n"
            "            instructions=(\n"
            "                'You are a RECIST 1.1 response specialist. You receive a current '\n"
            "                'longest-diameter (mm) and a baseline longest-diameter (mm) for a '\n"
            "                'single target lesion. Compute the percent change = '\n"
            "                '(current - baseline) / baseline * 100, rounded to one decimal. '\n"
            "                'Classify per RECIST 1.1 (single target-lesion approximation): '\n"
            "                'Complete Response (CR) if current is 0; Partial Response (PR) if '\n"
            "                'decrease >= 30%; Progressive Disease (PD) if increase >= 20%; '\n"
            "                'otherwise Stable Disease (SD). State the percent change and the '\n"
            "                'category with a one-line rationale. Research decision-support only.'))\n"
            "        created_agent_ids.append(compare_agent.id)\n"
            "        print('Prior-comparison specialist:', compare_agent.id)\n"
            "    except Exception as e:\n"
            "        print('[skip] could not create specialists:', type(e).__name__, e)\n"
            "else:\n"
            "    print('[skip] no agents client - see Step 1.')\n"
        ),
        md(
            "---\n## Step 5 — Create the case-coordinator that connects the team\n\n"
            "`ConnectedAgentTool(id, name, description)` turns each specialist into a "
            "**tool** the coordinator can call. The `description` is the routing "
            "signal — Foundry reads it to decide which specialist a case needs. No "
            "glue code: the platform owns the fan-out and merge.\n"
        ),
        code(
            "coordinator = None\n"
            "if findings_agent is not None and compare_agent is not None:\n"
            "    try:\n"
            "        from azure.ai.agents.models import ConnectedAgentTool\n"
            "\n"
            "        find_conn = ConnectedAgentTool(\n"
            "            id=findings_agent.id, name='imaging_findings_specialist',\n"
            "            description='Summarizes the radiology impression and confirms the measurable target lesion.')\n"
            "        comp_conn = ConnectedAgentTool(\n"
            "            id=compare_agent.id, name='prior_comparison_specialist',\n"
            "            description='Computes RECIST 1.1 response from current vs baseline lesion diameter.')\n"
            "\n"
            "        connected_defs = list(find_conn.definitions) + list(comp_conn.definitions)\n"
            "        coordinator = agents.create_agent(\n"
            "            model=MODEL, name='acme-tumorboard-coordinator',\n"
            "            instructions=(\n"
            "                'You are the case coordinator for a research tumor board. For each '\n"
            "                'case, send the impression + current measurement to the imaging-findings '\n"
            "                'specialist, and the current + baseline measurements to the '\n"
            "                'prior-comparison specialist. Then merge both into ONE concise '\n"
            "                'tumor-board draft: Findings, RECIST response, and a Suggested next '\n"
            "                'step (e.g. continue surveillance / discuss at board). End with: '\n"
            "                '\"Research decision-support only - not a diagnosis.\"'),\n"
            "            tools=connected_defs)\n"
            "        created_agent_ids.append(coordinator.id)\n"
            "        print('Tumor-board coordinator   :', coordinator.id)\n"
            "        print('Connected specialists     :', 'imaging_findings_specialist, prior_comparison_specialist')\n"
            "    except Exception as e:\n"
            "        print('[skip] could not create coordinator:', type(e).__name__, e)\n"
            "else:\n"
            "    print('[skip] specialists missing - see Step 4.')\n"
        ),
        md(
            "---\n## Step 6 — Run the case through the whole board (LIVE)\n\n"
            "One case, two specialties: *describe the target lesion* (findings) **and** "
            "*is it responding vs baseline* (RECIST). The coordinator fans out to both "
            "connected agents, then merges the tumor-board draft. We read the **run "
            "steps** to visualise the flow — each connected-agent call is a node in "
            "the trace. The run is polled with a **hard 120 s timeout + cancel** so a "
            "flow can never hang the notebook.\n"
        ),
        code(
            "import time\n"
            "if coordinator is not None:\n"
            "    try:\n"
            "        case_msg = (\n"
            "            'New surveillance scan for research case RC-4471.\\n'\n"
            "            f'Radiology impression: {impression}\\n'\n"
            "            f'Current target-lesion longest diameter: {CURRENT_LONGEST_DIAMETER_MM} mm.\\n'\n"
            "            f'Baseline (prior study) longest diameter: {BASELINE_LONGEST_DIAMETER_MM} mm.\\n'\n"
            "            'Please assess findings and RECIST response, then draft the board note.')\n"
            "        thread = agents.threads.create()\n"
            "        agents.messages.create(thread_id=thread.id, role='user', content=case_msg)\n"
            "        # Poll explicitly with a hard timeout so the flow can never hang the notebook.\n"
            "        run = agents.runs.create(thread_id=thread.id, agent_id=coordinator.id)\n"
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
            "        print('\\n--- tumor-board flow trace (run steps) ---')\n"
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
            "        print('\\n--- tumor-board draft ---')\n"
            "        for m in agents.messages.list(thread_id=thread.id):\n"
            "            if m.role == 'assistant':\n"
            "                for c in m.content:\n"
            "                    if getattr(c, 'text', None):\n"
            "                        print('BOARD:', c.text.value)\n"
            "                break\n"
            "    except Exception as e:\n"
            "        print('[skip] flow run failed:', type(e).__name__, e)\n"
            "else:\n"
            "    print('[skip] no coordinator - see Step 5.')\n"
        ),
        md(
            "---\n## Step 7 — Fine-tune the specialists (SFT \u00b7 DPO \u00b7 tool-calling)\n\n"
            "Each specialist runs on whatever deployment you hand "
            "`create_agent(model=...)` \u2014 so pointing one at a **fine-tuned** model is "
            "a *one-line* change. The three techniques from Labs 01-03 map cleanly "
            "onto a tumor board:\n\n"
            "- **SFT** (Lab 01) \u2014 teach **house-style structured reports** and local "
            "protocol facts the base model never saw.\n"
            "- **DPO** (Lab 02) \u2014 prefer the **radiologist-approved phrasing** over "
            "generic textbook wording.\n"
            "- **Tool-calling FT** (Lab 03) \u2014 emit **reliable structured RECIST "
            "fields** with ~80% fewer prompt tokens.\n\n"
            "Below we run the **same structuring task** on the base `gpt-4o-mini` and "
            "on a fine-tuned deployment, and print **token usage** so you can see why "
            "fine-tuning both raises quality *and* cuts cost. *(The lab's existing "
            "fine-tunes are pharmacy-domain \u2014 in production you'd fine-tune on "
            "de-identified radiology reports; the mechanism is identical.)*\n"
        ),
        code(
            "# Three fine-tuning techniques (Labs 01-03) and where each fits a tumor board:\n"
            "FT_TECHNIQUES = [\n"
            "    ('SFT  (Lab 01)',          'acme-sft-deployment',\n"
            "     'House-style structured reports + local protocol facts.'),\n"
            "    ('DPO  (Lab 02)',          'acme-dpo-deployment',\n"
            "     'Radiologist-approved phrasing over generic wording.'),\n"
            "    ('Tool-calling (Lab 03)',  'acme-tools-deployment',\n"
            "     'Reliable structured RECIST fields, ~80% fewer prompt tokens.'),\n"
            "]\n"
            "for label, dep, why in FT_TECHNIQUES:\n"
            "    print(f'  {label:<22} -> {dep:<26} {why}')\n"
            "\n"
            "# Swapping a fine-tuned model into a specialist is literally one line:\n"
            "#     agents.create_agent(model='acme-sft-deployment', name=..., instructions=...)\n"
            "\n"
            "# LIVE: base gpt-4o-mini vs a fine-tuned deployment on the SAME task (+ token usage).\n"
            "FT_DEPLOYMENT = os.environ.get('ACME_FT_DEPLOYMENT', 'acme-tools-deployment')\n"
            "task = ('Return ONLY a compact JSON object with keys location, margins, '\n"
            "        'longest_diameter_mm, measurable_target (true/false) for this impression: '\n"
            "        + impression + f' Longest diameter is {CURRENT_LONGEST_DIAMETER_MM} mm.')\n"
            "\n"
            "def _ask(dep):\n"
            "    r = vision.chat.completions.create(model=dep, max_tokens=160,\n"
            "        messages=[{'role': 'user', 'content': task}])\n"
            "    u = r.usage\n"
            "    return r.choices[0].message.content.strip(), (u.prompt_tokens, u.completion_tokens)\n"
            "\n"
            "if vision is not None:\n"
            "    for tag, dep in [('base  gpt-4o-mini', MODEL), (f'tuned {FT_DEPLOYMENT}', FT_DEPLOYMENT)]:\n"
            "        try:\n"
            "            out, (pt, ct) = _ask(dep)\n"
            "            print(f'\\n[{tag}]  prompt={pt}  completion={ct} tokens')\n"
            "            print(out[:300])\n"
            "        except Exception as e:\n"
            "            print(f'\\n[{tag}] unavailable:', type(e).__name__, e)\n"
            "else:\n"
            "    print('\\n[skip] no client - see Step 1.')\n"
        ),
        md(
            "---\n## Step 8 — What the flow costs (and how tiering + fine-tuning cut it)\n\n"
            "The board makes **four model calls** per case: one **multimodal** read "
            "(needs `gpt-4o` vision) plus three **text** calls (findings, comparison, "
            "synthesis) that run fine on cheap `gpt-4o-mini`. The big lever is **not "
            "running the whole team on `gpt-4o`** \u2014 reserve the expensive model for "
            "the pixels, and let a small (optionally fine-tuned) model do the "
            "reasoning. The table below prices the **same flow** three ways.\n"
        ),
        code(
            "# Illustrative list prices (USD per 1M tokens) - replace with your EA / PTU rates.\n"
            "PRICES = {  # (input, output) per 1M tokens\n"
            "    'gpt-4o':            (2.50, 10.00),\n"
            "    'gpt-4o-mini':       (0.15,  0.60),\n"
            "    'gpt-4o-mini (FT)':  (0.30,  1.20),\n"
            "}\n"
            "\n"
            "# Illustrative tokens per tumor-board case, by flow stage: (input, output).\n"
            "FLOW = {\n"
            "    'perception (vision)':   (1100, 120),   # gpt-4o reads the scan\n"
            "    'findings specialist':   (260, 130),\n"
            "    'comparison specialist': (210,  90),\n"
            "    'coordinator synthesis': (520, 190),\n"
            "}\n"
            "\n"
            "def _cost(model, tin, tout):\n"
            "    pin, pout = PRICES[model]\n"
            "    return (tin * pin + tout * pout) / 1_000_000\n"
            "\n"
            "vis_in, vis_out = FLOW['perception (vision)']\n"
            "team_in  = sum(i for s, (i, o) in FLOW.items() if s != 'perception (vision)')\n"
            "team_out = sum(o for s, (i, o) in FLOW.items() if s != 'perception (vision)')\n"
            "\n"
            "per_case = {\n"
            "    'All gpt-4o (no tiering)':          _cost('gpt-4o', vis_in + team_in, vis_out + team_out),\n"
            "    'Tiered: 4o vision + mini team':    _cost('gpt-4o', vis_in, vis_out) + _cost('gpt-4o-mini', team_in, team_out),\n"
            "    'Tiered: 4o vision + FT-mini team': _cost('gpt-4o', vis_in, vis_out) + _cost('gpt-4o-mini (FT)', team_in, team_out),\n"
            "}\n"
            "\n"
            "STUDIES_PER_MONTH = 2000\n"
            "base = per_case['All gpt-4o (no tiering)']\n"
            "print(f'{\"approach\":<36}{\"$/case\":>9}{\"$/month\":>12}   vs all-4o')\n"
            "for name, c in per_case.items():\n"
            "    save = '' if name.startswith('All') else f'  -{(1 - c / base) * 100:.0f}%'\n"
            "    print(f'{name:<36}{c:>9.4f}{c * STUDIES_PER_MONTH:>12.2f}{save}')\n"
            "print(f'\\nAt {STUDIES_PER_MONTH:,} studies/month, reserving gpt-4o for the scan and running')\n"
            "print('the reasoning team on (fine-tuned) mini is the dominant cost lever.')\n"
        ),
        md(
            "---\n## Step 9 — Clean up the whole board\n\n"
            "Every agent we created — coordinator **and** both specialists — is a "
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
            "---\n## Step 10 — Production path for imaging (reference)\n\n"
            "To take this from demo to research-grade, swap the stubs for server-side "
            "tools the connected specialists can use **without hanging**:\n\n"
            "- **Segmentation / measurement** → a dedicated imaging endpoint (e.g. a "
            "**MONAI** model on Azure ML or Container Apps) the coordinator calls as a "
            "server-side tool; it returns lesion masks + RECIST diameters instead of "
            "our hard-coded mm.\n"
            "- **Prior studies & literature** → **Azure AI Search** over an indexed "
            "corpus of de-identified prior reports / trial criteria, attached to a "
            "specialist via `AzureAISearchTool` (server-side `file_search` works the "
            "same way for uploaded PDFs).\n"
            "- **Audited arithmetic** → the **code interpreter** tool for the RECIST "
            "math, so every number has a reproducible cell behind it.\n"
            "- **Visual design & versioning** → build the board as a **Foundry "
            "Workflow** in the portal canvas and invoke it by name "
            "(`azure-ai-projects>=2.1.0`), exactly as Lab 18 Step 6 shows.\n\n"
            "**Governance.** Synthetic data here → real workflows need PHI handling "
            "(Lab 10), groundedness / RAI checks (Lab 17), and a human-in-the-loop "
            "sign-off. Treat every agent output as **decision-support**, never an "
            "autonomous diagnosis.\n"
        ),
        md(
            "---\n## Takeaways\n\n"
            "- The Lab 18 **flow pattern transfers wholesale** to oncology imaging — "
            "just rename the specialists and feed them imaging context.\n"
            "- **Perception and reasoning are separate tiers:** do the multimodal "
            "read once (`gpt-4o` on the pixels), then route its **text** through a "
            "server-side specialist team. That keeps the flow fast and "
            "hang-proof.\n"
            "- `ConnectedAgentTool` makes the board **declarative** — add a "
            "radiogenomics or trial-matching specialist later without touching the "
            "coordinator.\n"
            "- The **run steps** are your tumor-board audit trail (Step 0 tracing) — "
            "the *who-saw-what* record reviewers expect.\n"
            "- Production = **server-side tools** (segmentation endpoint, Azure AI "
            "Search, code interpreter) + a portal **Workflow**, with PHI / RAI / "
            "human-in-the-loop governance.\n"
            "- **Fine-tuning is a one-line swap** per specialist "
            "(`create_agent(model='acme-sft-deployment')`) \u2014 SFT for house-style "
            "reports, DPO for preferred phrasing, tool-calling FT for cheaper "
            "structured output.\n"
            "- **Tiering is the cost lever:** reserve `gpt-4o` for the pixels, run the "
            "reasoning team on cheap (fine-tuned) `gpt-4o-mini` \u2014 a large saving at "
            "imaging volume.\n\n"
            "*Related: Lab 11 (single agent + tools) → Lab 18 (multi-agent flow) → "
            "Lab 18b (multimodal imaging flow).*\n"
        ),
    ]


FOLDERS = {
    "pre-demo": "acme-imaging-flow-lab",
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
        cells = _apply_service(lab18b(), service)
        nb = {"cells": cells, "metadata": NB_META, "nbformat": 4, "nbformat_minor": 5}
        (target_dir / "18b_imaging_agent_flow.ipynb").write_text(
            json.dumps(nb, indent=1, ensure_ascii=False), encoding="utf-8")
        print(f"wrote {folder}/18b_imaging_agent_flow.ipynb  (service={service})")


if __name__ == "__main__":
    main()
