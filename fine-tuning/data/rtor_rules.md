# Return to the Operating Room (RTOR) — Clinical Abstraction Rules

> **Example data for a clinical document-abstraction scenario.** Every patient
> timeline, operative note, and provider NPI below is **fully synthetic** and
> contains **no real PHI**. Replace the rules and notes with your own registry
> definition when you customize the accelerator.

This knowledge base defines how a surgical-quality abstractor decides whether a
given operative episode counts as an **unplanned Return to the Operating Room
(RTOR)** for the index surgical procedure. It is consumed by the **Acme Health
Surgical Quality abstraction assistant**, which reads the structured inputs for
one case and emits `{ "is_return_to_or": <bool>, "evidence": "<exact text>" }`.

The model must apply the rules **strictly** and cite the **exact sentence** from
the source documents that justified its determination.

---

## Inputs available per case

For each case the abstractor receives:

- **Patient timeline** — dated surgical events for this patient (the index
  surgery plus any subsequent procedures), with the day offset from the index
  surgery.
- **Progress note** — the clinical narrative around the current encounter.
- **Index surgery procedure description** — the short CPT-style description of
  the original (index) operation.
- **Index surgery operative note** — the narrative of the index operation,
  including any documented plan to return.
- **Current surgery procedure description** — the short description of the
  operation under review.
- **Current surgery operative note** — the narrative of the operation under
  review, including the stated indication.

---

## Definition

A **Return to the Operating Room (RTOR)** is an **unplanned** return to an
operating room for a surgical procedure that is **related to the index surgery**
and occurs within **30 days** of the index surgery.

A return is **not** an RTOR if it was **planned or staged** at the time of the
index surgery, if it is **unrelated** to the index surgery (different anatomy,
new diagnosis), or if it occurs **more than 30 days** after the index surgery.

---

## Specific Abstraction Rules

### Rule 1 — Conflict-resolution order (apply in this exact priority)

When more than one rule could apply, resolve the conflict by applying the rules
in the following order. The **first** rule that matches decides the case.

1. **Planned / staged overrides everything.** If the index operative note OR the
   current operative note documents that the second procedure was **planned,
   staged, anticipated, or scheduled** at the time of the index surgery
   (e.g. "planned second-look", "staged washout", "return to OR scheduled for
   delayed closure"), then **`is_return_to_or = false`** — even if it occurs
   within 30 days. A planned return is part of the original surgical plan.

2. **Unplanned + related + within 30 days = RTOR.** If the current surgery is
   **unplanned** and addresses a **complication of the index surgery**
   (post-operative bleeding, hematoma, surgical-site infection, wound
   dehiscence, anastomotic leak, abscess, graft/flap failure, retained foreign
   body) **and** occurs within 30 days of the index surgery, then
   **`is_return_to_or = true`**.

3. **Unrelated anatomy or new diagnosis = not RTOR.** If the current surgery is
   for a **different anatomic site or a new, unrelated diagnosis** (e.g. index
   was a knee arthroplasty, current is an appendectomy), then
   **`is_return_to_or = false`**, regardless of timing.

4. **Outside the 30-day window = not RTOR.** If the current surgery occurs
   **more than 30 days** after the index surgery and is not otherwise captured
   above, then **`is_return_to_or = false`**.

### Rule 2 — "Operating room" requirement

The return must be to an **operating room**. Bedside procedures, interventional
radiology suites, endoscopy suites, and clinic-based procedures do **not** count
as a return to the OR. If the current note documents the procedure was performed
**at the bedside / in the ICU / in IR / in the endoscopy suite**, then
**`is_return_to_or = false`**.

### Rule 3 — Evidence requirement

The `evidence` field must quote the **single most decisive sentence** from the
source documents (operative notes, progress note, or timeline) that supports the
determination. Do not paraphrase the clinical facts; cite the source text and
then state which rule it triggers.

---

## Worked examples

- **Unplanned reoperation for bleeding (day 2)** → Rule 2 → `true`. Evidence:
  "Taken back to the OR emergently for evacuation of an expanding hematoma."
- **Staged abdominal washout documented at index** → Rule 1 → `false`. Evidence:
  "Abdomen left open; planned return to OR in 48 hours for second-look washout
  and delayed fascial closure."
- **Appendectomy 9 days after a total knee arthroplasty** → Rule 1.3 → `false`.
  Evidence: "Indication: acute appendicitis," unrelated to the index knee.
- **Reoperation for surgical-site infection on day 41** → Rule 1.4 → `false`.
  Outside the 30-day window.
- **Bedside re-exploration in the ICU for fascial dehiscence** → Rule 2 →
  `false`. Not performed in an operating room.
