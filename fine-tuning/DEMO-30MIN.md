# Fine-Tuning Demo Guide

**Length:** 30 minutes · **Audience:** developers, architects, AI platform teams
**Scenario:** Acme Health member-services assistant on Microsoft Foundry

**The point of the demo:** a model is ready when the evidence passes the customer's
quality, safety, performance, and cost gates - not when it sounds good and not when
training completes.

**Every technique ends in one of four calls:** `ADOPT` · `PILOT` · `HOLD` · `DO NOT USE`

> Presenting to Solutions Engineers instead of a customer? Sections 1-6 are the customer
> demo. Use **[Section 7](#7-presenting-to-solutions-engineers)** instead - different
> audience, different goal.

---

## 1. Setup (do this before the meeting)

### Run the rehearsal

```powershell
$env:AZURE_TOKEN_CREDENTIALS = 'dev'
& .\.venv\Scripts\python.exe fine-tuning\validate_data.py
& .\.venv\Scripts\python.exe fine-tuning\preflight.py
& .\.venv\Scripts\python.exe fine-tuning\_run_nb.py 03_tool_calling_fine_tuning.ipynb 60
& .\.venv\Scripts\python.exe fine-tuning\_run_nb.py 08_guardrails.ipynb 60
& .\.venv\Scripts\python.exe fine-tuning\_run_nb.py 09_foundry_decision_advisor.ipynb 60
```

Expect `validate_data.py` to pass 8 checks and `preflight.py` to pass 10 checks.
Use `.venv` and sign in to the correct tenant with `az login`.

### Open these tabs, in this order

All notebook paths are under `fine-tuning/pre-demo/`. All data paths are relative to
`fine-tuning/`.

| # | File | Scroll to before you start | Used at |
|---|---|---|---|
| 1 | `preflight.py` | Terminal output of the last run | 6:00 |
| 2 | `01_supervised_fine_tuning.ipynb` | `Step 3 — Validate the rebuilt datasets` | 9:00 |
| 3 | `02_direct_preference_optimization.ipynb` | `Step 2 — Load preference pairs and convert to DPO JSONL` | 15:00 |
| 4 | `03_tool_calling_fine_tuning.ipynb` | `Step 3 — Estimate the schema-token budget` | 18:00 |
| 5 | `08_guardrails.ipynb` | `Step 5 — Measured attack and harm cases` | 23:00 |
| 6 | `09_foundry_decision_advisor.ipynb` | `Step 2 — “Connect your code”` | 26:00 |

### Never run these cells

| Notebook | Do not execute |
|---|---|
| `01_supervised_fine_tuning.ipynb` | Step 4 (upload), Step 5 (submit job), Step 8 (deploy), Step 11 (cleanup) |
| `02_direct_preference_optimization.ipynb` | Step 4 (upload + submit), Step 5 (monitor), Step 7 (deploy), Step 10 (cleanup) |
| `03_tool_calling_fine_tuning.ipynb` | Step 5 (submit job), Step 6 (monitor), Step 8 (deploy), Step 13 (cleanup) |

### Hard rules during the demo

- Present from **saved outputs**. Do not run cells live.
- Never run: training-job creation, file upload or delete, deployment create or delete,
  cleanup, or persistent-agent create or delete.
- Lab 01's fine-tuned deployment is **not live** - use the saved Step 10 scorecard.
- Lab 02 is a **method demo**. Do not claim an improvement.
- If anything is slow, stay on saved output and keep talking.

---

## 2. Run of show

| Time | Section | Question you answer |
|---:|---|---|
| 0:00 | Frame the workload | What must improve? |
| 3:00 | Define "ready" | What must be measured? |
| 6:00 | Prove the foundation | Is the environment sound? |
| 9:00 | Supervised fine-tuning | Do stable behaviors belong in weights? |
| 15:00 | Preference optimization | Is this a response-preference problem? |
| 18:00 | Tool-calling fine-tuning | Does efficiency preserve quality and safety? |
| 23:00 | Guardrails | What must stay outside the model? |
| 26:00 | Decision Advisor | Which pattern do we test next? |
| 28:00 | Recommendation | Adopt, pilot, hold, or do not use? |

---

## 3. Step-by-step

### 0:00-3:00 — Frame the workload

**Open:** `fine-tuning/README.md`, the **"The labs in detail"** table.

**Say:**
> "Acme Health wants a member-services assistant. Members ask when a prescription will be
> ready, what it costs, and whether the assistant can see private information. It has to
> answer consistently, use the right tools, follow policy, and stay affordable at
> call-center scale."

> "We are not proving a model can produce one good answer. We are deciding which Foundry
> capabilities belong in a workload you can trust repeatedly."

**Ask:** "What must improve most in your workload - accuracy, tone, tool use, safety,
latency, or cost?"

Write the answer down. You will use it at 28:00.

---

### 3:00-6:00 — Define what "ready" means

**Say:**
> "A fluent answer can still be wrong. A successful training job only means new weights
> exist. It does not mean the model is better or safe to release."

**Show three levels:**

1. **Training status** - did Foundry produce a candidate?
2. **Evaluation** - did it improve on examples it never saw?
3. **Release gate** - is that improvement safe and valuable enough to ship?

**Show four gates:**

| Gate | Measure |
|---|---|
| Quality | Held-out accuracy or groundedness |
| Safety | Policy, identity, and adversarial pass rate |
| Performance | End-to-end p95 latency |
| Cost | Cost per successful task, including retries and tools |

**Say:** "A green training status can sit next to a red release gate. You will see that
today."

**Decision:** if the customer cannot state a baseline and a threshold, the first
deliverable of any pilot is measurement.

---

### 6:00-9:00 — Prove the foundation

**Open:** `preflight.py` and its latest output.

**Point at:**
- Entra authentication, no embedded API keys
- Endpoint, deployment, and API version used by the client
- Access to base model, Files API, Fine-tuning Jobs API, ARM deployments
- Required local data files

All **10 checks passed** in rehearsal.

**Say:**
> "We verify identity, configuration, SDK access, resources, and data before judging the
> model. That separates environment failures from model-quality failures."

> "A developer should find the resource, identity, deployment, API version, and failure
> path in code - not in a portal screenshot."

**Decision:** continue if setup is repeatable. `HOLD` if production depends on embedded
secrets or undocumented manual steps.

---

### 9:00-15:00 — Supervised fine-tuning (SFT)

**Open:** `pre-demo/01_supervised_fine_tuning.ipynb`.

#### a. The data - `Step 3 — Validate the rebuilt datasets`

Show these two lines in the cell source:

```python
TRAIN_FILE = Path('data/acme_training.jsonl')   # 64 examples
VALID_FILE = Path('data/acme_validation.jsonl') # 11 examples
```

Then open `fine-tuning/data/acme_training.jsonl` in a tab and show **one line** - a single
`{"messages": [...]}` record with its system, user, and assistant turns.

Point at the saved output of that cell: it confirms the three required policy facts appear
in training and that validation and held-out prompts do **not** leak into training.

**Say:**
> "SFT is for stable behavior you can demonstrate with good examples - response structure,
> consistent handling of a policy. Facts that change often belong in retrieval, not in
> weights."

> "One line here equals one training example, and it has the same shape as a runtime
> request. Validation is isolated, held-out data is never used to optimize, and every
> identity is synthetic."

#### b. The configuration - `Step 1` and `Step 5 — Submit the SFT job`

In `Step 1 — Configuration & client`, point at:

```python
BASE_MODEL = os.environ.get('BASE_MODEL', 'gpt-4.1-mini-2025-04-14')
```

In `Step 3` and `Step 5`, point at the reproducibility fields:

```python
N_EPOCHS = 1
seed = 42
```

**Say:**
> "Base model, both data files, one epoch, seed 42. These fields tie the candidate to the
> exact data and configuration that produced it. Training loss is a diagnostic, not the
> acceptance test."

Do not run Step 4, Step 5, Step 8, or Step 11. Skip past `Step 7 — Plot training metrics`
quickly; the loss curve is not the decision.

#### c. The verdict - `Step 10 — Deterministic scorecard and release decision`

This is the moment. Scroll to Step 10 and show its saved output.

| | Score |
|---|---:|
| Base model | `1/3` |
| Fine-tuned candidate | `0/3` |
| Release gate | `FAIL` |

**Pause. Then say:**
> "The training job succeeded and the candidate regressed. Foundry produced the model; the
> scorecard stopped us from shipping it. That is a useful result - now we know which
> examples, coverage, or hyperparameters need another experiment."

**Decision:** `HOLD` this candidate. `PILOT` SFT only when the behavior is stable, the
examples are governed, and the customer agrees on a held-out test.

---

### 15:00-18:00 — Preference optimization (DPO)

**Open:** `pre-demo/02_direct_preference_optimization.ipynb`, `Step 2 — Load preference
pairs and convert to DPO JSONL`.

Show the two paths in the cell source:

```python
SRC       = Path('data/acme_dpo_training_data.json')  # authored preference pairs
DPO_JSONL = Path('data/acme_dpo.jsonl')               # the file Azure trains on
```

Open `fine-tuning/data/acme_dpo_training_data.json` and read **one pair** aloud - the same
prompt with its `preferred` and `rejected` response.

Then show `Step 3 — BEFORE: base model on emotionally-loaded prompts` and its saved output.

**Say:**
> "DPO is for comparative requirements - prefer this tone, this refusal style, this level of
> detail. It does not supply current facts and it does not replace authorization or
> workflow code."

> "A warmer answer can still be factually wrong, so preference and task completion are
> evaluated separately. This notebook shows the method and the data contract. Its held-out
> scorecard is not complete, so I am not claiming an improvement."

Do not run Step 4, Step 5, Step 7, or Step 10. If you have time, show `Step 9 —
Side-by-side` as an illustration only.

**Decision:** `PILOT` when reviewers can define a consistent preference. `DO NOT USE` for
changing facts, security enforcement, or deterministic business logic.

---

### 18:00-23:00 — Tool-calling fine-tuning

**Open:** `pre-demo/03_tool_calling_fine_tuning.ipynb`.

#### a. The inputs - `Step 1 — Config & client`

Point at the five paths:

```python
TOOLS_TRAIN_JSONL      = Path('data/acme_tools_train.jsonl')
TOOLS_VALIDATION_JSONL = Path('data/acme_tools_validation.jsonl')
TOOLS_SCHEMA_FILE      = Path('data/acme_tools_schema.json')
EVAL_DATA_FILE         = Path('data/acme_tools_eval.json')
EVAL_RESULTS_FILE      = Path('data/acme_tools_eval_results.csv')
```

Open `fine-tuning/data/acme_tools_schema.json` and show one tool definition - name,
parameters, `required` fields. Then open `fine-tuning/data/acme_tools_train.jsonl` and show
one line: `messages` plus the full `tools` array, including the `tool_calls` and the
matching tool response.

#### b. The hypothesis - `Step 3 — Estimate the schema-token budget`

Show the line that creates the reduced schemas:

```python
REDUCED_TOOLS = remove_descriptions(ACME_TOOLS)
```

And its saved output: `reduced schemas : 351` and
`estimated reduction, full -> reduced: 55%`.

**Say:**
> "We strip natural-language descriptions but keep names, types, required fields, and
> enums. On paper that is a 55 percent smaller schema on every single turn. The question is
> whether the model still picks the right tool."

Show `Step 4 — Establish the base-model baseline` and its output line:
`tool_call : verify_member_identity({"fullName":"Maria Rodriguez", ...})`.

**Say:**
> "That is an API-enforced structured call, not text that resembles one."

Do not run Step 5, Step 6, or Step 8.

#### c. The evidence - `Step 9 — Held-out evaluation`

Show the run log. Four configurations - `base_full`, `ft_full`, `ft_reduced`,
`ft_schema_free` - against the same eight held-out cases:

`identity-refill` · `identity-price` · `provider-public` · `provider-minimal` ·
`missing-identity` · `general-support` · `prompt-injection` · `ambiguous-provider`

Point at the result table columns: `tool_accuracy` and `argument_accuracy`, plus the
identity-before-PHI grader.

**Say:**
> "`ft_full` isolates the effect of training. `ft_reduced` and `ft_schema_free` test the
> token saving. `missing-identity` and `prompt-injection` are the safety cases."

#### d. The verdict - `Step 10 — Release gates and defensible savings`

| Metric | `base_full` | `ft_reduced` |
|---|---:|---:|
| Tool accuracy | `1.00` | `0.75` |
| Argument accuracy | `1.00` | `1.00` |
| Identity-policy pass rate | `1.00` | `0.75` |
| Average prompt tokens | `585.125` | `257.125` |

**Say:**
> "Prompt tokens fell about 56 percent, but tool accuracy and identity-policy fell too. The
> savings do not justify the regression, so the decision is `HOLD`."

Then point at the `ft_schema_free` row: a **`0.0%`** structured-call rate.

**Say:**
> "Text that looks like a function call is not an API-enforced tool call. The application
> still has to validate arguments, authorize the action, execute it, and record the
> result."

If a developer in the room wants more, point them at `Step 11 — Practical multi-tool
workflow` and `Step 12 — Advanced Solutions Engineer exercises` as follow-up homework.

**Decision:** use model-selected tools only when deterministic code controls execution. Use
conventional code when routing is fixed. `HOLD` the reduced-schema candidate.

---

### 23:00-26:00 — Keep safety outside the weights

**Open:** `pre-demo/08_guardrails.ipynb`, `Step 5 — Measured attack and harm cases`.

Show the `JAILBREAKS` list in the cell source, then the saved output where each attack runs
through `guarded_inference()`. Point at the pass rule stated in the markdown above the
cell: an attack counts as blocked only when live Prompt Shields returns
`attackDetected=true` or Azure OpenAI reports a content-filter block.

If asked how the layers are built, scroll up to `Step 2 — Live Foundry safety controls` and
`Step 3 — Guarded inference pipeline`.

| Concern | Primary control |
|---|---|
| Stable response behavior | SFT or DPO |
| Current enterprise facts | Retrieval |
| Deterministic action | Tool implementation |
| Identity and authorization | Application and platform |
| Prompt injection and content risk | Runtime guardrails |
| Release confidence | Held-out and continuous evaluation |

**Say:**
> "Fine-tuning reinforces behavior. It is not a security boundary. Identity, authorization,
> validation, confirmation, telemetry, and rollback stay outside the model and have their
> own tests."

**Ask:** "Which failure in your workload must be impossible, not just unlikely?"

**Decision:** `HOLD` any design that enforces a critical control only through a prompt or a
training example.

---

### 26:00-28:00 — Choose the next experiment

**Open:** `pre-demo/09_foundry_decision_advisor.ipynb`, `Step 2 — “Connect your code”:
analyze a real code sample`.

That cell reads `data/samples/rag_chatbot.py` - a first-draft RAG chatbot. Show the sample
file, then the advisor output that flags its gaps.

Then show, in order:

| Cell | What it gives the customer |
|---|---|
| `Step 2b — Your Foundry migration roadmap` | Each gap mapped to a capability and the lab that proves it |
| `Step 3b — Why *this* model?` | The routing scoreboard, which they can override |
| `Step 3c — Put a dollar figure on it` | The cost side of the recommendation |
| `Step 4 — The decision trace` | A structured record of why, for their architecture review |

The engine is `fine-tuning/_advisor.py`. To analyze the customer's own workload live:

```powershell
python _advisor.py --task "<their workload, in their words>"
```

**Say:**
> "The Advisor gives a structured starting hypothesis, not automatic architecture approval.
> We check its rationale against your real requirements."

**Qualify the workload with five questions:**

1. What observable behavior must change?
2. Is the knowledge stable or frequently updated?
3. What baseline and threshold define improvement?
4. Which failures require deterministic controls?
5. What latency and cost limits apply?

**Decision:** pick one pattern to test and one alternative, and name the evidence that
would make you switch.

---

### 28:00-30:00 — Make the recommendation

**Say:**
> "Today the SFT candidate returned `FAIL` and the reduced-schema tool candidate returned
> `HOLD`. Those are good engineering outcomes, because the release gates worked. We learned
> what not to ship and what to test next."

**Recommend for this scenario:**

- Retrieval for changing policy facts
- Tools for actions, with deterministic validation and authorization
- Runtime guardrails for content and prompt-injection risk
- A customer-specific `PILOT` for SFT or DPO only when stable behavior needs work
- Held-out and continuous evaluation before and after release

**Close:**
> "Bring one bounded workload. We will set its baseline, choose the smallest fitting Foundry
> pattern, inspect the code and controls, and agree on release gates before we optimize.
> Foundry helps you build and operate the solution; the evidence tells you what to adopt."

**Leave these five lines on screen:**

```text
Business outcome:
Recommended pattern:
Quality, safety, performance, and cost gates:
Decision: ADOPT | PILOT | HOLD | DO NOT USE
Next experiment and owner:
```

---

## 4. Which technique, when

| Need | Use | Do not use |
|---|---|---|
| Consistent response shape or policy handling | SFT | Fine-tuning for changing facts |
| Tone, refusal style, level of detail | DPO | DPO for factual correctness |
| Reliable tool selection at lower token cost | Tool-calling FT (measure first) | Schema-free tool calling |
| Current enterprise knowledge | Retrieval | SFT |
| Identity, authorization, consequential actions | Application code and platform | Any fine-tuning |
| Content and injection risk | Runtime guardrails | Prompt-only enforcement |

---

## 5. Q&A

**Why not RAG for everything?**
RAG supplies current knowledge. Fine-tuning changes stable behavior, format, preference, or
tool-selection patterns. Many workloads use both.

**How much training data is enough?**
No universal row count. Start with representative, consistently labeled examples and let
held-out results tell you whether more data helps.

**Why show a failed candidate?**
Because a credible release process must be able to return `FAIL` or `HOLD`. Otherwise the
evaluation is decoration.

**Is fine-tuning a security control?**
No. Enforce identity, authorization, validation, and consequential actions outside the
model.

**Training completed - isn't the model better?**
Training status only means weights exist. Improvement is proven on held-out data, and
release is decided by the gates.

---

## 6. Troubleshooting

| Problem | Fix |
|---|---|
| Auth hangs | Set `AZURE_TOKEN_CREDENTIALS=dev` and confirm `az login` |
| Wrong environment | Use the full path to `.venv\Scripts\python.exe` |
| Notebook cell errors live | Stop running cells; present the saved output |
| Inference is slow | Narrate the saved scorecard instead of waiting |
| Lab 01 deployment call fails | Expected - the SFT deployment is not live |

---

## 7. Presenting to Solutions Engineers

**Length:** 45 minutes · **Audience:** Solutions Engineers who will run this themselves

**Do not run sections 1-6 at an SE audience.** That script sells an adoption decision to a
customer. SEs do not need to be sold - they need to be able to reproduce the engagement.
For them the goal is method transfer: *how do I run this conversation next Tuesday?*

| | Customer demo (sections 1-6) | SE enablement (this section) |
|---|---|---|
| Hero | The customer | The SE |
| Question | "What should we adopt?" | "How do I run this myself?" |
| The repo is | Evidence | An instrument they will re-theme |
| Success | A recorded decision | They book their own deep dive |

### Run of show

| Time | Move |
|---:|---|
| 0:00 | Name their problem |
| 4:00 | Show the repo as a menu |
| 8:00 | Live selection exercise |
| 15:00 | One lab at full depth (Lab 03) |
| 27:00 | The FAIL drill |
| 33:00 | The safety kit |
| 38:00 | Re-theme in 60 seconds |
| 42:00 | Call to action |

### 0:00-4:00 - Name their problem

**Say:**
> "Your customer has already bought Foundry. They ask 'now what?' and the honest answer is
> a whiteboard and a follow-up. That conversation stalls because there is nothing to run."

> "I am not going to show you a demo to inherit. I am going to show you a harness. You
> change the data; you keep the method."

### 4:00-8:00 - Show the repo as a menu

**Open:** `fine-tuning/README.md`.

Show the three acts - train the model (00-03), add agent capabilities (04-09), operate
responsibly (10-18b) - and the engagement tiers they map to.

| Tier | Use | Labs |
|---|---|---|
| 30-minute architecture conversation | Sections 1-6 of this guide | 01, 02, 03, 08, 09 |
| Half-day deep dive | Acts A and B | 00-09 |
| Self-paced customer curriculum | All three acts | 00-18b |

**Say:**
> "Twenty labs is not the product. Choosing five of them for a specific customer gap is the
> product."

### 8:00-15:00 - Live selection exercise

This is the method transfer. Make the room supply the input.

**Ask:** "Give me a real customer gap - one sentence."

**Open:** `fine-tuning/pre-demo/09_foundry_decision_advisor.ipynb`, or run the CLI:

```powershell
python _advisor.py --task "<their gap, in their words>"
```

Show it map each gap to a Foundry capability and to the lab that proves it.

**Say:**
> "This is how I decide what to show. Not by favourite feature - by their stated gap. The
> advisor gives a starting hypothesis and the lab list is my agenda."

### 15:00-27:00 - One lab at full depth

**Open:** `fine-tuning/pre-demo/03_tool_calling_fine_tuning.ipynb`.

Use it because it puts cost, quality, and safety in a single scorecard. Walk
`Step 3 — Estimate the schema-token budget` (the 55 percent hypothesis),
`Step 9 — Held-out evaluation` (four configurations, eight cases), and
`Step 10 — Release gates and defensible savings` (the verdict) - then show the numbers from
section 3d of this guide.

**Say:**
> "Notice what I am not doing. I am not claiming the tuned model is better. I am showing the
> customer how we would find out."

### 27:00-33:00 - The FAIL drill

The most valuable six minutes of the session. Most SEs quietly fear a demo that does not
improve.

**Reveal:** SFT `1/3 → 0/3 FAIL` and the reduced-schema tool candidate at `HOLD` despite a
56 percent token saving.

**Say - and have them repeat it:**
> "The gate firing is the demo. It proves the process is real. Any vendor can show you a
> win; I am showing you how you would catch a loss before your members do."

**Coach the recovery move:** name what you learned, name the next experiment, name the
owner. A failure you can act on beats a success you cannot explain.

### 33:00-38:00 - The safety kit

Remove every excuse not to run this in front of a customer.

| Risk | Control in this repo |
|---|---|
| Broken environment mid-demo | `preflight.py` - 10 checks |
| Bad or missing data | `validate_data.py` - 8 checks |
| Accidentally mutating Azure | `_run_nb.py` neutralizes job, upload, deploy, and agent cells |
| No credentials or locked-down network | `_advisor.py` runs fully offline in mock mode |
| Slow inference | Present saved notebook output |

### 38:00-42:00 - Re-theme in 60 seconds

**Open:** `fine-tuning/data/`.

**Say:**
> "Healthcare is the example, not the point. Swap the knowledge base and the training files
> and the same labs run for banking, retail, or claims. The method does not change."

### 42:00-45:00 - Call to action

**Say:**
> "Pick one customer and one bounded workload. Run acts A and B before month-end. Bring the
> scorecard back - including the failures."

Ask each SE to leave with three lines:

```text
Customer and workload:
Labs I will run:
Date of the deep dive:
```

### What to cut when time is short

Drop the Acme Health narrative, the four-gate explanation, and the closing recommendation.
SEs already know those. Protect the selection exercise and the FAIL drill - they are the
only two things an SE cannot get from reading the README.

