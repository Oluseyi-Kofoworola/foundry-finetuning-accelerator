/**
 * Acme Health - OpenAI Realtime Service
 * 
 * Handles connection to OpenAI's Realtime API for voice-to-voice
 * conversations with function calling support.
 * 
 * Supports both standard OpenAI and Azure OpenAI with managed identity.
 */

import OpenAI from 'openai';
import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { DefaultAzureCredential } from '@azure/identity';
import type {
  ToolContext,
  SessionState,
  ScenarioDefinition,
} from '../types/index.js';
import { logger } from '../utils/logger.js';
import { getConfig } from '../utils/config.js';
import { toolRegistry, getOpenAIToolDefinitions } from '../tools/index.js';
import { sessionManager } from './session-manager.js';

// =============================================================================
// TYPES
// =============================================================================

export interface RealtimeEvents {
  'audio.delta': { audio: string };
  'audio.done': void;
  'transcript.partial': { text: string; role: 'user' | 'assistant' };
  'transcript.done': { text: string; role: 'user' | 'assistant' };
  'tool.call': { name: string; arguments: string; callId: string };
  'response.done': void;
  'error': { message: string; code?: string };
  'session.created': { sessionId: string };
  'speech.started': void;
  'speech.stopped': void;
}

// =============================================================================
// REALTIME SERVICE
// =============================================================================

export class OpenAIRealtimeService extends EventEmitter {
  private ws: WebSocket | null = null;
  private sessionId: string;
  private scenario: ScenarioDefinition;
  private openai: OpenAI | null = null;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 3;

  constructor(sessionId: string, scenario: ScenarioDefinition) {
    super();
    this.sessionId = sessionId;
    this.scenario = scenario;
    
    const config = getConfig();
    
    // Only create OpenAI client if not using Azure (for potential non-realtime operations)
    if (!config.openai.useAzure && config.openai.apiKey) {
      this.openai = new OpenAI({
        apiKey: config.openai.apiKey,
      });
    }
  }

  /**
   * Get Azure access token using managed identity
   */
  private async getAzureAccessToken(): Promise<string> {
    // Pin to the resource tenant; see realtime-webrtc.ts getEntraToken for
    // the cross-tenant rationale.
    const tenantId = process.env.AZURE_TENANT_ID;
    const credential = new DefaultAzureCredential(tenantId ? { tenantId } : undefined);
    const tokenResponse = await credential.getToken('https://cognitiveservices.azure.com/.default');
    return tokenResponse.token;
  }

  /**
   * Connect to OpenAI Realtime API (supports both OpenAI and Azure OpenAI)
   */
  async connect(): Promise<void> {
    const config = getConfig();

    let url: string;
    let headers: Record<string, string>;

    if (config.openai.useAzure) {
      // Azure OpenAI Realtime API
      if (!config.openai.azureEndpoint) {
        throw new Error('Azure OpenAI endpoint not configured');
      }

      // Azure OpenAI Realtime WebSocket URL
      // 2025-04-01-preview adds semantic_vad (model-based turn detection)
      // which is the right knob for "let the user finish their thought."
      const endpoint = config.openai.azureEndpoint.replace(/^https?:\/\//, '').replace(/\/$/, '');
      const deployment = config.openai.azureDeployment || 'gpt-4o-realtime';
      url = `wss://${endpoint}/openai/realtime?api-version=2025-04-01-preview&deployment=${deployment}`;

      // Use API key if provided, otherwise use managed identity
      if (config.openai.azureApiKey) {
        headers = {
          'api-key': config.openai.azureApiKey,
        };
        logger.info('Connecting to Azure OpenAI Realtime API with API key', {
          endpoint: config.openai.azureEndpoint,
          deployment,
          sessionId: this.sessionId,
        });
      } else {
        // Use managed identity for authentication
        const accessToken = await this.getAzureAccessToken();
        headers = {
          'Authorization': `Bearer ${accessToken}`,
        };
        logger.info('Connecting to Azure OpenAI Realtime API with managed identity', {
          endpoint: config.openai.azureEndpoint,
          deployment,
          sessionId: this.sessionId,
        });
      }
    } else {
      // Standard OpenAI Realtime API
      if (!config.openai.apiKey) {
        throw new Error('OpenAI API key not configured');
      }

      url = 'wss://api.openai.com/v1/realtime?model=' + config.openai.realtimeModel;
      headers = {
        'Authorization': `Bearer ${config.openai.apiKey}`,
        'OpenAI-Beta': 'realtime=v1',
      };

      logger.info('Connecting to OpenAI Realtime API', {
        model: config.openai.realtimeModel,
        sessionId: this.sessionId,
      });
    }

    try {
      this.ws = new WebSocket(url, { headers });

      this.setupWebSocketHandlers();

      // Wait for connection
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 10000);

        this.ws!.once('open', () => {
          clearTimeout(timeout);
          this.isConnected = true;
          this.reconnectAttempts = 0;
          resolve();
        });

        this.ws!.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

      // Initialize the session
      await this.initializeSession();

      logger.info(`OpenAI Realtime connected for session: ${this.sessionId}`, {
        useAzure: config.openai.useAzure,
      });
    } catch (error) {
      logger.error('Failed to connect to OpenAI Realtime', {
        error: error instanceof Error ? error.message : String(error),
        sessionId: this.sessionId,
        useAzure: config.openai.useAzure,
      });
      throw error;
    }
  }

  /**
   * Initialize the realtime session with tools and instructions
   */
  private async initializeSession(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    // Get tool definitions for this scenario
    const tools = getOpenAIToolDefinitions();
    
    // Log the tools being sent to OpenAI for debugging
    logger.info('Tools being sent to OpenAI', {
      sessionId: this.sessionId,
      scenarioId: this.scenario.id,
      toolCount: tools.length,
      toolNames: tools.map(t => t.name),
    });

    // Build turn-detection block from feature flags so demo operators can
    // hot-swap detector type / eagerness via env without touching code.
    const config = getConfig();
    const features = config.features;
    const turnDetection = features.turnDetectionType === 'semantic_vad'
      ? {
          type: 'semantic_vad' as const,
          eagerness: features.semanticVadEagerness,
          create_response: true,
          interrupt_response: true,
        }
      : {
          type: 'server_vad' as const,
          threshold: features.serverVadThreshold,
          prefix_padding_ms: features.serverVadPrefixPaddingMs,
          silence_duration_ms: features.serverVadSilenceMs,
          create_response: true,
        };

    // Send session configuration
    // semantic_vad (default) waits until the caller has actually finished
    // their thought instead of jumping in on a brief pause; eagerness=low
    // favors patience. Switch via TURN_DETECTION_TYPE / SEMANTIC_VAD_EAGERNESS.
    const sessionConfig = {
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: this.scenario.systemPrompt,
        voice: this.scenario.voice.voiceId,
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: {
          model: 'whisper-1',
        },
        turn_detection: turnDetection,
        tools: tools,
        tool_choice: 'auto',
        temperature: this.scenario.voice.temperature,
      },
    };

    this.sendMessage(sessionConfig);
    logger.debug('Session initialized with configuration', {
      sessionId: this.sessionId,
      toolCount: tools.length,
    });
    logger.info('Realtime turn-detection configured', {
      sessionId: this.sessionId,
      type: turnDetection.type,
      eagerness: 'eagerness' in turnDetection ? turnDetection.eagerness : undefined,
      silenceMs: 'silence_duration_ms' in turnDetection ? turnDetection.silence_duration_ms : undefined,
    });
  }

  /**
   * Setup WebSocket event handlers
   */
  private setupWebSocketHandlers(): void {
    if (!this.ws) return;

    this.ws.on('message', async (data: Buffer) => {
      try {
        const event = JSON.parse(data.toString());
        await this.handleServerEvent(event);
      } catch (error) {
        logger.error('Failed to parse WebSocket message', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    this.ws.on('close', (code, reason) => {
      this.isConnected = false;
      logger.info('WebSocket closed', {
        sessionId: this.sessionId,
        code,
        reason: reason.toString(),
      });
      this.emit('disconnected', { code, reason: reason.toString() });
    });

    this.ws.on('error', (error) => {
      logger.error('WebSocket error', {
        sessionId: this.sessionId,
        error: error.message,
      });
      this.emit('error', { message: error.message });
    });
  }

  /**
   * Handle events from OpenAI Realtime server
   */
  private async handleServerEvent(event: any): Promise<void> {
    switch (event.type) {
      case 'session.created':
        this.emit('session.created', { sessionId: this.sessionId });
        break;

      case 'response.audio.delta':
        // Streaming audio chunk
        if (event.delta) {
          this.emit('audio.delta', { audio: event.delta });
        }
        break;

      case 'response.audio.done':
        this.emit('audio.done');
        break;

      case 'response.audio_transcript.delta':
        // Partial transcript of assistant speech
        if (event.delta) {
          this.emit('transcript.partial', {
            text: event.delta,
            role: 'assistant',
          });
        }
        break;

      case 'response.audio_transcript.done':
        // Final transcript of assistant speech
        if (event.transcript) {
          this.emit('transcript.done', {
            text: event.transcript,
            role: 'assistant',
          });
          // Add to conversation history
          sessionManager.addTurn(this.sessionId, {
            role: 'assistant',
            content: event.transcript,
          });
        }
        break;

      case 'conversation.item.input_audio_transcription.completed':
        // Transcript of user speech
        if (event.transcript) {
          this.emit('transcript.done', {
            text: event.transcript,
            role: 'user',
          });
          // Add to conversation history
          sessionManager.addTurn(this.sessionId, {
            role: 'user',
            content: event.transcript,
          });
        }
        break;

      case 'response.function_call_arguments.done':
        // Function call completed - execute the tool
        await this.handleFunctionCall(event);
        break;

      case 'input_audio_buffer.speech_started':
        this.emit('speech.started');
        break;

      case 'input_audio_buffer.speech_stopped':
        this.emit('speech.stopped');
        break;

      case 'response.done':
        this.emit('response.done');
        break;

      case 'error':
        logger.error('OpenAI Realtime error', {
          sessionId: this.sessionId,
          error: event.error,
        });
        this.emit('error', {
          message: event.error?.message || 'Unknown error',
          code: event.error?.code,
        });
        break;

      default:
        // Log unhandled events in debug mode
        logger.debug('Unhandled OpenAI event', { type: event.type });
    }
  }

  /**
   * Handle function/tool calls from the model
   */
  private async handleFunctionCall(event: any): Promise<void> {
    const { name, arguments: argsString, call_id } = event;

    logger.info('Function call received', {
      sessionId: this.sessionId,
      toolName: name,
    });

    this.emit('tool.call', { name, arguments: argsString, callId: call_id });

    try {
      // Parse arguments
      const args = JSON.parse(argsString);

      // Get session for context
      const session = sessionManager.get(this.sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      // Create tool context
      const context: ToolContext = {
        sessionId: this.sessionId,
        memberId: session.memberContext?.memberId,
        scenarioId: session.scenarioId,
        timestamp: new Date(),
        auditLogger: sessionManager.getAuditLogger(),
      };

      // Execute the tool
      const result = await toolRegistry.execute(name, args, context);
      sessionManager.incrementToolCalls(this.sessionId);

      // Send the result back to OpenAI
      this.sendMessage({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: call_id,
          output: JSON.stringify(result.data),
        },
      });

      // Trigger a response from the model
      this.sendMessage({
        type: 'response.create',
      });

      // If this was member verification, update session context
      if (name === 'verify_member_identity' && result.success && result.data) {
        const verifyResult = result.data as any;
        if (verifyResult.verified) {
          sessionManager.setMemberContext(this.sessionId, {
            memberId: verifyResult.memberId,
            preferredName: verifyResult.preferredName,
            planType: verifyResult.planType,
            state: verifyResult.state,
            isVerified: true,
            verifiedAt: new Date(),
          });
        }
      }
    } catch (error) {
      logger.error('Function call execution failed', {
        sessionId: this.sessionId,
        toolName: name,
        error: error instanceof Error ? error.message : String(error),
      });

      // Send error result back to OpenAI
      this.sendMessage({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: call_id,
          output: JSON.stringify({
            success: false,
            error: 'Tool execution failed',
          }),
        },
      });

      this.sendMessage({
        type: 'response.create',
      });
    }
  }

  /**
   * Send audio data to the model
   */
  sendAudio(audioBase64: string): void {
    if (!this.isConnected) return;

    this.sendMessage({
      type: 'input_audio_buffer.append',
      audio: audioBase64,
    });
  }

  /**
   * Commit the audio buffer (trigger processing)
   */
  commitAudio(): void {
    if (!this.isConnected) return;
    this.sendMessage({ type: 'input_audio_buffer.commit' });
  }

  /**
   * Send a text message
   */
  sendText(text: string): void {
    if (!this.isConnected) return;

    // Add user message
    this.sendMessage({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: text,
          },
        ],
      },
    });

    // Trigger response
    this.sendMessage({
      type: 'response.create',
    });

    // Add to history
    sessionManager.addTurn(this.sessionId, {
      role: 'user',
      content: text,
    });
  }

  /**
   * Cancel the current response (for barge-in)
   */
  cancelResponse(): void {
    if (!this.isConnected) return;
    this.sendMessage({ type: 'response.cancel' });
  }

  /**
   * Clear the audio input buffer
   */
  clearAudioBuffer(): void {
    if (!this.isConnected) return;
    this.sendMessage({ type: 'input_audio_buffer.clear' });
  }

  /**
   * Send a message to the WebSocket
   */
  private sendMessage(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Disconnect from the Realtime API
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.removeAllListeners();
  }

  /**
   * Check if connected
   */
  get connected(): boolean {
    return this.isConnected;
  }
}

// Factory function for creating realtime service instances
export function createRealtimeService(
  sessionId: string,
  scenario: ScenarioDefinition
): OpenAIRealtimeService {
  return new OpenAIRealtimeService(sessionId, scenario);
}
