# Contributing

Thanks for helping improve this accelerator. It is designed to be **forked and
white-labeled per customer**, so contributions should keep the core generic and
push customer-specific content into config or `examples/`.

## Ground rules

1. **Never hardcode a customer name, color, phone number, or Azure resource
   name** in shared code. Read it from:
   - the app config (`sutter-voice-agent/backend/src/utils/config.ts` → `brand`)
   - frontend brand env (`VITE_BRAND_*`) / CSS variables
   - `config/client.config.json` (propagated via `npm run apply:config`)
2. **Never commit secrets.** Subscription IDs, tenant IDs, connection strings,
   API keys, and generated `agent-ids.json` belong only in gitignored `.env` /
   runtime files. Add a `*.example` template instead.
3. **Keep the reference example working.** If you change config plumbing, verify
   `examples/sutter/client.config.json` still applies cleanly.

## Development

```bash
# Voice agent
cd sutter-voice-agent && npm run install:all && npm run dev
npm run lint && npm run build      # before opening a PR

# Fine-tuning labs
cd fine-tuning && pip install -r requirements.txt && python preflight.py
```

## Pull requests

- Keep changes focused; describe what a forker needs to do (if anything) after
  pulling your change.
- Run `npm run lint` and `npm run build` in `sutter-voice-agent/`.
- Do not include generated artifacts (`dist/`, logs, `.env*` with real values).

## Reporting issues

Open an issue with steps to reproduce. **Do not paste secrets** (connection
strings, keys) into issues — redact them.
