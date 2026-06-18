# Foundry Fine-Tuning Accelerator

### Prove end-to-end model customization on Azure AI Foundry — without building the demo from scratch.

Most engineers, solution architects, and AI practitioners get asked the same
hard question: *"Can you actually customize and operationalize a model on Azure
AI Foundry — not just call an API?"* Answering it usually means writing fragile,
one-off demo code under time pressure, then throwing it away after one meeting.

This accelerator gives you **20 verified, white-labelable notebooks** — from
fine-tuning to evaluation, guardrails, and cost governance — so you can walk in
with a credible, end-to-end AI story and **re-skin it for any customer in
minutes**.

---

## Why this exists

Answering *"can you customize and operationalize a model on Foundry?"* normally
means rebuilding a throwaway demo under time pressure. This accelerator removes
that tax:

- **Credibility, on demand** — show the *full* lifecycle (data → tuning → eval →
  guardrails → production), not a single API call.
- **Repeatable, not throwaway** — one config file re-skins the whole thing per
  customer in minutes instead of a find-and-replace across dozens of files.
- **A real payoff** — the `examples/voice-agent/` app runs the exact tools you
  fine-tune in Lab 03, so the labs produce something a production app can use.
- **Verified, not hopeful** — every notebook is run live against Azure, so what
  you present has actually executed.

---

## The problem

- Foundry demos built from scratch are brittle, hard to repeat, and rarely
  cover the *full* lifecycle (data → tuning → eval → guardrails → production).
- Re-branding a demo for a new customer means a tedious find-and-replace across
  dozens of files.
- "Show me it works" too often becomes "trust me, it works."

**The stakes:** a weak or hand-wavy demo costs credibility — and the deal.

## The plan

Three steps to a working, customer-ready Foundry story:

1. **Clone & configure** — set one config file (`config/client.config.json`)
   with your brand, names, and Azure resource IDs.
2. **Run the labs** — work through the lifecycle: synthetic data → SFT → DPO →
   tool-calling → RAG → evaluation → guardrails → agents → cost governance.
3. **Show the outcome** — a verified, end-to-end customization story you can
   present live and re-skin per customer.

---

## What you get — 20 hands-on labs

All notebooks live in [`fine-tuning/`](fine-tuning/) (`live-demo/` to run,
`pre-demo/` as verified reference copies).

| # | Lab | What it proves |
|---|-----|----------------|
| 00 | Synthetic data generation | Build training/validation datasets from a knowledge base |
| 01 | Supervised fine-tuning (SFT) | Teach a base model your domain voice |
| 02 | Direct preference optimization (DPO) | Align responses to preferred answers |
| 03 | Tool-calling fine-tuning | Reliable function/tool invocation |
| 04 | Knowledge retrieval (RAG) | Ground answers in your content |
| 05 | Conversation memory | Multi-turn context handling |
| 06 | Date awareness | Time-sensitive reasoning |
| 07 | Evaluation | Score quality with eval datasets |
| 08 | Guardrails | Content safety & policy enforcement |
| 09 | Foundry decision advisor | When to fine-tune vs. RAG vs. prompt |
| 10 | Security & compliance | PHI/PII patterns, audit logging |
| 11 | Agents orchestration | Multi-agent coordination |
| 12 | Production deployment | Ship a tuned model |
| 13 | Continuous evaluation | Ongoing quality monitoring |
| 14 | Cost governance | Track and control spend |
| 15 | Migration path | Move between models/approaches |
| 16 | Reasoning (RFT) | Reinforcement fine-tuning for reasoning |
| 17 | Responsible AI | Fairness, transparency, safety |
| 18 | Agent flow | End-to-end agentic workflow |
| 18b | Imaging agent flow | Multimodal/imaging agent workflow |

See [`fine-tuning/README.md`](fine-tuning/README.md) for the full lab guide and
run order.

---

## Quick start

```bash
cd fine-tuning
python -m venv .venv && . .venv/Scripts/Activate.ps1   # Windows
pip install -r requirements.txt

cp .env.example .env        # add your Azure/Foundry secrets (gitignored)
python preflight.py         # verifies your Azure/Foundry setup

# then open the notebooks in fine-tuning/live-demo/*.ipynb
```

> **Auth tip:** if `DefaultAzureCredential` hangs, set
> `AZURE_TOKEN_CREDENTIALS=dev` in your environment before running.

---

## White-label it for any customer

Everything customer-specific lives in **`config/client.config.json`**:

```jsonc
{
  "client":  { "slug": "acme", "name": "Acme Health", "industry": "healthcare" },
  "brand":   { "productName": "Acme Assistant", "colors": { "primary": "#003087" } },
  "azure":   { "resourceGroup": "rg-acme-dev", "foundryResourceName": "aif-acme-dev" },
  "deployments": { "chat": "gpt-4o", "finetunePrefix": "acme" }
}
```

Then propagate it into the labs:

```bash
npm install            # root tooling
npm run apply:config   # writes .env templates and brand values into the labs
```

- Template: [`config/client.config.example.json`](config/client.config.example.json)
- Schema: [`config/client.config.schema.json`](config/client.config.schema.json)
- Worked example: [`examples/acme/`](examples/acme/) — a filled-in
  healthcare member-services config you can copy as your starting point.

Full walkthrough: **[docs/CUSTOMIZATION.md](docs/CUSTOMIZATION.md)**.

---

## The voice agent — see the labs pay off in a real app

The repo ships a production-style **voice + chat agent** at
[`examples/voice-agent/`](examples/voice-agent/) — a Node/TypeScript + React app
with realtime voice, multi-agent orchestration, tool calling, guardrails, and
audit logging.

It's the **payoff for the labs**: the same tools you fine-tune in Lab 03
(`verify_member_identity`, `lookup_prescriptions`, `calculate_medication_price`,
…) are the tools this app dispatches at runtime, and a model customized in Labs
01–03 drops straight in. Run it:

```bash
cd examples/voice-agent
npm install
npm run dev            # backend :3001 + frontend :5173
```

See [`examples/voice-agent/README.md`](examples/voice-agent/README.md).

---

## Security & secrets

- **No real secrets are committed.** Subscription IDs, connection strings, and
  API keys live only in gitignored `.env` files. Every secret file has a
  `*.example` template.
- See [SECURITY.md](SECURITY.md) before deploying. This accelerator covers
  patterns relevant to regulated industries (PHI/PII, audit logging, content
  safety) — review them against your own compliance requirements.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Licensed under the [MIT License](LICENSE).
