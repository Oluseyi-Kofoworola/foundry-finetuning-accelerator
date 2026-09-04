# Contributing

Thanks for helping improve this accelerator. It teaches model customization on
Microsoft Foundry, so the bar for a change is: **does it stay accurate, and can
a stranger still run it?** Keep the core generic and push domain-specific
content into config or `examples/`.

## Ground rules

1. **Never hardcode a customer name, color, phone number, or Azure resource
   name** in shared code. Read it from:
   - the app config (`examples/voice-agent/backend/src/utils/config.ts` → `brand`)
   - frontend brand env (`VITE_BRAND_*`) / CSS variables
   - `config/client.config.json` (propagated via `npm run apply:config`)
2. **Never commit secrets.** Subscription IDs, tenant IDs, connection strings,
   API keys, and generated `agent-ids.json` belong only in gitignored `.env` /
   runtime files. Add a `*.example` template instead.
3. **Never claim a result the scorecard doesn't show.** Labs 01 and 03 ship
   `FAIL` and `HOLD` on purpose. If you change data or hyperparameters, re-run
   the lab and update the documented numbers to match — in the notebook, in
   `fine-tuning/README.md`, and in `DEMO-30MIN.md`.
4. **Change both copies of a lab.** `live-demo/` and `pre-demo/` hold the same
   20 labs. Fixing one and forgetting the other is the most common way to break
   this repo; CI fails the PR if only one side changes.
5. **Keep the reference example working.** If you change config plumbing, verify
   the Acme Health profile at `examples/acme/client.config.json` still applies
   cleanly.

## What CI checks

Every push and pull request runs
[`.github/workflows/quality-gate.yml`](.github/workflows/quality-gate.yml):

| Check | What it enforces |
| --- | --- |
| `fine-tuning/validate_data.py` | Dataset integrity, split hygiene, and train/held-out leakage |
| `check_notebooks.py` | Every notebook is valid JSON |
| `check_links.py` | Markdown links resolve **in a clone**, not just locally |
| `check_no_leaks.py` | No local paths, real endpoints, or non-generic kernel names |
| `check_lab_parity.py` | `live-demo/` and `pre-demo/` changed together |
| `ruff` / `gitleaks` | Correctness-class lint and committed secrets |

Run them locally before opening a PR:

```bash
python fine-tuning/validate_data.py
python .github/scripts/check_links.py
python .github/scripts/check_no_leaks.py
ruff check .
```

## Two traps worth knowing

- **Saving a notebook stamps your kernel name into its metadata.** If your
  virtualenv is called something personal, it ends up in the committed file.
  Every notebook should declare `"display_name": "Python 3"`; `check_no_leaks.py`
  enforces it.
- **`Test-Path`-style link checking hides broken links.** Gitignored files exist
  on your machine but not in a clone. `check_links.py` validates against
  git-tracked paths for that reason.

## Development

```bash
# Voice agent
cd examples/voice-agent && npm run install:all && npm run dev
npm run lint && npm run build      # before opening a PR

# Fine-tuning labs
cd fine-tuning && pip install -r requirements.txt && python preflight.py
```

Dependencies in `fine-tuning/requirements.txt` are **pinned** because the repo
claims its labs are verified. If you upgrade one, re-run the affected labs and
update the pin in the same PR.

## Pull requests

- Keep changes focused; describe what a forker needs to do (if anything) after
  pulling your change.
- Run `npm run lint` and `npm run build` in `examples/voice-agent/`.
- Do not include generated artifacts (`dist/`, logs, `.env*` with real values).

## Reporting issues

Open an issue with steps to reproduce. **Do not paste secrets** (connection
strings, keys) into issues — redact them.
