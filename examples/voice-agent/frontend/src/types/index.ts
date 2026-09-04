/**
 * Acme Health - Frontend Type Definitions
 */

// =============================================================================
// WEBSOCKET MESSAGES
// =============================================================================

export interface WSMessage {
  type: string;
  id: string;
  timestamp: string;
  payload?: unknown;
}

export interface ConnectionEstablished extends WSMessage {
  type: 'connection.established';
  payload: {
    message: string;
    scenarios: ScenarioSummary[];
  };
}

export interface SessionCreated extends WSMessage {
  type: 'session.created';
  payload: {
    sessionId: string;
    scenario: {
      id: string;
      name: string;
      conversationStarters: ConversationStarter[];
    };
    requiresConsent: boolean;
    consentMessage: string | null;
  };
}

export interface AudioOutput extends WSMessage {
  type: 'audio.output';
  payload: {
    audio: string;
    isFinal: boolean;
  };
}

export interface TranscriptMessage extends WSMessage {
  type: 'transcript.partial' | 'transcript.final';
  payload: {
    text: string;
    role: 'user' | 'assistant';
  };
}

export interface ToolCallingMessage extends WSMessage {
  type: 'tool.calling';
  payload: {
    toolName: string;
    callId: string;
  };
}

export interface ErrorMessage extends WSMessage {
  type: 'error';
  payload: {
    code: string;
    message: string;
    recoverable: boolean;
  };
}

// =============================================================================
// SCENARIO TYPES
// =============================================================================

export interface ScenarioSummary {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
}

export interface ConversationStarter {
  label: string;
  utterance: string;
  description: string;
}

// =============================================================================
// SESSION STATE
// =============================================================================

export type ConnectionStatus = 
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'session_active'
  | 'error';

export type VoiceState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'error';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  isPartial?: boolean;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  name: string;
  status: 'calling' | 'completed' | 'error';
}

export interface SessionState {
  sessionId: string | null;
  scenarioId: string | null;
  scenarioName: string | null;
  consentGiven: boolean;
  consentMessage: string | null;
  conversationStarters: ConversationStarter[];
}

// =============================================================================
// AUDIO TYPES
// =============================================================================

export interface AudioContextConfig {
  sampleRate: number;
  channelCount: number;
}

// =============================================================================
// COMPONENT PROPS
// =============================================================================

export interface VoiceButtonProps {
  state: VoiceState;
  onPress: () => void;
  onRelease: () => void;
  disabled?: boolean;
}

export interface MessageBubbleProps {
  message: Message;
}

export interface ScenarioCardProps {
  scenario: ScenarioSummary;
  isSelected: boolean;
  onSelect: (id: string) => void;
}
