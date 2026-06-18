# SAMPLE INPUT for Lab 09 — a typical "first draft" RAG chatbot.
# Drop a file like this into the advisor and watch it recommend Foundry features.
from openai import AzureOpenAI

client = AzureOpenAI()

def answer_member_question(question: str) -> str:
    # One hardcoded model for everything — easy + hard requests alike.
    model = "gpt-4o"

    # Pulls from the Sutter formulary / knowledge base, which changes weekly.
    docs = retrieve_from_knowledge_base(question)

    prompt = f"Answer using these docs:\n{docs}\n\nQuestion: {question}"
    resp = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
    )
    return resp.choices[0].message.content
