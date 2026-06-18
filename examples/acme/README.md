# Reference Client: Acme Health (healthcare)

This folder is a **worked example** of how to white-label the accelerator for a
customer. It reproduces the original healthcare demo ("Acme Health") that ships
with this repo.

## What's here

| File | Purpose |
|------|---------|
| `client.config.json` | A filled-in copy of the [central config](../../config/client.config.example.json) for a healthcare member-services use case. |

## How to use it as a starting point

```bash
# From the repo root
cp examples/acme/client.config.json config/client.config.json
# edit config/client.config.json — change slug, name, colors, Azure IDs
npm run apply:config
```

`apply:config` propagates the brand colors, names, and Azure settings into the
voice agent app (`examples/voice-agent`) and the fine-tuning labs. See
[docs/CUSTOMIZATION.md](../../docs/CUSTOMIZATION.md) for the full walkthrough.

## Swapping the domain

This example is healthcare-themed. To build for another vertical (banking,
retail, telco, …):

1. Change `client.industry` and the brand strings.
2. Replace the domain knowledge base, member/customer profiles, and scenario
   prompts (see the customization guide for exact file locations).
3. Regenerate the fine-tuning datasets from your own knowledge base
   (`fine-tuning/live-demo/00_synthetic_data_generation.ipynb`).
