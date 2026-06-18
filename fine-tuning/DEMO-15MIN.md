# Acme Health · Foundry Demo — 15-Minute Showcase Script

A ruthlessly tight cut of the full walkthrough. One story: *a generic model can't run a
health plan — Foundry makes it correct, cheap, safe, agentic, and provable.* Six moments,
15 minutes, every second earns its place.

- **Run from:** `fine-tuning/pre-demo/` (finished outputs render instantly — no waiting).
- **Golden rule:** these notebooks are pre-run. **Don't re-execute live on stage.** Scroll
  to the already-rendered output cell, read the result, land the line, move on.
- **Have open in tabs (in order):** `01` → `02` → `03` → `08` → `18b` → `09`, plus the
  Foundry **Tracing** tab in the portal.

---

## ⏱️ The minute budget

| Time | Lab | The one thing you prove |
|-----:|-----|-------------------------|
| 0:00–1:00 | Opening frame | The stakes: trust, cost, compliance |
| 1:00–3:30 | **01 · SFT** | Generic guesses; fine-tuned *knows* ($20 copay) |
| 3:30–5:00 | **02 · DPO** | Same facts, Acme bedside manner |
| 5:00–7:00 | **03 · Tool-calling** | Same call, ~80% fewer tokens = millions/mo |
| 7:00–8:30 | **08 · Guardrails** | 3 jailbreaks → 3 refusals, 0 leaks |
| 8:30–12:00 | **18b · Imaging flow** | Multimodal + multi-agent tumor board, live |
| 12:00–14:30 | **09 · Decision Advisor** | The platform tells you *which* lab to use |
| 14:30–15:00 | Close | "Foundry gives you the receipts" |

> If you're running long, the two cuttable moments are **02** and **08** (mention them
> in one sentence each). Never cut 01, 03, 18b, or 09 — they are the spine.

---

## 0:00 — Opening frame (60 sec)

> "You're on the phone with Acme Health: *what's my copay, when does my prescription
> arrive, is this covered.* A generic chatbot answers confidently — and is sometimes
> wrong. In healthcare, wrong isn't an option. In the next fifteen minutes I'll turn a
> generic model into a Acme agent that's **accurate, warm, cheap, safe, and agentic** —
> and I'll prove every claim."

Name the three stakes once: **trust, cost, compliance.** Every moment pays back one.

---

## 1:00 — Lab 01 · Supervised Fine-Tuning  *(correctness)*

**Open:** `pre-demo/01_supervised_fine_tuning.ipynb`

1. Scroll to the **base vs. fine-tuned** comparison output.
2. Read the base `gpt-4o-mini` answer to a specialist-copay question — it *guesses*.
3. Read the fine-tuned answer — it returns **$20**, the exact KB number.

> "Same model family, same prompt. The base one improvises; the tuned one *knows*. That's
> the difference between a generic chatbot and a Acme agent."

**Land it:** correctness is a training outcome, not a lucky prompt.

---

## 3:30 — Lab 02 · Direct Preference Optimization  *(tone)*

**Open:** `pre-demo/02_direct_preference_optimization.ipynb`

1. Read the emotional prompt aloud — a member who just got a cancer diagnosis.
2. Base answer: correct but cold. DPO answer: leads with empathy, then concrete Acme
   next steps.

> "We didn't add a single fact. We taught it how Acme wants members to *feel*."

---

## 5:00 — Lab 03 · Tool-Calling Fine-Tuning  *(cost)*

**Open:** `pre-demo/03_tool_calling_fine_tuning.ipynb`

1. Frame the cost leak: every voice turn ships ~800–1,200 tokens of tool schemas *before
   the member speaks*.
2. Scroll to the **token-cost table** — full schemas vs. names-only vs. no `tools` array.
3. Same correct `verify_member_identity` call, ~**80% fewer** prompt tokens.

> "Same call, millions of tokens a month cheaper. This is the line item your CFO feels."

---

## 7:00 — Lab 08 · Guardrails  *(safety)*

**Open:** `pre-demo/08_guardrails.ipynb`

1. Name the four layers: hardened system prompt → PII scrubber → out-of-scope refusal →
   jailbreak defense.
2. Scroll to the **three jailbreak attempts** → three polite refusals, zero leaked data.

> "Safe by design, not by luck. Nothing here trains on live PII."

---

## 8:30 — Lab 18b · Multimodal Imaging Flow  *(the showpiece)*

**Open:** `pre-demo/18b_imaging_agent_flow.ipynb` — this is the "wow," budget the most time.

Walk the rendered outputs top to bottom (all pre-run):

1. **Perception (multimodal).** `gpt-4o` reads an *actual* synthetic CT slice and writes a
   radiology-style impression. "One genuinely multimodal step — pixels in, text out."
2. **The team.** A **tumor-board coordinator** fans the case out to two server-side
   specialists via `ConnectedAgentTool` — imaging-findings + RECIST prior-comparison — then
   merges a board draft. Point at the **run-steps trace**: who saw what, in order.
3. **The result.** RECIST **Partial Response, −33.3%** (20 mm vs. 30 mm baseline).
4. **Fine-tuning ties back (Step 7).** Show the base vs. fine-tuned token comparison — the
   same SFT/DPO/tool-calling techniques from Labs 01–03, now in an imaging context.
5. **Cost (Step 8).** The tiering table: reserve `gpt-4o` for the *pixels*, run the
   reasoning team on cheap (fine-tuned) `gpt-4o-mini` → **~−59%** vs. all-`gpt-4o`.

> "Perception and reasoning are separate tiers. Do the expensive multimodal read once,
> then route its *text* through a cheap, fine-tuned, server-side team. That's a real
> agentic system — and it's auditable in the Tracing tab."

**Optional flourish:** switch to the Foundry **Tracing** tab and show the same flow as a
live trace — the who-saw-what audit trail reviewers ask for.

---

## 12:00 — Lab 09 · Foundry Decision Advisor  *(capstone)*

**Open:** `pre-demo/09_foundry_decision_advisor.ipynb`

1. Frame: "You've seen the capabilities. How do you know *which* ones a workload needs?"
2. Drop a first-draft RAG chatbot into the advisor. It flags ~6 gaps, recommends a model
   with a **cost / latency / accuracy** tradeoff, and routes each gap to the exact lab that
   fixes it.
3. Point at the **decision trace** (`trace_id`, tokens, flags, confidence) — pull it up in
   Application Insights if time allows.

> "Foundry isn't a model endpoint. It's the platform that tells you *which* model, whether
> to fine-tune, how to ground, guard, and evaluate — and gives you the receipts to prove it
> in production."

---

## 14:30 — Close (30 sec)

> "Five claims, all proven in fifteen minutes: **correct** (01), **on-brand** (02),
> **cheap** (03), **safe** (08), and **agentic + multimodal** (18b) — with a decision
> engine that picks the right tool for any workload (09). That's Azure AI Foundry."

---

## Pre-flight (do this before you walk in)

- [ ] `.venv` active, `az login` complete (correct tenant).
- [ ] All six notebooks **pre-run** so outputs render instantly; scroll positions set near
      each money-shot cell.
- [ ] Deployments live: `gpt-4o`, `gpt-4o-mini`, `text-embedding-3-large`, `model-router`,
      `acme-sft` / `acme-dpo` / `acme-tools`.
- [ ] Foundry **Tracing** tab open (for 18b + 09).
- [ ] Browser zoom up; output cells visible without horizontal scroll.

## If something breaks on stage

- **Don't live-run.** Every money shot is already rendered — just scroll to it.
- A skip message (`[skip] set ACME_WORKFLOW_NAME …`, `unavailable (mock)`) is **expected
  fallback behavior**, not an error — say "that's the graceful-degradation path" and move on.
- Out of time? Compress to the spine: **01 → 03 → 18b → 09**. That alone tells the whole story.
