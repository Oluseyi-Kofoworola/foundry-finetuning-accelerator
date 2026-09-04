# Fine-Tuning Labs — Microsoft Foundry

> **Take a base model through the full customization lifecycle — and measure
> whether it actually improved.** 20 notebooks, run against your own
> subscription, no portal clicks.

## What these labs are for

Two audiences, one set of notebooks:

- **Learning.** Work Labs 00 → 18b in order and you'll know what SFT, DPO, and
  tool-calling fine-tuning each change, when retrieval beats training, and why a
  finished job is not a passing gate.
  Start at [Lab 00](live-demo/00_synthetic_data_generation.ipynb).
- **Demonstrating.** [DEMO-30MIN.md](DEMO-30MIN.md) walks one workload through
  code, evaluation, safety, and cost to an `ADOPT` / `PILOT` / `HOLD` /
  `DO NOT USE` decision — and includes a section for teaching other engineers to
  run it themselves.

**How the folders differ.** `live-demo/` is yours to run. `pre-demo/` holds the
same labs with verified saved outputs — read those while a training job is still
running, or to see the expected result before spending money.

**The labs are allowed to fail.** Lab 01's fine-tuned candidate scores `0/3`
where the base model scores `1/3`. Lab 03's reduced-schema model cuts prompt
tokens by 56% while tool accuracy falls from `1.00` to `0.75`. Both gates return
`FAIL` / `HOLD` on purpose — a release process that cannot say no isn't one.

## 20 labs that do the proving for you

These labs are the path from base model to production story. Each one is a
self-contained Jupyter notebook with a clear **demo moment** you can show on
screen. They ship themed around a healthcare member-services assistant (default
brand: **Acme Health**), but the domain is a **swappable example** — re-theme
the data files in `data/` for any vertical.

## Three acts

1. **Train the model** (Part A) — teach a base model stable behavior: your
   response shape, your tone, and your tool-selection patterns.
2. **Add the agent capabilities** (Part B) — RAG, memory, evaluation, and
   guardrails every production agent needs.
3. **Operationalize responsibly** (Part C) — security, deployment, cost
   governance, and responsible-AI patterns.

Then **[the voice agent](#how-this-connects-back-to-the-voice-agent) runs the
result** — so the labs aren't academic, they produce something a real app uses.

### Start here

Run **[Lab 00](live-demo/00_synthetic_data_generation.ipynb)** — in 1–2 minutes a single
markdown file becomes a full training set. That's the moment the story starts.
(Setup is below if you haven't configured Azure yet.)

---

## Want a deep-dive Microsoft Foundry training?

The 20 labs double as a **self-paced curriculum** for engineers and architects
who want to *learn* Foundry hands-on, not just demo it. Work the three acts in
order — each one builds on the last, and by the end you've touched the full
customize-to-production lifecycle on real Azure infrastructure.

| Stage | Labs | What you'll master | Time to work through |
|-------|------|--------------------|----------------------|
| **1. Foundations — train a model** | 00 → 03 | Synthetic data generation, supervised fine-tuning (stable behavior), DPO (tone and preference), and tool-calling fine-tuning. The mechanics of teaching a base model *your* conventions, voice, and APIs. | ~2–4 hrs (mostly job wait time) |
| **2. Capabilities — build the agent** | 04 → 09 | RAG, conversation memory, date/time grounding, evaluation scoreboards, the four-layer guardrail stack, and the Foundry Decision Advisor. The patterns every production agent needs. | ~2–3 hrs |
| **3. Production — operate responsibly** | 10 → 18b | Security/compliance, multi-agent orchestration, deployment, continuous eval, cost governance, migration, reasoning (RFT), responsible AI, and end-to-end agent flow. | ~3–4 hrs |

**How to study each lab.** Read the markdown cell at the top (the *why*), run
the cells top-to-bottom (the *how*), then change one variable — a prompt, a
hyperparameter, a data file — and re-run to see what moves. That edit-and-rerun
loop is where the learning sticks.

**Go deeper.** Re-theme the data files in `data/` to your own domain and repeat
Part A — fine-tuning on data you understand is the fastest way to build
intuition for what SFT, DPO, and tool-calling FT each actually change.

**The capstone.** Finish with **[Lab 09 — Foundry Decision Advisor](pre-demo/09_foundry_decision_advisor.ipynb)**.
It ties the whole curriculum together: paste any workload and it maps each gap
to the Foundry capability — and the lab — that solves it. If you can read its
recommendations and know *why* it picked each one, you've internalized the
training.

---

## The labs in detail

### Part A — Fine-tuning labs (training a model)

| # | Lab | What it teaches | Demo moment |
|---|-----|-----------------|-------------|
| 00 | [Synthetic Data Generation](live-demo/00_synthetic_data_generation.ipynb) | Turn `acme_health_kb.md` into 50–80 grounded Q&A training pairs using a deployed chat model | "Look — the model just generated its own training set from a markdown file." |
| 01 | [Supervised Fine-Tuning (SFT)](live-demo/01_supervised_fine_tuning.ipynb) | Teach **stable behavior** — how to answer a policy question consistently, in the required shape. Mutable facts belong in retrieval (Lab 04), not in weights | Held-out scorecard decides the release, and this candidate scores `0/3` against the base model's `1/3` — a `FAIL` |
| 02 | [Direct Preference Optimization (DPO)](live-demo/02_direct_preference_optimization.ipynb) | Teach the model **tone & empathy** — pick the warm ACME response over the cold textbook one | "I just got diagnosed with cancer" → base gives boilerplate; DPO leads with empathy + concrete next steps |
| 03 | [Tool Calling Fine-Tuning](pre-demo/03_tool_calling_fine_tuning.ipynb) | Test whether tuning preserves tool intent with reduced schemas, then enforce quality and safety release gates | Held-out quality, policy, latency, and token scoreboard plus a complete synthetic workflow |

### Part B — Agent capability labs (no training required)

Each runs in 2–5 minutes against the already-deployed `gpt-4o-mini`. Use them as drop-in demos for the patterns every production voice agent needs.

| # | Lab | What it teaches | Demo moment |
|---|-----|-----------------|-------------|
| 04 | [Knowledge Retrieval (RAG)](live-demo/04_knowledge_retrieval.ipynb) | Ground the model in the live example KB with embeddings + cosine retrieval — no retrain when the formulary changes | Ungrounded model invents a copay; grounded model returns the exact `$20` **with a citation** |
| 05 | [Conversation Memory](live-demo/05_conversation_memory.ipynb) | Three memory strategies: sliding window, rolling summary, persistent per-member profile | Member calls back next day → agent already knows her preferred pharmacy and active meds |
| 06 | [Date & Time Awareness](live-demo/06_date_awareness.ipynb) | Stop the model guessing today's date: prompt injection, `get_current_time` tool, and a deterministic mail-order ETA helper | "When does my order arrive?" with the 3 PM PT cutoff baked into a Python function the model calls |
| 07 | [Evaluation](live-demo/07_evaluation.ipynb) | Build a 5-case eval set scored three ways: keyword, LLM-as-judge, and a printable scoreboard | One scoreboard per release — replaces "the model felt better today" with numbers |
| 08 | [Guardrails](live-demo/08_guardrails.ipynb) | The four-layer guardrail stack: hardened system prompt, PII scrubber, out-of-scope refusal, jailbreak defense | Send 3 jailbreak attempts at the agent — watch all 3 get refused politely |
| 09 | [Foundry Decision Advisor](pre-demo/09_foundry_decision_advisor.ipynb) | The "should I use Foundry?" lab — drop in a code sample or task and it recommends a model (with rationale + cost/latency/accuracy tradeoff), maps each gap to a Foundry capability + the lab that proves it, and emits a structured decision trace | Paste a first-draft RAG chatbot → advisor flags 6 gaps and routes each to SFT / RAG / eval / guardrails / routing / tracing |

### Part C — Production & governance labs (no training required)

Run against the base `gpt-4o-mini` deployment — the patterns you need to take a
customized model to production responsibly.

| # | Lab | What it teaches |
|---|-----|-----------------|
| 10 | [Security & Compliance](live-demo/10_security_compliance.ipynb) | PHI/PII handling, audit logging, and compliance-aware patterns |
| 11 | [Agents Orchestration](live-demo/11_agents_orchestration.ipynb) | Coordinate multiple specialized agents behind one entry point |
| 12 | [Production Deployment](live-demo/12_production_deployment.ipynb) | Ship a tuned model and wire it for real traffic |
| 13 | [Continuous Evaluation](live-demo/13_continuous_evaluation.ipynb) | Keep scoring quality after launch, not just before |
| 14 | [Cost Governance](live-demo/14_cost_governance.ipynb) | Track, attribute, and cap spend across deployments |
| 15 | [Migration Path](live-demo/15_migration_path.ipynb) | Move between models/approaches without rewrites |
| 16 | [Reasoning (RFT)](live-demo/16_reasoning_rft.ipynb) | Reinforcement fine-tuning for multi-step reasoning |
| 17 | [Responsible AI](live-demo/17_responsible_ai.ipynb) | Fairness, transparency, and safety checks |
| 18 | [Agent Flow](live-demo/18_agent_flow.ipynb) | End-to-end agentic workflow tying the pieces together |
| 18b | [Imaging Agent Flow](live-demo/18b_imaging_agent_flow.ipynb) | Multimodal / imaging variant of the agent workflow |

### Lab 09 — Foundry Decision Advisor (the "is Foundry worth it?" capstone)

For experienced developers deciding whether to adopt Foundry. The engine lives in
[`_advisor.py`](_advisor.py) and runs **fully offline in mock mode** (pure heuristics); with
Azure creds present it adds an LLM classification pass. It is also a CLI:

```powershell
# Analyze a code sample and get a model + feature recommendation
python _advisor.py --sample data/samples/rag_chatbot.py

# Analyze a plain-text task (cost-optimized routing)
python _advisor.py --task "Summarize 10k member call transcripts nightly" --cost

# Structured JSON for piping into tooling
python _advisor.py --sample data/samples/tool_calling_agent.py --json

# Run the full built-in demo suite
python _advisor.py --demo
```

It classifies the workload, recommends the best deployment from
[`data/foundry_model_catalog.json`](data/foundry_model_catalog.json) **with rationale**, maps
detected gaps to Foundry capabilities (SFT, DPO, tool-calling FT, RAG, memory, eval, guardrails,
routing, tracing) and the lab that proves each, then emits a `trace_id` decision trace to
Application Insights → the Foundry **Tracing** tab.

Plus shared data files in `data/`:

- `acme_health_kb.md` — healthcare knowledge base (pharmacy, plans, member health org, billing)
- `acme_dpo_training_data.json` — 12 preference pairs (cold vs warm answers)
- `acme_tools_schema.json` — 5 example tools (matches the live demo agents)
- `acme_tool_calling_training_data.json` — 12 multi-turn tool-calling traces
- `foundry_model_catalog.json` — deployment catalog (cost/latency/accuracy) used by Lab 09
- `samples/rag_chatbot.py`, `samples/tool_calling_agent.py` — sample inputs for the Lab 09 advisor

---

## Prerequisites

1. **Python 3.10+** and VS Code with the Jupyter extension.
2. **Azure subscription** with a **Microsoft Foundry resource** (`kind: AIServices`) — or a legacy Azure OpenAI resource.
3. **`gpt-4o-mini` deployment** in that resource — used both as the generator for Lab 00 and as the base model for fine-tuning. (`gpt-4o-realtime` and `gpt-4o` **cannot** be fine-tuned today.)
4. **Azure CLI** logged in: `az login --tenant <YOUR_TENANT_ID>`
5. **Role assignments** on the Foundry/AOAI resource — your user needs `Cognitive Services OpenAI Contributor` (data plane: files, jobs, deployments-via-data-plane) **plus** the implicit ARM write permission to PUT a deployment of the fine-tuned model.

---

## One-shot setup (recommended)

Run the setup script. It is idempotent and re-runnable:

```powershell
cd fine-tuning
.\setup-foundry.ps1 `
    -SubscriptionId "<your sub id>" `
    -ResourceGroup  "rg-foundry-labs" `
    -FoundryAccount "aif-foundry-labs" `
    -TenantId       "<your tenant id>" `
    -ProjectName    "agents"
```

It will:
1. Run `az login` if needed and set the subscription.
2. Verify the Foundry AI Services account exists.
3. Create the `gpt-4o-mini` deployment (model `2024-07-18`, GlobalStandard, capacity 50) if missing.
4. Grant **Cognitive Services OpenAI Contributor** to your user on the account.
5. Write `fine-tuning/.env` pointing at the Foundry endpoint.

Then verify with the preflight script:

```powershell
.\.venv\Scripts\Activate.ps1
python fine-tuning\preflight.py
```

You should see ten green `[ OK ]` checks. If anything fails, the script tells you exactly which permission or env var to fix.

---

## Setup (one time, ~3 minutes)

> Skip this section if you ran `setup-foundry.ps1` above.

```powershell
# from the repo root
cd fine-tuning

# create a venv (recommended)
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# install
pip install -r requirements.txt

# create your .env
Copy-Item .env.example .env
# then open .env and fill in YOUR endpoint / subscription / resource group / resource name / tenant
```

Pick the `.venv` kernel inside any notebook (top right → **Select Kernel** →
**Python Environments** → `.venv`).

---

## How to run the demo

| Order | Notebook | Roughly how long |
|-------|----------|------------------|
| 1 | `00_synthetic_data_generation.ipynb` | 1–2 min |
| 2 | `01_supervised_fine_tuning.ipynb`     | 30–60 min (mostly waiting for the job) |
| 3 | `02_direct_preference_optimization.ipynb` | 30–60 min |
| 4 | `03_tool_calling_fine_tuning.ipynb`   | 30–60 min |
| 5 | `04_knowledge_retrieval.ipynb`        | 2–3 min |
| 6 | `05_conversation_memory.ipynb`        | 2–3 min |
| 7 | `06_date_awareness.ipynb`             | 2–3 min |
| 8 | `07_evaluation.ipynb`                 | 2–3 min |
| 9 | `08_guardrails.ipynb`                 | 2–3 min |

You **must** run Lab 00 before Lab 01 (it produces the JSONL files Lab 01
consumes). Labs 02 and 03 are independent — you can run them in any order
after Lab 00. Labs 04–18b only need the base `gpt-4o-mini` deployment and
can run in any order at any time.

---

## What to highlight when presenting

### Lab 00 — Synthetic Data
- One markdown file (`acme_health_kb.md`) becomes a full training set.
- Generated pairs are saved to `data/acme_training.jsonl` (UTF-8 with BOM —
  Azure requirement).
- Cost: a few cents on `gpt-4o-mini`.

### Lab 01 — SFT
- **Baseline first:** the base model is scored on held-out policy questions
  before anything is trained. It gets `1/3`.
- **After training:** the fine-tuned candidate is scored on the *same* held-out
  set. It gets `0/3`. The release gate returns **`FAIL`**.
- The training job succeeded and the loss curve went down. Neither fact is the
  acceptance test — the held-out scorecard is.
- Demo line: *"Foundry produced the model. The scorecard stopped us shipping it.
  That is the process working, not failing."*

### Lab 02 — DPO
- Shows the preference data contract: one prompt, a preferred response, and a
  rejected one.
- Both models are then scored on the same held-out rubric — empathy,
  acknowledgement, concrete next steps, relevant action, no dismissive phrasing.
- On the shipped run the behavior gate returns **`FAIL`**: no measured
  improvement over the base model. The lab teaches the method and the
  evaluation, and deliberately does not claim a win it cannot evidence.
- Demo line: *"A warmer answer can still be wrong, so tone and task completion
  are scored separately."*

### Lab 03 — Tool Calling
- Four configurations run against the same held-out synthetic cases: base/full,
  fine-tuned/full, fine-tuned/reduced, and fine-tuned/schema-free.
- The release table reports tool and argument accuracy, identity-policy compliance,
  structured-call rate, tokens, and p95 latency.
- Result: prompt tokens fall from `585` to `257` (about 56%), but tool accuracy
  and identity-policy compliance both fall from `1.00` to `0.75`. The gate
  returns **`HOLD`**. Schema-free mode produces a `0.0%` structured-call rate.
- Demo line: *"We claim token savings only after the reduced-schema candidate passes
  the same quality and safety gates as the baseline. This one doesn't."*

---

## Costs and cleanup (important)

| Item | Cost | Lives forever? |
|------|------|----------------|
| Fine-tuning job (training) | ~$1–$5 per lab on `gpt-4o-mini` GlobalStandard | One-time |
| Fine-tuned model weights stored in your resource | **Free** | Yes — delete from the portal when done |
| Fine-tuned model **deployment** (so you can call it) | **~$1.70/hour** while live | **Until you delete it** |

Each notebook ends with a **Cleanup** cell that deletes the deployment.
**Run it.** A deployment left on overnight is ~$40.

To also delete the model weights, go to the Foundry portal → your resource →
**Fine-tuning** → select the model → **Delete**.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `DefaultAzureCredential failed` | Run `az login --tenant <TENANT_ID>` and re-run the cell |
| `model not found: gpt-4o-mini` | Deploy `gpt-4o-mini` (version `2024-07-18` or later) in Foundry first |
| `400 Invalid file format` on training upload | Make sure the JSONL was saved with `utf-8-sig` (the notebooks do this) |
| Job stuck at `queued` for >10 min | GlobalStandard capacity; usually clears within 30 min — leave it |
| `403 Forbidden` on the ARM deploy PUT | Your user needs `Cognitive Services OpenAI Contributor` on the resource |
| DPO job fails: `method not supported` | Make sure `AZURE_OPENAI_API_VERSION=2025-04-01-preview` in `.env` |

---

## How this connects back to the voice agent

The tools in `acme_tools_schema.json` — `verify_member_identity`,
`lookup_prescriptions`, `request_refill`, `find_in_network_providers`,
`calculate_medication_price` — are a **direct subset of the real tools** the
companion voice agent in [`examples/voice-agent/backend/src/tools/`](../examples/voice-agent/backend/src/tools)
uses today. The fine-tuned model from Lab 03 could literally be swapped into
the agent and dispatch the same five tools with a fraction of the prompt
overhead — that's the whole point: **the labs customize the model, the voice
agent is the real app that runs it.**

---

## What you walk away with

Work through the three acts and you no longer *describe* model customization —
you can **reason about it from evidence**:

- A held-out scorecard for every technique, so "better" is a measurement rather
  than an impression — including the runs that come back `FAIL` and `HOLD`.
- A working sense of the split: stable behavior in the weights, changing facts
  in retrieval, consequential actions in deterministic code, safety at runtime.
- The production scaffolding around it: retrieval, memory, evaluation
  scoreboards, guardrails, cost controls, and responsible-AI checks.
- A lifecycle you can re-run on your own data by swapping `data/` and the
  config — never rebuilt from scratch.
- Verified, not hypothetical: every notebook has been run live against Azure.

That's the difference between "trust me, it works" and "here is what the
evidence says."
