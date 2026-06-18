/**
 * Acme Health - Tool Registry
 * 
 * Centralized registry for all agent tools. Manages tool definitions,
 * validation, and execution with proper audit logging.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  RegisteredTool,
  ToolDefinition,
  ToolContext,
  ToolResult,
  ToolCategory,
} from '../types/index.js';
import { logger, logToolCall } from '../utils/logger.js';
import { foundryTracing } from '../services/foundry-tracing.js';

// =============================================================================
// TOOL REGISTRY CLASS
// =============================================================================

export class ToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();
  private enabledTools: Set<string> = new Set();

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

  /**
   * Set which tools are enabled for the current scenario
   */
  setEnabledTools(toolNames: string[]): void {
    this.enabledTools = new Set(toolNames);
    logger.info(`Enabled ${toolNames.length} tools for scenario`);
  }

  /**
   * Check if a tool is enabled
   */
  isEnabled(name: string): boolean {
    return this.enabledTools.has(name);
  }

  /**
   * Get tool definitions for enabled tools (for OpenAI)
   */
  getEnabledDefinitions(): ToolDefinition[] {
    return this.getAll()
      .filter(t => this.enabledTools.has(t.definition.name))
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

    // Tool not enabled for current scenario
    if (!this.isEnabled(name)) {
      const error = `Tool '${name}' is not enabled for the current scenario`;
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
        logger.info(`Normalized memberId: "${args.memberId}" \u2192 "${normalizedArgs.memberId}"`, {
          tool: name,
          sessionId: context.sessionId,
        });
      }

      // Execute the tool handler
      const result = await tool.handler(normalizedArgs, context);

      // Add metadata
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
  getSummary(): { name: string; category: ToolCategory; isMocked: boolean; enabled: boolean }[] {
    return this.getAll().map(t => ({
      name: t.definition.name,
      category: t.category,
      isMocked: t.isMocked,
      enabled: this.isEnabled(t.definition.name),
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
