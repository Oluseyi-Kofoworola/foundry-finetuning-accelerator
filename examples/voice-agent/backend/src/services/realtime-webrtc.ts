/**
 * Acme Health - WebRTC Realtime Session Broker
 *
 * Phase 2 transport: instead of relaying PCM16 frames through a backend
 * WebSocket, the browser opens a direct WebRTC peer connection to Azure
 * OpenAI. This service mints the short-lived ephemeral session token that
 * the browser uses as its bearer credential and packages the scenario
 * config (system prompt, voice, tool schema) the browser will push into
 * the session via the data channel.
 *
 * Tool execution stays on the server (see executeToolForSession) so PHI
 * handling, audit logging, and member-context updates remain authoritative
 * here even though audio bypasses the backend entirely.
 */

import { DefaultAzureCredential } from '@azure/identity';
import type { ScenarioDefinition, ToolContext } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { getConfig } from '../utils/config.js';
import { getOpenAIToolDefinitions, toolRegistry } from '../tools/index.js';
import { sessionManager } from './session-manager.js';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface EphemeralSession {
  /** Ephemeral key (ek_...) the browser uses as the SDP bearer. */
  clientSecret: string;
  /** Unix epoch seconds when the ephemeral key expires. */
  expiresAt: number;
  /** Server-side session id we use for audit / tool execution. */
  sessionId: string;
  /** Azure OpenAI deployment name the browser should target. */
  deployment: string;
  /** Regional WebRTC endpoint to POST the SDP offer to. */
  webrtcUrl: string;
  /** Full session config the browser should send as the first session.update. */
  sessionConfig: Record<string, unknown>;
  /** Convenience copy of the scenario the operator selected. */
  scenarioName: string;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Azure WebRTC realtime is currently exposed in a small set of regions. */
const REGION_WEBRTC_HOST: Record<string, string> = {
  eastus2: 'https://eastus2.realtimeapi-preview.ai.azure.com',
  swedencentral: 'https://swedencentral.realtimeapi-preview.ai.azure.com',
};

/**
 * Best-effort region inference from the Azure OpenAI custom domain.
 * Users can override via AZURE_REALTIME_REGION if their endpoint name
 * doesn't encode the region.
 */
function inferRegion(): string {
  const explicit = (process.env.AZURE_REALTIME_REGION || '').toLowerCase();
  if (explicit && REGION_WEBRTC_HOST[explicit]) return explicit;
  // Default to eastus2 — that's where the demo resource lives. If a future
  // deployment moves regions, set AZURE_REALTIME_REGION explicitly.
  return 'eastus2';
}

/**
 * Build the turn-detection block. Keep this exactly aligned with the
 * WebSocket transport so both paths feel identical to the caller.
 */
function buildTurnDetection() {
  const f = getConfig().features;
  return f.turnDetectionType === 'semantic_vad'
    ? {
        type: 'semantic_vad' as const,
        eagerness: f.semanticVadEagerness,
        create_response: true,
        interrupt_response: true,
      }
    : {
        type: 'server_vad' as const,
        threshold: f.serverVadThreshold,
        prefix_padding_ms: f.serverVadPrefixPaddingMs,
        silence_duration_ms: f.serverVadSilenceMs,
        create_response: true,
      };
}

async function getEntraToken(): Promise<string> {
  // Pin the credential to the resource's tenant. Without this, a developer
  // who is signed into the Azure CLI under a different tenant (e.g. their
  // corporate tenant) ends up with a token issued by the wrong issuer and
  // the mint endpoint returns 400 "Tenant provided in token does not
  // match resource token".
  const tenantId = process.env.AZURE_TENANT_ID;
  const credential = new DefaultAzureCredential(tenantId ? { tenantId } : undefined);
  const tokenResponse = await credential.getToken('https://cognitiveservices.azure.com/.default');
  return tokenResponse.token;
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Mint a short-lived (~1 min) ephemeral session for a given scenario.
 * The browser will exchange this for a WebRTC peer connection.
 */
export async function mintEphemeralSession(
  sessionId: string,
  scenario: ScenarioDefinition,
): Promise<EphemeralSession> {
  const config = getConfig();
  if (!config.openai.useAzure || !config.openai.azureEndpoint) {
    throw new Error('WebRTC transport currently requires Azure OpenAI configuration.');
  }

  const endpoint = config.openai.azureEndpoint.replace(/\/$/, '');
  const deployment = config.openai.azureDeployment || 'gpt-4o-realtime';
  const region = inferRegion();
  const webrtcHost = REGION_WEBRTC_HOST[region] ?? REGION_WEBRTC_HOST.eastus2;
  const webrtcUrl = `${webrtcHost}/v1/realtimertc?model=${encodeURIComponent(deployment)}`;

  // Authenticate with the same managed-identity / Entra path the WS service uses.
  let authHeader: Record<string, string>;
  if (config.openai.azureApiKey) {
    authHeader = { 'api-key': config.openai.azureApiKey };
  } else {
    const token = await getEntraToken();
    authHeader = { Authorization: `Bearer ${token}` };
  }

  const mintUrl = `${endpoint}/openai/realtimeapi/sessions?api-version=2025-04-01-preview`;
  const mintBody = {
    model: deployment,
    voice: scenario.voice.voiceId,
  };

  const resp = await fetch(mintUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader },
    body: JSON.stringify(mintBody),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    logger.error('Ephemeral session mint failed', {
      sessionId,
      status: resp.status,
      body: errBody.slice(0, 500),
    });
    throw new Error(`Azure realtime session mint failed (${resp.status})`);
  }

  const minted = (await resp.json()) as {
    client_secret: { value: string; expires_at: number };
    id: string;
  };

  // The full session.update payload the browser should send as the very
  // first data-channel message. Keeps prompt + tools + VAD authoritative
  // on the server even though the transport is peer-to-peer.
  const sessionConfig = {
    type: 'session.update',
    session: {
      modalities: ['text', 'audio'],
      instructions: scenario.systemPrompt,
      voice: scenario.voice.voiceId,
      input_audio_format: 'pcm16',
      output_audio_format: 'pcm16',
      input_audio_transcription: { model: 'whisper-1' },
      turn_detection: buildTurnDetection(),
      tools: getOpenAIToolDefinitions(),
      tool_choice: 'auto',
      temperature: scenario.voice.temperature,
    },
  };

  logger.info('Minted ephemeral realtime session', {
    sessionId,
    scenarioId: scenario.id,
    deployment,
    region,
    expiresAt: minted.client_secret.expires_at,
  });

  return {
    clientSecret: minted.client_secret.value,
    expiresAt: minted.client_secret.expires_at,
    sessionId,
    deployment,
    webrtcUrl,
    sessionConfig,
    scenarioName: scenario.name,
  };
}

/**
 * Server-side tool execution invoked by the browser after it observes a
 * function_call_arguments.done event on the data channel. Returns the
 * raw JSON the browser will wrap in a conversation.item.create.
 */
export async function executeToolForSession(
  sessionId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<{ success: boolean; data: unknown; error?: string }> {
  const session = sessionManager.get(sessionId);
  if (!session) {
    return { success: false, data: null, error: 'Session not found or expired.' };
  }

  const context: ToolContext = {
    sessionId,
    memberId: session.memberContext?.memberId,
    scenarioId: session.scenarioId,
    timestamp: new Date(),
    auditLogger: sessionManager.getAuditLogger(),
  };

  try {
    const result = await toolRegistry.execute(name, args, context);
    sessionManager.incrementToolCalls(sessionId);

    // Promote verified member context exactly like the WS path does, so
    // verification persists across tool calls regardless of transport.
    if (name === 'verify_member_identity' && result.success && result.data) {
      // Mirror the loose typing the WS handler uses — the tool's response
      // shape is owned by the tool, not this transport.
      const verify = result.data as {
        verified?: boolean;
        memberId?: string;
        preferredName?: string;
        planType?: 'gold' | 'silver' | 'bronze' | 'platinum';
        state?: string;
      };
      if (
        verify.verified &&
        verify.memberId &&
        verify.preferredName &&
        verify.planType &&
        verify.state
      ) {
        sessionManager.setMemberContext(sessionId, {
          memberId: verify.memberId,
          preferredName: verify.preferredName,
          planType: verify.planType,
          state: verify.state,
          isVerified: true,
          verifiedAt: new Date(),
        });
      }
    }

    return { success: result.success, data: result.data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('WebRTC tool execution failed', { sessionId, name, error: message });
    return { success: false, data: null, error: message };
  }
}
