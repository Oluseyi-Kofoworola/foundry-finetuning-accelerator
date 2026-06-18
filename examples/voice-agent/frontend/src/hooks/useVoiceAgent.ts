/**
 * Acme Health - Voice Agent Hook
 * 
 * Main hook for managing voice agent state and interactions.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { wsService } from '../services/websocket';
import { AudioService, audioService } from '../services/audio';
import type {
  ConnectionStatus,
  VoiceState,
  Message,
  SessionState,
  ScenarioSummary,
  SessionCreated,
  TranscriptMessage,
  AudioOutput,
  ToolCallingMessage,
  ErrorMessage,
} from '../types';

interface UseVoiceAgentReturn {
  // Connection state
  connectionStatus: ConnectionStatus;
  error: string | null;
  
  // Session state
  session: SessionState;
  scenarios: ScenarioSummary[];
  
  // Voice state
  voiceState: VoiceState;
  inputVolume: number;
  isAutoListening: boolean;
  
  // Messages
  messages: Message[];
  partialTranscript: string;
  
  // Actions
  connect: () => Promise<void>;
  disconnect: () => void;
  createSession: (scenarioId: string) => void;
  provideConsent: () => void;
  startListening: () => void;
  stopListening: () => void;
  startAutoListening: () => Promise<void>;
  stopAutoListening: () => void;
  sendText: (text: string) => void;
  switchScenario: (scenarioId: string) => void;
  clearMessages: () => void;
}

export function useVoiceAgent(): UseVoiceAgentReturn {
  // Connection state
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  
  // Session state
  const [session, setSession] = useState<SessionState>({
    sessionId: null,
    scenarioId: null,
    scenarioName: null,
    consentGiven: false,
    consentMessage: null,
    conversationStarters: [],
  });
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  
  // Voice state
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [inputVolume, setInputVolume] = useState(0);
  const [isAutoListening, setIsAutoListening] = useState(false);
  
  // Messages
  const [messages, setMessages] = useState<Message[]>([]);
  const [partialTranscript, setPartialTranscript] = useState('');
  
  // Refs
  const isRecording = useRef(false);
  const currentToolCalls = useRef<Map<string, string>>(new Map());
  const autoListenRef = useRef(false);

  // ==========================================================================
  // CONNECTION MANAGEMENT
  // ==========================================================================

  const connect = useCallback(async () => {
    try {
      setConnectionStatus('connecting');
      setError(null);

      // Initialize audio
      if (!AudioService.isSupported()) {
        throw new Error('Audio is not supported in this browser');
      }
      await audioService.initialize();
      audioService.setVolumeCallback(setInputVolume);

      // Connect to WebSocket
      const response = await wsService.connect();
      setScenarios(response.payload.scenarios);
      setConnectionStatus('connected');

      console.log('[VoiceAgent] Connected successfully');
    } catch (err) {
      // Surface a useful message instead of the raw DOMException name. The
      // most common failure here is the browser blocking the microphone,
      // which we want to translate into actionable guidance for the user.
      let errorMessage: string;
      if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.message === 'Permission denied')) {
        errorMessage =
          'Microphone access was blocked. Click the lock icon in the address bar, allow microphone access for this site, and try again.';
      } else if (err instanceof DOMException && err.name === 'NotFoundError') {
        errorMessage = 'No microphone was detected. Plug one in, then click Connect again.';
      } else {
        errorMessage = err instanceof Error ? err.message : 'Connection failed';
      }
      setError(errorMessage);
      setConnectionStatus('error');
      console.error('[VoiceAgent] Connection error:', err);
    }
  }, []);

  const disconnect = useCallback(() => {
    wsService.disconnect();
    audioService.dispose();
    setConnectionStatus('disconnected');
    setSession({
      sessionId: null,
      scenarioId: null,
      scenarioName: null,
      consentGiven: false,
      consentMessage: null,
      conversationStarters: [],
    });
    setMessages([]);
  }, []);

  // ==========================================================================
  // SESSION MANAGEMENT
  // ==========================================================================

  const createSession = useCallback((scenarioId: string) => {
    wsService.createSession(scenarioId);
  }, []);

  const provideConsent = useCallback(() => {
    wsService.provideConsent();
  }, []);

  const switchScenario = useCallback((scenarioId: string) => {
    wsService.switchScenario(scenarioId);
    setMessages([]);
    setPartialTranscript('');
  }, []);

  // ==========================================================================
  // VOICE INTERACTION
  // ==========================================================================

  const startListening = useCallback(async () => {
    if (!session.consentGiven) {
      setError('Please provide consent before speaking');
      return;
    }

    try {
      setVoiceState('listening');
      isRecording.current = true;

      // If agent is speaking, cancel (barge-in)
      if (voiceState === 'speaking') {
        wsService.cancelResponse();
        audioService.stopPlayback();
      }

      await audioService.startRecording((audioData) => {
        if (isRecording.current) {
          wsService.sendAudio(audioData);
        }
      });
    } catch (err) {
      console.error('[VoiceAgent] Failed to start recording:', err);
      setVoiceState('error');
    }
  }, [session.consentGiven, voiceState]);

  const stopListening = useCallback(() => {
    isRecording.current = false;
    audioService.stopRecording();
    wsService.commitAudio();
    setVoiceState('processing');
  }, []);

  /**
   * Start continuous auto-listening mode (VAD handled by server)
   */
  const startAutoListening = useCallback(async () => {
    if (!session.consentGiven) {
      setError('Please provide consent before speaking');
      return;
    }

    if (autoListenRef.current) {
      return; // Already auto-listening
    }

    try {
      autoListenRef.current = true;
      setIsAutoListening(true);
      setVoiceState('listening');
      isRecording.current = true;

      await audioService.startRecording((audioData) => {
        if (isRecording.current && autoListenRef.current) {
          wsService.sendAudio(audioData);
        }
      });

      console.log('[VoiceAgent] Auto-listening started - speak naturally');
    } catch (err) {
      console.error('[VoiceAgent] Failed to start auto-listening:', err);
      autoListenRef.current = false;
      setIsAutoListening(false);
      setVoiceState('error');
    }
  }, [session.consentGiven]);

  /**
   * Stop continuous auto-listening mode
   */
  const stopAutoListening = useCallback(() => {
    autoListenRef.current = false;
    isRecording.current = false;
    setIsAutoListening(false);
    audioService.stopRecording();
    setVoiceState('idle');
    console.log('[VoiceAgent] Auto-listening stopped');
  }, []);

  const sendText = useCallback((text: string) => {
    if (!text.trim()) return;
    
    wsService.sendText(text);
    
    // Add user message immediately
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setVoiceState('processing');
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setPartialTranscript('');
  }, []);

  // ==========================================================================
  // WEBSOCKET EVENT HANDLERS
  // ==========================================================================

  useEffect(() => {
    // Session created
    const unsubSessionCreated = wsService.on('session.created', (msg) => {
      const data = msg as SessionCreated;
      setSession({
        sessionId: data.payload.sessionId,
        scenarioId: data.payload.scenario.id,
        scenarioName: data.payload.scenario.name,
        consentGiven: !data.payload.requiresConsent,
        consentMessage: data.payload.consentMessage,
        conversationStarters: data.payload.scenario.conversationStarters,
      });
      setConnectionStatus('session_active');

      // Add system message if consent is required
      if (data.payload.requiresConsent && data.payload.consentMessage) {
        setMessages([{
          id: crypto.randomUUID(),
          role: 'system',
          content: data.payload.consentMessage,
          timestamp: new Date(),
        }]);
      }
    });

    // Consent confirmed - auto-start listening
    const unsubConsentConfirmed = wsService.on('consent.confirmed', () => {
      setSession((prev) => ({ ...prev, consentGiven: true }));
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        role: 'system',
        content: '🎤 Consent confirmed. Microphone is now active - just speak naturally!',
        timestamp: new Date(),
      }]);
    });

    // Partial transcript
    const unsubTranscriptPartial = wsService.on('transcript.partial', (msg) => {
      const data = msg as TranscriptMessage;
      if (data.payload.role === 'assistant') {
        setPartialTranscript(data.payload.text);
      }
    });

    // Final transcript
    const unsubTranscriptFinal = wsService.on('transcript.final', (msg) => {
      const data = msg as TranscriptMessage;
      setPartialTranscript('');
      
      const newMessage: Message = {
        id: crypto.randomUUID(),
        role: data.payload.role,
        content: data.payload.text,
        timestamp: new Date(),
      };

      // Add tool calls to the message if it's from assistant
      if (data.payload.role === 'assistant' && currentToolCalls.current.size > 0) {
        newMessage.toolCalls = Array.from(currentToolCalls.current.entries()).map(
          ([name]) => ({ name, status: 'completed' as const })
        );
        currentToolCalls.current.clear();
      }

      setMessages((prev) => [...prev, newMessage]);
    });

    // Audio output
    const unsubAudioOutput = wsService.on('audio.output', (msg) => {
      const data = msg as AudioOutput;
      if (data.payload.audio) {
        setVoiceState('speaking');
        audioService.playAudio(data.payload.audio);
      }
      if (data.payload.isFinal) {
        // Only return to listening if auto-listen is STILL active (user hasn't muted)
        // Check the ref value to respect mute state
        if (autoListenRef.current) {
          setVoiceState('listening');
        } else {
          setVoiceState('idle');
        }
      }
    });

    // Tool calling
    const unsubToolCalling = wsService.on('tool.calling', (msg) => {
      const data = msg as ToolCallingMessage;
      currentToolCalls.current.set(data.payload.toolName, data.payload.callId);
    });

    // Speech events - VAD detected user speaking
    const unsubSpeechStarted = wsService.on('audio.speech_started', () => {
      // VAD detected user started speaking
      setVoiceState('listening');
      console.log('[VoiceAgent] VAD: Speech detected');
    });

    const unsubSpeechEnded = wsService.on('audio.speech_ended', () => {
      // VAD detected user stopped speaking - processing begins
      setVoiceState('processing');
      console.log('[VoiceAgent] VAD: Speech ended, processing...');
    });

    // Scenario switched
    const unsubScenarioSwitched = wsService.on('scenario.switched', (msg: any) => {
      setSession((prev) => ({
        ...prev,
        scenarioId: msg.payload.scenario.id,
        scenarioName: msg.payload.scenario.name,
        conversationStarters: msg.payload.scenario.conversationStarters,
      }));
    });

    // Error handling
    const unsubError = wsService.on('error', (msg) => {
      const data = msg as ErrorMessage;
      setError(data.payload.message);
      if (!data.payload.recoverable) {
        setConnectionStatus('error');
      }
      setVoiceState('error');
    });

    // Cleanup
    return () => {
      unsubSessionCreated();
      unsubConsentConfirmed();
      unsubTranscriptPartial();
      unsubTranscriptFinal();
      unsubAudioOutput();
      unsubToolCalling();
      unsubSpeechStarted();
      unsubSpeechEnded();
      unsubScenarioSwitched();
      unsubError();
    };
  }, []);

  return {
    connectionStatus,
    error,
    session,
    scenarios,
    voiceState,
    inputVolume,
    isAutoListening,
    messages,
    partialTranscript,
    connect,
    disconnect,
    createSession,
    provideConsent,
    startListening,
    stopListening,
    startAutoListening,
    stopAutoListening,
    sendText,
    switchScenario,
    clearMessages,
  };
}
