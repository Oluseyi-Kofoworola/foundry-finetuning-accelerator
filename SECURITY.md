# Security Policy

## Reporting a vulnerability

Please report security issues privately to the repository owner rather than
opening a public issue. Include steps to reproduce and impact. **Redact any
secrets** (connection strings, keys, tokens) from your report.

## Secrets hygiene

This repository is built to be forked. To keep it safe:

- All secrets live in **gitignored** `.env` files (and runtime files such as
  `agent-ids.json`). Each has a committed `*.example` template with placeholders.
- The root [`.gitignore`](.gitignore) blocks `.env`, `.env.*` (except
  `*.example`), `*.env.foundry`, `agent-ids.json`, `foundry-agent*.json`, and
  all `*.log` files.
- Every push and pull request runs automated scanning:
  [`gitleaks`](https://github.com/gitleaks/gitleaks) for committed secrets, and
  `.github/scripts/check_no_leaks.py` for environment-specific values that are
  not secrets but still should not ship — local user paths, real resource
  endpoints, deployed hostnames, and non-generic notebook kernel names.
- Before pushing a fork, you can run the same check locally:

  ```bash
  python .github/scripts/check_no_leaks.py
  ```

  As a manual fallback, this catches the most common patterns:

  ```bash
  git grep -nE "(InstrumentationKey=|asst_[A-Za-z0-9]{20,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})" -- . ':!*.example*' ':!docs/*'
  ```

  Any hit (other than the all-zero placeholder GUID and Azure's public built-in
  role definition IDs) should be moved into a gitignored `.env` file.

## Regulated-industry considerations

The bundled healthcare example demonstrates patterns relevant to PHI/PII
workloads (audit logging, consent capture, content safety, prompt shields, PHI
scrubbing). These are **reference implementations** — you are responsible for
validating them against your own HIPAA/GDPR/SOC 2 or other compliance
obligations before production use.

## Managed identity over keys

Prefer Azure **managed identity** (`DefaultAzureCredential`) for Azure OpenAI /
Foundry access in deployed environments. API keys are supported for local
development only.
