/**
 * Acme Health - WebSocket Handler
 * 
 * Handles WebSocket connections from clients and bridges
 * to the OpenAI Realtime API for voice conversations.
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';
import { getConfig } from '../utils/config.js';
import { sessionManager } from '../services/session-manager.js';
import { createRealtimeService, OpenAIRealtimeService } from '../services/openai-realtime.js';
import { scenarioEngine } from '../scenarios/engine.js';
import type { WSMessage } from '../types/index.js';

// =============================================================================
// TYPES
// =============================================================================

interface ClientConnection {
  ws: WebSocket;
  sessionId: string | null;
  realtimeService: OpenAIRealtimeService | null;
  isAlive: boolean;
}

// =============================================================================
// WEBSOCKET SERVER
// =============================================================================

export class VoiceAgentWebSocketServer {
  private wss: WebSocketServer;
  private clients: Map<WebSocket, ClientConnection> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.setupServer();
    this.startHeartbeat();
    logger.info('WebSocket server initialized on /ws');
  }

  /**
   * Setup WebSocket server event handlers
   */
  private setupServer(): void {
    this.wss.on('connection', (ws: WebSocket, req) => {
      const clientId = uuidv4().substring(0, 8);
      logger.info(`Client connected: ${clientId}`, {
        origin: req.headers.origin,
        ip: req.socket.remoteAddress,
      });

      // Initialize client connection
      const client: ClientConnection = {
        ws,
        sessionId: null,
        realtimeService: null,
        isAlive: true,
      };
      this.clients.set(ws, client);

      // Setup event handlers
      ws.on('message', (data: Buffer) => {
        this.handleMessage(client, data);
      });

      ws.on('close', () => {
        this.handleClose(client);
      });

      ws.on('error', (error) => {
        logger.error('Client WebSocket error', {
          clientId,
          error: error.message,
        });
      });

      ws.on('pong', () => {
        client.isAlive = true;
      });

      // Send initial connection acknowledgment
      this.send(ws, {
        type: 'connection.established',
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        payload: {
          message: "Connected to Acme Health Voice Agent",
          scenarios: scenarioEngine.getScenarioList(),
        },
      });
    });
  }

  /**
   * Handle incoming messages from clients
   */
  private async handleMessage(client: ClientConnection, data: Buffer): Promise<void> {
    try {
      const message = JSON.parse(data.toString()) as WSMessage & { payload?: any };

      switch (message.type) {
        case 'session.create':
          await this.handleSessionCreate(client, message);
          break;

        case 'consent.provide':
          await this.handleConsent(client, message);
          break;

        case 'audio.input':
          this.handleAudioInput(client, message);
          break;

        case 'text.input':
          await this.handleTextInput(client, message);
          break;

        case 'audio.commit':
          this.handleAudioCommit(client);
          break;

        case 'response.cancel':
          this.handleResponseCancel(client);
          break;

        case 'scenario.switch':
          await this.handleScenarioSwitch(client, message);
          break;

        case 'scenario.list':
          this.handleScenarioList(client);
          break;

        case 'session.end':
          await this.handleSessionEnd(client);
          break;

        default:
          logger.warn('Unknown message type', { type: message.type });
      }
    } catch (error) {
      logger.error('Failed to handle message', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.sendError(client.ws, 'INVALID_MESSAGE', 'Failed to process message');
    }
  }

  /**
   * Handle session creation
   */
  private async handleSessionCreate(
    client: ClientConnection,
    message: any
  ): Promise<void> {
    const config = getConfig();
    const { scenarioId, userId } = message.payload || {};

    const effectiveScenarioId = scenarioId || config.demo.defaultScenario;

    try {
      // Activate the scenario
      const scenario = scenarioEngine.activate(effectiveScenarioId);

      // Create session
      const session = await sessionManager.create(effectiveScenarioId, userId);
      client.sessionId = session.id;

      // Create and connect realtime service
      client.realtimeService = createRealtimeService(session.id, scenario);
      
      // Setup realtime service event handlers
      this.setupRealtimeHandlers(client);

      // Connect to OpenAI
      await client.realtimeService.connect();

      // Send session created response
      this.send(client.ws, {
        type: 'session.created',
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        payload: {
          sessionId: session.id,
          scenario: {
            id: scenario.id,
            name: scenario.name,
            conversationStarters: scenario.conversationStarters,
          },
          requiresConsent: config.security.requireConsent && !session.consentGiven,
          consentMessage: config.security.requireConsent
            ? this.getConsentMessage()
            : null,
        },
      });

      logger.info(`Session created for client`, {
        sessionId: session.id,
        scenarioId: effectiveScenarioId,
      });
    } catch (error) {
      logger.error('Failed to create session', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.sendError(client.ws, 'SESSION_CREATE_FAILED', 'Failed to create session');
    }
  }

  /**
   * Handle consent provision
   */
  private async handleConsent(client: ClientConnection, message: any): Promise<void> {
    if (!client.sessionId) {
      this.sendError(client.ws, 'NO_SESSION', 'No active session');
      return;
    }

    const success = await sessionManager.recordConsent(client.sessionId);

    if (success) {
      this.send(client.ws, {
        type: 'consent.confirmed',
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        payload: {
          message: 'Consent recorded. You may now begin the conversation.',
        },
      });
    } else {
      this.sendError(client.ws, 'CONSENT_FAILED', 'Failed to record consent');
    }
  }

  /**
   * Handle audio input from client
   */
  private handleAudioInput(client: ClientConnection, message: any): void {
    if (!client.realtimeService || !client.sessionId) {
      return;
    }

    // Check consent
    const session = sessionManager.get(client.sessionId);
    if (session && !session.consentGiven) {
      this.sendError(client.ws, 'CONSENT_REQUIRED', 'Consent is required before sending audio');
      return;
    }

    // Forward audio to OpenAI
    const { audio } = message.payload || {};
    if (audio) {
      client.realtimeService.sendAudio(audio);
      sessionManager.touch(client.sessionId);
    }
  }

  /**
   * Handle audio commit (trigger processing)
   */
  private handleAudioCommit(client: ClientConnection): void {
    if (client.realtimeService) {
      client.realtimeService.commitAudio();
    }
  }

  /**
   * Handle text input from client
   */
  private async handleTextInput(client: ClientConnection, message: any): Promise<void> {
    if (!client.realtimeService || !client.sessionId) {
      this.sendError(client.ws, 'NO_SESSION', 'No active session');
      return;
    }

    const session = sessionManager.get(client.sessionId);
    if (session && !session.consentGiven) {
      this.sendError(client.ws, 'CONSENT_REQUIRED', 'Consent is required');
      return;
    }

    const { text } = message.payload || {};
    if (text) {
      client.realtimeService.sendText(text);
      sessionManager.touch(client.sessionId);
    }
  }

  /**
   * Handle response cancellation (barge-in)
   */
  private handleResponseCancel(client: ClientConnection): void {
    if (client.realtimeService) {
      client.realtimeService.cancelResponse();
      client.realtimeService.clearAudioBuffer();
    }
  }

  /**
   * Handle scenario switch
   */
  private async handleScenarioSwitch(
    client: ClientConnection,
    message: any
  ): Promise<void> {
    if (!client.sessionId) {
      this.sendError(client.ws, 'NO_SESSION', 'No active session');
      return;
    }

    const { scenarioId } = message.payload || {};
    if (!scenarioId) {
      this.sendError(client.ws, 'INVALID_SCENARIO', 'Scenario ID required');
      return;
    }

    try {
      // Disconnect existing realtime service
      if (client.realtimeService) {
        client.realtimeService.disconnect();
      }

      // Activate new scenario
      const scenario = scenarioEngine.activate(scenarioId);
      await sessionManager.switchScenario(client.sessionId, scenarioId);

      // Create new realtime service
      client.realtimeService = createRealtimeService(client.sessionId, scenario);
      this.setupRealtimeHandlers(client);
      await client.realtimeService.connect();

      this.send(client.ws, {
        type: 'scenario.switched',
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        payload: {
          scenario: {
            id: scenario.id,
            name: scenario.name,
            conversationStarters: scenario.conversationStarters,
          },
        },
      });
    } catch (error) {
      logger.error('Failed to switch scenario', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.sendError(client.ws, 'SCENARIO_SWITCH_FAILED', 'Failed to switch scenario');
    }
  }

  /**
   * Handle scenario list request
   */
  private handleScenarioList(client: ClientConnection): void {
    this.send(client.ws, {
      type: 'scenario.list',
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      payload: {
        scenarios: scenarioEngine.getScenarioList(),
      },
    });
  }

  /**
   * Handle session end
   */
  private async handleSessionEnd(client: ClientConnection): Promise<void> {
    if (client.sessionId) {
      await sessionManager.end(client.sessionId, 'user_requested');
    }

    if (client.realtimeService) {
      client.realtimeService.disconnect();
      client.realtimeService = null;
    }

    this.send(client.ws, {
      type: 'session.ended',
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      payload: {
        message: 'Session ended successfully',
      },
    });
  }

  /**
   * Setup event handlers for the OpenAI realtime service
   */
  private setupRealtimeHandlers(client: ClientConnection): void {
    if (!client.realtimeService) return;

    const service = client.realtimeService;

    service.on('audio.delta', ({ audio }) => {
      this.send(client.ws, {
        type: 'audio.output',
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        payload: { audio, isFinal: false },
      });
    });

    service.on('audio.done', () => {
      this.send(client.ws, {
        type: 'audio.output',
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        payload: { audio: '', isFinal: true },
      });
    });

    service.on('transcript.partial', ({ text, role }) => {
      this.send(client.ws, {
        type: 'transcript.partial',
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        payload: { text, role },
      });
    });

    service.on('transcript.done', ({ text, role }) => {
      this.send(client.ws, {
        type: 'transcript.final',
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        payload: { text, role },
      });
    });

    service.on('tool.call', ({ name, arguments: args, callId }) => {
      this.send(client.ws, {
        type: 'tool.calling',
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        payload: {
          toolName: name,
          callId,
        },
      });
    });

    service.on('speech.started', () => {
      this.send(client.ws, {
        type: 'audio.speech_started',
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        payload: {},
      });
    });

    service.on('speech.stopped', () => {
      this.send(client.ws, {
        type: 'audio.speech_ended',
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        payload: {},
      });
    });

    service.on('error', ({ message, code }) => {
      this.sendError(client.ws, code || 'REALTIME_ERROR', message);
    });

    service.on('disconnected', () => {
      this.send(client.ws, {
        type: 'error',
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        payload: {
          code: 'DISCONNECTED',
          message: 'Connection to voice service lost',
          recoverable: true,
        },
      });
    });
  }

  /**
   * Handle client disconnect
   */
  private async handleClose(client: ClientConnection): Promise<void> {
    logger.info('Client disconnected', { sessionId: client.sessionId });

    if (client.sessionId) {
      await sessionManager.end(client.sessionId, 'client_disconnected');
    }

    if (client.realtimeService) {
      client.realtimeService.disconnect();
    }

    this.clients.delete(client.ws);
  }

  /**
   * Send a message to a client
   */
  private send(ws: WebSocket, message: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Send an error message to a client
   */
  private sendError(ws: WebSocket, code: string, message: string): void {
    this.send(ws, {
      type: 'error',
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      payload: {
        code,
        message,
        recoverable: true,
      },
    });
  }

  /**
   * Get consent message
   */
  private getConsentMessage(): string {
    return `Welcome to Acme Health Voice Assistant. 

Before we begin, please be aware that:
• This conversation may be recorded for quality assurance
• This is a demo system - do not share real personal health information
• For medical emergencies, please call 911
• This assistant cannot provide medical advice or diagnosis

By continuing, you acknowledge understanding these terms.

Say "I agree" or press the consent button to continue.`;
  }

  /**
   * Start heartbeat to detect dead connections
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      for (const [ws, client] of this.clients) {
        if (!client.isAlive) {
          ws.terminate();
          this.clients.delete(ws);
          continue;
        }
        client.isAlive = false;
        ws.ping();
      }
    }, 30000);
  }

  /**
   * Stop the WebSocket server
   */
  stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    for (const [ws, client] of this.clients) {
      if (client.realtimeService) {
        client.realtimeService.disconnect();
      }
      ws.close();
    }

    this.wss.close();
  }
}
