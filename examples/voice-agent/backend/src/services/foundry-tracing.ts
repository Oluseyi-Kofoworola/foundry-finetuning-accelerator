/**
 * Acme Health — Azure AI Foundry Tracing Service
 *
 * Bridges agent runtime events into Application Insights so that every
 * conversation turn, tool call, and ActionPacket can be replayed in the
 * Foundry Tracing view.
 *
 * Capabilities demonstrated:
 *   • OpenTelemetry-compatible span attributes (`gen_ai.*`)
 *   • Per-session correlation id usable in Foundry Tracing UI
 *   • Tool-call spans with arguments & latency
 *   • Safety / grounding signal events attached to spans
 *   • ActionPacket emit event for staff review
 *
 * Implementation notes:
 *   • If `APPLICATIONINSIGHTS_CONNECTION_STRING` is set, this module wires
 *     to `@azure/monitor-opentelemetry` if installed, otherwise logs
 *     structured trace events through Winston so they are still queryable
 *     in App Insights via the `traces` table.
 *   • Spans follow the GenAI semantic conventions
 *     (https://opentelemetry.io/docs/specs/semconv/gen-ai/).
 */

import { logger } from '../utils/logger.js';
import type { ActionPacket } from '../types/index.js';

// =============================================================================
// SPAN ATTRIBUTE HELPERS — GenAI semconv
// =============================================================================

export interface GenAiTurnAttributes {
  'gen_ai.system': 'azure.ai.foundry';
  'gen_ai.operation.name': 'chat' | 'realtime' | 'tool_call' | 'agent_run';
  'gen_ai.request.model': string;
  'gen_ai.response.model'?: string;
  'gen_ai.request.temperature'?: number;
  'gen_ai.request.max_tokens'?: number;
  'gen_ai.usage.input_tokens'?: number;
  'gen_ai.usage.output_tokens'?: number;
  'acme.session_id': string;
  'acme.scenario_id': string;
  'acme.identity_confidence'?: string;
  'acme.allowed_workflow'?: string;
  'acme.grounding_collections'?: string;
}

// =============================================================================
// SERVICE
// =============================================================================

class FoundryTracingService {
  private connectionString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
  private enabled = false;
  private otelTracer: unknown = null;

  async initialize(): Promise<void> {
    if (!this.connectionString) {
      logger.info('[foundry-tracing] APPLICATIONINSIGHTS_CONNECTION_STRING not set — using log-based tracing');
      return;
    }
    try {
      // Lazy import so the module is optional at install time.
      const monitor = await import('@azure/monitor-opentelemetry' as string).catch(() => null);
      if (monitor && typeof (monitor as any).useAzureMonitor === 'function') {
        (monitor as any).useAzureMonitor({
          azureMonitorExporterOptions: { connectionString: this.connectionString },
        });
        this.enabled = true;
        logger.info('[foundry-tracing] OpenTelemetry exporter wired to Application Insights');
      } else {
        logger.info('[foundry-tracing] @azure/monitor-opentelemetry not installed — using log-based tracing');
      }
    } catch (err) {
      logger.warn('[foundry-tracing] init failed', { error: (err as Error).message });
    }
  }

  /**
   * Record the start of a conversation turn. Returns a span id used to close it.
   */
  startTurn(attrs: GenAiTurnAttributes): string {
    const spanId = `span_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    logger.info('[trace] turn.start', { spanId, ...attrs });
    return spanId;
  }

  endTurn(spanId: string, outcome: 'ok' | 'error' | 'escalated', extra?: Record<string, unknown>) {
    logger.info('[trace] turn.end', { spanId, outcome, ...extra });
  }

  /**
   * Record a tool call as a child span with arguments + result summary.
   */
  recordToolCall(args: {
    sessionId: string;
    toolName: string;
    durationMs: number;
    success: boolean;
    isMocked: boolean;
    argumentDigest?: string; // hashed/redacted args for PHI safety
    errorMessage?: string;
  }) {
    logger.info('[trace] tool.call', {
      'gen_ai.operation.name': 'tool_call',
      'gen_ai.tool.name': args.toolName,
      'gen_ai.tool.duration_ms': args.durationMs,
      'gen_ai.tool.success': args.success,
      'acme.tool.is_mocked': args.isMocked,
      'acme.session_id': args.sessionId,
      'acme.tool.arg_digest': args.argumentDigest,
      'acme.tool.error': args.errorMessage,
    });
  }

  /**
   * Record a content-safety / prompt-shield event.
   */
  recordSafetyEvent(args: {
    sessionId: string;
    kind: 'prompt_shield' | 'content_safety' | 'jailbreak' | 'pii_redaction';
    severity: 'low' | 'medium' | 'high';
    action: 'allowed' | 'redacted' | 'blocked';
    detail?: string;
  }) {
    logger.warn('[trace] safety.event', {
      'acme.session_id': args.sessionId,
      'acme.safety.kind': args.kind,
      'acme.safety.severity': args.severity,
      'acme.safety.action': args.action,
      'acme.safety.detail': args.detail,
    });
  }

  /**
   * Record a grounding event (search query + citation summary).
   */
  recordGrounding(args: {
    sessionId: string;
    query: string;
    collections: string[];
    hitCount: number;
    topScore?: number;
    success: boolean;
  }) {
    logger.info('[trace] grounding.query', {
      'acme.session_id': args.sessionId,
      'acme.grounding.query_digest': digest(args.query),
      'acme.grounding.collections': args.collections.join(','),
      'acme.grounding.hit_count': args.hitCount,
      'acme.grounding.top_score': args.topScore,
      'acme.grounding.success': args.success,
    });
  }

  /**
   * Emit an ActionPacket trace event. This is the closing event for a session
   * and is the staff-facing artifact reviewable from Foundry Tracing.
   */
  emitActionPacket(packet: ActionPacket) {
    logger.info('[trace] action_packet.emit', {
      'acme.session_id': packet.sessionId,
      'acme.scenario_id': packet.scenarioId,
      'acme.identity_confidence': packet.identityConfidence,
      'acme.allowed_workflow': packet.allowedWorkflow,
      'acme.detected_intent': packet.detectedIntent.primary,
      'acme.escalation_reason': packet.escalationReasonCode,
      'acme.grounding_citation_count': packet.groundingSources.length,
      'acme.safety.prompt_injection': packet.safety.promptInjectionDetected,
      'acme.safety.content_safety_triggered': packet.safety.contentSafetyTriggered,
      'acme.safety.clinical_refusal_count': packet.safety.clinicalRefusalCount,
      'acme.eval.groundedness': packet.evaluation?.groundedness,
      'acme.eval.intent_resolution': packet.evaluation?.intentResolutionAccuracy,
    });
  }
}

function digest(s: string): string {
  // Lightweight non-cryptographic digest for log correlation only — never used
  // for security. Avoids leaking raw user utterances into the trace stream.
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return `d_${(h >>> 0).toString(16)}`;
}

export const foundryTracing = new FoundryTracingService();
