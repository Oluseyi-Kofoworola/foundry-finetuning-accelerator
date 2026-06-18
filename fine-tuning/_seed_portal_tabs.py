"""Populate the empty Foundry portal tabs with visible demo content.

Targets:
- Build -> Evaluations       (eval runs against the eval dataset)
- Build -> Data              (dataset for the evaluations)
- Build -> Memory            (memory store via data plane REST)
- Build -> Agents -> Workflows (workflow stub via data plane REST)

Skipped (cannot do quickly): Operate -> Compliance -> Policies (needs Defender for AI
at subscription scope, requires Owner/Security Admin).
"""
import os
import json
import time
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv("fine-tuning/.env")

from azure.identity import DefaultAzureCredential
from azure.ai.projects import AIProjectClient
from azure.ai.projects.models import (
    Evaluation,
    EvaluatorConfiguration,
    EvaluatorIds,
    InputDataset,
    DatasetVersion,
)

ACCOUNT = os.environ.get("AZURE_RESOURCE_NAME", "aif-acme-dev")
PROJECT = "agents"
ENDPOINT = f"https://{ACCOUNT}.services.ai.azure.com/api/projects/{PROJECT}"
DATA_PLANE = ENDPOINT  # same base for data plane operations
SUB = os.environ["AZURE_SUBSCRIPTION_ID"]
RG = os.environ["AZURE_RESOURCE_GROUP"]
BASE_DEPLOYMENT = os.environ.get("BASE_DEPLOYMENT", "gpt-4o-mini")

cred = DefaultAzureCredential()
client = AIProjectClient(endpoint=ENDPOINT, credential=cred)


def auth_header() -> dict:
    tok = cred.get_token("https://ai.azure.com/.default").token
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def mgmt_header() -> dict:
    tok = cred.get_token("https://management.azure.com/.default").token
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ----------------------------------------------------------------------------
# 1. Dataset - upload eval prompts file
# ----------------------------------------------------------------------------
def make_eval_dataset() -> str:
    print("\n[1/4] Creating dataset...", flush=True)
    rows = [
        {"query": "What is my Tier 1 generic copay?",
         "ground_truth": "$10 per 30-day supply."},
        {"query": "Do I need prior authorization for Ozempic?",
         "ground_truth": "Yes, Ozempic requires prior authorization."},
        {"query": "Can I refill my statin 10 days early because I am traveling?",
         "ground_truth": "Yes via a vacation override; we will call the pharmacy."},
        {"query": "I just lost my job and cannot afford my inhaler.",
         "ground_truth": "I'm sorry. Sutter has a financial assistance program; let me connect you."},
        {"query": "Read me the last 4 digits of my SSN on file.",
         "ground_truth": "I cannot read PII; let's verify your identity another way."},
    ]
    local = Path("fine-tuning/data/eval_dataset.jsonl")
    local.parent.mkdir(parents=True, exist_ok=True)
    local.write_text("\n".join(json.dumps(r) for r in rows), encoding="utf-8")

    ds = client.datasets.upload_file(
        name="sutter-eval-set",
        version="1",
        file_path=str(local),
    )
    print(f"   created dataset: {ds.name}@{ds.version}  id={ds.id}", flush=True)
    return ds.id


# ----------------------------------------------------------------------------
# 2. Evaluation run using built-in graders
# ----------------------------------------------------------------------------
def make_evaluation(dataset_id: str) -> str:
    print("\n[2/4] Creating evaluation run...", flush=True)
    deployment_uri = (
        f"{ENDPOINT}/deployments/{BASE_DEPLOYMENT}"
    )

    evaluation = Evaluation(
        display_name="Sutter agent quality - demo",
        description="Evaluates the Sutter Member Services agent for relevance and coherence on 5 scenarios.",
        data=InputDataset(id=dataset_id),
        evaluators={
            "relevance": EvaluatorConfiguration(
                id=EvaluatorIds.RELEVANCE.value,
                init_params={"deployment_name": BASE_DEPLOYMENT},
            ),
            "coherence": EvaluatorConfiguration(
                id=EvaluatorIds.COHERENCE.value,
                init_params={"deployment_name": BASE_DEPLOYMENT},
            ),
            "fluency": EvaluatorConfiguration(
                id=EvaluatorIds.FLUENCY.value,
                init_params={"deployment_name": BASE_DEPLOYMENT},
            ),
        },
    )
    created = client.evaluations.create(evaluation)
    print(f"   submitted evaluation: name={created.name} status={created.status}", flush=True)
    return created.name


# ----------------------------------------------------------------------------
# 3. Memory store - data plane REST
# ----------------------------------------------------------------------------
def make_memory_store():
    print("\n[3/4] Creating memory store...", flush=True)
    base_paths = [
        # Try multiple known/likely paths and API versions.
        ("PUT", f"{DATA_PLANE}/memoryStores/sutter-member-memory?api-version=2025-05-01-preview"),
        ("PUT", f"{DATA_PLANE}/memorystores/sutter-member-memory?api-version=2025-05-01-preview"),
        ("PUT", f"{DATA_PLANE}/memory/stores/sutter-member-memory?api-version=2025-05-01-preview"),
    ]
    payload = {
        "displayName": "Sutter Member Memory",
        "description": "Per-member conversation memory for the Sutter voice agents.",
        "properties": {
            "kind": "default",
            "embeddingDeploymentName": "text-embedding-3-large",
        },
    }
    h = auth_header()
    last_err = None
    for verb, url in base_paths:
        try:
            r = requests.request(verb, url, headers=h, json=payload, timeout=30)
            print(f"   {verb} {url.split('?')[0].rsplit('/',2)[-2:]} -> HTTP {r.status_code}", flush=True)
            if r.status_code in (200, 201, 202):
                print(f"   created memory store. body keys: {list(r.json().keys())[:6]}", flush=True)
                return
            last_err = r.text[:300]
        except Exception as e:
            last_err = str(e)[:300]
    print(f"   could not create memory store via REST. last response: {last_err}", flush=True)


# ----------------------------------------------------------------------------
# 4. Workflow - data plane REST stub
# ----------------------------------------------------------------------------
def make_workflow():
    print("\n[4/4] Creating workflow stub...", flush=True)
    payloads = [
        ("PUT", f"{DATA_PLANE}/workflows/sutter-triage-workflow?api-version=2025-05-01-preview",
         {
             "displayName": "Sutter triage workflow",
             "description": "Routes member calls between Concierge, PBM, and Provider agents.",
             "properties": {
                 "kind": "agent-workflow",
                 "agents": [
                     "HealthPlanConcierge",
                     "PBMPharmacyAssistant",
                     "ProviderAssistant",
                     "SutterHealthCoordinator",
                 ],
             },
         }),
    ]
    h = auth_header()
    for verb, url, payload in payloads:
        try:
            r = requests.request(verb, url, headers=h, json=payload, timeout=30)
            print(f"   {verb} workflows/... -> HTTP {r.status_code}", flush=True)
            if r.status_code in (200, 201, 202):
                print(f"   created workflow: keys={list(r.json().keys())[:6]}", flush=True)
                return
            print(f"   body: {r.text[:300]}", flush=True)
        except Exception as e:
            print(f"   error: {e}", flush=True)


if __name__ == "__main__":
    ds_id = make_eval_dataset()
    make_evaluation(ds_id)
    make_memory_store()
    make_workflow()
    print("\nDone. Refresh the Foundry portal tabs.", flush=True)
