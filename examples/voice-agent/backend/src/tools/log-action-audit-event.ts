/**
 * Acme Health - Audit Event Logging Tool
 * 
 * Tool for logging significant actions and events for compliance and audit purposes.
 * Required for healthcare regulatory compliance (HIPAA audit trail).
 */

import { createTool } from './registry.js';
import type { ToolResult, ToolContext, AuditEventType } from '../types/index.js';

// =============================================================================
// RESULT TYPES
// =============================================================================

export interface AuditLogResult {
  logged: boolean;
  auditId: string;
  timestamp: string;
  message: string;
}

// =============================================================================
// TOOL IMPLEMENTATION
// =============================================================================

export const logActionAuditEventTool = createTool<
  {
    eventType: string;
    eventDescription: string;
    actionTaken: string;
    outcome: 'success' | 'failure' | 'pending';
    sensitiveAction?: boolean;
    additionalContext?: Record<string, unknown>;
  },
  AuditLogResult
>({
  name: 'log_action_audit_event',
  description: `Log a significant action or event for audit and compliance purposes.
  Use this to record important interactions, decisions, and actions taken.
  Required for healthcare compliance - automatically called for sensitive operations.
  Events are stored in tamper-evident audit log.`,
  category: 'audit',
  parameters: {
    type: 'object',
    properties: {
      eventType: {
        type: 'string',
        description: 'Type of event (e.g., "member_verification", "prescription_action", "information_disclosure")',
      },
      eventDescription: {
        type: 'string',
        description: 'Human-readable description of the event',
      },
      actionTaken: {
        type: 'string',
        description: 'What action was taken',
      },
      outcome: {
        type: 'string',
        enum: ['success', 'failure', 'pending'],
        description: 'The outcome of the action',
      },
      sensitiveAction: {
        type: 'boolean',
        description: 'Whether this is considered a sensitive action requiring additional logging',
      },
      additionalContext: {
        type: 'object',
        description: 'Any additional context to include in the audit log (will be sanitized)',
      },
    },
    required: ['eventType', 'eventDescription', 'actionTaken', 'outcome'],
  },
  handler: async (args, context): Promise<ToolResult<AuditLogResult>> => {
    const { eventType, eventDescription, actionTaken, outcome, sensitiveAction, additionalContext } = args;

    const timestamp = new Date();
    const auditId = `AUD-${timestamp.getTime().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    // Log to the audit system
    await context.auditLogger.log({
      sessionId: context.sessionId,
      eventType: (sensitiveAction ? 'sensitive_action' : 'tool_called') as AuditEventType,
      eventData: {
        customEventType: eventType,
        description: eventDescription,
        action: actionTaken,
        additionalContext: additionalContext || {},
      },
      actor: {
        type: 'agent',
      },
      outcome: outcome as 'success' | 'failure',
      metadata: {
        scenarioId: context.scenarioId,
        toolName: 'log_action_audit_event',
      },
    });

    return {
      success: true,
      data: {
        logged: true,
        auditId,
        timestamp: timestamp.toISOString(),
        message: `Audit event logged: ${eventDescription}`,
      },
    };
  },
  isMocked: false, // This tool actually logs - not mocked
  version: '1.0.0',
});
