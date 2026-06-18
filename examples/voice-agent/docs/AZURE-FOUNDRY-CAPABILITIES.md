# Azure AI Foundry Capability Map — Voice Agent

This codebase is deliberately structured so that each Azure AI Foundry capability
maps to a clearly identifiable file or module. Use this document to brief an
engineer in 5 minutes.

---

## 1. Agent Service (Hosted Agents)

**What it is:** Foundry-managed agents with tool calling, threads, and traces.

| Demonstrated by | File |
|---|---|
| Foundry client + token provider | [backend/src/services/assistants.ts](../backend/src/services/assistants.ts) |
| Agent IDs per scenario | [backend/agent-ids.json](../backend/agent-ids.json), [backend/foundry-agent-ids.json](../backend/foundry-agent-ids.json) |
| Agent definitions (catalog) | [foundry-agents.json](../foundry-agents.json) |
| Agent provisioning script | [scripts/setup-foundry-agents.ts](../scripts/setup-foundry-agents.ts), [scripts/create-foundry-agents.py](../scripts/create-foundry-agents.py) |

## 2. Real-time Voice (GPT-4o Realtime via Azure OpenAI)

**What it is:** Low-latency speech in / speech out from a Foundry-hosted model.

| Demonstrated by | File |
|---|---|
| Realtime WebSocket bridge | [backend/src/services/openai-realtime.ts](../backend/src/services/openai-realtime.ts) |
| Session manager (per-call state) | [backend/src/services/session-manager.ts](../backend/src/services/session-manager.ts) |

## 3. Connected Agents / Multi-Agent Coordination

**What it is:** A coordinator routes to specialist agents (e.g. a member-services
front door, a concierge, bilingual access). Each scenario is a separate agent
definition.

| Demonstrated by | File |
|---|---|
| Scenario engine | [backend/src/scenarios/engine.ts](../backend/src/scenarios/engine.ts) |
| Example healthcare scenarios | [backend/src/scenarios/acme-scenarios.ts](../backend/src/scenarios/acme-scenarios.ts) |

## 4. Knowledge / File Search / RAG (Azure AI Search)

**What it is:** Hybrid + semantic retrieval grounded against approved
collections, with citations carried into the ActionPacket.

| Demonstrated by | File |
|---|---|
| Knowledge service wrapper | [backend/src/services/foundry-knowledge.ts](../backend/src/services/foundry-knowledge.ts) |
| Per-scenario collection allow-list | `SCENARIO_COLLECTIONS` map in the same file |
| Search service IaC | [infra/modules/ai-search.bicep](../infra/modules/ai-search.bicep) |
| Citation contract | `GroundingSource` in [backend/src/types/action-packet.ts](../backend/src/types/action-packet.ts) |

**Example collections used (rename these for your domain):**
`acme-mho-faq`, `acme-locations`, `acme-cancellation-policy`,
`acme-health-plus-benefits`, `acme-network-directory`,
`acme-health-plus-policy`, `acme-interpreter-services`

## 5. Content Safety + Prompt Shields

**What it is:** First-line guardrails for user input and indirect prompt
injection from retrieved documents. Local fallback regex when the Azure
endpoint is not yet provisioned.

| Demonstrated by | File |
|---|---|
| Service implementation | [backend/src/services/content-safety.ts](../backend/src/services/content-safety.ts) |
| Content Safety account IaC | [infra/modules/content-safety.bicep](../infra/modules/content-safety.bicep) |
| Safety signals on packet | `SafetySignals` in [backend/src/types/action-packet.ts](../backend/src/types/action-packet.ts) |

## 6. Evaluations (Continuous + Batch)

**What it is:** Golden dataset + scenario-specific evaluators that score every
ActionPacket. Pre-filter is rule-based locally; in production the same packets
feed the Foundry Batch Evaluation surface for Groundedness, IntentResolution,
TaskAdherence, ToolCallAccuracy, ContentSafety.

| Demonstrated by | File |
|---|---|
| Service + golden set | [backend/src/services/foundry-evaluations.ts](../backend/src/services/foundry-evaluations.ts) |
| Scores on packet | `EvaluationScores` in [backend/src/types/action-packet.ts](../backend/src/types/action-packet.ts) |

**Golden cases (10):** verified-confirm happy path, clinical-question refusal,
cancel-requires-step-up, grounded location answer, direct prompt injection,
Spanish in-language, Cantonese interpreter handoff, benefit-coverage refusal,
low-confidence identity, billing out-of-scope.

## 7. Tracing & Observability (App Insights + OTEL)

**What it is:** GenAI semantic-convention spans correlated by sessionId and
forwarded to Application Insights so the team can replay any conversation in
the Foundry Tracing view.

| Demonstrated by | File |
|---|---|
| Tracing service | [backend/src/services/foundry-tracing.ts](../backend/src/services/foundry-tracing.ts) |
| App Insights IaC | [infra/modules/app-insights.bicep](../infra/modules/app-insights.bicep) |
| Alerts | [infra/modules/alerts.bicep](../infra/modules/alerts.bicep) |

## 8. Identity (Managed Identity end-to-end)

**What it is:** No keys in containers. The backend Container App uses managed
identity to call Azure OpenAI, AI Search, Content Safety, and Foundry.

| Demonstrated by | File |
|---|---|
| Token provider in Foundry client | [backend/src/services/assistants.ts](../backend/src/services/assistants.ts) |
| Token provider for AI Search | `getAuthHeader()` in [backend/src/services/foundry-knowledge.ts](../backend/src/services/foundry-knowledge.ts) |
| Role assignments | [infra/modules/role-assignment.bicep](../infra/modules/role-assignment.bicep) |

## 9. The ActionPacket — the staff-facing artifact

Every session produces exactly one `ActionPacket` summarizing what happened,
what was grounded, which workflow was permitted at the caller's identity tier,
which safety signals fired, and which evaluator scores resulted. This is the
shared contract between the agent and human staff.

| Demonstrated by | File |
|---|---|
| Schema + helpers | [backend/src/types/action-packet.ts](../backend/src/types/action-packet.ts) |
| Type re-export | [backend/src/types/index.ts](../backend/src/types/index.ts) |

---

## How to walk this with an engineer

1. Open [backend/src/scenarios/acme-scenarios.ts](../backend/src/scenarios/acme-scenarios.ts) → show the three example scenarios and the identity-tier policy in the system prompts.
2. Open [backend/src/types/action-packet.ts](../backend/src/types/action-packet.ts) → show the shared contract.
3. Open [backend/src/services/foundry-knowledge.ts](../backend/src/services/foundry-knowledge.ts) → show how every factual answer must produce a `GroundingSource`.
4. Open [backend/src/services/content-safety.ts](../backend/src/services/content-safety.ts) → show Prompt Shields + PHI redaction + indirect-injection defense on retrieved docs.
5. Open [backend/src/services/foundry-evaluations.ts](../backend/src/services/foundry-evaluations.ts) → show the 10-case golden set and `evaluatePacket()`.
6. Open [backend/src/services/foundry-tracing.ts](../backend/src/services/foundry-tracing.ts) → show the `gen_ai.*` semantic conventions and the `emitActionPacket` closing event.
7. Open [infra/main.bicep](../infra/main.bicep) and the new `ai-search.bicep` / `content-safety.bicep` modules → show the deployed surface.

---

## Environment variables added

| Variable | Used by | Purpose |
|---|---|---|
| `AZURE_SEARCH_ENDPOINT` | foundry-knowledge | RAG endpoint |
| `AZURE_SEARCH_INDEX` | foundry-knowledge | default index name |
| `AZURE_SEARCH_TOP_K` | foundry-knowledge | retrieval depth (default 5) |
| `AZURE_SEARCH_SEMANTIC_CONFIG` | foundry-knowledge | semantic ranker config |
| `AZURE_SEARCH_AUTH` | foundry-knowledge | `managed-identity` or `api-key` |
| `AZURE_SEARCH_API_KEY` | foundry-knowledge | local-dev fallback only |
| `AZURE_CONTENT_SAFETY_ENDPOINT` | content-safety | guardrail endpoint |
| `AZURE_CONTENT_SAFETY_API_KEY` | content-safety | local-dev fallback only |
| `PROMPT_SHIELD_ENABLED` | content-safety | toggle (default true) |
| `CONTENT_SAFETY_ENABLED` | content-safety | toggle (default true) |
| `CONTENT_SAFETY_BLOCK_SEVERITY` | content-safety | block threshold 0..7 (default 4) |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | foundry-tracing | OTEL export |
