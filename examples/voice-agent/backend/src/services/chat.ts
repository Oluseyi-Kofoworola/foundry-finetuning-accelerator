/**
 * Acme Health - Chat Service
 * 
 * Handles chat messages with text, image, and file support.
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';
import type { UploadedFile } from '../middleware/upload.js';

export interface ChatAttachment {
  id: string;
  type: 'image' | 'file';
  name: string;
  url: string;
  mimetype: string;
  size: number;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments: ChatAttachment[];
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface ChatSession {
  id: string;
  scenarioId?: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

// In-memory chat storage (use Redis/DB in production)
const chatSessions = new Map<string, ChatSession>();

export class ChatService {
  /**
   * Create a new chat session
   */
  createSession(scenarioId?: string): ChatSession {
    const session: ChatSession = {
      id: uuidv4(),
      scenarioId,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    chatSessions.set(session.id, session);
    logger.info('Chat session created', { sessionId: session.id, scenarioId });

    return session;
  }

  /**
   * Get a chat session
   */
  getSession(sessionId: string): ChatSession | undefined {
    return chatSessions.get(sessionId);
  }

  /**
   * Add a message to a session
   */
  addMessage(
    sessionId: string,
    role: ChatMessage['role'],
    content: string,
    attachments: UploadedFile[] = [],
    metadata?: Record<string, unknown>
  ): ChatMessage {
    const session = chatSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const message: ChatMessage = {
      id: uuidv4(),
      sessionId,
      role,
      content,
      attachments: attachments.map((f) => ({
        id: f.id,
        type: f.isImage ? 'image' : 'file',
        name: f.originalName,
        url: f.url,
        mimetype: f.mimetype,
        size: f.size,
      })),
      timestamp: new Date(),
      metadata,
    };

    session.messages.push(message);
    session.updatedAt = new Date();

    logger.debug('Message added to session', {
      sessionId,
      messageId: message.id,
      role,
      hasAttachments: attachments.length > 0,
    });

    return message;
  }

  /**
   * Get messages from a session
   */
  getMessages(sessionId: string, limit?: number): ChatMessage[] {
    const session = chatSessions.get(sessionId);
    if (!session) {
      return [];
    }

    if (limit) {
      return session.messages.slice(-limit);
    }

    return session.messages;
  }

  /**
   * Delete a session
   */
  deleteSession(sessionId: string): boolean {
    return chatSessions.delete(sessionId);
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    return chatSessions.size;
  }

  /**
   * Clean up old sessions
   */
  cleanupOldSessions(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    let cleaned = 0;

    chatSessions.forEach((session, id) => {
      if (now - session.updatedAt.getTime() > maxAgeMs) {
        chatSessions.delete(id);
        cleaned++;
      }
    });

    if (cleaned > 0) {
      logger.info('Cleaned up old chat sessions', { count: cleaned });
    }

    return cleaned;
  }
}

// Export singleton
export const chatService = new ChatService();
