# Customization Guide

The labs ship with a fictional healthcare profile so a fresh clone runs out of
the box. Everything domain-specific lives in one file —
`config/client.config.json`, copied from
[`config/client.config.example.json`](../config/client.config.example.json) — and a single
command propagates it across the voice/chat app and the fine-tuning labs.

Re-theming to a domain you know well is also the fastest way to build intuition:
run Labs 00–03 on your own data and the difference between what SFT, DPO, and
tool-calling fine-tuning each change becomes concrete. The worked profile lives
at [`examples/acme/`](../examples/acme/).

---

## 1. Fork & clone

```bash
git clone <your-fork-url>
cd <repo>
```

## 2. Create your client config

```bash
cp config/client.config.example.json config/client.config.json
```

Edit `config/client.config.json`:

| Field | Purpose |
| --- | --- |
| `client.slug` | Short lowercase id (`^[a-z][a-z0-9-]{1,30}$`). Used in resource/trace names. |
| `client.name` / `client.shortName` | Display names shown in the UI and prompts. |
| `client.industry` | Domain label (e.g. `healthcare`, `banking`). |
| `client.supportPhone` / `supportUrl` | Surfaced to the assistant. |
| `brand.productName` / `assistantName` / `tagline` | App + assistant identity. |
| `brand.colors.*` | Hex brand palette (`#RRGGBB`). Drives the whole UI theme. |
| `azure.*` | Subscription, tenant, resource group, region, Foundry resource/project, App Insights. |
| `deployments.*` | Model deployment names + `finetunePrefix`. |

> `config/client.config.json` is **gitignored** — it never gets committed. Only the
> `.example` template is tracked.

## 3. Apply the config

From the repo root:

```bash
npm run config:check   # validate only — no files written
npm run apply:config   # propagate values
```

This updates:

- `examples/voice-agent/frontend/src/styles/globals.css` — brand color CSS variables
- `examples/voice-agent/frontend/.env.local` — `VITE_BRAND_*`
- `examples/voice-agent/frontend/index.html` — `<title>` + description
- `examples/voice-agent/backend/.env` — `BRAND_*` + `AZURE_*` (key-by-key upsert, **existing secrets preserved**)
- `fine-tuning/.env` — `CLIENT_*` + `AZURE_*`

Env files are upserted line-by-line, so your API keys and connection strings are never
overwritten.

## 4. Add your secrets

The apply step does **not** invent secrets. Fill these in by hand:

- `examples/voice-agent/backend/.env` — `OPENAI_API_KEY`, Azure OpenAI endpoint/keys, etc.
  (start from `.env.example`).
- `fine-tuning/.env` — `APPLICATIONINSIGHTS_CONNECTION_STRING`, Azure OpenAI values
  (start from `.env.example`).

## 5. Run

```bash
# Voice/chat app
cd examples/voice-agent
npm install
npm run dev            # backend + frontend together

# Fine-tuning labs
cd ../fine-tuning
python -m venv .venv && .venv\Scripts\activate    # Windows
pip install -r requirements.txt
jupyter lab            # open live-demo/ notebooks
```

---

## How the branding works (so you can extend it)

### Backend
- `backend/src/types/index.ts` defines a `brand` block on the config schema with safe
  generic defaults.
- `backend/src/utils/config.ts` reads `BRAND_*` env vars.
- `backend/src/scenarios/engine.ts` resolves `{{ORG_NAME}}`, `{{SHORT_NAME}}`,
  `{{ASSISTANT_NAME}}`, and `{{PRODUCT_NAME}}` placeholders **at runtime** and rewrites
  legacy display branding. Write new scenario content with those placeholders.

> Tool names such as `search_acme_knowledge`, `acme-*` scenario/Search IDs, `ACME_*`
> symbols, and `acme.*` telemetry attributes are retained compatibility identifiers.
> Brand substitution never rewrites them because renaming one without its deployed
> counterpart breaks tool calling, routing, or telemetry continuity.

### Frontend
- Colors are CSS variables in `globals.css` (`:root { --brand-*: r g b }`). Tailwind maps
  `brand-*` (and the legacy `acme-*` alias) to those variables, so opacity modifiers
  like `bg-brand-primary/20` keep working.
- Text labels come from `frontend/src/brand.ts`, which reads `VITE_BRAND_*` env vars with
  generic fallbacks.

### Fine-tuning labs
- `fine-tuning/_tracing.py` derives the trace `service_name` from `CLIENT_SLUG`.
- Scripts default the Foundry resource name from `AZURE_RESOURCE_NAME`.

---

## Swapping the example domain

The shipped scenarios and lab datasets model a **healthcare** member-support assistant.
To target a different domain:

1. Update `client.industry` and the brand fields.
2. Replace the scenario prompt content in `backend/src/scenarios/` (keep the `{{...}}`
   placeholders).
3. Swap the knowledge base + datasets under `fine-tuning/data/` and re-run the relevant
   notebooks.
4. Rename or replace domain tools under `backend/src/tools/` (and update their references
   in the scenario `enabledTools` lists).

See the Acme Health profile in the retained [`examples/acme/`](../examples/acme/)
compatibility path for a complete starting point.
