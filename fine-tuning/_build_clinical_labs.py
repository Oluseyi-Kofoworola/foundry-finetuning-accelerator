"""One-shot builder for the **Return to the Operating Room (RTOR)** clinical
abstraction pre-demo — the *second use case* for the accelerator.

This mirrors the Acme Health member-services labs (00/01/03/07) but swaps the
domain to surgical-quality document abstraction: read a patient timeline plus
operative notes for one case and emit a strict
`{ "is_return_to_or": <bool>, "evidence": "<exact text>" }` decision.

Emits four runnable notebooks into ``fine-tuning/clinical-rtor/``:
    00_synthetic_data_generation.ipynb   build the abstraction dataset
    01_supervised_fine_tuning.ipynb      SFT the rules/judgment into the model
    03_tool_calling_fine_tuning.ipynb    THE batch-abstraction lab (the screenshot)
    07_evaluation.ipynb                  precision/recall + evidence groundedness

Run:
    python fine-tuning/_build_clinical_labs.py

Conventions match the existing builders:
  * cell 0 = chdir guard (works from fine-tuning/ or fine-tuning/clinical-rtor/)
  * AzureOpenAI client via managed-identity token provider
  * every live call degrades gracefully when az login / data is missing
  * all clinical data is fully SYNTHETIC and PHI-free
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "clinical-rtor"

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


def write_nb(name: str, cells: list[dict]) -> None:
    nb = {"cells": cells, "metadata": NB_META, "nbformat": 4, "nbformat_minor": 5}
    path = OUT / name
    path.write_text(json.dumps(nb, indent=1), encoding="utf-8")
    print(f"wrote {path.relative_to(HERE)}  ({len(cells)} cells)")


# --------------------------------------------------------------------------- #
# Shared cell sources (raw strings: backslashes stay literal in the cell)
# --------------------------------------------------------------------------- #
CHDIR_GUARD = r"""# Make this notebook work from fine-tuning/ or fine-tuning/clinical-rtor/
# (idempotent: re-running is safe)
import os
from pathlib import Path
_here = Path.cwd()
if _here.name in ('clinical-rtor', 'pre-demo', 'live-demo'):
    os.chdir(_here.parent)
print('cwd:', Path.cwd())
"""

CLIENT_SETUP = r"""import os, json
from pathlib import Path
from dotenv import load_dotenv
from openai import AzureOpenAI
from azure.identity import DefaultAzureCredential

load_dotenv()

AZURE_OPENAI_ENDPOINT    = os.environ['AZURE_OPENAI_ENDPOINT']
AZURE_OPENAI_API_VERSION = os.environ.get('AZURE_OPENAI_API_VERSION', '2025-04-01-preview')
BASE_MODEL               = os.environ.get('BASE_MODEL', 'gpt-4o-mini-2024-07-18')
BASE_DEPLOYMENT          = os.environ.get('BASE_DEPLOYMENT', 'gpt-4o-mini')
SUBSCRIPTION_ID          = os.environ.get('AZURE_SUBSCRIPTION_ID')
RESOURCE_GROUP           = os.environ.get('AZURE_RESOURCE_GROUP')
RESOURCE_NAME            = os.environ.get('AZURE_RESOURCE_NAME')
TENANT_ID                = os.environ.get('AZURE_TENANT_ID')

_cred = DefaultAzureCredential(interactive_browser_tenant_id=TENANT_ID) if TENANT_ID else DefaultAzureCredential()
client = AzureOpenAI(
    azure_endpoint          = AZURE_OPENAI_ENDPOINT,
    azure_ad_token_provider = lambda: _cred.get_token('https://cognitiveservices.azure.com/.default').token,
    api_version             = AZURE_OPENAI_API_VERSION,
)
print('client ready ->', AZURE_OPENAI_ENDPOINT)
"""

# Self-contained green-light check. Hard-fails only on missing local data files;
# Azure checks are reported but non-fatal so the offline data path still runs.
PREFLIGHT = r"""import os, sys, json
from pathlib import Path

_OK, _WARN, _FAIL = '[ OK ]', '[WARN]', '[FAIL]'
_problems = []

def _say(tag, msg):
    print(f'{tag} {msg}')

print('=== Preflight: Return-to-OR labs ===\n')

# 1) Local data files (hard requirement) -----------------------------------
need = ['data/rtor_rules.md', 'data/rtor_cases.jsonl', 'data/rtor_tools_schema.json']
missing = [f for f in need if not Path(f).exists()]
if missing:
    for f in missing:
        _say(_FAIL, f'missing {f}')
    _problems.append('data files')
else:
    n = sum(1 for l in Path('data/rtor_cases.jsonl').read_text(encoding='utf-8').splitlines() if l.strip())
    _say(_OK, f'data files present ({n} labeled cases)')

# 2) SDK imports (hard requirement) ----------------------------------------
try:
    import openai
    from openai import AzureOpenAI
    from azure.identity import DefaultAzureCredential
    _say(_OK, f'SDKs importable (openai {openai.__version__})')
except Exception as e:
    _say(_FAIL, f'SDK import failed: {e}  ->  pip install -r fine-tuning/requirements.txt')
    _problems.append('sdk')

# 3) Endpoint env var (needed for any Azure call) --------------------------
try:
    from dotenv import load_dotenv; load_dotenv()
except Exception:
    pass
endpoint = os.environ.get('AZURE_OPENAI_ENDPOINT')
if endpoint:
    _say(_OK, f'AZURE_OPENAI_ENDPOINT = {endpoint}')
else:
    _say(_WARN, 'AZURE_OPENAI_ENDPOINT not set  ->  Labs 01/03/07 need it (set it or run setup-foundry.ps1)')

# 4) AAD token via az login (needed for any Azure call) --------------------
_token_ok = False
if 'DefaultAzureCredential' in dir() and endpoint:
    try:
        _cred = DefaultAzureCredential()
        _cred.get_token('https://cognitiveservices.azure.com/.default')
        _say(_OK, 'AAD token acquired (az login active)')
        _token_ok = True
    except Exception as e:
        _say(_WARN, f"couldn't get AAD token: {str(e)[:120]}  ->  run 'az login'")

# 5) Base model reachable (the real green light for inference) -------------
if _token_ok:
    dep = os.environ.get('BASE_DEPLOYMENT', 'gpt-4o-mini')
    try:
        _c = AzureOpenAI(
            azure_endpoint=endpoint,
            azure_ad_token_provider=lambda: _cred.get_token('https://cognitiveservices.azure.com/.default').token,
            api_version=os.environ.get('AZURE_OPENAI_API_VERSION', '2025-04-01-preview'),
        )
        _r = _c.chat.completions.create(model=dep, max_tokens=5, temperature=0,
            messages=[{'role': 'system', 'content': 'Reply with exactly: ready'}, {'role': 'user', 'content': 'ping'}])
        _say(_OK, f"base deployment '{dep}' responded: '{(_r.choices[0].message.content or '').strip()}'")
    except Exception as e:
        _say(_WARN, f"base deployment '{dep}' not reachable: {str(e)[:120]}")

# Verdict ------------------------------------------------------------------
print()
if 'data files' in _problems or 'sdk' in _problems:
    raise SystemExit('Preflight FAILED on a hard prerequisite above — fix it before continuing.')
if _token_ok and endpoint:
    print('GREEN: ready to run all RTOR labs (00 / 01 / 03 / 07).')
else:
    print('AMBER: local data path is ready. Set AZURE_OPENAI_ENDPOINT + run "az login" before Labs 01/03/07.')
"""

# Defines the abstraction prompt + loads the labeled cases. Used by every lab.
PROMPT_SETUP = r"""import json
from pathlib import Path

CASES = [json.loads(l) for l in Path('data/rtor_cases.jsonl').read_text(encoding='utf-8').splitlines() if l.strip()]

RULES_BLOCK = '''
### SPECIFIC ABSTRACTION RULES

Rule 1 - Conflict-resolution order (apply in this EXACT priority; the FIRST match decides):
  1. Planned / staged overrides everything. If the index OR current operative note documents that
     the second procedure was planned, staged, anticipated, or scheduled at the time of the index
     surgery, then is_return_to_or = false (even if it occurs within 30 days).
  2. Unplanned + related + within 30 days = RTOR. If the current surgery is unplanned and treats a
     complication of the index surgery (bleeding, hematoma, surgical-site infection, wound dehiscence,
     anastomotic leak, abscess, graft/flap failure) within 30 days, then is_return_to_or = true.
  3. Unrelated anatomy or new diagnosis = not RTOR (false), regardless of timing.
  4. Outside the 30-day window = not RTOR (false).

Rule 2 - Operating-room requirement. The return must be to an operating room. Bedside, ICU, IR,
  endoscopy-suite, or clinic procedures do NOT count: is_return_to_or = false.

Rule 3 - Evidence requirement. Quote the single most decisive sentence from the source documents
  verbatim, then state which rule it triggers.
'''

SYSTEM_PROMPT = (
    'You are a surgical-quality abstraction assistant for Acme Health. Determine whether the '
    'current operative episode is an unplanned Return to the Operating Room (RTOR) for the index '
    'surgery, applying the rules below.\n'
    + RULES_BLOCK +
    '\n### TASK EXECUTION\n'
    '- Read the provided text thoroughly.\n'
    '- Evaluate the context against the Specific Abstraction Rules, resolving any conflicting data '
    'using the exact order specified in Rule 1.\n'
    '- Output ONLY a valid JSON object with exactly two keys: "is_return_to_or" (boolean) and '
    '"evidence" (string citing the exact text used and how it applies to the rules).\n'
    '- Do not include conversational filler. Do not include markdown formatting like a json fence.'
)

TEMPLATE = '''Patient Timeline:
{patient_timeline_json}

Progress Note Details:
{progress_note_json}

Index Surgery Procedure Description:
{index_surgery_procedure_desc}

Index Surgery Operative Note:
{index_surgery_op_note}

Current Surgery Procedure Description:
{current_surgery_procedure_desc}

Current Surgery Operative Note:
{current_surgery_op_note}

Task: Determine if the current operating note/surgery represents a return to the operating room based strictly on the abstraction rules provided above. Output ONLY the raw JSON object.'''

def build_user_prompt(case):
    return TEMPLATE.format(
        patient_timeline_json        = json.dumps(case.get('patient_timeline', []), indent=2),
        progress_note_json           = json.dumps(case.get('progress_note', {}), indent=2),
        index_surgery_procedure_desc = case.get('index_surgery_procedure_desc', ''),
        index_surgery_op_note        = case.get('index_surgery_op_note', ''),
        current_surgery_procedure_desc = case.get('current_surgery_procedure_desc', ''),
        current_surgery_op_note      = case.get('current_surgery_op_note', ''),
    )

def safe_parse(val):
    '''Safely extract JSON from the LLM response, stripping stray markdown fences.'''
    try:
        clean = str(val).strip()
        if clean.startswith('```'):
            clean = clean.strip('`')
            if clean.startswith('json'):
                clean = clean[4:]
        return json.loads(clean.strip())
    except Exception as e:
        return {'is_return_to_or': None, 'evidence': f'Parse Error: {e} | Raw: {val}'}

print(f'Loaded {len(CASES)} labeled cases. Prompt + parser ready.')
print('--- USER PROMPT for', CASES[0]['case_id'], '(first 500 chars) ---')
print(build_user_prompt(CASES[0])[:500])
"""


# --------------------------------------------------------------------------- #
# LAB 00 - Synthetic data generation
# --------------------------------------------------------------------------- #
def lab00() -> list[dict]:
    return [
        code(CHDIR_GUARD),
        md(
            "# Lab 00 (Clinical) · Build the Return-to-OR abstraction dataset\n\n"
            "**Use case 2 — surgical-quality document abstraction.** A registry abstractor reads a "
            "patient timeline plus operative notes and decides whether a surgery is an *unplanned "
            "Return to the Operating Room (RTOR)* — and must **cite the exact sentence** that "
            "justifies the call. This lab turns a one-page rules file (`data/rtor_rules.md`) plus a "
            "handful of labeled cases into a full supervised-fine-tuning set.\n\n"
            "> All op-notes, timelines, and NPIs here are **fully synthetic and PHI-free.**\n\n"
            "*Demo moment:* a markdown rules file + 16 labeled cases become a train / validation / "
            "eval split the next labs train and score against."
        ),
        md(
            "---\n## Step 0 — Preflight (run me first)\n\n"
            "A self-contained green-light check: local data files, SDKs, your endpoint, `az login`, "
            "and a tiny call to the base model. It **only hard-fails** on missing local files — the "
            "Azure checks are advisory so the offline data path still runs."
        ),
        code(PREFLIGHT),
        md("---\n## Step 1 — Load the rules and the labeled seed cases"),
        code(
            r"""import json
from pathlib import Path

RULES = Path('data/rtor_rules.md').read_text(encoding='utf-8')
CASES = [json.loads(l) for l in Path('data/rtor_cases.jsonl').read_text(encoding='utf-8').splitlines() if l.strip()]
pos = sum(1 for c in CASES if c['is_return_to_or'])
print(f'Rules KB: {len(RULES)} chars')
print(f'Labeled cases: {len(CASES)}  (RTOR=true: {pos}, RTOR=false: {len(CASES)-pos})')
print('\nExample case:', CASES[0]['case_id'])
print('  gold is_return_to_or:', CASES[0]['is_return_to_or'])
print('  gold evidence       :', CASES[0]['evidence'])
"""
        ),
        md(
            "---\n## Step 2 — The abstraction prompt (system rules + per-case template)\n\n"
            "Exactly the shape of the production batch job: a rules-laden **system prompt** plus a "
            "**template** that injects each case's timeline and operative notes, asking for a strict "
            "two-key JSON answer."
        ),
        code(PROMPT_SETUP),
        md(
            "---\n## Step 3 — (Optional, LIVE) augment with paraphrased variants\n\n"
            "Use the deployed model to **reword the operative notes** while preserving every clinical "
            "fact, timing, and location — more training signal, same gold label. Safe to skip: if "
            "there are no Azure creds or the call fails, we keep just the seed cases."
        ),
        code(
            r"""AUGMENT_VARIANTS_PER_CASE = 1
augmented = []
try:
    import os
    from dotenv import load_dotenv
    from openai import AzureOpenAI
    from azure.identity import DefaultAzureCredential
    load_dotenv()
    _cred = DefaultAzureCredential()
    _client = AzureOpenAI(
        azure_endpoint          = os.environ['AZURE_OPENAI_ENDPOINT'],
        azure_ad_token_provider = lambda: _cred.get_token('https://cognitiveservices.azure.com/.default').token,
        api_version             = os.environ.get('AZURE_OPENAI_API_VERSION', '2025-04-01-preview'),
    )
    _dep = os.environ.get('BASE_DEPLOYMENT', 'gpt-4o-mini')
    for case in CASES[:6]:
        for _ in range(AUGMENT_VARIANTS_PER_CASE):
            rw = _client.chat.completions.create(
                model=_dep, temperature=0.7, max_tokens=600,
                response_format={'type': 'json_object'},
                messages=[
                    {'role': 'system', 'content': 'You rewrite operative notes in different wording while preserving EVERY clinical fact, timing, and location. Reply with JSON containing only the keys index_surgery_op_note and current_surgery_op_note.'},
                    {'role': 'user', 'content': json.dumps({'index_surgery_op_note': case['index_surgery_op_note'], 'current_surgery_op_note': case['current_surgery_op_note']})},
                ],
            )
            nv = json.loads(rw.choices[0].message.content)
            variant = dict(case)
            variant['case_id'] = case['case_id'] + '-v'
            variant['index_surgery_op_note']   = nv.get('index_surgery_op_note', case['index_surgery_op_note'])
            variant['current_surgery_op_note'] = nv.get('current_surgery_op_note', case['current_surgery_op_note'])
            augmented.append(variant)
    print(f'Generated {len(augmented)} paraphrased variants (gold labels unchanged).')
except Exception as e:
    print(f'[augmentation skipped] {e}')

CASES_ALL = CASES + augmented
print('Total cases for the splits:', len(CASES_ALL))
"""
        ),
        md(
            "---\n## Step 4 — Emit the SFT splits and the eval set\n\n"
            "Each training record is an OpenAI-style `messages` triple (system rules → case prompt → "
            "the gold JSON answer). The eval set keeps the raw case + gold label but **never leaks the "
            "answer into the prompt**, so Lab 07 scores honestly."
        ),
        code(
            r"""import json, random
from pathlib import Path
random.seed(42)

def to_sft_record(case):
    answer = {'is_return_to_or': case['is_return_to_or'], 'evidence': case['evidence']}
    return {'messages': [
        {'role': 'system',    'content': SYSTEM_PROMPT},
        {'role': 'user',      'content': build_user_prompt(case)},
        {'role': 'assistant', 'content': json.dumps(answer)},
    ]}

pool = list(CASES_ALL)
random.shuffle(pool)
val   = pool[:4]
train = pool[4:]

train_path = Path('data/rtor_training.jsonl')
val_path   = Path('data/rtor_validation.jsonl')
eval_path  = Path('data/rtor_eval.jsonl')

with open(train_path, 'w', encoding='utf-8-sig') as f:
    for c in train:
        f.write(json.dumps(to_sft_record(c)) + '\n')
with open(val_path, 'w', encoding='utf-8-sig') as f:
    for c in val:
        f.write(json.dumps(to_sft_record(c)) + '\n')
with open(eval_path, 'w', encoding='utf-8') as f:
    for c in CASES_ALL:
        rec = {k: c[k] for k in c if k != 'evidence'}
        rec['gold_is_return_to_or'] = c['is_return_to_or']
        rec['gold_evidence'] = c['evidence']
        f.write(json.dumps(rec) + '\n')

print(f'train: {len(train)}   val: {len(val)}   eval: {len(CASES_ALL)}')
print('Wrote:', train_path, '|', val_path, '|', eval_path)
print('\nSample SFT record (first 700 chars):')
print(json.dumps(to_sft_record(train[0]), indent=2)[:700], '...')
"""
        ),
        md(
            "---\n## Takeaways\n\n"
            "- One rules file + a few labeled cases → a structured SFT dataset, no manual JSON wrangling.\n"
            "- The **same** system prompt and template drive training, batch inference (Lab 03), and "
            "evaluation (Lab 07) — change the rules once, everything downstream follows.\n"
            "- Next: **Lab 01** teaches the model to apply Rule 1's conflict ordering that base models "
            "routinely get wrong."
        ),
    ]


# --------------------------------------------------------------------------- #
# LAB 01 - Supervised fine-tuning
# --------------------------------------------------------------------------- #
def lab01() -> list[dict]:
    return [
        code(CHDIR_GUARD),
        md(
            "# Lab 01 (Clinical) · Supervised Fine-Tuning — teach the abstraction rules\n\n"
            "The hard part of Return-to-OR abstraction is **judgment under conflict**: a staged "
            "washout that still happens within 30 days is *not* a return (Rule 1.1 wins), but a base "
            "model sees \"returned to OR\" + complication words and says `true`. SFT bakes the "
            "rule-ordering in. *Same prompt — the tuned model stops over-calling RTOR.*"
        ),
        md("---\n## Step 1 — Config, client, prompt & data"),
        code(CLIENT_SETUP),
        code(PROMPT_SETUP),
        md(
            "---\n## Step 2 — BEFORE: the base model on the conflict case\n\n"
            "`RTOR-0013` is a **staged** return that occurs on day 3. Gold = `false` (planned). Watch "
            "the base model likely over-call it `true`."
        ),
        code(
            r"""hard = next(c for c in CASES if c['case_id'] == 'RTOR-0013')
r = client.chat.completions.create(
    model=BASE_DEPLOYMENT,
    messages=[{'role': 'system', 'content': SYSTEM_PROMPT},
              {'role': 'user',   'content': build_user_prompt(hard)}],
    temperature=0.0, max_tokens=300, response_format={'type': 'json_object'},
)
pred = safe_parse(r.choices[0].message.content)
print('Case    :', hard['case_id'])
print('GOLD    :', hard['is_return_to_or'])
print('BASE    :', pred.get('is_return_to_or'))
print('Evidence:', pred.get('evidence'))
"""
        ),
        md(
            "---\n## Step 3 — Submit the SFT job\n\n"
            "Idempotent: a `.rtor_sft_job_id` marker prevents duplicate jobs; a stale marker "
            "(deleted job) is cleared automatically. Requires `data/rtor_training.jsonl` from Lab 00."
        ),
        code(
            r"""import time
from pathlib import Path
from openai import NotFoundError

TRAIN = Path('data/rtor_training.jsonl')
VAL   = Path('data/rtor_validation.jsonl')
assert TRAIN.exists(), 'Run Lab 00 first to generate data/rtor_training.jsonl'

_marker = Path('.rtor_sft_job_id')
job_id = None
if _marker.exists():
    cand = _marker.read_text().strip()
    try:
        s = client.fine_tuning.jobs.retrieve(cand)
        job_id = cand
        print('existing job:', job_id, '|', s.status)
    except NotFoundError:
        print('stale marker cleared'); _marker.unlink(missing_ok=True)

if job_id is None:
    up_tr = client.files.create(file=open(TRAIN, 'rb'), purpose='fine-tune')
    up_va = client.files.create(file=open(VAL, 'rb'),  purpose='fine-tune')
    print('uploaded train/val:', up_tr.id, up_va.id)
    for fid in (up_tr.id, up_va.id):
        for _ in range(60):
            if client.files.retrieve(fid).status == 'processed':
                break
            time.sleep(5)
    job = client.fine_tuning.jobs.create(
        training_file   = up_tr.id,
        validation_file = up_va.id,
        model           = BASE_MODEL,
        suffix          = 'acme-rtor',
        seed            = 42,
        hyperparameters = {'n_epochs': 3},
        extra_body      = {'trainingType': 'GlobalStandard'},
    )
    job_id = job.id
    _marker.write_text(job_id)
    print('submitted:', job_id, '|', job.status)
"""
        ),
        md("---\n## Step 4 — Monitor (self-healing on a 404)"),
        code(
            r"""import time
from pathlib import Path
from openai import NotFoundError

job_id = globals().get('job_id') or (
    Path('.rtor_sft_job_id').read_text().strip() if Path('.rtor_sft_job_id').exists() else None)
print('job_id:', job_id)
try:
    st = client.fine_tuning.jobs.retrieve(job_id) if job_id else None
except NotFoundError:
    st = None

if st is None:
    Path('.rtor_sft_job_id').unlink(missing_ok=True)
    print('job missing (404) — re-run Step 3 to submit a fresh job.')
else:
    while st.status not in ('succeeded', 'failed', 'cancelled'):
        print('  ', st.status, flush=True); time.sleep(30)
        st = client.fine_tuning.jobs.retrieve(job_id)
    print('final:', st.status)
    if st.status == 'succeeded':
        fine_tuned_model = st.fine_tuned_model
        print('fine_tuned_model:', fine_tuned_model)
"""
        ),
        md(
            "---\n## Step 5 — Deploy the tuned model\n\n"
            "**Note:** a deployment bills ~\\$1.70/hour even idle — Step 7 tears it down."
        ),
        code(
            r"""import json, requests, time

FT_DEPLOYMENT_NAME = 'acme-rtor-deployment'
fine_tuned_model = globals().get('fine_tuned_model')
assert fine_tuned_model, 'No fine_tuned_model yet — finish Step 4 (job must succeed).'

auth = _cred.get_token('https://management.azure.com/.default').token
deploy_url = (
    f'https://management.azure.com/subscriptions/{SUBSCRIPTION_ID}'
    f'/resourceGroups/{RESOURCE_GROUP}'
    f'/providers/Microsoft.CognitiveServices/accounts/{RESOURCE_NAME}'
    f'/deployments/{FT_DEPLOYMENT_NAME}'
)
r = requests.put(
    deploy_url, params={'api-version': '2024-10-01'},
    headers={'Authorization': f'Bearer {auth}', 'Content-Type': 'application/json'},
    json={'sku': {'name': 'GlobalStandard', 'capacity': 1},
          'properties': {'model': {'format': 'OpenAI', 'name': fine_tuned_model, 'version': '1'}}},
)
print('PUT', r.status_code, r.reason)
status_url = deploy_url + '?api-version=2024-10-01'
while True:
    s = requests.get(status_url, headers={'Authorization': f'Bearer {auth}'}).json()
    state = s.get('properties', {}).get('provisioningState', 'Unknown')
    print(state)
    if state == 'Succeeded':
        break
    if state in ('Failed', 'Canceled'):
        print(json.dumps(s, indent=2)); break
    time.sleep(20)
"""
        ),
        md(
            "---\n## Step 6 — AFTER: tuned vs base on the conflict cases\n\n"
            "Run a mix of planned, unplanned, bedside, and unrelated cases through both and count "
            "agreement with the gold label."
        ),
        code(
            r"""ids = ('RTOR-0013', 'RTOR-0002', 'RTOR-0009', 'RTOR-0001', 'RTOR-0006', 'RTOR-0010')
EVAL_CASES = [c for c in CASES if c['case_id'] in ids]

def predict(dep, case):
    r = client.chat.completions.create(
        model=dep,
        messages=[{'role': 'system', 'content': SYSTEM_PROMPT},
                  {'role': 'user',   'content': build_user_prompt(case)}],
        temperature=0.0, max_tokens=300, response_format={'type': 'json_object'},
    )
    return safe_parse(r.choices[0].message.content).get('is_return_to_or')

print(f"{'case':12} {'gold':6} {'base':6} {'tuned':6}")
bc = tc = 0
for c in EVAL_CASES:
    b = predict(BASE_DEPLOYMENT, c)
    t = predict(FT_DEPLOYMENT_NAME, c)
    bc += int(b == c['is_return_to_or'])
    tc += int(t == c['is_return_to_or'])
    print(f"{c['case_id']:12} {str(c['is_return_to_or']):6} {str(b):6} {str(t):6}")
print(f"\nBase  accuracy: {bc}/{len(EVAL_CASES)}")
print(f"Tuned accuracy: {tc}/{len(EVAL_CASES)}")
"""
        ),
        md("---\n## Step 7 — Cleanup (stop the hourly deployment bill, keep the model)"),
        code(
            r"""import requests
auth = _cred.get_token('https://management.azure.com/.default').token
url = (
    f'https://management.azure.com/subscriptions/{SUBSCRIPTION_ID}'
    f'/resourceGroups/{RESOURCE_GROUP}'
    f'/providers/Microsoft.CognitiveServices/accounts/{RESOURCE_NAME}'
    f'/deployments/{globals().get("FT_DEPLOYMENT_NAME", "acme-rtor-deployment")}'
)
r = requests.delete(url, params={'api-version': '2024-10-01'},
                    headers={'Authorization': f'Bearer {auth}'})
print('deployment delete:', r.status_code)
print('fine-tuned model kept:', globals().get('fine_tuned_model'))
"""
        ),
        md(
            "---\n## Takeaways\n\n"
            "- SFT injects **judgment**, not just facts — the tuned model honors Rule 1's "
            "planned-overrides-everything ordering the base model trips on.\n"
            "- Same `messages` mechanics as the member-services SFT lab; only the data changed.\n"
            "- Next: **Lab 03** runs the abstractor over a whole batch and shows the tool-schema "
            "token cost you can fine-tune away."
        ),
    ]


# --------------------------------------------------------------------------- #
# LAB 03 - Tool-calling / batch abstraction (the screenshot)
# --------------------------------------------------------------------------- #
def lab03() -> list[dict]:
    return [
        code(CHDIR_GUARD),
        md(
            "# Lab 03 (Clinical) · Batch abstraction + tool-calling fine-tuning\n\n"
            "This is the production pattern from the screenshot: run the abstractor **row-by-row over "
            "a DataFrame** of surgical cases, force a strict `{is_return_to_or, evidence}` JSON, and "
            "**robustly parse** it. Then look at the tool-schema token cost — and how tool-calling "
            "fine-tuning may let you drop the schema; the lab measures the actual prompt-token change."
        ),
        md("---\n## Step 1 — Config, client, prompt & schema"),
        code(CLIENT_SETUP),
        code(PROMPT_SETUP),
        code(
            r"""import json
from pathlib import Path
RTOR_TOOLS = json.loads(Path('data/rtor_tools_schema.json').read_text(encoding='utf-8'))
print('Loaded', len(RTOR_TOOLS), 'tool schemas:')
for t in RTOR_TOOLS:
    print('  -', t['function']['name'])
"""
        ),
        md(
            "---\n## Step 2 — Load the cases into a DataFrame\n\n"
            "One row per surgical episode — the same shape a registry export or EHR query would hand you."
        ),
        code(
            r"""import pandas as pd
df = pd.DataFrame(CASES)
print(df.shape)
display(df[['case_id', 'provider_npi', 'index_surgery_procedure_desc', 'current_surgery_procedure_desc', 'is_return_to_or']])
"""
        ),
        md(
            "---\n## Step 3 — The AI abstraction function (row-wise, strict JSON)\n\n"
            "`response_format=json_object` forces valid JSON; `safe_parse` still guards against stray "
            "markdown fences. We expand the parsed result into columns and score against the gold label."
        ),
        code(
            r"""import pandas as pd

def classify(case):
    r = client.chat.completions.create(
        model=BASE_DEPLOYMENT,
        messages=[{'role': 'system', 'content': SYSTEM_PROMPT},
                  {'role': 'user',   'content': build_user_prompt(case)}],
        temperature=0.0, max_tokens=300, response_format={'type': 'json_object'},
    )
    return r.choices[0].message.content

# Execute the AI function across the DataFrame (mirrors the production batch job)
df['raw_ai_response'] = df.apply(lambda row: classify(row.to_dict()), axis=1)

# Robustly parse + expand into structured columns
parsed = df['raw_ai_response'].apply(safe_parse).apply(pd.Series)
df['pred_is_return_to_or'] = parsed['is_return_to_or']
df['pred_evidence']        = parsed['evidence']
df['correct']              = df['pred_is_return_to_or'] == df['is_return_to_or']

acc = df['correct'].mean()
print(f'Batch accuracy vs gold: {acc:.0%}  ({int(df["correct"].sum())}/{len(df)})')
display(df[['case_id', 'provider_npi', 'is_return_to_or', 'pred_is_return_to_or', 'correct', 'pred_evidence']])
"""
        ),
        md(
            "---\n## Step 4 — The token bill you can fine-tune away\n\n"
            "If you let the model emit a `classify_return_to_or` **tool call** for downstream systems, "
            "you ship the tool schema on every request. Tool-calling fine-tuning bakes that schema into "
            "the weights so you can drop it at inference."
        ),
        code(
            r"""full_tools_json = json.dumps(RTOR_TOOLS)
approx_full = len(full_tools_json) // 4   # ~4 chars per token
print(f'Tool schemas: {len(RTOR_TOOLS)} functions, ~{approx_full} tokens shipped PER call if sent every time.')
print(f'After tool-calling fine-tuning you can drop the tools array entirely: ~{approx_full} fewer tokens/turn.')
print('Across thousands of charts a night, that is the dominant cost lever.')
"""
        ),
        md(
            "---\n## Step 5 — Write the tool-calling SFT artifact\n\n"
            "Baking the schema in is the **same** SFT job as Lab 01 with one change: each record also "
            "carries the `tools` array. We emit that artifact here (no billable job submitted); submit "
            "it exactly like Lab 01 Step 3 when you want the tuned tool-caller."
        ),
        code(
            r"""import json
from pathlib import Path

src_path = Path('data/rtor_training.jsonl')
assert src_path.exists(), 'Run Lab 00 first to generate data/rtor_training.jsonl'
src = [json.loads(l) for l in src_path.read_text(encoding='utf-8-sig').splitlines() if l.strip()]

out_path = Path('data/rtor_tools.jsonl')
with open(out_path, 'w', encoding='utf-8-sig') as f:
    for rec in src:
        rec2 = dict(rec)
        rec2['tools'] = RTOR_TOOLS
        f.write(json.dumps(rec2) + '\n')

print(f'Wrote {len(src)} tool-calling records -> {out_path}')
print('Submit with the Lab 01 Step 3 cell, swapping TRAIN for data/rtor_tools.jsonl and suffix "acme-rtor-tools".')
"""
        ),
        md(
            "---\n## Takeaways\n\n"
            "- The whole abstraction job is a **row-wise strict-JSON call + a defensive parser** — "
            "exactly the production cell, now reproducible and scored.\n"
            "- Evidence citations make every decision **auditable** (Lab 17 / Responsible AI).\n"
            "- Tool-calling fine-tuning turns a per-call schema tax into a one-time training cost.\n"
            "- Next: **Lab 07** turns batch accuracy into a precision/recall scoreboard."
        ),
    ]


# --------------------------------------------------------------------------- #
# LAB 07 - Evaluation
# --------------------------------------------------------------------------- #
def lab07() -> list[dict]:
    return [
        code(CHDIR_GUARD),
        md(
            "# Lab 07 (Clinical) · Evaluate the abstractor\n\n"
            "\"It looks right\" doesn't ship in a quality registry. This lab scores the Return-to-OR "
            "abstractor two ways: **classification metrics** (precision / recall / F1 on "
            "`is_return_to_or`) and an **LLM-as-judge** check that each cited *evidence* string is "
            "actually grounded in the source notes."
        ),
        md("---\n## Step 1 — Config, client, prompt & eval set"),
        code(CLIENT_SETUP),
        code(PROMPT_SETUP),
        code(
            r"""import json
from pathlib import Path
ep = Path('data/rtor_eval.jsonl')
assert ep.exists(), 'Run Lab 00 first to generate data/rtor_eval.jsonl'
EVAL = [json.loads(l) for l in ep.read_text(encoding='utf-8').splitlines() if l.strip()]
print('Eval cases:', len(EVAL))
"""
        ),
        md("---\n## Step 2 — Run the abstractor over the eval set"),
        code(
            r"""preds = []
for case in EVAL:
    r = client.chat.completions.create(
        model=BASE_DEPLOYMENT,
        messages=[{'role': 'system', 'content': SYSTEM_PROMPT},
                  {'role': 'user',   'content': build_user_prompt(case)}],
        temperature=0.0, max_tokens=300, response_format={'type': 'json_object'},
    )
    p = safe_parse(r.choices[0].message.content)
    preds.append({
        'case_id': case['case_id'],
        'gold': case['gold_is_return_to_or'],
        'pred': p.get('is_return_to_or'),
        'pred_evidence': p.get('evidence'),
        'gold_evidence': case['gold_evidence'],
    })
print('Scored', len(preds), 'cases.')
"""
        ),
        md("---\n## Step 3 — Classification metrics"),
        code(
            r"""tp = sum(1 for p in preds if p['gold'] and p['pred'] is True)
tn = sum(1 for p in preds if (not p['gold']) and p['pred'] is False)
fp = sum(1 for p in preds if (not p['gold']) and p['pred'] is True)
fn = sum(1 for p in preds if p['gold'] and p['pred'] is False)
unparsed = sum(1 for p in preds if p['pred'] is None)

prec = tp / (tp + fp) if (tp + fp) else 0.0
rec  = tp / (tp + fn) if (tp + fn) else 0.0
f1   = 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0
acc  = (tp + tn) / len(preds) if preds else 0.0

print('RETURN-TO-OR CLASSIFICATION SCOREBOARD')
print('=' * 48)
print(f'Accuracy : {acc:.0%}')
print(f'Precision: {prec:.0%}')
print(f'Recall   : {rec:.0%}')
print(f'F1       : {f1:.0%}')
print(f'Confusion: TP={tp}  TN={tn}  FP={fp}  FN={fn}   unparsed={unparsed}')
"""
        ),
        md(
            "---\n## Step 4 — LLM-as-judge: is the cited evidence grounded?\n\n"
            "A correct boolean with a hand-wavy citation still fails an audit. Grade each evidence "
            "string 0/1 for quoting a relevant source sentence and naming a plausible rule."
        ),
        code(
            r"""import json

def judge(p):
    sys = (
        'You grade whether an abstraction citation is well-grounded. Given the GOLD evidence and the '
        'MODEL evidence for a surgical Return-to-OR decision, reply with JSON {"score": 0 or 1, '
        '"reason": "..."}. score=1 means the model quoted a relevant source sentence and named a '
        'plausible rule.'
    )
    r = client.chat.completions.create(
        model=BASE_DEPLOYMENT, temperature=0.0, max_tokens=150,
        response_format={'type': 'json_object'},
        messages=[{'role': 'system', 'content': sys},
                  {'role': 'user',   'content': json.dumps({'gold': p['gold_evidence'], 'model': p['pred_evidence']})}],
    )
    return safe_parse(r.choices[0].message.content).get('score', 0)

scored = [p for p in preds if p['pred'] is not None]
scores = [judge(p) for p in scored]
avg = sum(scores) / len(scores) if scores else 0.0
print(f'Evidence groundedness (LLM-judge): {avg:.0%} over {len(scores)} parsed cases')
"""
        ),
        md("---\n## Step 5 — One scoreboard per release"),
        code(
            r"""import pandas as pd
board = pd.DataFrame(preds)
board['match'] = board['gold'] == board['pred']
display(board[['case_id', 'gold', 'pred', 'match']])
print(f'\nRelease scoreboard -> classification accuracy {acc:.0%} | evidence groundedness {avg:.0%}')
print('Re-run after Lab 01 fine-tuning to watch both numbers move.')
"""
        ),
        md(
            "---\n## Takeaways\n\n"
            "- Numbers, not vibes: precision/recall on the boolean **and** a groundedness check on the "
            "citation.\n"
            "- The same eval set scores the base model today and the fine-tuned model from Lab 01 — "
            "that delta is your release gate.\n"
            "- Wire this into **Lab 13 (continuous eval)** to catch drift as op-note templates change."
        ),
    ]


def main() -> None:
    OUT.mkdir(exist_ok=True)
    write_nb("00_synthetic_data_generation.ipynb", lab00())
    write_nb("01_supervised_fine_tuning.ipynb", lab01())
    write_nb("03_tool_calling_fine_tuning.ipynb", lab03())
    write_nb("07_evaluation.ipynb", lab07())
    print("done.")


if __name__ == "__main__":
    main()
