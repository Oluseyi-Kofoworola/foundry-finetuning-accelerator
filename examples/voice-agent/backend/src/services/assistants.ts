/**
 * Acme Health - Assistants API Service
 * 
 * Integrates with Azure OpenAI Assistants API to leverage specialized agents:
 * - AcmeHealthCoordinator: Main orchestrator for identity verification & routing
 * - PBMPharmacyAssistant: Prescription and pharmacy services
 * - HealthPlanConcierge: Benefits and provider network
 * - ProviderAssistant: Provider-facing medical records access
 */

import OpenAI from 'openai';
import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity';
import { logger, createAuditLogger } from '../utils/logger.js';
import { getConfig } from '../utils/config.js';
import { toolRegistry } from '../tools/index.js';
import type { ToolContext } from '../types/index.js';
import * as fs from 'fs';
import * as path from 'path';

// Get directory path in CommonJS compatible way
const getCurrentDir = (): string => {
  // In production, use __dirname or fallback
  return process.cwd();
};

// =============================================================================
// TYPES
// =============================================================================

interface AgentConfig {
  id: string;
  name: string;
  model: string;
  tools_count: number;
}

interface AgentsConfig {
  AcmeHealthCoordinator: AgentConfig;
  PBMPharmacyAssistant: AgentConfig;
  HealthPlanConcierge: AgentConfig;
  ProviderAssistant: AgentConfig;
}

interface ThreadMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ToolOutput {
  tool_call_id: string;
  output: string;
}

// =============================================================================
// ASSISTANTS SERVICE
// =============================================================================

class AssistantsService {
  private client: OpenAI | null = null;
  private agents: AgentsConfig | null = null;
  private threads: Map<string, string> = new Map(); // sessionId -> threadId
  private initialized: boolean = false;
  private auditLogger = createAuditLogger();

  /**
   * Initialize the Assistants API client with Azure AD authentication
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const config = getConfig();

    try {
      // Load agent IDs from config file - try multiple locations
      const possiblePaths = [
        // Docker production: /app/agent-ids.json
        '/app/agent-ids.json',
        // Local development paths
        path.join(getCurrentDir(), 'backend', 'agent-ids.json'),
        path.join(getCurrentDir(), 'agent-ids.json'),
        path.join(process.cwd(), 'agent-ids.json'),
      ];

      let agentIdsPath: string | null = null;
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          agentIdsPath = p;
          break;
        }
      }

      if (agentIdsPath) {
        const agentData = fs.readFileSync(agentIdsPath, 'utf-8');
        this.agents = JSON.parse(agentData) as AgentsConfig;
        logger.info('Loaded agent configuration', {
          agents: Object.keys(this.agents),
          path: agentIdsPath,
        });
      } else {
        logger.warn('Agent configuration file not found', { searchedPaths: possiblePaths });
      }

      // Initialize Azure OpenAI client with managed identity
      if (config.azure?.openaiEndpoint) {
        const credential = new DefaultAzureCredential();
        const tokenProvider = getBearerTokenProvider(
          credential,
          'https://cognitiveservices.azure.com/.default'
        );

        this.client = new OpenAI({
          apiKey: '', // Not used with Azure AD
          baseURL: `${config.azure.openaiEndpoint}/openai`,
          defaultQuery: { 'api-version': '2024-05-01-preview' },
          defaultHeaders: {
            'Authorization': `Bearer ${await this.getAccessToken(tokenProvider)}`
          }
        });

        logger.info('Initialized Assistants Service with Azure AD auth', {
          endpoint: config.azure.openaiEndpoint
        });
      } else {
        logger.warn('Azure OpenAI endpoint not configured for Assistants API');
      }

      this.initialized = true;
    } catch (error) {
      logger.error('Failed to initialize Assistants Service', { error });
      throw error;
    }
  }

  /**
   * Get access token from token provider
   */
  private async getAccessToken(tokenProvider: () => Promise<string>): Promise<string> {
    return await tokenProvider();
  }

  /**
   * Get or create a thread for a session
   */
  async getOrCreateThread(sessionId: string): Promise<string> {
    if (!this.client) {
      throw new Error('Assistants Service not initialized');
    }

    // Check if thread already exists for this session
    let threadId = this.threads.get(sessionId);
    if (threadId) {
      return threadId;
    }

    // Create a new thread
    const thread = await this.client.beta.threads.create();
    threadId = thread.id;
    this.threads.set(sessionId, threadId);

    logger.info('Created new thread', { sessionId, threadId });
    return threadId;
  }

  /**
   * Select the appropriate agent based on the user's intent
   */
  selectAgent(message: string, context?: { memberId?: string; verified?: boolean }): AgentConfig {
    if (!this.agents) {
      throw new Error('Agents not loaded');
    }

    const lowerMessage = message.toLowerCase();

    // If not verified yet, always use the coordinator
    if (!context?.verified) {
      return this.agents.AcmeHealthCoordinator;
    }

    // Route based on intent
    if (
      lowerMessage.includes('prescription') ||
      lowerMessage.includes('refill') ||
      lowerMessage.includes('medication') ||
      lowerMessage.includes('pharmacy') ||
      lowerMessage.includes('drug') ||
      lowerMessage.includes('medicine')
    ) {
      return this.agents.PBMPharmacyAssistant;
    }

    if (
      lowerMessage.includes('provider') ||
      lowerMessage.includes('doctor') ||
      lowerMessage.includes('specialist') ||
      lowerMessage.includes('in-network') ||
      lowerMessage.includes('benefits') ||
      lowerMessage.includes('coverage') ||
      lowerMessage.includes('copay') ||
      lowerMessage.includes('deductible')
    ) {
      return this.agents.HealthPlanConcierge;
    }

    if (
      lowerMessage.includes('medical record') ||
      lowerMessage.includes('lab result') ||
      lowerMessage.includes('immunization') ||
      lowerMessage.includes('allergy') ||
      lowerMessage.includes('condition')
    ) {
      return this.agents.ProviderAssistant;
    }

    // Default to coordinator for general questions
    return this.agents.AcmeHealthCoordinator;
  }

  /**
   * Send a message to an assistant and get a response
   */
  async chat(
    sessionId: string,
    message: string,
    context?: { memberId?: string; verified?: boolean }
  ): Promise<string> {
    if (!this.client || !this.agents) {
      throw new Error('Assistants Service not initialized');
    }

    try {
      // Get or create thread
      const threadId = await this.getOrCreateThread(sessionId);

      // Select the appropriate agent
      const agent = this.selectAgent(message, context);
      logger.info('Selected agent', { 
        sessionId, 
        agent: agent.name,
        verified: context?.verified 
      });

      // Add user message to thread
      await this.client.beta.threads.messages.create(threadId, {
        role: 'user',
        content: message
      });

      // Create a run with the selected assistant
      let run = await this.client.beta.threads.runs.create(threadId, {
        assistant_id: agent.id
      });

      // Poll for completion, handling tool calls
      while (run.status === 'queued' || run.status === 'in_progress' || run.status === 'requires_action') {
        await this.sleep(500);

        if (run.status === 'requires_action' && run.required_action?.type === 'submit_tool_outputs') {
          // Handle tool calls
          const toolCalls = run.required_action.submit_tool_outputs.tool_calls;
          const toolOutputs = await this.executeToolCalls(toolCalls, sessionId, context?.memberId);

          // Submit tool outputs
          run = await this.client.beta.threads.runs.submitToolOutputs(threadId, run.id, {
            tool_outputs: toolOutputs
          });
        } else {
          // Refresh run status
          run = await this.client.beta.threads.runs.retrieve(threadId, run.id);
        }
      }

      if (run.status === 'completed') {
        // Get the assistant's response
        const messages = await this.client.beta.threads.messages.list(threadId, {
          limit: 1,
          order: 'desc'
        });

        const assistantMessage = messages.data[0];
        if (assistantMessage && assistantMessage.role === 'assistant') {
          const content = assistantMessage.content[0];
          if (content.type === 'text') {
            return content.text.value;
          }
        }
      }

      // Handle failed runs
      if (run.status === 'failed') {
        logger.error('Run failed', { 
          sessionId, 
          threadId, 
          error: run.last_error 
        });
        return "I apologize, but I encountered an issue processing your request. Please try again.";
      }

      return "I apologize, but I couldn't generate a response. Please try again.";

    } catch (error) {
      logger.error('Assistants chat error', { sessionId, error });
      throw error;
    }
  }

  /**
   * Execute tool calls from the assistant
   */
  private async executeToolCalls(
    toolCalls: Array<{ id: string; function: { name: string; arguments: string } }>,
    sessionId: string,
    memberId?: string
  ): Promise<ToolOutput[]> {
    const outputs: ToolOutput[] = [];

    for (const toolCall of toolCalls) {
      const { name, arguments: argsString } = toolCall.function;
      
      try {
        const args = JSON.parse(argsString);
        
        // Log the tool call
        this.auditLogger.log({
          eventType: 'tool_executed',
          sessionId,
          eventData: { toolName: name, arguments: args, memberId },
          actor: { type: 'agent' },
          outcome: 'success',
          metadata: { toolName: name, scenarioId: 'assistants-api' },
        });

        // Execute the tool using the tool registry's execute method
        const toolContext: ToolContext = {
          sessionId,
          memberId,
          scenarioId: 'assistants-api',
          timestamp: new Date(),
          auditLogger: this.auditLogger,
        };
        
        // Make sure the tool is enabled
        const tool = toolRegistry.get(name);
        if (tool) {
          // Use the registry's execute method which handles everything
          const result = await toolRegistry.execute(name, args, toolContext);
          outputs.push({
            tool_call_id: toolCall.id,
            output: JSON.stringify(result)
          });
        } else {
          logger.warn('Tool not found in registry', { name });
          outputs.push({
            tool_call_id: toolCall.id,
            output: JSON.stringify({ error: `Tool ${name} not found` })
          });
        }
      } catch (error) {
        logger.error('Tool execution error', { toolCall: name, error });
        outputs.push({
          tool_call_id: toolCall.id,
          output: JSON.stringify({ error: 'Tool execution failed' })
        });
      }
    }

    return outputs;
  }

  /**
   * Clear a session's thread
   */
  async clearSession(sessionId: string): Promise<void> {
    const threadId = this.threads.get(sessionId);
    if (threadId && this.client) {
      try {
        await this.client.beta.threads.del(threadId);
        this.threads.delete(sessionId);
        logger.info('Cleared session thread', { sessionId, threadId });
      } catch (error) {
        logger.error('Failed to delete thread', { sessionId, threadId, error });
      }
    }
  }

  /**
   * Get available agents info
   */
  getAgents(): AgentsConfig | null {
    return this.agents;
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.initialized && this.client !== null && this.agents !== null;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const assistantsService = new AssistantsService();
