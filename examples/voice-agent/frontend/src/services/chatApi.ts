/**
 * Acme Health - Chat API Service
 * 
 * Handles chat API interactions with the backend.
 */

// Backend URL configuration
const BACKEND_HOST = 'ca-shuttervoice-backend-dev.redbeach-e3c7b4de.eastus.azurecontainerapps.io';

const getApiUrl = (): string => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && envUrl.length > 0 && envUrl !== 'undefined') {
    return envUrl;
  }
  // Production fallback
  if (window.location.protocol === 'https:') {
    return `https://${BACKEND_HOST}`;
  }
  // Local development fallback
  return 'http://localhost:8080';
};

const API_URL = getApiUrl();

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
}

export interface ChatSession {
  id: string;
  scenarioId?: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

class ChatApiService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = API_URL;
  }

  /**
   * Create a new chat session
   */
  async createSession(scenarioId?: string): Promise<ChatSession> {
    const response = await fetch(`${this.baseUrl}/api/chat/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ scenarioId }),
    });

    const result: ApiResponse<{ session: ChatSession }> = await response.json();

    if (!result.success || !result.data) {
      throw new Error(result.error?.message || 'Failed to create session');
    }

    return result.data.session;
  }

  /**
   * Get a chat session
   */
  async getSession(sessionId: string): Promise<ChatSession | null> {
    const response = await fetch(`${this.baseUrl}/api/chat/sessions/${sessionId}`);

    if (response.status === 404) {
      return null;
    }

    const result: ApiResponse<{ session: ChatSession }> = await response.json();

    if (!result.success || !result.data) {
      throw new Error(result.error?.message || 'Failed to get session');
    }

    return result.data.session;
  }

  /**
   * Send a message with optional file attachments
   */
  async sendMessage(
    sessionId: string,
    content: string,
    files: File[] = []
  ): Promise<{ userMessage: ChatMessage; assistantMessage: ChatMessage }> {
    const formData = new FormData();
    formData.append('content', content);

    files.forEach((file) => {
      formData.append('files', file);
    });

    const response = await fetch(`${this.baseUrl}/api/chat/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: formData,
    });

    const result: ApiResponse<{ userMessage: ChatMessage; assistantMessage: ChatMessage }> =
      await response.json();

    if (!result.success || !result.data) {
      throw new Error(result.error?.message || 'Failed to send message');
    }

    return result.data;
  }

  /**
   * Get messages from a session
   */
  async getMessages(sessionId: string, limit?: number): Promise<ChatMessage[]> {
    const url = new URL(`${this.baseUrl}/api/chat/sessions/${sessionId}/messages`);
    if (limit) {
      url.searchParams.set('limit', limit.toString());
    }

    const response = await fetch(url.toString());
    const result: ApiResponse<{ messages: ChatMessage[] }> = await response.json();

    if (!result.success || !result.data) {
      throw new Error(result.error?.message || 'Failed to get messages');
    }

    return result.data.messages;
  }

  /**
   * Upload files
   */
  async uploadFiles(files: File[]): Promise<ChatAttachment[]> {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });

    const response = await fetch(`${this.baseUrl}/api/files`, {
      method: 'POST',
      body: formData,
    });

    const result: ApiResponse<{ files: ChatAttachment[] }> = await response.json();

    if (!result.success || !result.data) {
      throw new Error(result.error?.message || 'Failed to upload files');
    }

    return result.data.files;
  }
}

export const chatApi = new ChatApiService();
