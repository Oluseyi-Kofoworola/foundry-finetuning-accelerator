# Foundry Fine-Tuning Accelerator

### Learn how model customization actually works — and prove it on Microsoft Foundry.

Most fine-tuning material stops at "here's the API call." This repo goes further:
**20 runnable labs** that take a base model through synthetic data generation,
supervised fine-tuning, preference optimization, tool-calling fine-tuning,
retrieval, guardrails, evaluation, and production governance — then **measure
whether any of it actually helped**.

Every lab runs live against your own Azure subscription. Nothing is mocked.

---

## Two ways to use this

| | **Learn it** | **Demo it** |
|---|---|---|
| **You want** | To understand what SFT, DPO, and tool-calling FT really change | To show a customer or team what Foundry can do |
| **Start at** | [Lab 00](fine-tuning/live-demo/00_synthetic_data_generation.ipynb) and work forward | [DEMO-30MIN.md](fine-tuning/DEMO-30MIN.md) |
| **Time** | ~8-11 hours across three stages | 30 minutes, from saved outputs |
| **Output** | Intuition you can defend in a design review | A decision: `ADOPT` / `PILOT` / `HOLD` / `DO NOT USE` |

---

## What you'll understand when you're done

Not "how to call the fine-tuning API" — you get that in Lab 01. The harder things:

- **Why a finished training job tells you almost nothing.** Training status,
  held-out evaluation, and release readiness are three different questions.
  Labs 01 and 03 show a green job sitting next to a red gate.
- **What each technique actually moves.** SFT changes stable behavior. DPO
  changes comparative preference. Tool-calling FT changes selection. None of
  them add facts.
- **Why fine-tuning is not a security boundary.** Lab 08 shows a tuned model
  still needs identity, authorization, and runtime guardrails outside the
  weights.
- **How to price a tradeoff.** Lab 03 cuts prompt tokens by 56% and *still*
  fails its gate, because accuracy and policy compliance fell with them.
- **When not to fine-tune at all.** Lab 09 routes a workload to retrieval,
  tools, or plain code when those fit better.

---

## The decision table

The single most useful artifact here. Most "should we fine-tune?" arguments end
the moment someone names the failure mode precisely.

| If the problem is... | Use | Not |
|---|---|---|
| Inconsistent response shape or policy handling | **SFT** (Lab 01) | Fine-tuning for facts that change |
| Wrong tone, refusal style, or level of detail | **DPO** (Lab 02) | DPO for factual correctness |
| Unreliable tool selection, or schema token cost | **Tool-calling FT** (Lab 03) — measure first | Schema-free tool calling |
| The model doesn't know current facts | **Retrieval** (Lab 04) | SFT |
| An action must happen exactly once, correctly | **Tool implementation in code** | Any fine-tuning |
| Identity, authorization, consequential actions | **Application and platform controls** (Lab 10) | Prompts or training examples |
| Prompt injection or harmful content | **Runtime guardrails** (Lab 08) | Prompt-only enforcement |
| You don't know which of the above it is | **Lab 09 — Decision Advisor** | Guessing |

---

## Quick start

```powershell
cd fine-tuning
python -m venv .venv
.\.venv\Scripts\Activate.ps1          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env                  # fill in your own endpoint and resource
python validate_data.py               # 8 data integrity checks
python preflight.py                   # 10 environment checks
```

`preflight.py` verifies identity, endpoint, API version, base-model access, the
Files and Fine-tuning APIs, ARM deployment permissions, and required data files
— **before** you lose an hour debugging a notebook that was never going to work.
It runs every check and reports one summary, so a single broken thing doesn't
hide the rest. Add `--json` for automation.

Then open `fine-tuning/live-demo/00_synthetic_data_generation.ipynb`.

> **Auth tip:** if `DefaultAzureCredential` hangs, set
> `AZURE_TOKEN_CREDENTIALS=dev` and make sure `az login` is current.

### What you need

| | |
|---|---|
| Azure | A Microsoft Foundry (AIServices) resource with a fine-tunable base model deployed |
| Roles | Cognitive Services OpenAI Contributor · Cognitive Services User · Cognitive Services Contributor |
| Default model | `gpt-4o-mini-2024-07-18` — cheap, fast, supports SFT, DPO, and tool-calling |
| API version | `2025-04-01-preview` |
| Python | 3.10+ |

**Cost and time.** Fine-tuning jobs are the only slow, billable part — budget
20-60 minutes per job. Labs 04 through 18b run in 2-5 minutes each against your
already-deployed base model and cost pennies.

---

## The learning path

`live-demo/` is yours to run. `pre-demo/` holds the same labs with **verified
saved outputs** — read those while a job is still training, or to see the
expected result before spending money.

| Stage | Labs | What you'll master | Time |
|---|---|---|---|
| **1. Foundations** | 00 → 03 | Synthetic data generation, SFT, DPO, tool-calling FT. The mechanics of teaching a base model your behavior, voice, and APIs. | ~2-4 hrs (mostly job wait) |
| **2. Capabilities** | 04 → 09 | RAG, conversation memory, date grounding, evaluation scoreboards, the guardrail stack, and the Decision Advisor. | ~2-3 hrs |
| **3. Production** | 10 → 18b | Security and compliance, orchestration, deployment, continuous eval, cost governance, migration, RFT, responsible AI, agent flow. | ~3-4 hrs |

**How to study a lab.** Read the markdown cell at the top (the *why*), run the
cells top to bottom (the *how*), then change one variable — a prompt, a
hyperparameter, a data row — and re-run. The edit-and-rerun loop is where the
learning sticks.

<details>
<summary><b>All 20 labs</b></summary>

| # | Lab | What it teaches |
|---|-----|-----------------|
| 00 | Synthetic data generation | Turn a knowledge base into grounded Q&A training pairs |
| 01 | Supervised fine-tuning (SFT) | Teach stable behavior, then measure it on held-out data |
| 02 | Direct preference optimization (DPO) | Shift tone and refusal style with preference pairs |
| 03 | Tool-calling fine-tuning | Trade schema tokens against tool accuracy and policy |
| 04 | Knowledge retrieval (RAG) | Ground answers in current content, with citations |
| 05 | Conversation memory | Sliding window, rolling summary, persistent profile |
| 06 | Date and time awareness | Stop the model guessing what "today" is |
| 07 | Evaluation | Keyword scoring, LLM-as-judge, and a printable scoreboard |
| 08 | Guardrails | Prompt Shields, content filters, layered defense |
| 09 | Foundry Decision Advisor | Map a workload's gaps to the right capability |
| 10 | Security and compliance | PHI/PII handling, audit logging |
| 11 | Agents orchestration | Coordinate specialized agents behind one entry point |
| 12 | Production deployment | Ship a tuned model and wire it for real traffic |
| 13 | Continuous evaluation | Keep scoring after launch, not just before |
| 14 | Cost governance | Track, attribute, and cap spend |
| 15 | Migration path | Move between models and approaches without rewrites |
| 16 | Reasoning (RFT) | Reinforcement fine-tuning for multi-step reasoning |
| 17 | Responsible AI | Fairness, transparency, and safety checks |
| 18 / 18b | Agent flow | End-to-end agentic workflow, plus a multimodal variant |

Full run order and per-lab detail: [fine-tuning/README.md](fine-tuning/README.md).

</details>

---

## The labs are allowed to fail — and they do

This is the part most demos leave out, and the reason this repo is worth your
time.

The shipped results for Labs 01 and 03 are **negative**.

**Lab 01 — supervised fine-tuning**

| | Score |
|---|---:|
| Base model | `1/3` |
| Fine-tuned candidate | `0/3` |
| Release gate | **`FAIL`** |

**Lab 03 — tool-calling fine-tuning**

| Metric | Base / full schemas | Tuned / reduced schemas |
|---|---:|---:|
| Tool accuracy | `1.00` | `0.75` |
| Argument accuracy | `1.00` | `1.00` |
| Identity-policy pass rate | `1.00` | `0.75` |
| Average prompt tokens | `585.125` | `257.125` |
| Release gate | | **`HOLD`** |

Schema-free mode produced a **`0.0%`** structured-call rate — text that *looks*
like a function call is not an API-enforced tool call.

Both training jobs succeeded. Both models got worse. **That is the lesson:** a
release process that cannot return `FAIL` is not a release process, and a 56%
token saving does not pay for a policy regression. Every scorecard here is
deterministic and reproducible, so you can go find out *why* — and fix it.

---

## How this repo keeps itself honest

A repo that argues for evidence should hold itself to it. Every push runs
[`.github/workflows/quality-gate.yml`](.github/workflows/quality-gate.yml):

| Guard | Why it exists |
|---|---|
| **Leakage detection** | An evaluation prompt that is a reworded training prompt silently inflates every score. `validate_data.py` flags near-duplicates across all train/held-out pairs — it caught a real contaminated case the first time it ran. |
| **Pinned dependencies** | "Verified labs" means nothing if `pip install` resolves different SDKs next year. Versions are pinned to the ones the labs were actually run against. |
| **Link checking** | Validated against git-tracked paths, so a link that works on the author's machine but 404s in a clone still fails. |
| **No environment-specific values** | Local paths, real endpoints, and notebook kernel names are rejected before they reach the repo. |
| **Lab parity** | The 20 labs exist in `live-demo/` and `pre-demo/`; changing one and forgetting the other fails the build. |
| **Preflight** | `preflight.py` runs all ten environment checks and reports one summary, so a single misconfiguration doesn't hide the rest. `--json` for automation. |

---

## The 30-minute demo

[**fine-tuning/DEMO-30MIN.md**](fine-tuning/DEMO-30MIN.md) is a complete
presenter guide: exactly which notebook steps to open, what to say, which cells
must never run, and the decision to land on.

It has two tracks:

- **Sections 1-6 — customer demo.** One workload from framing to
  recommendation, judged on quality, safety, performance, and cost gates.
- **Section 7 — engineer enablement.** For teaching *other* engineers to run
  it: a live lab-selection exercise, the "what do I say when it fails" drill,
  and the safety kit.

Rehearse safely with the included harness, which neutralizes any cell that would
submit a billable job or mutate a deployment:

```powershell
cd fine-tuning
python _run_nb.py 03_tool_calling_fine_tuning.ipynb 60
```

---

## What else is in here

| Path | What it is |
|---|---|
| [`fine-tuning/`](fine-tuning/) | The 20 labs, data, preflight, validator, and demo guide |
| [`fine-tuning/clinical-rtor/`](fine-tuning/clinical-rtor/) | **A second use case** — the same lifecycle applied to clinical quality abstraction: strict JSON output, batch scoring over a DataFrame. Seeing one lifecycle on two very different tasks is what turns procedure into intuition. |
| [`fabric/`](fabric/) | Microsoft Fabric track — OneLake landing, RAG baseline, fine-tuned scoring, hybrid routing, MLflow evaluation |
| [`examples/voice-agent/`](examples/voice-agent/) | A production-style voice and chat app that dispatches the *same tools* you fine-tune in Lab 03. A model from Labs 01-03 drops straight in. |
| [`config/`](config/) | One config file re-skins brand, names, and resources across every lab |

All names, data, and scenarios in this repo are **fictional and synthetic**. No
real patient, member, or customer data appears anywhere.

---

## Make it yours

The fastest way to build real intuition is to run Stage 1 on data *you*
understand. Edit `config/client.config.json`, then:

```powershell
npm install
npm run apply:config     # propagates brand and resource values into the labs
```

Or re-theme the files in `fine-tuning/data/` directly and re-run Labs 00-03.
Full walkthrough: [docs/CUSTOMIZATION.md](docs/CUSTOMIZATION.md).

---

## Security

No secrets are committed. Subscription IDs, endpoints, and keys live only in
gitignored `.env` files, each with a `*.example` template. Authentication is
Entra-based throughout — there are no API keys in the notebooks.

This repo demonstrates patterns relevant to regulated industries (PHI/PII
handling, audit logging, content safety). Review them against your own
compliance requirements before adapting. See [SECURITY.md](SECURITY.md).

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Licensed under the [MIT License](LICENSE).
