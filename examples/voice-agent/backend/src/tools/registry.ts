/**
 * Acme Health - Tool Registry
 * 
 * Centralized registry for all agent tools. Manages tool definitions,
 * validation, and execution with proper audit logging.
 */

import { createHash, randomUUID } from 'node:crypto';
import type {
  RegisteredTool,
  ToolDefinition,
  ToolContext,
  ToolResult,
  ToolCategory,
} from '../types/index.js';
import { logger, logToolCall } from '../utils/logger.js';
import { foundryTracing } from '../services/foundry-tracing.js';
import { CacheKeys, sessionCache } from '../services/cache.js';

// =============================================================================
// TOOL REGISTRY CLASS
// =============================================================================

export class ToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();

  /**
   * Register a new tool
   */
  register(tool: RegisteredTool): void {
    if (this.tools.has(tool.definition.name)) {
      logger.warn(`Tool ${tool.definition.name} is being re-registered`);
    }

    this.tools.set(tool.definition.name, tool);
    logger.debug(`Registered tool: ${tool.definition.name}`, {
      category: tool.category,
      isMocked: tool.isMocked,
    });
  }

  /**
   * Get a tool by name
   */
  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tools
   */
  getAll(): RegisteredTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools by category
   */
  getByCategory(category: ToolCategory): RegisteredTool[] {
    return this.getAll().filter(t => t.category === category);
  }

  /** Get tool definitions for one scenario without mutating global state. */
  getDefinitions(toolNames: readonly string[]): ToolDefinition[] {
    const allowed = new Set(toolNames);
    return this.getAll()
      .filter(t => allowed.has(t.definition.name))
      .map(t => t.definition);
  }

  /**
   * Execute a tool with full context and audit logging
   */
  async execute(
    name: string,
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    const startTime = Date.now();

    // Tool not found
    if (!tool) {
      const error = `Tool '${name}' not found in registry`;
      logger.error(error);
      return { success: false, error };
    }

    // Tool not enabled for this session's scenario
    if (!context.allowedTools.includes(name)) {
      const error = `Tool '${name}' is not enabled for scenario '${context.scenarioId}'`;
      logger.warn(error, { scenarioId: context.scenarioId });
      return { success: false, error };
    }

    try {
      logger.info(`Executing tool: ${name}`, {
        sessionId: context.sessionId,
        args: Object.keys(args),
      });

      // Normalize common identity-shaped args BEFORE the handler runs.
      // Voice transcripts are wildly inconsistent about case (\"mem-001\",\n      // \"MEM 001\", \" mem-001 \"), and downstream tools use these strings as
      // raw Map keys. Doing this once here means every tool gets the fix.
      //
      // We also smart-coerce bare numerics ("2", "002", "member number 2")
      // into the canonical "MEM-XXX" format the mock data uses. Without
      // this, callers who say "member number 002" never match anything.
      const normalizeMemberId = (raw: string): string => {
        const trimmed = raw.trim();
        if (!trimmed) return trimmed;
        // Already in canonical MEM-XXX form (case-insensitive).
        const canonical = trimmed.toUpperCase().replace(/\s+/g, '-');
        if (/^MEM-?\d+$/.test(canonical)) {
          const digits = canonical.replace(/^MEM-?/, '');
          return `MEM-${digits.padStart(3, '0')}`;
        }
        // Bare numeric ("2", "002", "12").
        if (/^\d+$/.test(trimmed)) {
          return `MEM-${trimmed.padStart(3, '0')}`;
        }
        // Mixed garbage — fall back to upper-trim.
        return canonical;
      };

      const normalizedArgs = { ...args };
      for (const key of ['memberId', 'memberID', 'member_id'] as const) {
        const value = normalizedArgs[key];
        if (typeof value === 'string') {
          normalizedArgs[key] = normalizeMemberId(value);
        }
      }

      if (normalizedArgs.memberId !== args.memberId) {
        logger.debug('Normalized member identifier', {
          tool: name,
          sessionId: context.sessionId,
        });
      }
        const requestedMemberId = normalizedArgs.memberId;
        if (
          typeof requestedMemberId === 'string' &&
          context.memberId &&
          requestedMemberId !== context.memberId
        ) {
          return {
            success: false,
            error: 'The requested member does not match the identity verified for this session.',
          };
        }

        const requiresVerifiedIdentity =
          ['prescriptions', 'pharmacy', 'patient'].includes(tool.category) ||
          name === 'send_mfa_code' ||
          name === 'verify_mfa_code';
        if (requiresVerifiedIdentity) {
          const memberId = context.memberId ?? (
            typeof requestedMemberId === 'string' ? requestedMemberId : undefined
          );
          const identity = memberId
            ? sessionCache.get<{ verified?: boolean }>(
                context.sessionId,
                'identity',
                CacheKeys.identity(memberId)
              )
            : null;
          if (!memberId || !identity?.verified) {
            return { success: false, error: 'Verified member identity is required for this tool.' };
          }

          if (['prescriptions', 'pharmacy', 'patient'].includes(tool.category)) {
            const mfa = sessionCache.get<{ verified?: boolean; canProceed?: boolean }>(
              context.sessionId,
              'mfa',
              CacheKeys.mfaStatus(memberId)
            );
            if (!mfa?.verified || !mfa.canProceed) {
              return { success: false, error: 'Current-session MFA verification is required for this tool.' };
            }
          }
        }

      const confirmationRequired = ['request_refill', 'transfer_prescription'].includes(name);
      if (confirmationRequired) {
        const confirmationToken = normalizedArgs.confirmationToken;
        delete normalizedArgs.confirmationToken;
        const actionDigest = createHash('sha256')
          .update(JSON.stringify(Object.keys(normalizedArgs).sort().map(key => [key, normalizedArgs[key]])))
          .digest('hex');

        if (typeof confirmationToken !== 'string') {
          const token = randomUUID();
          sessionCache.set(
            context.sessionId,
            'confirmation',
            `${name}:${token}`,
            { actionDigest },
            5 * 60 * 1000
          );
          return {
            success: true,
            data: {
              confirmationRequired: true,
              confirmationToken: token,
              action: name,
              message: 'Read back the requested action and obtain explicit patient confirmation before continuing.',
            },
          };
        }

        const pending = sessionCache.get<{ actionDigest: string }>(
          context.sessionId,
          'confirmation',
          `${name}:${confirmationToken}`
        );
        if (!pending || pending.actionDigest !== actionDigest) {
          return { success: false, error: 'Confirmation is missing, expired, or does not match this action.' };
        }
        sessionCache.delete(context.sessionId, 'confirmation', `${name}:${confirmationToken}`);
      }

      const result = await tool.handler(normalizedArgs, context);

      result.metadata = {
        executionTimeMs: Date.now() - startTime,
        isMocked: tool.isMocked,
        toolVersion: tool.version,
      };

      // Audit log the execution
      await logToolCall(
        context.auditLogger,
        context.sessionId,
        name,
        args,
        { success: result.success, error: result.error },
        result.metadata.executionTimeMs
      );

      // Emit a Foundry trace span for this tool call. We pass the *names*
      // of the args rather than values to avoid leaking PHI into the trace
      // stream (the full args are already in the audit log behind RBAC).
      foundryTracing.recordToolCall({
        sessionId: context.sessionId,
        toolName: name,
        durationMs: result.metadata.executionTimeMs,
        success: result.success,
        isMocked: tool.isMocked,
        argumentDigest: Object.keys(args).join(','),
        errorMessage: result.error,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const durationMs = Date.now() - startTime;

      logger.error(`Tool execution failed: ${name}`, {
        error: errorMessage,
        sessionId: context.sessionId,
      });

      // Audit log the failure
      await logToolCall(
        context.auditLogger,
        context.sessionId,
        name,
        args,
        { success: false, error: errorMessage },
        durationMs
      );

      foundryTracing.recordToolCall({
        sessionId: context.sessionId,
        toolName: name,
        durationMs,
        success: false,
        isMocked: tool.isMocked,
        argumentDigest: Object.keys(args).join(','),
        errorMessage,
      });

      return {
        success: false,
        error: `Tool execution failed: ${errorMessage}`,
        metadata: {
          executionTimeMs: durationMs,
          isMocked: tool.isMocked,
          toolVersion: tool.version,
        },
      };
    }
  }

  /**
   * Get a summary of all registered tools
   */
  getSummary(toolNames: readonly string[] = []): { name: string; category: ToolCategory; isMocked: boolean; enabled: boolean }[] {
    const allowed = new Set(toolNames);
    return this.getAll().map(t => ({
      name: t.definition.name,
      category: t.category,
      isMocked: t.isMocked,
      enabled: allowed.has(t.definition.name),
    }));
  }
}

// Singleton instance
export const toolRegistry = new ToolRegistry();

// =============================================================================
// HELPER FOR CREATING TOOLS
// =============================================================================

/**
 * Helper function to create a tool with proper typing
 */
export function createTool<TArgs extends Record<string, unknown>, TResult>(config: {
  name: string;
  description: string;
  category: ToolCategory;
  parameters: ToolDefinition['parameters'];
  handler: (args: TArgs, context: ToolContext) => Promise<ToolResult<TResult>>;
  isMocked?: boolean;
  version?: string;
}): RegisteredTool {
  return {
    definition: {
      name: config.name,
      description: config.description,
      parameters: config.parameters,
    },
    handler: config.handler as (
      args: Record<string, unknown>,
      context: ToolContext
    ) => Promise<ToolResult>,
    category: config.category,
    isMocked: config.isMocked ?? true,
    version: config.version ?? '1.0.0',
  };
}
