"""Bounded tool-calling sample with deterministic fictional adapters.

Required environment variables:
  AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_DEPLOYMENT
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any, Callable


DATA_DIR = Path(__file__).resolve().parents[1]
TOOLS_PATH = DATA_DIR / "acme_tools_schema.json"
PROFILES_PATH = DATA_DIR / "member_profiles.json"
MAX_TOOL_ROUNDS = 4

PRESCRIPTIONS = {
    "MEM-002": [
        {"prescriptionId": "RX-100412", "drug": "lisinopril 10mg", "refillsRemaining": 3},
        {"prescriptionId": "RX-100590", "drug": "amlodipine 5mg", "refillsRemaining": 1},
    ],
    "MEM-007": [
        {"prescriptionId": "RX-100733", "drug": "atorvastatin 20mg", "refillsRemaining": 0, "expired": True},
    ],
}

PROVIDERS = [
    {"name": "Dr. Avery Example", "specialty": "internal medicine", "zipCode": "95816", "languages": ["English", "Spanish"], "acceptingNewPatients": True},
    {"name": "Dr. Cameron Example", "specialty": "cardiology", "zipCode": "94109", "languages": ["English"], "acceptingNewPatients": True},
]


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


def load_tools() -> list[dict[str, Any]]:
    return json.loads(TOOLS_PATH.read_text(encoding="utf-8-sig"))


def select_tools(user_text: str) -> list[dict[str, Any]]:
    text = user_text.lower()
    intents = {
        "verify_member_identity": any(word in text for word in ("my ", "member", "prescription", "refill", "price", "cost")),
        "lookup_prescriptions": any(word in text for word in ("prescription", "medication", "refill")),
        "request_refill": "refill" in text,
        "find_in_network_providers": any(word in text for word in ("provider", "doctor", "specialist", "cardiologist", "dermatologist")),
        "calculate_medication_price": any(word in text for word in ("price", "cost", "copay")),
    }
    selected = [tool for tool in load_tools() if intents[tool["function"]["name"]]]
    return selected or [tool for tool in load_tools() if tool["function"]["name"] == "find_in_network_providers"]


def validate_arguments(tool: dict[str, Any], arguments: dict[str, Any]) -> None:
    schema = tool["function"]["parameters"]
    properties = schema.get("properties", {})
    unknown = set(arguments) - set(properties)
    missing = set(schema.get("required", [])) - set(arguments)
    if unknown or missing:
        raise ValueError(f"unknown={sorted(unknown)}, missing={sorted(missing)}")
    python_types = {"string": str, "integer": int, "boolean": bool}
    for name, value in arguments.items():
        rule = properties[name]
        expected = python_types.get(rule.get("type"))
        if expected and (not isinstance(value, expected) or isinstance(value, bool) and expected is int):
            raise ValueError(f"{name} must be {rule['type']}")
        if "enum" in rule and value not in rule["enum"]:
            raise ValueError(f"{name} must be one of {rule['enum']}")


def verify_member_identity(arguments: dict[str, Any]) -> dict[str, Any]:
    profiles = json.loads(PROFILES_PATH.read_text(encoding="utf-8-sig"))
    member_id = arguments.get("memberId")
    profile = profiles.get(member_id, {})
    verified = bool(profile) and profile["name"] == arguments["fullName"] and profile["date_of_birth"] == arguments["dateOfBirth"]
    return {"verified": verified, "memberId": member_id if verified else None}


def lookup_prescriptions(arguments: dict[str, Any]) -> list[dict[str, Any]]:
    rows = PRESCRIPTIONS.get(arguments["memberId"], [])
    if arguments.get("includeExpired"):
        return rows
    return [row for row in rows if not row.get("expired")]


def request_refill(arguments: dict[str, Any]) -> dict[str, Any]:
    return {
        "status": "confirmation_required",
        "message": "Preview only; no refill was submitted by this sample adapter.",
        "request": arguments,
    }


def find_in_network_providers(arguments: dict[str, Any]) -> list[dict[str, Any]]:
    language = arguments.get("language")
    return [
        row for row in PROVIDERS
        if row["specialty"] == arguments["specialty"].lower()
        and row["zipCode"] == arguments["zipCode"]
        and (not arguments.get("acceptingNewPatients", True) or row["acceptingNewPatients"])
        and (not language or language in row["languages"])
    ]


def calculate_medication_price(arguments: dict[str, Any]) -> dict[str, Any]:
    tier_one = {"lisinopril 10mg", "atorvastatin 20mg", "metformin 500mg", "losartan 50mg"}
    medication = arguments["medication"].lower()
    if medication not in tier_one:
        return {"status": "unknown", "message": "No grounded fixture price is available."}
    copay = 20 if arguments["daysSupply"] == 90 and arguments["pharmacy"] == "mail_order" else 10
    return {"status": "quoted", "tier": 1, "copay": copay, **arguments}


HANDLERS: dict[str, Callable[[dict[str, Any]], Any]] = {
    "verify_member_identity": verify_member_identity,
    "lookup_prescriptions": lookup_prescriptions,
    "request_refill": request_refill,
    "find_in_network_providers": find_in_network_providers,
    "calculate_medication_price": calculate_medication_price,
}


def execute_tool(name: str, raw_arguments: str, available_tools: list[dict[str, Any]]) -> Any:
    tool = next((item for item in available_tools if item["function"]["name"] == name), None)
    if not tool or name not in HANDLERS:
        raise ValueError(f"Tool {name!r} is not available for this request.")
    arguments = json.loads(raw_arguments)
    if not isinstance(arguments, dict):
        raise ValueError("Tool arguments must be a JSON object.")
    validate_arguments(tool, arguments)
    return HANDLERS[name](arguments)


def handle_turn(user_text: str) -> str:
    tools = select_tools(user_text)
    messages: list[dict[str, Any]] = [
        {
            "role": "system",
            "content": (
                "You assist a fictional healthcare organization. Verify identity before "
                "private-data tools. Never infer arguments. Refill results are previews only: "
                "ask for explicit confirmation and never claim submission. Report empty or "
                "failed tool results honestly; do not diagnose or decide coverage."
            ),
        },
        {"role": "user", "content": user_text},
    ]
    client = build_client()
    for _ in range(MAX_TOOL_ROUNDS):
        response = client.chat.completions.create(
            model=os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-4.1-mini"),
            messages=messages,
            tools=tools,
            temperature=0,
        )
        message = response.choices[0].message
        messages.append(message.model_dump(exclude_none=True))
        if not message.tool_calls:
            return message.content or ""
        for call in message.tool_calls:
            try:
                result = execute_tool(call.function.name, call.function.arguments, tools)
            except (ValueError, json.JSONDecodeError) as exc:
                result = {"status": "error", "message": str(exc)}
            messages.append({
                "role": "tool",
                "tool_call_id": call.id,
                "content": json.dumps(result),
            })
    raise RuntimeError(f"Tool loop exceeded {MAX_TOOL_ROUNDS} rounds.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("message")
    args = parser.parse_args()
    print(handle_turn(args.message))


if __name__ == "__main__":
    main()
