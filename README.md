# Azure AI Foundry Accelerator — Voice Agent + Fine-Tuning Labs

A **white-label, fork-and-customize** accelerator for building enterprise AI
assistants on **Azure AI Foundry**. It ships two complementary tracks plus a
worked healthcare example you can rebrand for any customer in minutes.

| Track | Folder | What it gives you |
|-------|--------|-------------------|
| **Voice / chat agent** | [`sutter-voice-agent/`](sutter-voice-agent/) | Production-style Node/TypeScript + React app: realtime voice, multi-agent orchestration, tool calling, guardrails, audit logging. |
| **Fine-tuning labs** | [`fine-tuning/`](fine-tuning/) | 18 runnable notebooks: synthetic data, SFT, DPO, tool-calling fine-tunes, RAG, evaluation, guardrails, cost governance, RFT, multi-agent flows. |
| **Reference client** | [`examples/sutter/`](examples/sutter/) | A filled-in config + content for a healthcare member-services use case. Copy it as your starting point. |

> The folder is named `sutter-voice-agent/` for historical reasons — it is fully
> white-labeled. Branding, colors, names, and Azure resource names come from
> **one config file**.

---

## 1. One config to rule them all

Everything customer-specific lives in **`config/client.config.json`**:

```jsonc
{
  "client":  { "slug": "acme", "name": "Acme Health", "industry": "healthcare" },
  "brand":   { "productName": "Acme Voice Agent", "colors": { "primary": "#003087", ... } },
  "azure":   { "resourceGroup": "rg-acme-dev", "foundryResourceName": "aif-acme-dev", ... },
  "deployments": { "chat": "gpt-4o", "finetunePrefix": "acme" }
}
```

See [`config/client.config.example.json`](config/client.config.example.json) for
the template and [`config/client.config.schema.json`](config/client.config.schema.json)
for the full schema.

---

## 2. Fork & customize in 4 steps

```bash
# 1) Fork / clone, then create your client config from the example
cp config/client.config.example.json config/client.config.json
#    ...or start from the healthcare reference client:
#    cp examples/sutter/client.config.json config/client.config.json

# 2) Edit config/client.config.json — slug, names, brand colors, Azure IDs

# 3) Propagate it into the app + labs (writes brand theme, .env templates)
npm install        # root tooling
npm run apply:config

# 4) Fill in secrets locally (never committed):
#    - sutter-voice-agent/backend/.env        (copy from .env.example)
#    - fine-tuning/.env                        (copy from .env.example)
```

Full walkthrough: **[docs/CUSTOMIZATION.md](docs/CUSTOMIZATION.md)**.

---

## 3. Run the voice agent

```bash
cd sutter-voice-agent
npm run install:all
npm run dev            # backend :3001  + frontend :5173
```

See [`sutter-voice-agent/README.md`](sutter-voice-agent/README.md).

## 4. Run the fine-tuning labs

```bash
cd fine-tuning
python -m venv .venv && . .venv/Scripts/Activate.ps1   # Windows
pip install -r requirements.txt
python preflight.py    # verifies your Azure/Foundry setup
# then open fine-tuning/live-demo/*.ipynb
```

See [`fine-tuning/README.md`](fine-tuning/README.md).

---

## Security & secrets

- **No real secrets are committed.** Subscription IDs, connection strings, and
  API keys live only in gitignored `.env` files. Every secret file has a
  `*.example` template.
- See [SECURITY.md](SECURITY.md) before deploying. This accelerator handles
  patterns relevant to regulated industries (PHI/PII, audit logging, content
  safety) — review them for your own compliance requirements.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Licensed under the [MIT License](LICENSE).
