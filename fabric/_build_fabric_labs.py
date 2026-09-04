"""One-shot builder for the **Microsoft Fabric operationalization** track.

This is the *production* layer for the RTOR clinical-abstraction use case. The
fine-tuned model is still produced in Foundry (the clinical-rtor labs); Fabric
*operationalizes* it at data scale and exposes it to analysts. It implements the
recommended de-risking arc end-to-end:

    00_onelake_landing.ipynb      land synthetic cases as a Lakehouse Delta table
    01_rag_baseline.ipynb         CHEAP path: ground the BASE model on rules (no training)
    02_finetuned_scoring.ipynb    dual-model batch score (base vs fine-tuned) at scale
    03_hybrid_router.ipynb        COST-OPTIMAL: cheap rules for the easy 90%, escalate the rest
    04_evaluation_mlflow.ipynb    one scoreboard across all approaches, logged to MLflow

Every notebook is **dual-mode**: it runs inside Microsoft Fabric (Spark +
Lakehouse + notebookutils token broker) and degrades gracefully to LOCAL
(pandas + the repo's fine-tuning/data/ files + DefaultAzureCredential) so it can
be demoed anywhere. All clinical data is fully SYNTHETIC and PHI-free.

Run:
    python fabric/_build_fabric_labs.py
"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE
DATA = HERE.parent / "fine-tuning" / "data"

NB_META = {
    "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
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


def _cid(prefix: str, text: str) -> str:
    return prefix + hashlib.md5(text.encode("utf-8")).hexdigest()[:10]


def md(text: str) -> dict:
    return {"cell_type": "markdown", "id": _cid("md-", text), "metadata": {},
            "source": text.splitlines(keepends=True)}


def code(src: str) -> dict:
    return {"cell_type": "code", "id": _cid("code-", src), "execution_count": None,
            "metadata": {}, "outputs": [], "source": src.splitlines(keepends=True)}


def write_nb(name: str, cells: list[dict]) -> None:
    nb = {"cells": cells, "metadata": NB_META, "nbformat": 4, "nbformat_minor": 5}
    (OUT / name).write_text(json.dumps(nb, indent=1), encoding="utf-8")
    print(f"wrote {name}  ({len(cells)} cells)")


# --------------------------------------------------------------------------- #
# Build the retrievable rule chunks from the canonical rules KB (build-time).
# --------------------------------------------------------------------------- #
_rules_text = (DATA / "rtor_rules.md").read_text(encoding="utf-8")
_parts = re.split(r"\n(?=#{2,3}\s)", _rules_text)
RULE_CHUNKS = []
for _p in _parts:
    _p = _p.strip()
    if not _p:
        continue
    _title = _p.splitlines()[0].lstrip("# ").strip()
    RULE_CHUNKS.append({"rule_id": _title[:48], "text": _p})


# --------------------------------------------------------------------------- #
# Shared cell sources
# --------------------------------------------------------------------------- #
FABRIC_SETUP = r'''# === Dual-mode setup: Microsoft Fabric (Spark + Lakehouse) OR local (pandas + repo files) ===
import os, json
from pathlib import Path

try:
    import notebookutils            # exists ONLY inside Microsoft Fabric
    IN_FABRIC = True
except Exception:
    IN_FABRIC = False

def _find_data_dir():
    here = Path.cwd()
    for c in [here, *here.parents]:
        d = c / 'fine-tuning' / 'data'
        if d.exists():
            return d
    return Path('fine-tuning/data')
DATA_DIR = None if IN_FABRIC else _find_data_dir()

AZURE_OPENAI_ENDPOINT = os.environ.get('AZURE_OPENAI_ENDPOINT', 'https://<your-foundry>.cognitiveservices.azure.com/')
API_VERSION           = os.environ.get('AZURE_OPENAI_API_VERSION', '2025-04-01-preview')
BASE_DEPLOYMENT       = os.environ.get('BASE_DEPLOYMENT', 'gpt-4o-mini')
TUNED_DEPLOYMENT      = os.environ.get('TUNED_DEPLOYMENT', 'acme-rtor-deployment')

# Entra token for Azure OpenAI: Fabric token broker in-cloud, DefaultAzureCredential locally.
if IN_FABRIC:
    def _token():
        return notebookutils.credentials.getToken('https://cognitiveservices.azure.com')
else:
    from azure.identity import DefaultAzureCredential
    _cred = DefaultAzureCredential()
    def _token():
        return _cred.get_token('https://cognitiveservices.azure.com/.default').token

from openai import AzureOpenAI
client = AzureOpenAI(
    azure_endpoint          = AZURE_OPENAI_ENDPOINT,
    azure_ad_token_provider = _token,
    api_version             = API_VERSION,
)
print('mode    :', 'FABRIC' if IN_FABRIC else 'LOCAL')
print('endpoint:', AZURE_OPENAI_ENDPOINT)
print('models  : base=' + BASE_DEPLOYMENT + '  tuned=' + TUNED_DEPLOYMENT)
'''

# Built as a concatenated string (not a raw triple-quote) to avoid nesting triple quotes.
RULES_PROMPT = (
    "# === The RTOR abstraction prompt + defensive parser (identical to the Foundry labs) ===\n"
    "import json\n\n"
    "RULES_BLOCK = '''\n"
    "### SPECIFIC ABSTRACTION RULES\n\n"
    "Rule 1 - Conflict-resolution order (apply in this EXACT priority; the FIRST match decides):\n"
    "  1. Planned / staged overrides everything (planned/staged/anticipated/scheduled at index) -> false, even within 30 days.\n"
    "  2. Unplanned + related complication (bleeding, hematoma, SSI, dehiscence, anastomotic leak, abscess, graft/flap failure) within 30 days -> true.\n"
    "  3. Unrelated anatomy or new diagnosis -> false, regardless of timing.\n"
    "  4. Outside the 30-day window -> false.\n\n"
    "Rule 2 - Operating-room requirement. Bedside / ICU / IR / endoscopy-suite / clinic procedures do NOT count -> false.\n\n"
    "Rule 3 - Evidence requirement. Quote the single most decisive sentence verbatim, then state which rule it triggers.\n"
    "'''\n\n"
    "SYSTEM_PROMPT = (\n"
    "    'You are a surgical-quality abstraction assistant for Acme Health. Determine whether the '\n"
    "    'current operative episode is an unplanned Return to the Operating Room (RTOR) for the index '\n"
    "    'surgery, applying the rules below.\\n'\n"
    "    + RULES_BLOCK +\n"
    "    '\\n### TASK EXECUTION\\n'\n"
    "    '- Read the provided text thoroughly.\\n'\n"
    "    '- Resolve conflicting data using the exact order in Rule 1.\\n'\n"
    "    '- Output ONLY a valid JSON object with exactly two keys: \"is_return_to_or\" (boolean) and '\n"
    "    '\"evidence\" (string citing the exact text used and how it applies to the rules).\\n'\n"
    "    '- No conversational filler. No markdown json fence.'\n"
    ")\n\n"
    "TEMPLATE = '''Patient Timeline:\n"
    "{patient_timeline_json}\n\n"
    "Progress Note Details:\n"
    "{progress_note_json}\n\n"
    "Index Surgery Procedure Description:\n"
    "{index_surgery_procedure_desc}\n\n"
    "Index Surgery Operative Note:\n"
    "{index_surgery_op_note}\n\n"
    "Current Surgery Procedure Description:\n"
    "{current_surgery_procedure_desc}\n\n"
    "Current Surgery Operative Note:\n"
    "{current_surgery_op_note}\n\n"
    "Task: Determine if the current operating note/surgery represents a return to the operating room based strictly on the abstraction rules provided above. Output ONLY the raw JSON object.'''\n\n"
    "def build_user_prompt(case):\n"
    "    return TEMPLATE.format(\n"
    "        patient_timeline_json          = json.dumps(case.get('patient_timeline', []), indent=2),\n"
    "        progress_note_json             = json.dumps(case.get('progress_note', {}), indent=2),\n"
    "        index_surgery_procedure_desc   = case.get('index_surgery_procedure_desc', ''),\n"
    "        index_surgery_op_note          = case.get('index_surgery_op_note', ''),\n"
    "        current_surgery_procedure_desc = case.get('current_surgery_procedure_desc', ''),\n"
    "        current_surgery_op_note        = case.get('current_surgery_op_note', ''),\n"
    "    )\n\n"
    "def safe_parse(val):\n"
    "    '''Extract JSON from the model response, stripping stray markdown fences.'''\n"
    "    try:\n"
    "        clean = str(val).strip()\n"
    "        if clean.startswith('```'):\n"
    "            clean = clean.strip('`')\n"
    "            if clean.startswith('json'):\n"
    "                clean = clean[4:]\n"
    "        return json.loads(clean.strip())\n"
    "    except Exception as e:\n"
    "        return {'is_return_to_or': None, 'evidence': f'Parse Error: {e} | Raw: {val}'}\n\n"
    "print('prompt + parser ready')\n"
)

DATA_LOAD = r'''# === Load the eval cases (full dicts incl. gold_*). Fabric -> Lakehouse table; local -> jsonl ===
def load_eval():
    if IN_FABRIC:
        rows = spark.read.table('surgical_episodes').toPandas().to_dict('records')
        return [json.loads(r['case_json']) for r in rows]
    p = DATA_DIR / 'rtor_eval.jsonl'
    assert p.exists(), f'missing {p} -- run the Foundry clinical Lab 00 first'
    return [json.loads(l) for l in p.read_text(encoding='utf-8').splitlines() if l.strip()]

EVAL = load_eval()
print('eval cases:', len(EVAL))
'''

PREDS_IO = r'''# === Persist / load predictions so the eval notebook can compare every approach ===
def save_preds(name, preds):
    if IN_FABRIC:
        import pandas as pd
        (spark.createDataFrame(pd.DataFrame(preds))
            .write.format('delta').mode('overwrite').saveAsTable(f'preds_{name}'))
    else:
        (DATA_DIR / f'preds_{name}.json').write_text(json.dumps(preds), encoding='utf-8')
    print(f'saved preds -> {name} ({len(preds)})')

def load_preds(name):
    if IN_FABRIC:
        return spark.read.table(f'preds_{name}').toPandas().to_dict('records')
    return json.loads((DATA_DIR / f'preds_{name}.json').read_text(encoding='utf-8'))
'''

METRICS = r'''# === Shared scoring: classification metrics + LLM-as-judge evidence groundedness ===
def score(preds):
    tp = sum(1 for p in preds if p['gold'] and p['pred'] is True)
    tn = sum(1 for p in preds if (not p['gold']) and p['pred'] is False)
    fp = sum(1 for p in preds if (not p['gold']) and p['pred'] is True)
    fn = sum(1 for p in preds if p['gold'] and p['pred'] is False)
    un = sum(1 for p in preds if p['pred'] is None)
    prec = tp / (tp + fp) if (tp + fp) else 0.0
    rec  = tp / (tp + fn) if (tp + fn) else 0.0
    f1   = 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0
    acc  = (tp + tn) / len(preds) if preds else 0.0
    return {'accuracy': acc, 'precision': prec, 'recall': rec, 'f1': f1,
            'tp': tp, 'tn': tn, 'fp': fp, 'fn': fn, 'unparsed': un}

def judge_groundedness(preds):
    scored = [p for p in preds if p.get('pred') is not None and p.get('pred_evidence')]
    if not scored:
        return 0.0
    total = 0
    for p in scored:
        sysmsg = ('You grade whether an abstraction citation is well-grounded. Given GOLD evidence and '
                  'MODEL evidence for a surgical Return-to-OR decision, reply JSON {"score": 0 or 1}. '
                  'score=1 means the model quoted a relevant source sentence and named a plausible rule.')
        r = client.chat.completions.create(model=BASE_DEPLOYMENT, temperature=0.0, max_tokens=80,
            response_format={'type': 'json_object'},
            messages=[{'role': 'system', 'content': sysmsg},
                      {'role': 'user', 'content': json.dumps({'gold': p.get('gold_evidence'), 'model': p.get('pred_evidence')})}])
        total += int(safe_parse(r.choices[0].message.content).get('score', 0) or 0)
    return total / len(scored)

def print_board(name, m):
    print(f'[{name}]  acc={m["accuracy"]:.0%}  prec={m["precision"]:.0%}  rec={m["recall"]:.0%}  '
          f'f1={m["f1"]:.0%}  (TP={m["tp"]} TN={m["tn"]} FP={m["fp"]} FN={m["fn"]} unparsed={m["unparsed"]})')
'''


# --------------------------------------------------------------------------- #
# Notebook 00 - OneLake landing
# --------------------------------------------------------------------------- #
def nb00() -> list[dict]:
    return [
        md(
            "# Fabric 00 · Land the surgical cases into OneLake\n\n"
            "**Foundry trains the model; Fabric operationalizes it.** This first notebook lands the "
            "synthetic Return-to-OR cases as a governed **Delta table** (`surgical_episodes`) in a "
            "Fabric **Lakehouse** — the single source the scoring, routing, and evaluation notebooks "
            "read from.\n\n"
            "> **Dual-mode:** runs in Microsoft Fabric (Spark + Lakehouse) *or* locally (pandas + the "
            "repo's `fine-tuning/data/`). All data is fully **synthetic & PHI-free**.\n\n"
            "**To run in Fabric:** attach a Lakehouse, then upload `fine-tuning/data/rtor_eval.jsonl` "
            "to the Lakehouse under `Files/rtor/`."
        ),
        code(FABRIC_SETUP),
        md("---\n## Step 1 — Read the synthetic source cases"),
        code(
            r"""if IN_FABRIC:
    src = '/lakehouse/default/Files/rtor/rtor_eval.jsonl'
    cases = [json.loads(l) for l in open(src, encoding='utf-8') if l.strip()]
else:
    p = DATA_DIR / 'rtor_eval.jsonl'
    cases = [json.loads(l) for l in p.read_text(encoding='utf-8').splitlines() if l.strip()]
print('source cases:', len(cases))
print('keys:', sorted(cases[0].keys()))
"""
        ),
        md(
            "---\n## Step 2 — Flatten to a table-friendly shape\n\n"
            "Nested fields (timeline, progress note, op notes) are kept as a single `case_json` string "
            "so the table stays simple; flat columns drive BI filters and joins."
        ),
        code(
            r"""rows = []
for c in cases:
    rows.append({
        'case_id'                        : c['case_id'],
        'provider_npi'                   : c.get('provider_npi'),
        'index_surgery_procedure_desc'   : c.get('index_surgery_procedure_desc'),
        'current_surgery_procedure_desc' : c.get('current_surgery_procedure_desc'),
        'gold_is_return_to_or'           : bool(c.get('gold_is_return_to_or')),
        'gold_evidence'                  : c.get('gold_evidence'),
        'case_json'                      : json.dumps(c),
    })
print('prepared', len(rows), 'rows')
"""
        ),
        md(
            "---\n## Step 3 — Write to OneLake (Delta) or a local stand-in\n\n"
            "In Fabric this is a managed **Delta table** in the Lakehouse — queryable from Spark, the "
            "SQL endpoint, and Power BI. Locally we write a parquet/CSV stand-in just to prove the shape."
        ),
        code(
            r"""if IN_FABRIC:
    sdf = spark.createDataFrame(rows)
    sdf.write.format('delta').mode('overwrite').saveAsTable('surgical_episodes')
    print('Lakehouse table surgical_episodes:', sdf.count(), 'rows')
    display(spark.read.table('surgical_episodes').limit(5))
else:
    import pandas as pd
    pdf = pd.DataFrame(rows)
    try:
        out = DATA_DIR / 'surgical_episodes.parquet'
        pdf.to_parquet(out); print('LOCAL stand-in ->', out)
    except Exception as e:
        out = DATA_DIR / 'surgical_episodes.csv'
        pdf.to_csv(out, index=False); print('LOCAL stand-in (csv) ->', out, '|', e)
    display(pdf.head())
"""
        ),
        md(
            "---\n## Takeaways\n\n"
            "- One governed `surgical_episodes` table is the contract every downstream notebook reads.\n"
            "- The same flat-plus-`case_json` shape works for Spark scoring **and** Power BI.\n"
            "- Next: **Fabric 01** stands up the *cheap* RAG baseline — no training — to set the bar."
        ),
    ]


# --------------------------------------------------------------------------- #
# Notebook 01 - RAG baseline (no fine-tuning)
# --------------------------------------------------------------------------- #
def nb01() -> list[dict]:
    chunks_literal = "RULE_CHUNKS = " + json.dumps(RULE_CHUNKS, ensure_ascii=False)
    retriever = chunks_literal + r'''

import re
def retrieve_rules(case, k=3):
    """Pick the k most relevant rule chunks for this case (keyword overlap).
    Swap in embeddings (text-embedding-3-small) for a large rule base."""
    blob = ' '.join([
        case.get('index_surgery_op_note', ''),
        case.get('current_surgery_op_note', ''),
        str(case.get('progress_note', '')),
        case.get('index_surgery_procedure_desc', ''),
        case.get('current_surgery_procedure_desc', ''),
    ]).lower()
    def s(ch):
        toks = set(re.findall(r'[a-z]{5,}', ch['text'].lower()))
        return sum(1 for t in toks if t in blob)
    return sorted(RULE_CHUNKS, key=s, reverse=True)[:k]

print('rule chunks indexed:', len(RULE_CHUNKS))
'''
    return [
        md(
            "# Fabric 01 · The cheap baseline — RAG over the rules (no training)\n\n"
            "**De-risk before you fine-tune.** This notebook grounds the **base** model on the "
            "abstraction rules via retrieval — rules live as *editable text*, not weights, so a policy "
            "change is a one-line edit. It sets the **bar**: whatever RAG *can't* crack is exactly what "
            "justifies fine-tuning.\n\n"
            "> Cheapest to stand up, easiest to govern, lowest ceiling on the hard Rule 1 conflict cases."
        ),
        code(FABRIC_SETUP),
        code(RULES_PROMPT),
        code(DATA_LOAD),
        code(PREDS_IO),
        code(METRICS),
        md(
            "---\n## Step 1 — Index the rules as retrievable chunks\n\n"
            "The rules KB is chunked by section. A real deployment swaps the keyword scorer for an "
            "embedding index; the *pattern* — retrieve the relevant rules, inject them — is identical."
        ),
        code(retriever),
        md("---\n## Step 2 — Classify each case with retrieved-rule grounding"),
        code(
            r"""def rag_classify(case):
    chunks = retrieve_rules(case, k=3)
    grounding = '\n\n'.join(c['text'] for c in chunks)
    sysmsg = SYSTEM_PROMPT + '\n\n### RETRIEVED RULES (most relevant to this case)\n' + grounding
    r = client.chat.completions.create(model=BASE_DEPLOYMENT, temperature=0.0, max_tokens=300,
        response_format={'type': 'json_object'},
        messages=[{'role': 'system', 'content': sysmsg},
                  {'role': 'user',   'content': build_user_prompt(case)}])
    return safe_parse(r.choices[0].message.content)

rag_preds = []
for c in EVAL:
    p = rag_classify(c)
    rag_preds.append({'case_id': c['case_id'], 'gold': bool(c['gold_is_return_to_or']),
                      'pred': p.get('is_return_to_or'), 'pred_evidence': p.get('evidence'),
                      'gold_evidence': c.get('gold_evidence')})
save_preds('rag', rag_preds)
print('scored', len(rag_preds), 'cases via RAG baseline')
"""
        ),
        md("---\n## Step 3 — Score the baseline"),
        code(
            r"""m = score(rag_preds)
print_board('RAG baseline (base model + retrieved rules)', m)
print('evidence groundedness:', f"{judge_groundedness(rag_preds):.0%}")
"""
        ),
        md(
            "---\n## Takeaways\n\n"
            "- RAG gives a **governed, no-training** baseline you can ship today and edit as text.\n"
            "- Its misses (especially the staged-within-30-days conflict) are the **business case** for "
            "fine-tuning — measured, not assumed.\n"
            "- Next: **Fabric 02** scores the fine-tuned model against this same set, at scale."
        ),
    ]


# --------------------------------------------------------------------------- #
# Notebook 02 - Dual-model fine-tuned scoring
# --------------------------------------------------------------------------- #
def nb02() -> list[dict]:
    return [
        md(
            "# Fabric 02 · Batch score base vs fine-tuned, at scale\n\n"
            "The production pattern: run the **same** abstraction over the whole `surgical_episodes` "
            "table with two models — base `gpt-4o-mini` and the fine-tuned `acme-rtor-deployment` — and "
            "write both to a `rtor_predictions` table for BI and audit.\n\n"
            "> If the fine-tuned deployment isn't available yet, the notebook scores base only and skips "
            "the tuned pass cleanly."
        ),
        code(FABRIC_SETUP),
        code(RULES_PROMPT),
        code(DATA_LOAD),
        code(PREDS_IO),
        code(METRICS),
        md("---\n## Step 1 — One scoring function, parameterized by model"),
        code(
            r"""def run_model(model):
    out = []
    for c in EVAL:
        try:
            r = client.chat.completions.create(model=model, temperature=0.0, max_tokens=300,
                response_format={'type': 'json_object'},
                messages=[{'role': 'system', 'content': SYSTEM_PROMPT},
                          {'role': 'user',   'content': build_user_prompt(c)}])
            p = safe_parse(r.choices[0].message.content)
        except Exception as e:
            p = {'is_return_to_or': None, 'evidence': f'error: {e}'}
        out.append({'case_id': c['case_id'], 'gold': bool(c['gold_is_return_to_or']),
                    'pred': p.get('is_return_to_or'), 'pred_evidence': p.get('evidence'),
                    'gold_evidence': c.get('gold_evidence')})
    return out

def deployment_available(model):
    try:
        client.chat.completions.create(model=model, max_tokens=3,
            messages=[{'role': 'user', 'content': 'ping'}])
        return True
    except Exception as e:
        print(f"deployment '{model}' unavailable: {str(e)[:120]}")
        return False
"""
        ),
        md("---\n## Step 2 — Score base, then fine-tuned (if deployed)"),
        code(
            r"""base_preds = run_model(BASE_DEPLOYMENT)
save_preds('base', base_preds)

HAVE_TUNED = deployment_available(TUNED_DEPLOYMENT)
if HAVE_TUNED:
    tuned_preds = run_model(TUNED_DEPLOYMENT)
    save_preds('tuned', tuned_preds)
else:
    print('Skipping tuned pass — run the Foundry clinical Lab 01 to create', TUNED_DEPLOYMENT)
"""
        ),
        md(
            "---\n## Step 3 — (Fabric scale) the same job as a Spark UDF\n\n"
            "For millions of charts a night, wrap the classifier in a Spark UDF over the Delta table. "
            "Repartition to a sane concurrency to respect Azure OpenAI rate limits."
        ),
        code(
            r"""if IN_FABRIC:
    from pyspark.sql.functions import udf, col
    from pyspark.sql.types import StructType, StructField, BooleanType, StringType

    out_schema = StructType([
        StructField('is_return_to_or', BooleanType()),
        StructField('evidence', StringType()),
    ])

    def _udf_for(model):
        def _f(case_json):
            c = json.loads(case_json)
            try:
                r = client.chat.completions.create(model=model, temperature=0.0, max_tokens=300,
                    response_format={'type': 'json_object'},
                    messages=[{'role': 'system', 'content': SYSTEM_PROMPT},
                              {'role': 'user',   'content': build_user_prompt(c)}])
                p = safe_parse(r.choices[0].message.content)
            except Exception as e:
                p = {'is_return_to_or': None, 'evidence': f'error: {e}'}
            return (p.get('is_return_to_or'), p.get('evidence'))
        return udf(_f, out_schema)

    model = TUNED_DEPLOYMENT if HAVE_TUNED else BASE_DEPLOYMENT
    src = spark.read.table('surgical_episodes').repartition(4)   # cap concurrency
    scored = src.withColumn('pred', _udf_for(model)(col('case_json')))
    (scored.select('case_id', 'provider_npi', 'gold_is_return_to_or',
                   col('pred.is_return_to_or').alias('pred_is_return_to_or'),
                   col('pred.evidence').alias('pred_evidence'))
        .write.format('delta').mode('overwrite').saveAsTable('rtor_predictions'))
    print('wrote Lakehouse table rtor_predictions using model:', model)
else:
    print('LOCAL mode — Spark UDF block is shown for reference; per-row scoring already ran above.')
"""
        ),
        md("---\n## Step 4 — Compare the two models on the same set"),
        code(
            r"""print_board('base ', score(base_preds))
if HAVE_TUNED:
    print_board('tuned', score(tuned_preds))
    print('evidence groundedness  base :', f"{judge_groundedness(base_preds):.0%}")
    print('evidence groundedness  tuned:', f"{judge_groundedness(tuned_preds):.0%}")
else:
    print('evidence groundedness  base :', f"{judge_groundedness(base_preds):.0%}")
"""
        ),
        md(
            "---\n## Takeaways\n\n"
            "- The fine-tuned model produces the **governed `rtor_predictions` table** that BI and the "
            "Data Agent query — the bridge from chat-over-text to semantic analytics.\n"
            "- Base often ties on classification but trails on **evidence groundedness**; that gap is the "
            "fine-tuning ROI.\n"
            "- Next: **Fabric 03** makes it cheap — route the easy cases away from the model entirely."
        ),
    ]


# --------------------------------------------------------------------------- #
# Notebook 03 - Hybrid router (cost-optimal)
# --------------------------------------------------------------------------- #
def nb03() -> list[dict]:
    return [
        md(
            "# Fabric 03 · The cost-optimal hybrid router\n\n"
            "The cheapest token is the one you never send. A deterministic pre-filter resolves the "
            "**easy majority** (clearly outside 30 days, bedside/IR, documented staged) for free, and "
            "escalates only the **ambiguous** cases to the fine-tuned model — the end-state production "
            "design."
        ),
        code(FABRIC_SETUP),
        code(RULES_PROMPT),
        code(DATA_LOAD),
        code(PREDS_IO),
        code(METRICS),
        md(
            "---\n## Step 1 — The cheap deterministic pre-filter\n\n"
            "Returns a confident decision for the unambiguous cases, or `None` to escalate. It only "
            "decides when a rule is *clearly* triggered — it never guesses the hard Rule 1.2 calls."
        ),
        code(
            r"""import re
PLANNED = re.compile(r'planned|staged|scheduled|second[- ]look|anticipat|delayed (closure|fascial)', re.I)
NON_OR  = re.compile(r'bedside|at the bedside|\bICU\b|interventional radiology|\bIR\b|endoscopy suite|in clinic|clinic-based', re.I)

def current_day_offset(case):
    days = [e.get('day_offset') for e in case.get('patient_timeline', []) if isinstance(e, dict)]
    days = [d for d in days if isinstance(d, (int, float))]
    return max(days) if days else None

def cheap_router(case):
    cur = (case.get('current_surgery_op_note', '') + ' ' + json.dumps(case.get('progress_note', {})))
    idx = case.get('index_surgery_op_note', '')
    d = current_day_offset(case)
    if d is not None and d > 30:
        return False, f'current procedure on day {d} (>30) -> Rule 1.4', 'cheap'
    if NON_OR.search(cur):
        return False, 'documented bedside/ICU/IR/endoscopy -> Rule 2', 'cheap'
    if PLANNED.search(cur) or PLANNED.search(idx):
        return False, 'planned/staged language documented -> Rule 1.1', 'cheap'
    return None, 'ambiguous -> escalate to model', 'model'

print('cheap router ready')
"""
        ),
        md("---\n## Step 2 — Route: cheap where confident, model otherwise"),
        code(
            r"""ESC_MODEL = TUNED_DEPLOYMENT
try:
    client.chat.completions.create(model=ESC_MODEL, max_tokens=3,
        messages=[{'role': 'user', 'content': 'ping'}])
except Exception:
    ESC_MODEL = BASE_DEPLOYMENT
print('escalation model:', ESC_MODEL)

def llm_classify(case, model):
    r = client.chat.completions.create(model=model, temperature=0.0, max_tokens=300,
        response_format={'type': 'json_object'},
        messages=[{'role': 'system', 'content': SYSTEM_PROMPT},
                  {'role': 'user',   'content': build_user_prompt(case)}])
    return safe_parse(r.choices[0].message.content)

hybrid_preds = []
cheap_n = esc_n = 0
for c in EVAL:
    dec, reason, path = cheap_router(c)
    if dec is not None:
        cheap_n += 1
        pred, ev = dec, reason
    else:
        esc_n += 1
        p = llm_classify(c, ESC_MODEL)
        pred, ev = p.get('is_return_to_or'), p.get('evidence')
    hybrid_preds.append({'case_id': c['case_id'], 'gold': bool(c['gold_is_return_to_or']),
                         'pred': pred, 'pred_evidence': ev, 'gold_evidence': c.get('gold_evidence'),
                         'path': path})
save_preds('hybrid', hybrid_preds)
print(f'cheap path: {cheap_n}/{len(EVAL)} ({cheap_n/len(EVAL):.0%})   escalated to model: {esc_n}')
"""
        ),
        md("---\n## Step 3 — The cost lever"),
        code(
            r"""AVG_TOKENS_PER_CALL = 700   # rules + case, order of magnitude
print(f'LLM calls avoided: {cheap_n} of {len(EVAL)} ({cheap_n/len(EVAL):.0%})')
print(f'~{cheap_n * AVG_TOKENS_PER_CALL:,} tokens/batch avoided at this sample size.')
print('At production volume (charts/night), the cheap path is the dominant cost lever.')
"""
        ),
        md("---\n## Step 4 — Did routing keep quality?"),
        code(
            r"""m = score(hybrid_preds)
print_board('hybrid router', m)
print('evidence groundedness:', f"{judge_groundedness(hybrid_preds):.0%}")
"""
        ),
        md(
            "---\n## Takeaways\n\n"
            "- The router trades a little build complexity for a large **cost reduction** — the easy "
            "cases never touch the model.\n"
            "- Escalations go to the fine-tuned model, so the *hard* cases still get the best answer.\n"
            "- Next: **Fabric 04** scores all four approaches on one board and logs them to MLflow."
        ),
    ]


# --------------------------------------------------------------------------- #
# Notebook 04 - Evaluation + MLflow comparison
# --------------------------------------------------------------------------- #
def nb04() -> list[dict]:
    return [
        md(
            "# Fabric 04 · One scoreboard, logged to MLflow\n\n"
            "Bring every approach — **base, RAG, fine-tuned, hybrid** — onto one board with the same "
            "Foundry Lab 07 metrics (precision/recall/F1 + evidence groundedness), and log each as an "
            "**MLflow** run in Fabric Data Science. Then pick the *cheapest* approach that clears the "
            "release bar."
        ),
        code(FABRIC_SETUP),
        code(RULES_PROMPT),
        code(PREDS_IO),
        code(METRICS),
        md("---\n## Step 1 — Load every approach's predictions and score them"),
        code(
            r"""approaches = ['base', 'rag', 'tuned', 'hybrid']
results = {}
for name in approaches:
    try:
        preds = load_preds(name)
    except Exception as e:
        print(f'skip {name}: {str(e)[:80]}')
        continue
    m = score(preds)
    m['groundedness'] = judge_groundedness(preds)
    results[name] = m
    print_board(name, m)
    print(f'    groundedness: {m["groundedness"]:.0%}')

import pandas as pd
tbl = pd.DataFrame(results).T
cols = ['accuracy', 'precision', 'recall', 'f1', 'groundedness', 'unparsed']
display(tbl[[c for c in cols if c in tbl.columns]])
"""
        ),
        md("---\n## Step 2 — Log runs to MLflow (Fabric Data Science)"),
        code(
            r"""try:
    import mlflow
    mlflow.set_experiment('rtor-abstraction')
    for name, m in results.items():
        with mlflow.start_run(run_name=name):
            mlflow.log_param('approach', name)
            mlflow.log_param('endpoint', AZURE_OPENAI_ENDPOINT)
            mlflow.log_metrics({k: float(v) for k, v in m.items()})
    print('logged', len(results), 'runs to MLflow experiment: rtor-abstraction')
except Exception as e:
    print('MLflow logging skipped (likely LOCAL without MLflow installed):', str(e)[:120])
"""
        ),
        md(
            "---\n## Step 3 — The release decision\n\n"
            "Pick the **cheapest** approach (hybrid < RAG < base < tuned, by run cost) that still clears "
            "the accuracy + groundedness bar. That is the recommended de-risking outcome: fine-tune only "
            "where cheaper options fall short."
        ),
        code(
            r"""BAR = {'accuracy': 0.90, 'groundedness': 0.85}
PREFERENCE = ['hybrid', 'rag', 'base', 'tuned']   # cheapest-first

print('release bar:', BAR)
winner = None
for name in PREFERENCE:
    m = results.get(name)
    if not m:
        continue
    ok = m['accuracy'] >= BAR['accuracy'] and m['groundedness'] >= BAR['groundedness']
    print(f"  {name:7s} acc={m['accuracy']:.0%} grounded={m['groundedness']:.0%}  -> {'PASS' if ok else 'below bar'}")
    if ok and winner is None:
        winner = name
print()
print('Recommended (cheapest that clears the bar):', winner or 'none yet — fine-tune / improve grounding')
"""
        ),
        md(
            "---\n## Takeaways\n\n"
            "- Every approach is scored on the **same** harness, so the choice is data-driven, not vibes.\n"
            "- MLflow keeps the model/approach comparison auditable over time (wire into continuous eval).\n"
            "- The end state is a **hybrid router** that escalates only the hard cases to the fine-tuned "
            "model — best quality at the lowest cost."
        ),
    ]


def main() -> None:
    OUT.mkdir(exist_ok=True)
    write_nb("00_onelake_landing.ipynb", nb00())
    write_nb("01_rag_baseline.ipynb", nb01())
    write_nb("02_finetuned_scoring.ipynb", nb02())
    write_nb("03_hybrid_router.ipynb", nb03())
    write_nb("04_evaluation_mlflow.ipynb", nb04())
    print("done.")


if __name__ == "__main__":
    main()
