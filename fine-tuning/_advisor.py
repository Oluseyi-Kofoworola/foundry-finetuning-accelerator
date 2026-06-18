"""Foundry Decision Advisor — engine for Lab 09.

The "drop in your code, Foundry tells you what to do" engine. Given a code or
task sample, it:

  1. Classifies the workload (reasoning / summarization / tool-calling / RAG /
     safety / synthesis ...).
  2. Detects gaps in the code (hardcoded model, no eval, no guardrails, heavy
     tool prompts, external knowledge, etc.).
  3. Recommends the best Foundry model from the catalog WITH a rationale and a
     cost / latency / accuracy tradeoff.
  4. Maps each detected need to a concrete Foundry capability and the lab in
     this repo that proves it (Labs 00-08).
  5. Emits a structured decision trace (trace_id, model_selected, tokens,
     latency, flags...) as JSON — and to App Insights when tracing is enabled.

Design goals:
  * Runs fully OFFLINE in mock mode (heuristics only) — no Azure required.
  * When Azure creds are present, an optional LLM pass refines classification.
  * Pure dataclasses + stdlib so the labs stay dependency-light and testable.

CLI:
    python _advisor.py --sample data/samples/rag_chatbot.py
    python _advisor.py --task "Summarize 10k member call transcripts nightly"
    python _advisor.py --demo          # run the full built-in demo suite
"""
from __future__ import annotations

import argparse
import json
import os
import re
import time
import uuid
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any, Optional

# --------------------------------------------------------------------------- #
# Paths / catalog loading
# --------------------------------------------------------------------------- #

_HERE = Path(__file__).resolve().parent
_CATALOG_PATH = _HERE / "data" / "foundry_model_catalog.json"


def load_catalog(path: Path | str = _CATALOG_PATH) -> list[dict[str, Any]]:
    """Load the curated Foundry model catalog + benchmark scores from disk.

    This is the offline benchmark sheet. For a *live* catalog of what is actually
    deployed on your Foundry resource, use ``load_catalog_live`` below."""
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return data["models"]


def get_credential() -> Any:
    """Return a fast, kernel-safe Azure credential.

    Inside the VS Code Jupyter kernel a bare ``DefaultAzureCredential`` hangs
    while it probes managed-identity / IMDS endpoints that don't exist on a dev
    box. Since `az login` is the real auth source here, we try
    ``AzureCliCredential`` first (instant) and only fall back to a
    ``DefaultAzureCredential`` that has the slow probes excluded. This keeps the
    lab fully LIVE — no mock mode — whenever the user is `az login`-ed.
    """
    from azure.identity import (
        AzureCliCredential,
        ChainedTokenCredential,
        DefaultAzureCredential,
    )

    return ChainedTokenCredential(
        AzureCliCredential(),
        DefaultAzureCredential(
            exclude_managed_identity_credential=True,
            exclude_shared_token_cache_credential=True,
            exclude_interactive_browser_credential=True,
            exclude_visual_studio_code_credential=True,
        ),
    )


def load_catalog_live(
    *,
    catalog_path: Path | str = _CATALOG_PATH,
    timeout: float = 15.0,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Load the Foundry model catalog **live** from the Azure resource.

    Pulls the *actual* model deployments on the configured Foundry resource via
    the Azure management API (the live "model catalog"), then merges in the
    curated benchmark scores from the local catalog file (the stand-in for the
    Foundry benchmarks API). Each entry is flagged ``live`` and annotated with
    the real underlying model + SKU.

    Falls back to the static benchmark sheet when Azure creds / network are
    unavailable so the lab still runs fully offline.

    Returns ``(catalog, meta)`` where ``meta`` describes the data source:
    ``{"source": "live"|"static", "live": bool, "endpoint": str,
    "deployments": int, "error": str|None}``.
    """
    benchmarks = {m["deployment"]: m for m in load_catalog(catalog_path)}

    sub = os.environ.get("AZURE_SUBSCRIPTION_ID")
    rg = os.environ.get("AZURE_RESOURCE_GROUP")
    acct = os.environ.get("AZURE_RESOURCE_NAME")
    meta: dict[str, Any] = {
        "source": "static",
        "live": False,
        "endpoint": os.environ.get("AZURE_OPENAI_ENDPOINT"),
        "deployments": 0,
        "error": None,
    }

    if not (sub and rg and acct):
        meta["error"] = (
            "missing AZURE_SUBSCRIPTION_ID / AZURE_RESOURCE_GROUP / AZURE_RESOURCE_NAME"
        )
        return list(benchmarks.values()), meta

    try:
        import requests

        token = (
            get_credential()
            .get_token("https://management.azure.com/.default")
            .token
        )
        url = (
            f"https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}"
            f"/providers/Microsoft.CognitiveServices/accounts/{acct}/deployments"
            f"?api-version=2023-05-01"
        )
        resp = requests.get(
            url, headers={"Authorization": f"Bearer {token}"}, timeout=timeout
        )
        resp.raise_for_status()
        live_deployments = resp.json().get("value", [])
    except Exception as exc:  # offline-safe: fall back to the static benchmark sheet
        meta["error"] = f"{type(exc).__name__}: {exc}"
        return list(benchmarks.values()), meta

    catalog: list[dict[str, Any]] = []
    live_names: set[str] = set()
    for dep in live_deployments:
        name = dep.get("name")
        if not name:
            continue
        props = dep.get("properties", {})
        model_name = (props.get("model") or {}).get("name")
        sku = (dep.get("sku") or {}).get("name")
        live_names.add(name)

        # Start from the curated benchmark scores when we have them for this
        # deployment; otherwise fall back to neutral defaults so the router can
        # still reason about a brand-new live deployment.
        entry = dict(benchmarks.get(name, {}))
        entry["deployment"] = name
        entry["live"] = True
        entry["live_model"] = model_name
        entry["sku"] = sku
        entry.setdefault("model", model_name)
        for field_name, default in (
            ("tier", "unknown"),
            ("fine_tunable", False),
            ("relative_cost", 5),
            ("relative_latency", 5),
            ("reasoning_score", 5),
            ("summarization_score", 5),
            ("tool_calling_score", 5),
            ("safety_score", 5),
            ("best_for", []),
            ("strengths", ""),
            ("notes", ""),
        ):
            entry.setdefault(field_name, default)
        catalog.append(entry)

    # Keep curated entries that aren't currently deployed, flagged not-live, so
    # the benchmark sheet still informs the demo even if a model was removed.
    for name, entry in benchmarks.items():
        if name not in live_names:
            stale = dict(entry)
            stale["live"] = False
            catalog.append(stale)

    meta.update(source="live", live=True, deployments=len(live_names))
    return catalog, meta


# --------------------------------------------------------------------------- #
# Task taxonomy + heuristic signals
# --------------------------------------------------------------------------- #

# Maps a task type -> the catalog score field used to rank models for it.
TASK_SCORE_FIELD: dict[str, str] = {
    "clinical_reasoning": "reasoning_score",
    "complex_reasoning": "reasoning_score",
    "synthesis": "reasoning_score",
    "summarization": "summarization_score",
    "extraction": "summarization_score",
    "classification": "summarization_score",
    "routing": "summarization_score",
    "tool_calling": "tool_calling_score",
    "safety_review": "safety_score",
    "rag": "summarization_score",
}

# Heuristic regexes that vote for a task type when found in a code/task sample.
_TASK_SIGNALS: dict[str, list[str]] = {
    "tool_calling": [r"\btools?\s*=", r"function_call", r"tool_call", r"@tool\b", r"\bfunctions=\["],
    "rag": [r"embed", r"vector", r"cosine", r"retriev", r"\brag\b", r"chunk", r"knowledge base", r"\bkb\b"],
    "summarization": [r"summar", r"tl;?dr", r"condense", r"digest", r"transcript"],
    "classification": [r"classif", r"\bintent\b", r"categor", r"label", r"route to"],
    "safety_review": [r"guardrail", r"\bpii\b", r"\bphi\b", r"jailbreak", r"moderation", r"safety", r"redact"],
    "clinical_reasoning": [r"diagnos", r"clinical", r"medical necessity", r"reason through", r"step.?by.?step"],
    "synthesis": [r"combine", r"synthe", r"aggregate", r"final recommendation", r"merge .*outputs"],
}

# Gap detectors: (flag_id, regex_that_indicates_the_gap_is_PRESENT_or_ABSENT)
# Each returns True when the *gap* exists (i.e. an improvement opportunity).
def _detect_gaps(text: str) -> list[str]:
    t = text.lower()
    gaps: list[str] = []

    if re.search(r"model\s*=\s*['\"]", t) or re.search(r"deployment\s*=\s*['\"]", t):
        gaps.append("hardcoded_model")
    if not re.search(r"eval|assert|score|rubric|judge|test_", t):
        gaps.append("no_evaluation")
    if not re.search(r"guardrail|moderation|refus|pii|phi|redact|system prompt", t):
        gaps.append("no_guardrails")
    if re.search(r"tools?\s*=|functions=\[|tool schema|tool description", t):
        gaps.append("heavy_tool_prompt")
    if re.search(r"copay|formulary|policy|price|cutoff|internal|proprietary|domain fact", t):
        gaps.append("needs_domain_facts")
    if re.search(r"empath|tone|warm|brand voice|bedside", t):
        gaps.append("needs_tone")
    if re.search(r"knowledge base|\bkb\b|retriev|changing data|up.?to.?date|formulary", t):
        gaps.append("external_knowledge")
    if re.search(r"history|multi.?turn|remember|previous (call|message|session)|context window", t):
        gaps.append("needs_memory")
    if re.search(r"today|current date|now\(|datetime|eta|arrive|deadline", t):
        gaps.append("needs_date_awareness")
    if not re.search(r"trace|telemetry|app ?insights|opentelemetry|monitor|log", t):
        gaps.append("no_observability")

    # --- Scale / enterprise readiness flags (map to Labs 10-17) ------------ #
    if re.search(r"\bphi\b|\bpii\b|hipaa|baa|compliance|data residency|in.?region|"
                 r"private endpoint|vnet|customer.?managed key|\bcmk\b|encrypt|audit", t):
        gaps.append("needs_compliance")
    if re.search(r"multi.?step|orchestrat|several tools|chain (of )?tools|workflow|"
                 r"\bagent\b|autonomous|connected tool|\bmcp\b|hand.?off", t):
        gaps.append("needs_agents")
    if not re.search(r"blue.?green|canary|rollback|staging|ci.?cd|pipeline|"
                     r"\bptu\b|provisioned throughput|promote|deployment slot", t):
        gaps.append("not_production_ready")
    if re.search(r"production|in prod|live traffic|drift|regression in prod|"
                 r"online eval|continuous (eval|monitor)|24.?7|nightly", t):
        gaps.append("needs_continuous_eval")
    if re.search(r"\$|cost|budget|spend|quota|chargeback|token cap|per.?member|"
                 r"at scale|millions of|throughput limit|rate limit", t):
        gaps.append("needs_cost_governance")
    if re.search(r"openai\.com|api\.openai|from openai import openai\b|anthropic|"
                 r"\bbedrock\b|vertex|\bgemini\b|other cloud|migrate", t):
        gaps.append("needs_migration")
    if re.search(r"o1\b|o3\b|o4\b|reasoning model|chain.?of.?thought|\brft\b|"
                 r"reinforcement fine.?tun|distill", t):
        gaps.append("needs_reasoning_ft")
    if re.search(r"harm categor|content safety|groundedness|protected material|"
                 r"red.?team|responsible ai|\brai\b|toxicit|self.?harm", t):
        gaps.append("needs_responsible_ai")
    return gaps


# Maps a gap / need -> (Foundry capability, lab file, one-line why).
FEATURE_MAP: dict[str, dict[str, str]] = {
    "needs_domain_facts": {
        "capability": "Supervised Fine-Tuning (SFT)",
        "lab": "01_supervised_fine_tuning.ipynb",
        "why": "Bake private facts (copays, cutoffs, policies) into the model so it stops hallucinating.",
    },
    "needs_tone": {
        "capability": "Direct Preference Optimization (DPO)",
        "lab": "02_direct_preference_optimization.ipynb",
        "why": "Teach a warm, on-brand tone by preferring good answers over cold ones.",
    },
    "heavy_tool_prompt": {
        "capability": "Tool-Calling Fine-Tuning",
        "lab": "03_tool_calling_fine_tuning.ipynb",
        "why": "Bake tool schemas in to cut prompt tokens ~80% while keeping correct calls.",
    },
    "external_knowledge": {
        "capability": "Knowledge Retrieval (RAG)",
        "lab": "04_knowledge_retrieval.ipynb",
        "why": "Ground answers in changing sources (formulary) without retraining.",
    },
    "needs_memory": {
        "capability": "Conversation Memory",
        "lab": "05_conversation_memory.ipynb",
        "why": "Carry context across turns / sessions (sliding window, summary, profile).",
    },
    "needs_date_awareness": {
        "capability": "Date & Time Awareness",
        "lab": "06_date_awareness.ipynb",
        "why": "Stop the model guessing dates; inject time + deterministic ETA helpers.",
    },
    "no_evaluation": {
        "capability": "Evaluation",
        "lab": "07_evaluation.ipynb",
        "why": "Replace 'felt better today' with keyword + LLM-judge scoreboards per release.",
    },
    "no_guardrails": {
        "capability": "Guardrails",
        "lab": "08_guardrails.ipynb",
        "why": "Add the 4-layer stack: hardened prompt, PII scrub, refusal, jailbreak defense.",
    },
    "hardcoded_model": {
        "capability": "Model Routing",
        "lab": "09_foundry_decision_advisor.ipynb",
        "why": "Route each request to the cheapest model that can handle it instead of one hardcoded model.",
    },
    "no_observability": {
        "capability": "Tracing / Observability",
        "lab": "07_evaluation.ipynb",
        "why": "Wire OpenTelemetry -> App Insights so every call shows in the Foundry Tracing tab.",
    },
    "needs_compliance": {
        "capability": "Security, Compliance & Data Residency (HIPAA/PHI)",
        "lab": "10_security_compliance.ipynb",
        "why": "Keep PHI out of base training, in-region, behind private endpoints + CMK with a HIPAA BAA.",
    },
    "needs_agents": {
        "capability": "Agents & Tool Orchestration (Foundry Agent Service)",
        "lab": "11_agents_orchestration.ipynb",
        "why": "Run persistent agents that chain connected tools / MCP across multi-step workflows.",
    },
    "not_production_ready": {
        "capability": "Production Deployment & Lifecycle (MLOps/CI-CD)",
        "lab": "12_production_deployment.ipynb",
        "why": "Add PTU vs pay-go, blue/green, rollback and dev->prod promotion via CI-CD.",
    },
    "needs_continuous_eval": {
        "capability": "Continuous Evaluation & Monitoring",
        "lab": "13_continuous_evaluation.ipynb",
        "why": "Catch quality drift in production with online eval + alerts to App Insights.",
    },
    "needs_cost_governance": {
        "capability": "Cost Governance at Scale",
        "lab": "14_cost_governance.ipynb",
        "why": "Control spend with quotas, PTU sizing, token caps, budget alerts and chargeback.",
    },
    "needs_migration": {
        "capability": "Migration Path to Foundry",
        "lab": "15_migration_path.ipynb",
        "why": "Port from OpenAI-direct / other clouds to Foundry with a minimal code diff.",
    },
    "needs_reasoning_ft": {
        "capability": "Reasoning Models + RFT / Distillation",
        "lab": "16_reasoning_rft.ipynb",
        "why": "Route hard cases to o-series and lift accuracy with reinforcement FT + distillation.",
    },
    "needs_responsible_ai": {
        "capability": "Responsible AI Deep Dive",
        "lab": "17_responsible_ai.ipynb",
        "why": "Harm categories, groundedness/protected-material checks, red-teaming and audit trail.",
    },
}


# --------------------------------------------------------------------------- #
# Result dataclasses (structured, JSON-serializable)
# --------------------------------------------------------------------------- #

@dataclass
class ModelRecommendation:
    deployment: str
    tier: str
    score: int
    rationale: str
    tradeoff: str
    runner_up: Optional[str] = None


@dataclass
class FeatureRecommendation:
    need: str
    capability: str
    lab: str
    why: str


@dataclass
class DecisionTrace:
    trace_id: str
    task_types: list[str]
    primary_task: str
    classification_method: str
    model_selected: str
    model_score: int
    feature_count: int
    prompt_tokens_estimate: int
    latency_ms: float
    flags: list[str]
    confidence: float


@dataclass
class AdvisorResult:
    primary_task: str
    task_types: list[str]
    classification_method: str
    model: ModelRecommendation
    features: list[FeatureRecommendation]
    trace: DecisionTrace
    decisive_field: str = ""
    scoreboard: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "primary_task": self.primary_task,
            "task_types": self.task_types,
            "classification_method": self.classification_method,
            "model": asdict(self.model),
            "features": [asdict(f) for f in self.features],
            "decisive_field": self.decisive_field,
            "scoreboard": self.scoreboard,
            "trace": asdict(self.trace),
        }


# --------------------------------------------------------------------------- #
# Classifier
# --------------------------------------------------------------------------- #

class WorkloadClassifier:
    """Classifies a code/task sample into task types.

    Heuristics always run (offline-safe). When an Azure OpenAI client is passed
    and creds exist, an optional LLM pass refines the ranking.
    """

    def __init__(self, client: Any = None, deployment: str = "gpt-4o-mini") -> None:
        self.client = client
        self.deployment = deployment

    def classify(self, text: str) -> tuple[list[str], str]:
        """Return (ordered_task_types, method)."""
        scores = self._heuristic_scores(text)
        if not scores:
            scores = {"summarization": 1}  # safe default

        if self.client is not None:
            llm_types = self._llm_refine(text)
            if llm_types:
                # Boost LLM-detected types so they sort first, keep heuristic tail.
                for i, tt in enumerate(llm_types):
                    scores[tt] = scores.get(tt, 0) + (10 - i)
                method = "heuristic+llm"
            else:
                method = "heuristic"
        else:
            method = "heuristic"

        ordered = [t for t, _ in sorted(scores.items(), key=lambda kv: kv[1], reverse=True)]
        return ordered, method

    def _heuristic_scores(self, text: str) -> dict[str, int]:
        t = text.lower()
        scores: dict[str, int] = {}
        for task, patterns in _TASK_SIGNALS.items():
            hits = sum(1 for p in patterns if re.search(p, t))
            if hits:
                scores[task] = hits
        return scores

    def _llm_refine(self, text: str) -> list[str]:
        """Optional LLM classification. Returns [] on any failure (offline-safe).

        # Replace this with an Azure AI Foundry Agent SDK call if you adopt agents.
        """
        try:
            allowed = sorted(set(TASK_SCORE_FIELD.keys()))
            prompt = (
                "Classify this AI workload into 1-3 task types from this exact list: "
                f"{allowed}. Reply with ONLY a JSON array of strings, most relevant first.\n\n"
                f"WORKLOAD:\n{text[:4000]}"
            )
            resp = self.client.chat.completions.create(
                model=self.deployment,
                messages=[{"role": "user", "content": prompt}],
                temperature=0,
                max_tokens=60,
            )
            raw = resp.choices[0].message.content.strip()
            raw = re.sub(r"^```(json)?|```$", "", raw, flags=re.MULTILINE).strip()
            parsed = json.loads(raw)
            return [p for p in parsed if p in TASK_SCORE_FIELD]
        except Exception:
            return []


# --------------------------------------------------------------------------- #
# Model router
# --------------------------------------------------------------------------- #

class ModelRouter:
    """Recommends the best Foundry model for a task — with rationale + tradeoff."""

    def __init__(self, catalog: Optional[list[dict[str, Any]]] = None) -> None:
        self.catalog = catalog if catalog is not None else load_catalog()

    def recommend(self, task_types: list[str], prefer_cost: bool = False) -> ModelRecommendation:
        primary = task_types[0] if task_types else "summarization"
        score_field = TASK_SCORE_FIELD.get(primary, "summarization_score")

        # Embedding tasks have their own pool.
        if primary in ("rag", "embeddings", "retrieval"):
            emb = next((m for m in self.catalog if m["tier"] == "embedding"), None)
            if emb:
                return ModelRecommendation(
                    deployment=emb["deployment"],
                    tier=emb["tier"],
                    score=10,
                    rationale=(
                        f"'{primary}' needs embeddings for grounding. {emb['deployment']} "
                        "produces the vectors; pair it with gpt-4o-mini to answer from retrieved chunks."
                    ),
                    tradeoff="Lowest cost/latency; not a chat model — must be paired with a generator.",
                )

        # Rank chat/reasoning models by the relevant score, then by cost.
        candidates = [m for m in self.catalog if m["tier"] != "embedding"]

        def sort_key(m: dict[str, Any]) -> tuple:
            quality = m.get(score_field, 0)
            # When cost matters, penalize expensive models slightly.
            cost_penalty = m["relative_cost"] if prefer_cost else 0
            return (quality - cost_penalty * 0.4, -m["relative_cost"])

        ranked = sorted(candidates, key=sort_key, reverse=True)
        best = ranked[0]
        runner = ranked[1] if len(ranked) > 1 else None

        rationale = (
            f"For a primary task of '{primary}', {best['deployment']} ranks highest on "
            f"{score_field.replace('_', ' ')} ({best.get(score_field, 0)}/10). {best['notes']}"
        )
        tradeoff = (
            f"cost={best['relative_cost']}/10, latency={best['relative_latency']}/10, "
            f"reasoning={best['reasoning_score']}/10. "
            + ("Optimized for cost." if prefer_cost else "Optimized for quality.")
        )
        return ModelRecommendation(
            deployment=best["deployment"],
            tier=best["tier"],
            score=int(best.get(score_field, 0)),
            rationale=rationale,
            tradeoff=tradeoff,
            runner_up=runner["deployment"] if runner else None,
        )

    def scoreboard(
        self, task_types: list[str], prefer_cost: bool = False
    ) -> tuple[str, str, list[dict[str, Any]]]:
        """Expose the full ranking behind a pick so a human can audit / override it.

        Returns ``(primary_task, decisive_field, ranked_rows)``. Each row carries
        every benchmark score (reasoning / summarization / tool-calling / safety),
        cost + latency, the ``decisive_score`` for this task, and the computed
        ``fit_score`` that actually orders the models. ``fit_score`` is
        ``decisive_score`` minus a cost penalty when ``prefer_cost`` is set — the
        exact value :meth:`recommend` sorts on — so the "why this model" answer is
        transparent and you can re-rank on any column you care about instead.
        """
        primary = task_types[0] if task_types else "summarization"
        score_field = TASK_SCORE_FIELD.get(primary, "summarization_score")

        rows: list[dict[str, Any]] = []
        for m in self.catalog:
            if m["tier"] == "embedding":
                continue
            quality = m.get(score_field, 0)
            cost_penalty = m["relative_cost"] if prefer_cost else 0
            fit = round(quality - cost_penalty * 0.4, 2)
            rows.append({
                "deployment": m["deployment"],
                "tier": m["tier"],
                "decisive_score": quality,
                "fit_score": fit,
                "reasoning": m.get("reasoning_score", 0),
                "summarization": m.get("summarization_score", 0),
                "tool_calling": m.get("tool_calling_score", 0),
                "safety": m.get("safety_score", 0),
                "cost": m.get("relative_cost", 0),
                "latency": m.get("relative_latency", 0),
                "live": m.get("live", None),
            })

        rows.sort(key=lambda r: (r["fit_score"], -r["cost"]), reverse=True)
        for i, r in enumerate(rows, 1):
            r["rank"] = i
        return primary, score_field, rows


# --------------------------------------------------------------------------- #
# Feature advisor
# --------------------------------------------------------------------------- #

class FoundryFeatureAdvisor:
    """Maps detected gaps -> Foundry capabilities + the lab that proves each."""

    def advise(self, gaps: list[str]) -> list[FeatureRecommendation]:
        recs: list[FeatureRecommendation] = []
        seen: set[str] = set()
        for gap in gaps:
            spec = FEATURE_MAP.get(gap)
            if not spec or spec["capability"] in seen:
                continue
            seen.add(spec["capability"])
            recs.append(
                FeatureRecommendation(
                    need=gap,
                    capability=spec["capability"],
                    lab=spec["lab"],
                    why=spec["why"],
                )
            )
        return recs


# --------------------------------------------------------------------------- #
# Top-level advisor
# --------------------------------------------------------------------------- #

class FoundryDecisionAdvisor:
    """Orchestrates classify -> recommend model -> recommend features -> trace."""

    def __init__(self, client: Any = None, catalog: Optional[list[dict[str, Any]]] = None) -> None:
        self.classifier = WorkloadClassifier(client=client)
        self.router = ModelRouter(catalog=catalog)
        self.features = FoundryFeatureAdvisor()

    def analyze(self, text: str, prefer_cost: bool = False) -> AdvisorResult:
        t0 = time.perf_counter()

        task_types, method = self.classifier.classify(text)
        gaps = _detect_gaps(text)
        model = self.router.recommend(task_types, prefer_cost=prefer_cost)
        _, decisive_field, board = self.router.scoreboard(task_types, prefer_cost=prefer_cost)
        features = self.features.advise(gaps)

        latency_ms = round((time.perf_counter() - t0) * 1000, 2)
        primary = task_types[0] if task_types else "summarization"
        # Confidence: more signals + more gaps detected => higher confidence.
        confidence = round(min(0.95, 0.5 + 0.05 * len(task_types) + 0.04 * len(features)), 2)

        trace = DecisionTrace(
            trace_id=str(uuid.uuid4()),
            task_types=task_types,
            primary_task=primary,
            classification_method=method,
            model_selected=model.deployment,
            model_score=model.score,
            feature_count=len(features),
            prompt_tokens_estimate=max(1, len(text) // 4),
            latency_ms=latency_ms,
            flags=gaps,
            confidence=confidence,
        )
        return AdvisorResult(
            primary_task=primary,
            task_types=task_types,
            classification_method=method,
            model=model,
            features=features,
            trace=trace,
            decisive_field=decisive_field,
            scoreboard=board,
        )

    def scoreboard(
        self, text: str, prefer_cost: bool = False
    ) -> tuple[str, str, list[dict[str, Any]]]:
        """Classify ``text`` then return the full ranked model scoreboard.

        Lets you SEE why a model wins — and pick a different one if you weight
        cost / latency / a specific capability differently. Returns
        ``(primary_task, decisive_field, ranked_rows)``.
        """
        task_types, _ = self.classifier.classify(text)
        return self.router.scoreboard(task_types, prefer_cost=prefer_cost)


# --------------------------------------------------------------------------- #
# Pretty printing
# --------------------------------------------------------------------------- #

def print_report(result: AdvisorResult, *, emit_trace: bool = True) -> None:
    r = result
    print("=" * 70)
    print(f"  FOUNDRY DECISION ADVISOR  ·  trace {r.trace.trace_id[:8]}")
    print("=" * 70)
    print(f"\n  Detected workload : {r.primary_task}")
    print(f"  All task types    : {', '.join(r.task_types)}")
    print(f"  Classified via    : {r.classification_method}")

    print(f"\n  ── Recommended model ──────────────────────────────────────────")
    print(f"  → {r.model.deployment}  (tier: {r.model.tier}, score {r.model.score}/10)")
    print(f"    Why     : {r.model.rationale}")
    print(f"    Tradeoff: {r.model.tradeoff}")
    if r.model.runner_up:
        print(f"    Runner-up: {r.model.runner_up}")

    if r.scoreboard:
        decisive = (r.decisive_field or "").replace("_score", "") or "fit"
        print(f"\n  ── Why this model? Ranked scoreboard (decided by {decisive}) ──")
        print(f"    {'#':<2} {'deployment':<24} {'fit':>5} {decisive[:9]:>9} "
              f"{'cost':>4} {'lat':>4}")
        for row in r.scoreboard[:5]:
            mark = "→" if row["rank"] == 1 else " "
            print(f"  {mark} {row['rank']:<2} {row['deployment']:<24} "
                  f"{row['fit_score']:>5} {row['decisive_score']:>9} "
                  f"{row['cost']:>4} {row['latency']:>4}")
        print("    (fit_score is what ordered them — re-rank on any column to override.)")

    print(f"\n  ── Foundry capabilities to adopt ──────────────────────────────")
    if not r.features:
        print("    (no gaps detected — your sample already uses the core patterns)")
    for f in r.features:
        print(f"  • {f.capability}  →  {f.lab}")
        print(f"      need: {f.need}  |  {f.why}")

    print(f"\n  Confidence: {r.trace.confidence}  ·  latency: {r.trace.latency_ms} ms")
    print("=" * 70)

    if emit_trace:
        # Replace this local print with Azure Monitor / Application Insights export.
        print("\n[trace] " + json.dumps(asdict(r.trace)))


# --------------------------------------------------------------------------- #
# Optional Azure client (used only when creds are present)
# --------------------------------------------------------------------------- #

def try_build_client() -> Any:
    """Build an AzureOpenAI client if creds exist; else return None (mock mode).

    # Replace this with an Azure AI Foundry Agent SDK client if you adopt agents.
    """
    endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT")
    if not endpoint:
        return None
    try:
        from openai import AzureOpenAI
        from azure.identity import get_bearer_token_provider

        token_provider = get_bearer_token_provider(
            get_credential(),
            "https://cognitiveservices.azure.com/.default",
        )
        return AzureOpenAI(
            azure_endpoint=endpoint,
            azure_ad_token_provider=token_provider,
            api_version=os.environ.get("AZURE_OPENAI_API_VERSION", "2025-04-01-preview"),
        )
    except Exception as exc:  # offline-safe: fall back to mock
        print(f"[advisor] could not build Azure client ({exc}); running in mock mode.")
        return None


# --------------------------------------------------------------------------- #
# Built-in demo suite
# --------------------------------------------------------------------------- #

DEMO_SAMPLES: dict[str, str] = {
    "Hardcoded RAG chatbot (no eval/guardrails)": (
        "client = AzureOpenAI()\n"
        "def answer(q):\n"
        "    model = 'gpt-4o'\n"
        "    docs = retrieve_from_knowledge_base(q)  # formulary changes weekly\n"
        "    return client.chat.completions.create(model=model, messages=[...])\n"
    ),
    "High-volume tool-calling agent": (
        "tools = [verify_member_identity, lookup_prescription, calc_price, ...]  # 12 tool schemas\n"
        "resp = client.chat.completions.create(model='gpt-4o', tools=tools, messages=convo)\n"
        "# we send the full tool descriptions on every single call\n"
    ),
    "Nightly transcript summarizer": (
        "Summarize 10,000 member call transcripts every night into 3-bullet digests "
        "for the supervisor dashboard. Cost matters, quality is secondary."
    ),
    "Empathetic member messaging": (
        "Draft warm, empathetic replies to members who just received a difficult diagnosis. "
        "Tone and bedside manner matter more than speed."
    ),
}


def run_demo() -> None:
    client = try_build_client()
    advisor = FoundryDecisionAdvisor(client=client)
    mode = "LIVE (Azure)" if client else "MOCK (offline)"
    print(f"\n### Foundry Decision Advisor — demo suite [{mode}] ###\n")
    for title, sample in DEMO_SAMPLES.items():
        print(f"\n>>> CASE: {title}")
        result = advisor.analyze(sample, prefer_cost=("summariz" in title.lower()))
        print_report(result)


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

def _main() -> None:
    ap = argparse.ArgumentParser(description="Foundry Decision Advisor")
    ap.add_argument("--sample", help="Path to a code sample file to analyze.")
    ap.add_argument("--task", help="A plain-text task description to analyze.")
    ap.add_argument("--demo", action="store_true", help="Run the built-in demo suite.")
    ap.add_argument("--cost", action="store_true", help="Optimize the recommendation for cost.")
    ap.add_argument("--json", action="store_true", help="Emit JSON instead of a report.")
    args = ap.parse_args()

    if args.demo or (not args.sample and not args.task):
        run_demo()
        return

    if args.sample:
        text = Path(args.sample).read_text(encoding="utf-8")
    else:
        text = args.task or ""

    client = try_build_client()
    advisor = FoundryDecisionAdvisor(client=client)
    result = advisor.analyze(text, prefer_cost=args.cost)

    if args.json:
        print(json.dumps(result.to_dict(), indent=2))
    else:
        print_report(result)


if __name__ == "__main__":
    _main()
