"""Validate the generic fine-tuning datasets and runnable samples."""

from __future__ import annotations

import json
import py_compile
import re
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
REQUIRED_PROFILE_FIELDS = {
    "name", "date_of_birth", "plan", "preferred_pharmacy", "active_meds",
    "allergies", "primary_care_provider", "communication_pref", "locale",
    "accessibility_needs", "consent_to_message",
}
FORBIDDEN_TEXT = {
    "Maria", "Robert", "Linda", "Patricia", "James", "Sarah", "Ashley",
    "a Acme", "Acme Health Portal", "1-866-978-8837",
}


def load_jsonl(path: Path) -> list[Any]:
    with path.open("r", encoding="utf-8-sig") as stream:
        return [json.loads(line) for line in stream if line.strip()]


def user_prompts(path: Path) -> set[str]:
    prompts: set[str] = set()
    for row in load_jsonl(path):
        messages = row.get("messages", row.get("input", {}).get("messages", []))
        prompts.update(
            message["content"].strip() for message in messages
            if message.get("role") == "user" and isinstance(message.get("content"), str)
        )
    return prompts


def validate_tool_messages(messages: list[dict[str, Any]], label: str) -> None:
    pending: set[str] = set()
    for message in messages:
        if message.get("role") == "assistant":
            for call in message.get("tool_calls", []):
                call_id = call.get("id")
                assert call_id and call_id not in pending, f"{label}: invalid tool call id"
                json.loads(call["function"]["arguments"])
                pending.add(call_id)
        elif message.get("role") == "tool":
            call_id = message.get("tool_call_id")
            assert call_id in pending, f"{label}: unmatched tool result {call_id}"
            pending.remove(call_id)
    assert not pending, f"{label}: missing tool results for {sorted(pending)}"


def validate_all_files() -> None:
    for path in DATA.rglob("*.json"):
        json.loads(path.read_text(encoding="utf-8-sig"))
    for path in DATA.rglob("*.jsonl"):
        load_jsonl(path)

    text_paths = [
        *DATA.rglob("*.json"), *DATA.rglob("*.jsonl"), *DATA.rglob("*.md"),
        *DATA.rglob("*.py"),
    ]
    for path in text_paths:
        text = path.read_text(encoding="utf-8-sig")
        for forbidden in FORBIDDEN_TEXT:
            pattern = rf"(?<!\w){re.escape(forbidden)}(?!\w)"
            assert not re.search(pattern, text, re.IGNORECASE), (
                f"{path}: contains {forbidden!r}"
            )


def validate_profiles() -> None:
    profiles = json.loads((DATA / "member_profiles.json").read_text(encoding="utf-8-sig"))
    assert len(profiles) == 7, "expected seven fictional member profiles"
    for member_id, profile in profiles.items():
        assert re.fullmatch(r"MEM-\d{3}", member_id), f"invalid member id {member_id}"
        missing = REQUIRED_PROFILE_FIELDS - set(profile)
        assert not missing, f"{member_id}: missing {sorted(missing)}"
        assert profile["name"].endswith(" Example"), f"{member_id}: non-generic name"
        assert profile["primary_care_provider"].endswith(" Example"), (
            f"{member_id}: non-generic provider"
        )


def validate_splits() -> None:
    for train_name, validation_name in (
        ("acme_training.jsonl", "acme_validation.jsonl"),
        ("acme_training_live.jsonl", "acme_validation_live.jsonl"),
        ("acme_tools_train.jsonl", "acme_tools_validation.jsonl"),
    ):
        train = user_prompts(DATA / train_name)
        validation = user_prompts(DATA / validation_name)
        overlap = train & validation
        assert not overlap, f"{train_name}/{validation_name}: prompt overlap {sorted(overlap)}"

    eval_rows = load_jsonl(DATA / "eval_dataset.jsonl")
    eval_ids = [row["id"] for row in eval_rows]
    eval_queries = {row["query"].strip() for row in eval_rows}
    assert len(eval_rows) >= 12 and len(eval_ids) == len(set(eval_ids))
    training_prompts: set[str] = set()
    for path in DATA.glob("acme_*training*.jsonl"):
        training_prompts |= user_prompts(path)
    assert not eval_queries & training_prompts, "held-out evaluation prompt appears in training"


def _tokens(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9$]+", text.lower()))


def _jaccard(a: set[str], b: set[str]) -> float:
    return len(a & b) / len(a | b) if a | b else 0.0


# Observed maxima on the shipped data are 0.37 jaccard / 0.59 ratio, so these
# thresholds catch copy-paste and trivial paraphrase without flagging the
# intentional held-out paraphrases the labs rely on.
LEAK_JACCARD = 0.80
LEAK_RATIO = 0.90


def _worst_pair(probes: list[str], corpus: list[str]) -> tuple[float, str, str]:
    worst = (0.0, "", "")
    corpus_tokens = [(text, _tokens(text)) for text in corpus]
    for probe in probes:
        probe_tokens = _tokens(probe)
        probe_lower = probe.lower()
        for text, tokens in corpus_tokens:
            score = max(
                _jaccard(probe_tokens, tokens),
                SequenceMatcher(None, probe_lower, text.lower()).ratio(),
            )
            if score > worst[0]:
                worst = (score, probe, text)
    return worst


def validate_leakage() -> None:
    """Held-out prompts must not be near-duplicates of training prompts.

    Exact-match checks miss the failure that actually inflates a scorecard: an
    evaluation prompt that is a lightly reworded training prompt.
    """
    eval_queries = [row["query"].strip() for row in load_jsonl(DATA / "eval_dataset.jsonl")]
    pairs: list[tuple[str, list[str], list[str]]] = [
        (
            "eval_dataset vs acme_training",
            eval_queries,
            sorted(user_prompts(DATA / "acme_training.jsonl")),
        ),
    ]
    for train_name, holdout_name in (
        ("acme_training.jsonl", "acme_validation.jsonl"),
        ("acme_training_live.jsonl", "acme_validation_live.jsonl"),
        ("acme_tools_train.jsonl", "acme_tools_validation.jsonl"),
        ("rtor_training.jsonl", "rtor_validation.jsonl"),
    ):
        if not (DATA / train_name).exists() or not (DATA / holdout_name).exists():
            continue
        pairs.append((
            f"{holdout_name} vs {train_name}",
            sorted(user_prompts(DATA / holdout_name)),
            sorted(user_prompts(DATA / train_name)),
        ))

    for label, probes, corpus in pairs:
        if not probes or not corpus:
            continue
        score, probe, match = _worst_pair(probes, corpus)
        assert score < max(LEAK_JACCARD, LEAK_RATIO), (
            f"{label}: possible leakage (similarity {score:.2f})\n"
            f"  held-out: {probe}\n  training: {match}"
        )


def validate_preferences() -> None:
    items = json.loads((DATA / "acme_dpo_training_data.json").read_text(encoding="utf-8-sig"))
    rows = load_jsonl(DATA / "acme_dpo.jsonl")
    assert len(items) == len(rows) == 12
    for index, item in enumerate(items):
        preferred = item["preferred_output"][0]["content"].strip()
        rejected = item["non_preferred_output"][0]["content"].strip()
        assert preferred != rejected, f"DPO row {index}: identical preference pair"


def validate_tools() -> None:
    source = json.loads(
        (DATA / "acme_tool_calling_training_data.json").read_text(encoding="utf-8-sig")
    )
    rows = load_jsonl(DATA / "acme_tools.jsonl")
    schema = json.loads((DATA / "acme_tools_schema.json").read_text(encoding="utf-8-sig"))
    assert len(source) == len(rows) >= 16
    for index, (item, row) in enumerate(zip(source, rows, strict=True)):
        assert item["messages"] == row["messages"], f"tool row {index}: source drift"
        assert row["tools"] == schema, f"tool row {index}: schema drift"
        validate_tool_messages(row["messages"], f"tool row {index}")


def validate_rtor() -> None:
    rows = load_jsonl(DATA / "rtor_cases.jsonl")
    labels = {row["is_return_to_or"] for row in rows}
    assert labels == {True, False}, "RTOR data must contain both labels"
    assert len({row["case_id"] for row in rows}) == len(rows), "duplicate RTOR case id"
    for row in rows:
        evidence = row["evidence"]
        quoted = re.search(r"['\"](.+?)['\"]", evidence)
        assert quoted, f"{row['case_id']}: evidence lacks an exact quote"
        source_text = " ".join(
            str(value) for key, value in row.items()
            if key != "evidence"
        )
        source_offset = 0
        for fragment in quoted.group(1).split(" ... "):
            fragment_offset = source_text.find(fragment, source_offset)
            assert fragment_offset >= 0, f"{row['case_id']}: evidence quote not found"
            source_offset = fragment_offset + len(fragment)


def validate_samples() -> None:
    for path in sorted((DATA / "samples").glob("*.py")):
        py_compile.compile(str(path), doraise=True)


def main() -> None:
    checks = [
        validate_all_files, validate_profiles, validate_splits, validate_leakage,
        validate_preferences, validate_tools, validate_rtor, validate_samples,
    ]
    for check in checks:
        check()
        print(f"PASS {check.__name__}")
    print("All fine-tuning data checks passed.")


if __name__ == "__main__":
    main()