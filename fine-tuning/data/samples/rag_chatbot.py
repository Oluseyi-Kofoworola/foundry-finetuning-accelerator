"""Grounded RAG sample for the fictional Acme Health knowledge base.

Required environment variables:
  AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_DEPLOYMENT
"""

from __future__ import annotations

import argparse
import json
import os
import re
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[1]
DEFAULT_KB = DATA_DIR / "acme_health_kb.md"
TOKEN_PATTERN = re.compile(r"[a-z0-9]+")


@dataclass(frozen=True)
class Passage:
    citation_id: str
    heading: str
    text: str
    score: float
    source: str
    source_updated_at: str


def build_client():
    try:
        from azure.identity import DefaultAzureCredential, get_bearer_token_provider
        from openai import AzureOpenAI
    except ImportError as exc:
        raise RuntimeError(
            "Install fine-tuning/requirements.txt before making a live Foundry call."
        ) from exc
    endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT")
    if not endpoint:
        raise RuntimeError("Set AZURE_OPENAI_ENDPOINT before running this sample.")
    token_provider = get_bearer_token_provider(
        DefaultAzureCredential(),
        "https://cognitiveservices.azure.com/.default",
    )
    return AzureOpenAI(
        azure_endpoint=endpoint,
        azure_ad_token_provider=token_provider,
        api_version=os.environ.get("AZURE_OPENAI_API_VERSION", "2025-04-01-preview"),
    )


def split_markdown(path: Path) -> list[tuple[str, str]]:
    heading = "Overview"
    chunks: list[tuple[str, str]] = []
    buffer: list[str] = []
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        if line.startswith("## "):
            if buffer:
                chunks.append((heading, "\n".join(buffer).strip()))
            heading = line.removeprefix("## ").strip()
            buffer = []
        else:
            buffer.append(line)
    if buffer:
        chunks.append((heading, "\n".join(buffer).strip()))
    return [(title, text) for title, text in chunks if text]


def retrieve(question: str, path: Path = DEFAULT_KB, top_k: int = 3) -> list[Passage]:
    query_terms = set(TOKEN_PATTERN.findall(question.lower()))
    updated_at = datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat()
    ranked: list[tuple[float, str, str]] = []
    for heading, text in split_markdown(path):
        document_terms = set(TOKEN_PATTERN.findall(f"{heading} {text}".lower()))
        overlap = query_terms & document_terms
        score = len(overlap) / max(len(query_terms), 1)
        if score:
            ranked.append((score, heading, text))
    ranked.sort(key=lambda item: (-item[0], item[1]))
    return [
        Passage(
            citation_id=f"KB-{index}",
            heading=heading,
            text=text,
            score=round(score, 3),
            source=path.name,
            source_updated_at=updated_at,
        )
        for index, (score, heading, text) in enumerate(ranked[:top_k], start=1)
    ]


def answer_member_question(question: str, kb_path: Path = DEFAULT_KB) -> dict[str, object]:
    passages = retrieve(question, kb_path)
    if not passages or passages[0].score < 0.1:
        return {
            "answer": "I don't have enough grounded policy evidence to answer that question.",
            "citations": [],
            "abstained": True,
        }

    context = "\n\n".join(
        f"[{item.citation_id}] {item.heading}\n{item.text}" for item in passages
    )
    messages = [
        {
            "role": "system",
            "content": (
                "You answer questions for the fictional Acme Health organization. Use only "
                "the supplied passages. Cite every factual claim with [KB-N]. If evidence is "
                "missing or conflicting, say so. Never diagnose, expose private data, or make "
                "a member-specific coverage determination. Phone numbers are fictional."
            ),
        },
        {"role": "user", "content": f"Evidence:\n{context}\n\nQuestion: {question}"},
    ]
    response = build_client().chat.completions.create(
        model=os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-4.1-mini"),
        messages=messages,
        temperature=0,
    )
    return {
        "answer": response.choices[0].message.content or "",
        "citations": [asdict(item) for item in passages],
        "abstained": False,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("question")
    parser.add_argument("--knowledge-base", type=Path, default=DEFAULT_KB)
    args = parser.parse_args()
    print(json.dumps(answer_member_question(args.question, args.knowledge_base), indent=2))


if __name__ == "__main__":
    main()
