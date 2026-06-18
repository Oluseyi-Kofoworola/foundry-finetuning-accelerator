# SAMPLE INPUT for Lab 09 — a high-volume tool-calling agent.
# Sends the full tool schemas on every single call (token-heavy).
from openai import AzureOpenAI

client = AzureOpenAI()

# 12 Sutter tool schemas, re-sent on every request.
tools = [
    verify_member_identity_schema,
    lookup_prescription_schema,
    calculate_medication_price_schema,
    find_in_network_provider_schema,
    transfer_prescription_schema,
    request_refill_schema,
    # ... 6 more ...
]

def handle_turn(conversation):
    return client.chat.completions.create(
        model="gpt-4o",
        tools=tools,                 # full tool descriptions every call
        messages=conversation,
    )
