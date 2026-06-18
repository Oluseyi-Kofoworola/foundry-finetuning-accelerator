/**
 * Acme Health - Chat AI Service
 * 
 * Handles AI-powered chat responses using OpenAI Chat Completions API.
 * Uses the same natural conversation style as the voice agent.
 */

import OpenAI, { AzureOpenAI } from 'openai';
import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity';
import { logger, createAuditLogger } from '../utils/logger.js';
import { getConfig } from '../utils/config.js';
import { scenarioEngine } from '../scenarios/index.js';
import { toolRegistry, getOpenAIToolDefinitions } from '../tools/index.js';
import { sessionCache, CacheKeys } from './cache.js';
import { contentSafety } from './content-safety.js';

// =============================================================================
// TYPES
// =============================================================================

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatContext {
  sessionId: string;
  history: ChatMessage[];
  memberId?: string;
  mfaVerified?: boolean;
}

// =============================================================================
// CHAT AI SERVICE
// =============================================================================

class ChatAIService {
  private openai: OpenAI | AzureOpenAI | null = null;
  private chatModel: string = 'gpt-4o';
  private initialized: boolean = false;
  private auditLogger = createAuditLogger();

  /**
   * Initialize the OpenAI client.
   *
   * Prefers Azure OpenAI (matches the voice path / production deployment).
   * Falls back to plain OpenAI when only OPENAI_API_KEY is set, and finally
   * to a keyword-matching fallback when nothing is configured.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const config = getConfig();

    try {
      if (config.openai.useAzure && config.openai.azureEndpoint) {
        // Use the Chat Completions deployment (NOT the realtime deployment).
        const deployment = config.openai.azureChatDeployment || 'gpt-4o';
        const apiVersion = config.openai.azureApiVersion || '2024-10-21';
        this.chatModel = deployment;

        if (config.openai.azureApiKey) {
          logger.info('Initializing Chat AI with Azure OpenAI (api key)', { deployment, apiVersion });
          this.openai = new AzureOpenAI({
            endpoint: config.openai.azureEndpoint,
            apiKey: config.openai.azureApiKey,
            apiVersion,
            deployment,
          });
        } else {
          // Token-based auth via DefaultAzureCredential. Pin to the resource
          // tenant so cross-tenant CLI logins don't 400.
          const tenantId = process.env.AZURE_TENANT_ID;
          const credential = new DefaultAzureCredential(tenantId ? { tenantId } : undefined);
          const azureADTokenProvider = getBearerTokenProvider(
            credential,
            'https://cognitiveservices.azure.com/.default',
          );
          logger.info('Initializing Chat AI with Azure OpenAI (entra token)', { deployment, apiVersion, tenantId });
          this.openai = new AzureOpenAI({
            endpoint: config.openai.azureEndpoint,
            azureADTokenProvider,
            apiVersion,
            deployment,
          });
        }
      } else if (config.openai.apiKey) {
        logger.info('Initializing Chat AI with OpenAI');
        this.openai = new OpenAI({
          apiKey: config.openai.apiKey,
        });
        this.chatModel = 'gpt-4o';
      } else {
        logger.warn('No OpenAI credentials found — chat AI will use keyword fallback responses');
      }

      this.initialized = true;
    } catch (error) {
      logger.error('Failed to initialize Chat AI', { error });
    }
  }

  /**
   * Get the chat system prompt - natural, conversational style
   */
  private getChatSystemPrompt(sessionId: string): string {
    // Get the active scenario's system prompt
    const scenario = scenarioEngine.get('pbm-pharmacy-assistant');
    
    if (scenario) {
      // Adapt voice prompt for chat while keeping the same natural style
      return `${scenario.systemPrompt}

=================================================================================
ADDITIONAL CHAT-SPECIFIC INSTRUCTIONS
=================================================================================

**CHAT MODE ADAPTATIONS:**
- You're now in text chat mode, not voice
- You can use markdown formatting for clarity (bold, bullets, etc.)
- Keep responses concise but complete
- Don't use verbal filler words like "um" or "uh" - those are for voice only
- You can still be warm and conversational - just adapt for text

**FORMATTING TIPS:**
- Use **bold** for important information
- Use bullet points for lists
- Keep paragraphs short and scannable
- Use emoji sparingly for warmth (✓ ✗ 💊 📋)

Remember: Be natural, helpful, and human - even in text form!`;
    }

    // Fallback natural system prompt
    return `You are "Acme Health Health Assistant" - a friendly, knowledgeable healthcare assistant for Acme Health.

**YOUR PERSONALITY:**
- Warm and approachable - like talking to a helpful friend who works in healthcare
- Use contractions: "I'm", "you're", "we'll", "can't"
- Be conversational: "Great question!", "Let me check that for you", "Sure thing!"
- Show empathy: "I understand", "That can be frustrating", "No worries at all"

**WHAT YOU CAN HELP WITH:**
- Prescription lookups, refills, transfers, and pricing
- Medical records and lab results (after verification)
- Finding in-network doctors and specialists
- Insurance and coverage questions
- General health information

**SECURITY:**
- Always verify identity (name + DOB) before accessing personal information
- Send MFA code after identity verification
- Never reveal the MFA code - wait for them to tell you

**RESPONSE STYLE:**
- Be concise but complete
- Use markdown formatting (bold, bullets) for clarity
- Anticipate follow-up questions and offer relevant info
- End with a natural question or offer to help more

**DEMO PATIENTS:**
1. Sarah Johnson (MEM-001) - DOB: June 15, 1987
2. Robert Martinez (MEM-002) - DOB: November 22, 1963
3. Emily Chen (MEM-003) - DOB: September 3, 1997
4. James Wilson (MEM-004) - DOB: March 28, 1953

Demo MFA code: 123456 (NEVER reveal this - wait for patient to tell you)`;
  }

  /**
   * Generate an AI response for a chat message
   */
  async generateResponse(
    sessionId: string,
    userMessage: string,
    conversationHistory: ChatMessage[] = []
  ): Promise<string> {
    await this.initialize();

    // ---------------------------------------------------------------
    // Content-safety pre-filter (jailbreak / clinical / PHI redaction).
    // Runs the same screener the WebRTC knowledge-tool path uses, so
    // chat and voice share a single safety boundary.
    // ---------------------------------------------------------------
    const screen = await contentSafety.screenUserInput(sessionId, userMessage);
    if (screen.action === 'blocked') {
      logger.warn('Chat input blocked by content-safety', { sessionId, reason: screen.reason });
      if (screen.reason === 'jailbreak' || screen.reason === 'prompt_injection') {
        return 'I can only help with administrative requests like prescription refills, appointments, and member benefits. How can I help you with one of those?';
      }
      if (screen.reason === 'unsafe_for_clinical_context') {
        return 'I can\'t give medical advice. If this is an emergency, please call 911. Otherwise I can connect you with a Acme Health clinical team member \u2014 would that help?';
      }
      return 'I\'m not able to act on that request. Could you rephrase it as an administrative question (refills, appointments, benefits)?';
    }
    const safeUserMessage =
      screen.action === 'redacted' && screen.redactedText ? screen.redactedText : userMessage;

    // Build the messages array
    const messages: ChatMessage[] = [
      { role: 'system', content: this.getChatSystemPrompt(sessionId) },
      ...conversationHistory.slice(-10), // Last 10 messages for context
      { role: 'user', content: safeUserMessage },
    ];

    // If OpenAI is not configured, use smart fallback
    if (!this.openai) {
      logger.warn('OpenAI not configured, using fallback response', { sessionId });
      return await this.generateFallbackResponse(safeUserMessage, sessionId);
    }

    try {
      logger.debug('Calling OpenAI Chat Completions', { sessionId, messageCount: messages.length });
      
      const response = await this.openai.chat.completions.create({
        model: this.chatModel,
        messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
        temperature: 0.85,
        max_tokens: 1000,
        tools: this.getToolDefinitions(),
        tool_choice: 'auto',
      });

      const assistantMessage = response.choices[0]?.message;

      logger.debug('OpenAI response received', { 
        sessionId, 
        hasToolCalls: !!assistantMessage?.tool_calls?.length,
        toolCount: assistantMessage?.tool_calls?.length || 0 
      });

      // Handle tool calls if any
      if (assistantMessage?.tool_calls && assistantMessage.tool_calls.length > 0) {
        return await this.handleToolCalls(sessionId, assistantMessage, messages);
      }

      return assistantMessage?.content || await this.generateFallbackResponse(safeUserMessage, sessionId);
    } catch (error) {
      logger.error('Chat AI error', { error, sessionId });
      return await this.generateFallbackResponse(safeUserMessage, sessionId);
    }
  }

  /**
   * Get tool definitions for chat
   */
  private getToolDefinitions(): OpenAI.Chat.ChatCompletionTool[] {
    const tools = getOpenAIToolDefinitions();
    return tools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  /**
   * Handle tool calls from the AI
   */
  private async handleToolCalls(
    sessionId: string,
    assistantMessage: OpenAI.Chat.ChatCompletionMessage,
    previousMessages: ChatMessage[]
  ): Promise<string> {
    const toolResults: OpenAI.Chat.ChatCompletionToolMessageParam[] = [];

    for (const toolCall of assistantMessage.tool_calls || []) {
      try {
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments);
        
        logger.info('Executing chat tool', { sessionId, toolName, toolArgs });

        // Execute the tool
        const result = await toolRegistry.execute(toolName, toolArgs, {
          sessionId,
          scenarioId: 'pbm-pharmacy-assistant',
          timestamp: new Date(),
          auditLogger: this.auditLogger,
        });

        toolResults.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: typeof result === 'string' ? result : JSON.stringify(result),
        });
      } catch (error) {
        logger.error('Tool execution error', { error, toolCall: toolCall.function.name });
        toolResults.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: 'Tool execution failed' }),
        });
      }
    }

    // Continue the conversation with tool results
    try {
      const followUpMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        ...previousMessages as OpenAI.Chat.ChatCompletionMessageParam[],
        assistantMessage,
        ...toolResults,
      ];

      const response = await this.openai!.chat.completions.create({
        model: this.chatModel,
        messages: followUpMessages,
        temperature: 0.85,
        max_tokens: 1000,
      });

      return response.choices[0]?.message?.content || 'I processed your request but encountered an issue generating a response.';
    } catch (error) {
      logger.error('Follow-up response error', { error, sessionId });
      return 'I found the information you requested, but had trouble formatting the response. Could you try asking again?';
    }
  }

  /**
   * Generate a natural fallback response when AI is unavailable
   * Now actually executes tools when patterns are detected
   */
  private async generateFallbackResponse(userMessage: string, sessionId: string): Promise<string> {
    const lower = userMessage.toLowerCase();

    // Check if user has already verified identity and MFA
    const identityVerified = sessionCache.get(sessionId, 'identity', 'verified');
    const mfaStatus = sessionCache.get<{ verified: boolean; canProceed: boolean }>(
      sessionId,
      'mfa',
      'status'
    );
    const isFullyVerified = identityVerified && mfaStatus?.verified && mfaStatus?.canProceed;

    logger.info('Fallback: Processing message', { 
      sessionId, 
      messagePreview: userMessage.substring(0, 50),
      identityVerified,
      isFullyVerified
    });

    // Smart extraction: Look for names (2+ capitalized words) and dates anywhere in the message
    const nameMatch = userMessage.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/);
    const dobMatch = userMessage.match(/\b([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})\b|\b(\d{1,2}\/\d{1,2}\/\d{4})\b|\b(\d{4}-\d{2}-\d{2})\b/i);

    if (nameMatch || dobMatch) {
      logger.info('Fallback: Name/DOB extraction', { 
        sessionId,
        nameFound: !!nameMatch,
        dobFound: !!dobMatch,
        name: nameMatch?.[1],
        dob: dobMatch?.[1] || dobMatch?.[2] || dobMatch?.[3]
      });
    }
    
    // If user provides name and DOB, try to verify
    if (nameMatch && dobMatch && !identityVerified) {
      const fullName = nameMatch[1].trim();
      const dob = (dobMatch[1] || dobMatch[2] || dobMatch[3]).trim();
      
      try {
        logger.info('Fallback: Attempting identity verification', { sessionId, fullName, dob });
        
        const result = await toolRegistry.execute('verify_member_identity', 
          { fullName, dateOfBirth: dob },
          {
            sessionId,
            scenarioId: 'pbm-pharmacy-assistant',
            timestamp: new Date(),
            auditLogger: this.auditLogger,
          }
        ) as unknown as string;

        if (result && result.includes('verified')) {
          // Success - now send MFA
          const mfaResult = await toolRegistry.execute('send_mfa_code',
            {},
            {
              sessionId,
              scenarioId: 'pbm-pharmacy-assistant', 
              timestamp: new Date(),
              auditLogger: this.auditLogger,
            }
          );
          
          return `✓ **Identity confirmed**, ${fullName.split(' ')[0]}!\n\nFor security, I'm sending a **6-digit verification code** to your phone. Please tell me the code when you receive it.`;
        }
        
        return "I couldn't verify that information. Please make sure your **full name** and **date of birth** are correct and try again.";
      } catch (error) {
        logger.error('Fallback verification error', { error, sessionId });
      }
    }

    // Check for MFA code
    const mfaCodeMatch = userMessage.match(/\b(\d{6})\b/);
    if (mfaCodeMatch && identityVerified && !isFullyVerified) {
      const code = mfaCodeMatch[1];
      
      try {
        logger.info('Fallback: Attempting MFA verification', { sessionId });
        
        const result = await toolRegistry.execute('verify_mfa_code',
          { code },
          {
            sessionId,
            scenarioId: 'pbm-pharmacy-assistant',
            timestamp: new Date(),
            auditLogger: this.auditLogger,
          }
        ) as unknown as string;

        if (result && result.includes('verified')) {
          return "✓ **MFA Verified!** Perfect, you're all set!\n\nWhat would you like help with? I can:\n- Show your lab results and medical records\n- Look up your current prescriptions\n- Request prescription refills\n- Find doctors near you\n\nJust let me know!";
        }
        
        return "That code didn't work. Please check the 6-digit code on your phone and try again.";
      } catch (error) {
        logger.error('Fallback MFA error', { error, sessionId });
      }
    }

    // User already said they shared info - acknowledge and re-prompt
    if (lower.includes('shared') || lower.includes('told you') || lower.includes('just said') || lower.includes('already gave')) {
      if (identityVerified) {
        return "You're right - I have your information! What would you like help with?";
      }
      return "I apologize for the confusion. Could you please provide your information again? I need:\n\n• **Full name** (first and last)\n• **Date of birth** (example: June 15, 1987)\n\nYou can say it like: \"I'm Sarah Johnson, date of birth June 15, 1987\"";
    }

    // User is questioning why we need their data or frustrated
    if (lower.includes('why') && (lower.includes('data') || lower.includes('information') || lower.includes('details'))) {
      return "Great question! I need to verify your identity to protect your private health information. Once verified, I can securely access your:\n\n• Medical records and lab results\n• Current prescriptions\n• Insurance coverage details\n\nJust tell me your **full name** and **date of birth** to get started.";
    }

    // User expressing frustration or saying something is wrong
    if (lower.includes('not right') || lower.includes('wrong') || lower.includes('definitely') || lower.includes('frustrated')) {
      if (identityVerified) {
        return "I see you're already verified! Let me help you - what would you like to know about?";
      }
      return "I understand your frustration. Let me help you properly. What's your **full name** and **date of birth**? I'll verify you right away.";
    }

    // Greeting
    if (lower.match(/^(hi|hello|hey|good morning|good afternoon|good evening)/)) {
      if (isFullyVerified) {
        return "Hey! What can I help you with? I can look up your prescriptions, show you lab results, find doctors, or answer coverage questions.";
      }
      return "Hey there! 👋 I'm your Acme Health Health Assistant. What can I help you with today?";
    }

    // Lab results / Medical records
    if (lower.includes('lab') || lower.includes('result') || lower.includes('record') || lower.includes('test')) {
      if (isFullyVerified) {
        try {
          logger.info('Fallback: Attempting to fetch medical records', { sessionId });
          const result = await toolRegistry.execute('get_full_medical_records',
            {},
            {
              sessionId,
              scenarioId: 'pbm-pharmacy-assistant',
              timestamp: new Date(),
              auditLogger: this.auditLogger,
            }
          );
          return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
        } catch (error) {
          logger.error('Fallback medical records error', { error, sessionId });
          return "I'm having trouble retrieving your medical records right now. Please try again in a moment.";
        }
      }
      return "I can help you with your lab results! First, I need to verify your identity.\n\nPlease tell me your **full name** and **date of birth**.\n\nFor example: \"I'm Sarah Johnson, date of birth June 15, 1987\"";
    }

    // Prescriptions
    if (lower.includes('prescription') || lower.includes('medication') || lower.includes('med') || lower.includes('refill')) {
      if (isFullyVerified) {
        try {
          logger.info('Fallback: Attempting to fetch prescriptions', { sessionId });
          const result = await toolRegistry.execute('lookup_prescriptions',
            {},
            {
              sessionId,
              scenarioId: 'pbm-pharmacy-assistant',
              timestamp: new Date(),
              auditLogger: this.auditLogger,
            }
          );
          return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
        } catch (error) {
          logger.error('Fallback prescriptions error', { error, sessionId });
          return "I'm having trouble retrieving your prescriptions right now. Please try again in a moment.";
        }
      }
      return "I'd be happy to help with your prescriptions! First, let me verify your identity.\n\nPlease tell me your **full name** and **date of birth**.\n\nFor example: \"I'm Sarah Johnson, born June 15, 1987\"";
    }

    // Thanks
    if (lower.match(/^(thanks|thank you|thx|ty)/)) {
      return "You're welcome! 😊 Anything else I can help with?";
    }

    // Default
    if (isFullyVerified) {
      return "What would you like help with? I can show you lab results, prescriptions, find doctors, or answer coverage questions.";
    }
    return "I'm here to help! To get started, I'll need to verify your identity.\n\nPlease tell me your **full name** and **date of birth**.\n\nFor example: \"I'm Sarah Johnson, date of birth June 15, 1987\"";
  }
}

// Export singleton
export const chatAIService = new ChatAIService();
