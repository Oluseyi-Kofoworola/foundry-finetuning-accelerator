/**
 * Acme Health - Voice Agent Type Definitions
 *
 * Core type definitions for the enterprise healthcare voice agent.
 * These types ensure type safety across the application and serve
 * as documentation for the system's data structures.
 */

import { z } from 'zod';

// Re-export ActionPacket and related identity/governance types so consumers
// can `import { ActionPacket, ... } from '../types/index.js'`.
export * from './action-packet.js';

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

/**
 * Tool parameter definition with JSON Schema-compatible typing
 */
export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  enum?: string[];
  items?: { type: string };
  properties?: Record<string, ToolParameter>;
}

/**
 * Tool definition schema for OpenAI function calling
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
      items?: { type: string };
    }>;
    required: string[];
  };
}

/**
 * Tool execution context - passed to tool handlers
 */
export interface ToolContext {
  sessionId: string;
  userId?: string;
  memberId?: string;
  scenarioId: string;
  timestamp: Date;
  auditLogger: AuditLogger;
}

/**
 * Tool execution result
 */
export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    executionTimeMs: number;
    isMocked: boolean;
    toolVersion: string;
  };
}

/**
 * Registered tool with handler
 */
export interface RegisteredTool {
  definition: ToolDefinition;
  handler: (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>;
  category: ToolCategory;
  isMocked: boolean;
  version: string;
}

export type ToolCategory = 
  | 'identity'
  | 'prescriptions'
  | 'pricing'
  | 'providers'
  | 'pharmacy'
  | 'patient'
  | 'audit'
  | 'knowledge';

// =============================================================================
// SCENARIO DEFINITIONS
// =============================================================================

/**
 * Guardrail configuration for safety constraints
 */
export interface GuardrailConfig {
  /** Topics the agent must never discuss */
  prohibitedTopics: string[];
  /** Required disclaimers to include */
  requiredDisclaimers: string[];
  /** Maximum allowed tool calls per turn */
  maxToolCallsPerTurn: number;
  /** Require confirmation for sensitive actions */
  requireConfirmation: string[];
  /** Phrases to avoid */
  avoidPhrases: string[];
}

/**
 * Example conversation starter for demo purposes
 */
export interface ConversationStarter {
  label: string;
  utterance: string;
  description: string;
}

/**
 * Complete scenario definition
 */
export interface ScenarioDefinition {
  id: string;
  name: string;
  description: string;
  /** System prompt that defines agent behavior */
  systemPrompt: string;
  /** Voice configuration */
  voice: VoiceConfig;
  /** Tools enabled for this scenario */
  enabledTools: string[];
  /** Safety guardrails */
  guardrails: GuardrailConfig;
  /** Example conversation starters */
  conversationStarters: ConversationStarter[];
  /** Metadata for display */
  metadata: {
    icon: string;
    category: string;
    estimatedDuration: string;
  };
}

/**
 * Voice configuration for the agent
 */
export interface VoiceConfig {
  /** OpenAI voice ID */
  voiceId: 'alloy' | 'ash' | 'ballad' | 'coral' | 'echo' | 'sage' | 'shimmer' | 'verse';
  /** Speaking rate multiplier */
  speed: number;
  /** Temperature for response generation */
  temperature: number;
}

// =============================================================================
// SESSION MANAGEMENT
// =============================================================================

/**
 * Session state tracking
 */
export interface SessionState {
  id: string;
  scenarioId: string;
  startedAt: Date;
  lastActivityAt: Date;
  /** Whether user has given consent */
  consentGiven: boolean;
  /** Current conversation turn */
  turnCount: number;
  /** Accumulated tool calls */
  toolCallCount: number;
  /** Member context (non-PHI) */
  memberContext?: MemberContext;
  /** Conversation history for context */
  conversationHistory: ConversationTurn[];
  /** Active status */
  status: SessionStatus;
  /** Foundry ActionPacket — staff-facing structured outcome */
  actionPacket?: import('./action-packet.js').ActionPacket;
}

export type SessionStatus = 'pending_consent' | 'active' | 'paused' | 'ended' | 'error';

/**
 * Single conversation turn
 */
export interface ConversationTurn {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCallRecord[];
  audioTranscript?: string;
}

/**
 * Record of a tool call within a turn
 */
export interface ToolCallRecord {
  toolName: string;
  arguments: Record<string, unknown>;
  result: ToolResult;
  timestamp: Date;
}

// =============================================================================
// MEMBER CONTEXT (Demo-Safe, Non-PHI)
// =============================================================================

/**
 * Member context for demo purposes - contains NO PHI
 * All data is mock/synthetic for demonstration
 */
export interface MemberContext {
  /** Synthetic member ID for demo */
  memberId: string;
  /** Member's preferred name (demo) */
  preferredName: string;
  /** Plan type for pricing lookups */
  planType: 'gold' | 'silver' | 'bronze' | 'platinum';
  /** Member state for network lookups */
  state: string;
  /** Verified status */
  isVerified: boolean;
  /** Verification timestamp */
  verifiedAt?: Date;
}

// =============================================================================
// WEBSOCKET MESSAGES
// =============================================================================

/**
 * Base WebSocket message structure
 */
export interface WSMessage {
  type: WSMessageType;
  id: string;
  timestamp: string;
}

export type WSMessageType = 
  | 'session.create'
  | 'session.created'
  | 'session.update'
  | 'session.end'
  | 'consent.provide'
  | 'consent.confirmed'
  | 'audio.input'
  | 'audio.output'
  | 'audio.speech_started'
  | 'audio.speech_ended'
  | 'text.input'
  | 'text.output'
  | 'transcript.partial'
  | 'transcript.final'
  | 'tool.calling'
  | 'tool.result'
  | 'error'
  | 'scenario.switch'
  | 'scenario.list'
  | 'audio.commit'
  | 'response.cancel';

/**
 * Session creation request
 */
export interface SessionCreateMessage extends WSMessage {
  type: 'session.create';
  payload: {
    scenarioId: string;
    userId?: string;
  };
}

/**
 * Audio input from client
 */
export interface AudioInputMessage extends WSMessage {
  type: 'audio.input';
  payload: {
    /** Base64-encoded PCM audio data */
    audio: string;
    /** Sample rate in Hz */
    sampleRate: number;
  };
}

/**
 * Audio output to client
 */
export interface AudioOutputMessage extends WSMessage {
  type: 'audio.output';
  payload: {
    /** Base64-encoded PCM audio data */
    audio: string;
    /** Sample rate in Hz */
    sampleRate: number;
    /** Whether this is the final chunk */
    isFinal: boolean;
  };
}

/**
 * Text transcript message
 */
export interface TranscriptMessage extends WSMessage {
  type: 'transcript.partial' | 'transcript.final';
  payload: {
    text: string;
    role: 'user' | 'assistant';
    confidence?: number;
  };
}

/**
 * Tool calling notification
 */
export interface ToolCallingMessage extends WSMessage {
  type: 'tool.calling';
  payload: {
    toolName: string;
    arguments: Record<string, unknown>;
  };
}

/**
 * Error message
 */
export interface ErrorMessage extends WSMessage {
  type: 'error';
  payload: {
    code: string;
    message: string;
    recoverable: boolean;
  };
}

// =============================================================================
// AUDIT LOGGING
// =============================================================================

/**
 * Audit log entry for compliance
 */
export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  sessionId: string;
  eventType: AuditEventType;
  eventData: Record<string, unknown>;
  /** Actor who triggered the event */
  actor: {
    type: 'user' | 'system' | 'agent';
    id?: string;
  };
  /** Result of the action */
  outcome: 'success' | 'failure' | 'denied';
  /** Additional context */
  metadata?: {
    scenarioId?: string;
    toolName?: string;
    duration?: number;
  };
}

export type AuditEventType =
  | 'session_started'
  | 'session_ended'
  | 'consent_given'
  | 'consent_withdrawn'
  | 'member_verified'
  | 'tool_called'
  | 'tool_failed'
  | 'tool_executed'
  | 'sensitive_action'
  | 'scenario_switched'
  | 'guardrail_triggered'
  | 'error_occurred';

/**
 * Audit logger interface
 */
export interface AuditLogger {
  log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<void>;
  getSessionLogs(sessionId: string): Promise<AuditLogEntry[]>;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Application configuration schema
 */
export const ConfigSchema = z.object({
  port: z.number().default(3001),
  host: z.string().default('0.0.0.0'),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  // White-label branding. All values come from environment variables (see
  // .env.example -> "Branding") which are derived from
  // /config/client.config.json via `npm run apply:config`. Defaults are
  // intentionally generic so an un-customized fork still runs.
  brand: z.object({
    orgName: z.string().default('Acme Health'),
    shortName: z.string().default('Acme'),
    productName: z.string().default('Acme Voice Agent'),
    assistantName: z.string().default('Acme Virtual Assistant'),
    industry: z.string().default('healthcare'),
    supportPhone: z.string().default(''),
    supportUrl: z.string().default(''),
  }).default({}),
  openai: z.object({
    apiKey: z.string().optional(),
    realtimeModel: z.string().default('gpt-realtime-2025-08-28'),
    // Azure OpenAI configuration
    azureEndpoint: z.string().optional(),
    azureApiKey: z.string().optional(),
    azureDeployment: z.string().optional(),
    azureChatDeployment: z.string().optional(),
    azureApiVersion: z.string().default('2024-10-21'),
    useAzure: z.boolean().default(false),
  }),
  azure: z.object({
    openaiEndpoint: z.string().optional(),
    useAssistants: z.boolean().default(false),
  }).optional(),
  security: z.object({
    enableAuditLogging: z.boolean().default(true),
    auditLogRetentionDays: z.number().default(90),
    sessionTimeoutMs: z.number().default(1800000),
    requireConsent: z.boolean().default(true),
    corsOrigins: z.array(z.string()).default(['http://localhost:5173']),
  }),
  demo: z.object({
    useMockTools: z.boolean().default(true),
    demoMode: z.boolean().default(true),
    defaultScenario: z.string().default('pbm-pharmacy-assistant'),
  }),
  features: z.object({
    enableVad: z.boolean().default(true),
    enableBargeIn: z.boolean().default(true),
    enableTextFallback: z.boolean().default(true),
    maxConversationDurationMins: z.number().default(30),
    // Turn detection: 'semantic_vad' uses a model to detect end-of-thought
    // (recommended for natural conversation). 'server_vad' is the legacy
    // silence-duration detector — only fall back if semantic_vad is unstable.
    turnDetectionType: z.enum(['semantic_vad', 'server_vad']).default('semantic_vad'),
    // semantic_vad eagerness: 'low' (most patient, ~1s delay) | 'medium'
    // (balanced, ~500ms) | 'high' (fast, may cut off) | 'auto'. Default
    // 'medium' is the sweet spot for healthcare conversation — patient
    // enough not to interrupt, fast enough not to feel sluggish.
    semanticVadEagerness: z.enum(['low', 'medium', 'high', 'auto']).default('medium'),
    // server_vad fallback knobs (only used when turnDetectionType=server_vad)
    serverVadThreshold: z.number().default(0.5),
    serverVadSilenceMs: z.number().default(700),
    serverVadPrefixPaddingMs: z.number().default(300),
  }),
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    format: z.enum(['json', 'simple']).default('json'),
  }),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

// =============================================================================
// API RESPONSES
// =============================================================================

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  meta?: {
    timestamp: string;
    requestId: string;
  };
}

/**
 * Health check response
 */
export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  checks: {
    openai: boolean;
    database?: boolean;
    memory: {
      used: number;
      total: number;
    };
  };
}
