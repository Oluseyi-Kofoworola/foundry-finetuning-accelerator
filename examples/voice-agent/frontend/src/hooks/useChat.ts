/**
 * Acme Health - useChat Hook
 * 
 * React hook for managing chat state and interactions.
 */

import { useState, useCallback, useEffect } from 'react';
import { chatApi, ChatMessage, ChatSession } from '../services/chatApi';

interface UseChatState {
  session: ChatSession | null;
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
}

interface UseChatActions {
  createSession: (scenarioId?: string) => Promise<void>;
  sendMessage: (content: string, files?: File[]) => Promise<void>;
  clearError: () => void;
  clearChat: () => void;
}

export function useChat(): UseChatState & UseChatActions {
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-create session on mount
  useEffect(() => {
    const storedSessionId = sessionStorage.getItem('chatSessionId');
    
    if (storedSessionId) {
      // Try to restore session
      chatApi.getSession(storedSessionId).then((existingSession) => {
        if (existingSession) {
          setSession(existingSession);
          setMessages(existingSession.messages);
        } else {
          // Session expired, create new one
          createSession();
        }
      }).catch(() => {
        createSession();
      });
    } else {
      createSession();
    }
  }, []);

  const createSession = useCallback(async (scenarioId?: string) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const newSession = await chatApi.createSession(scenarioId);
      setSession(newSession);
      setMessages([]);
      
      // Store session ID
      sessionStorage.setItem('chatSessionId', newSession.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create session';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const sendMessage = useCallback(async (content: string, files: File[] = []) => {
    if (!session) {
      setError('No active session');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const { userMessage, assistantMessage } = await chatApi.sendMessage(
        session.id,
        content,
        files
      );

      // Parse timestamps
      userMessage.timestamp = new Date(userMessage.timestamp);
      assistantMessage.timestamp = new Date(assistantMessage.timestamp);

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send message';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearChat = useCallback(() => {
    setMessages([]);
    sessionStorage.removeItem('chatSessionId');
    createSession();
  }, [createSession]);

  return {
    session,
    messages,
    isLoading,
    error,
    createSession,
    sendMessage,
    clearError,
    clearChat,
  };
}
