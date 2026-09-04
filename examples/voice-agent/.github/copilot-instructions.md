# GitHub Copilot Instructions for the Voice Agent

## Project Overview

This is an enterprise, white-label healthcare voice agent (default brand: Acme Health). It uses:
- **Backend**: Node.js, TypeScript, Express, WebSocket, OpenAI Realtime API
- **Frontend**: React, TypeScript, Vite, Tailwind CSS, WebAudio API

## Key Architectural Patterns

### Tool-Based Architecture
- All healthcare operations are implemented as "tools" in `backend/src/tools/`
- Each tool has a typed schema and async handler
- Tools are registered in `backend/src/tools/registry.ts`
- Tools receive session context and must return structured results

### Scenario System
- Scenarios define different use cases (PBM, Health Plan, Provider, Call Center)
- Each scenario has: system prompt, enabled tools, guardrails, voice settings
- Scenarios are managed in `backend/src/scenarios/engine.ts`

### Real-Time Communication
- WebSocket connection between frontend ↔ backend ↔ OpenAI
- Audio is PCM16 format at 24kHz
- Messages use typed protocols defined in `types/index.ts`

## Coding Standards

### TypeScript
- Use strict mode
- All functions must have return type annotations
- Use Zod for runtime validation of external data
- Prefer interfaces over types for object shapes

### React
- Use functional components with hooks
- Use `useCallback` for event handlers passed to children
- Prefer `useState` + `useEffect` over complex state libraries
- Keep components focused - one responsibility per component

### Error Handling
- All tool handlers should catch errors and return structured error responses
- Use the Winston logger for all logging
- Audit-sensitive operations must call `auditLog()`

### Audio Processing
- All audio is PCM16 at 24kHz sample rate
- Use Web Audio API's AudioWorklet when available
- Fall back to ScriptProcessorNode for broader compatibility

## File Naming Conventions

- Components: `PascalCase.tsx`
- Hooks: `useHookName.ts`
- Services: `kebab-case.ts`
- Types: `index.ts` in dedicated `types/` directory
- Tools: `kebab-case.ts` in `tools/` directory

## Testing Guidelines

- Unit test all tool handlers with mock data
- Integration test WebSocket message flows
- Test audio encoding/decoding separately
- Use descriptive test names: `should_[expected_behavior]_when_[condition]`

## Security Considerations

- Never log actual PHI data
- Always validate member identity before accessing records
- Use the consent system before any data operations
- Audit all data access with `log_action_audit_event` tool

## Adding New Features

### New Tool
1. Create file in `backend/src/tools/`
2. Define `ToolDefinition` with schema and handler
3. Register in `backend/src/tools/registry.ts`
4. Add to relevant scenarios' `enabledTools` array

### New Scenario
1. Add scenario definition in `backend/src/scenarios/engine.ts`
2. Include appropriate system prompt with guardrails
3. Enable relevant tools
4. Add conversation starters for demo

### New UI Component
1. Create in `frontend/src/components/`
2. Export from `frontend/src/components/index.ts`
3. Use the brand colors from the Tailwind config (driven by CSS variables in `frontend/src/styles/globals.css`)
4. Support both voice and text interaction modes
