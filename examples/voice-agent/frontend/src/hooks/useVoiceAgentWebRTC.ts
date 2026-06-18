/**
 * Acme Health - WebRTC Voice Agent Hook
 *
 * Drop-in replacement for `useVoiceAgent` that uses the direct browser↔Azure
 * WebRTC transport instead of the backend WebSocket relay. The return shape
 * matches `useVoiceAgent` so App.tsx can pick the transport with one env
 * flag and the rest of the UI is unaware.
 *
 * Key differences vs WS path:
 *   - No PCM Int16 / base64 plumbing; the browser sends the mic track and
 *     plays the inbound track natively via a hidden <audio> element.
 *   - No "auto-listening" toggle: the WebRTC mic track is live from the
 *     moment you connect; muting just disables the track.
 *   - Scenario list is fetched up front from /api/scenarios because the
 *     ephemeral path doesn't enumerate them on connect.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { webrtcRealtimeService } from '../services/webrtcRealtime';
import type {
  ConnectionStatus,
  VoiceState,
  Message,
  SessionState,
  ScenarioSummary,
  ConversationStarter,
} from '../types';

interface UseVoiceAgentReturn {
  connectionStatus: ConnectionStatus;
  error: string | null;
  session: SessionState;
  scenarios: ScenarioSummary[];
  voiceState: VoiceState;
  inputVolume: number;
  isAutoListening: boolean;
  messages: Message[];
  partialTranscript: string;
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

const BACKEND_HOST = 'ca-shuttervoice-backend-dev.redbeach-e3c7b4de.eastus.azurecontainerapps.io';

function getApiBase(): string {
  const envUrl = (import.meta as { env?: Record<string, string> }).env?.VITE_API_URL;
  if (envUrl && envUrl.length > 0 && envUrl !== 'undefined') return envUrl.replace(/\/$/, '');
  if (window.location.protocol === 'https:') return `https://${BACKEND_HOST}`;
  return 'http://localhost:3001';
}

export function useVoiceAgentWebRTC(): UseVoiceAgentReturn {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionState>({
    sessionId: null,
    scenarioId: null,
    scenarioName: null,
    consentGiven: false,
    consentMessage: null,
    conversationStarters: [],
  });
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [inputVolume] = useState(0);
  const [isAutoListening, setIsAutoListening] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [partialTranscript, setPartialTranscript] = useState('');

  // Track tool calls in-flight so we can attach them to the next assistant
  // transcript message, matching the WS hook's `currentToolCalls` pattern.
  const pendingToolCalls = useRef<Map<string, { name: string; status: 'calling' | 'completed' | 'error' }>>(new Map());
  const pendingScenarioRef = useRef<string | null>(null);

  // --- Scenario list bootstrap (independent of transport) ------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(`${getApiBase()}/api/scenarios`);
        const body = await resp.json();
        if (cancelled) return;
        const list: ScenarioSummary[] = body?.data?.scenarios ?? [];
        setScenarios(list);
      } catch (err) {
        console.warn('[VoiceAgentRTC] Failed to load scenarios', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // --- Transport event wiring ---------------------------------------------
  useEffect(() => {
    const unsubs: Array<() => void> = [];

    unsubs.push(webrtcRealtimeService.on('session.created', (evt) => {
      const payload = evt.payload as {
        sessionId: string;
        scenario: { id: string; name: string; conversationStarters: ConversationStarter[]; requiresConsent: boolean; consentMessage?: string };
      };
      setSession({
        sessionId: payload.sessionId,
        scenarioId: payload.scenario.id,
        scenarioName: payload.scenario.name,
        consentGiven: !payload.scenario.requiresConsent,
        consentMessage: payload.scenario.consentMessage ?? null,
        conversationStarters: payload.scenario.conversationStarters,
      });
      setConnectionStatus('session_active');
      setVoiceState('listening');
      setIsAutoListening(true);
    }));

    unsubs.push(webrtcRealtimeService.on('connected', () => {
      setConnectionStatus('connected');
    }));

    unsubs.push(webrtcRealtimeService.on('transcript.partial', (evt) => {
      const p = evt.payload as { text: string; role: string };
      if (p.role === 'assistant') {
        setPartialTranscript(p.text);
        setVoiceState('speaking');
      }
    }));

    unsubs.push(webrtcRealtimeService.on('transcript.final', (evt) => {
      const p = evt.payload as { text: string; role: 'user' | 'assistant' };
      setPartialTranscript('');
      const message: Message = {
        id: crypto.randomUUID(),
        role: p.role,
        content: p.text,
        timestamp: new Date(),
      };
      if (p.role === 'assistant' && pendingToolCalls.current.size > 0) {
        message.toolCalls = Array.from(pendingToolCalls.current.values()).map((tc) => ({
          name: tc.name,
          status: tc.status,
        }));
        pendingToolCalls.current.clear();
      }
      setMessages((prev) => [...prev, message]);
    }));

    unsubs.push(webrtcRealtimeService.on('tool.calling', (evt) => {
      const p = evt.payload as { toolName: string; callId: string };
      pendingToolCalls.current.set(p.callId, { name: p.toolName, status: 'calling' });
    }));

    unsubs.push(webrtcRealtimeService.on('tool.completed', (evt) => {
      const p = evt.payload as { toolName: string; callId: string; error?: string };
      const existing = pendingToolCalls.current.get(p.callId);
      if (existing) {
        existing.status = p.error ? 'error' : 'completed';
      } else {
        pendingToolCalls.current.set(p.callId, {
          name: p.toolName,
          status: p.error ? 'error' : 'completed',
        });
      }
    }));

    unsubs.push(webrtcRealtimeService.on('audio.speech_started', () => {
      setVoiceState('listening');
    }));

    unsubs.push(webrtcRealtimeService.on('audio.speech_ended', () => {
      setVoiceState('processing');
    }));

    unsubs.push(webrtcRealtimeService.on('response.done', () => {
      setVoiceState('listening');
    }));

    unsubs.push(webrtcRealtimeService.on('error', (evt) => {
      const message = (evt.payload?.message as string) ?? 'Realtime error';
      setError(message);
      setVoiceState('error');
    }));

    unsubs.push(webrtcRealtimeService.on('disconnected', () => {
      setConnectionStatus('disconnected');
      setVoiceState('idle');
      setIsAutoListening(false);
    }));

    return () => { unsubs.forEach((u) => u()); };
  }, []);

  // --- Public API ---------------------------------------------------------

  const connect = useCallback(async () => {
    setConnectionStatus('connecting');
    setError(null);
    try {
      await webrtcRealtimeService.connect(pendingScenarioRef.current ?? undefined);
      // session.created handler upgrades us to 'session_active'.
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start voice session';
      setError(message);
      setConnectionStatus('error');
    }
  }, []);

  const disconnect = useCallback(() => {
    webrtcRealtimeService.disconnect();
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
    setIsAutoListening(false);
    setVoiceState('idle');
  }, []);

  const createSession = useCallback((scenarioId: string) => {
    // For WebRTC the scenario is locked in at mint time. We stash it and
    // (re)connect so the next mint picks it up.
    pendingScenarioRef.current = scenarioId;
    webrtcRealtimeService.disconnect();
    setConnectionStatus('connecting');
    void webrtcRealtimeService.connect(scenarioId).catch((err) => {
      setError(err instanceof Error ? err.message : 'Failed to switch scenario');
      setConnectionStatus('error');
    });
  }, []);

  const provideConsent = useCallback(() => {
    setSession((prev) => ({ ...prev, consentGiven: true }));
  }, []);

  const switchScenario = useCallback((scenarioId: string) => {
    createSession(scenarioId);
    setMessages([]);
    setPartialTranscript('');
  }, [createSession]);

  // The WS hook exposed startListening / stopListening / auto-listening to
  // drive a manual record loop. For WebRTC the mic is always live; mute is
  // the only meaningful gesture, so we map these to mic-track toggles.
  const startListening = useCallback(() => {
    webrtcRealtimeService.setMuted(false);
    setIsAutoListening(true);
    setVoiceState('listening');
  }, []);

  const stopListening = useCallback(() => {
    webrtcRealtimeService.setMuted(true);
    setIsAutoListening(false);
    setVoiceState('idle');
  }, []);

  const startAutoListening = useCallback(async () => {
    webrtcRealtimeService.setMuted(false);
    setIsAutoListening(true);
    setVoiceState('listening');
  }, []);

  const stopAutoListening = useCallback(() => {
    webrtcRealtimeService.setMuted(true);
    setIsAutoListening(false);
    setVoiceState('idle');
  }, []);

  const sendText = useCallback((text: string) => {
    if (!text.trim()) return;
    webrtcRealtimeService.sendText(text);
    setMessages((prev) => [...prev, {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    }]);
    setVoiceState('processing');
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setPartialTranscript('');
  }, []);

  return useMemo(() => ({
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
  }), [
    connectionStatus, error, session, scenarios, voiceState, inputVolume,
    isAutoListening, messages, partialTranscript,
    connect, disconnect, createSession, provideConsent,
    startListening, stopListening, startAutoListening, stopAutoListening,
    sendText, switchScenario, clearMessages,
  ]);
}
