/**
 * Acme Health - WebSocket Service
 * 
 * Manages WebSocket connection to the voice agent backend.
 */

import type {
  WSMessage,
  ConnectionEstablished,
} from '../types';

type MessageHandler = (message: WSMessage) => void;

// Backend URL configuration - hardcoded for production deployment
const BACKEND_HOST = 'ca-shuttervoice-backend-dev.redbeach-e3c7b4de.eastus.azurecontainerapps.io';

// Get WebSocket URL - always use secure WebSocket when on HTTPS
const getDefaultWsUrl = (): string => {
  // First check environment variable
  const envUrl = import.meta.env.VITE_WS_URL;
  console.log('[WS] Environment VITE_WS_URL:', envUrl);
  
  if (envUrl && envUrl.length > 0 && envUrl !== 'undefined') {
    // Ensure it starts with wss:// when page is served over HTTPS
    let wsUrl = envUrl;
    if (window.location.protocol === 'https:' && wsUrl.startsWith('ws://')) {
      wsUrl = wsUrl.replace('ws://', 'wss://');
    }
    // Ensure it ends with /ws
    wsUrl = wsUrl.endsWith('/ws') ? wsUrl : `${wsUrl}/ws`;
    console.log('[WS] Using environment URL:', wsUrl);
    return wsUrl;
  }
  
  // Production fallback: use known backend URL with secure WebSocket
  if (window.location.protocol === 'https:') {
    const productionUrl = `wss://${BACKEND_HOST}/ws`;
    console.log('[WS] Using production fallback URL:', productionUrl);
    return productionUrl;
  }
  
  // Development fallback: derive from current location
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const fallbackUrl = `${protocol}//${window.location.host}/ws`;
  console.log('[WS] Using local fallback URL:', fallbackUrl);
  return fallbackUrl;
};

export class WebSocketService {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  constructor(url: string = getDefaultWsUrl()) {
    this.url = url;
  }

  /**
   * Connect to the WebSocket server
   */
  connect(): Promise<ConnectionEstablished> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log('[WS] Connected');
          this.reconnectAttempts = 0;
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data) as WSMessage;
            this.handleMessage(message);

            // Resolve connection promise on initial connection
            if (message.type === 'connection.established') {
              resolve(message as ConnectionEstablished);
            }
          } catch (error) {
            console.error('[WS] Failed to parse message:', error);
          }
        };

        this.ws.onclose = (event) => {
          console.log('[WS] Disconnected:', event.code, event.reason);
          this.handleDisconnect();
        };

        this.ws.onerror = (error) => {
          console.error('[WS] Error:', error);
          reject(error);
        };

        // Timeout for connection
        setTimeout(() => {
          if (this.ws?.readyState !== WebSocket.OPEN) {
            reject(new Error('Connection timeout'));
          }
        }, 10000);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(message: WSMessage): void {
    const handlers = this.handlers.get(message.type);
    if (handlers) {
      handlers.forEach((handler) => handler(message));
    }

    // Also notify 'all' handlers
    const allHandlers = this.handlers.get('*');
    if (allHandlers) {
      allHandlers.forEach((handler) => handler(message));
    }
  }

  /**
   * Handle disconnection
   */
  private handleDisconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`[WS] Reconnecting (attempt ${this.reconnectAttempts})...`);
      setTimeout(() => this.connect(), this.reconnectDelay * this.reconnectAttempts);
    }
  }

  /**
   * Subscribe to a message type
   */
  on(type: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  /**
   * Send a message
   */
  send(type: string, payload?: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const message: WSMessage = {
        type,
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        payload,
      };
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('[WS] Cannot send - not connected');
    }
  }

  /**
   * Create a session
   */
  createSession(scenarioId: string): void {
    this.send('session.create', { scenarioId });
  }

  /**
   * Provide consent
   */
  provideConsent(): void {
    this.send('consent.provide', {});
  }

  /**
   * Send audio data
   */
  sendAudio(audioBase64: string): void {
    this.send('audio.input', { audio: audioBase64 });
  }

  /**
   * Commit audio buffer
   */
  commitAudio(): void {
    this.send('audio.commit', {});
  }

  /**
   * Send text input
   */
  sendText(text: string): void {
    this.send('text.input', { text });
  }

  /**
   * Cancel current response (barge-in)
   */
  cancelResponse(): void {
    this.send('response.cancel', {});
  }

  /**
   * Switch scenario
   */
  switchScenario(scenarioId: string): void {
    this.send('scenario.switch', { scenarioId });
  }

  /**
   * End session
   */
  endSession(): void {
    this.send('session.end', {});
  }

  /**
   * Disconnect
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.handlers.clear();
  }

  /**
   * Check if connected
   */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
export const wsService = new WebSocketService();
