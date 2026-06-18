/**
 * Voice Agent App
 *
 * Main application shell. Wraps Chat and Voice modes in a shared
 * TrustBar (status strip) and ActionPanel (right-rail action timeline).
 */

import { useState, useEffect, useMemo } from 'react';
import { brand } from './brand';
import { useVoiceAgent } from './hooks/useVoiceAgent';
import { useVoiceAgentWebRTC } from './hooks/useVoiceAgentWebRTC';
import { useChat } from './hooks/useChat';
import {
  MessageList,
  ScenarioSelector,
  ConversationStarters,
  ConsentDialog,
  TextInput,
  ChatInput,
  ChatMessageList,
  QuickActions,
  TrustBar,
  ActionPanel,
  PersonaTiles,
} from './components';
import type { ActionPacket, ActionStatus, DemoPersona } from './components';
import {
  AlertCircle,
  Wifi,
  WifiOff,
  RefreshCw,
  MessageSquare,
  Mic,
  MicOff,
  PhoneOff,
  Volume2,
  VolumeX,
} from 'lucide-react';

type AppMode = 'voice' | 'chat';

// Map verbose backend agent IDs into the friendly persona label that
// shows in the TrustBar's "agent on the line" chip.
const AGENT_LABELS: Record<string, string> = {
  AcmeHealthCoordinator: brand.coordinatorLabel,
  PBMPharmacyAssistant: 'Pharmacy Assistant',
  HealthPlanConcierge: 'Health Plan Concierge',
  ProviderAssistant: 'Provider Assistant',
};

function statusFromToolCall(s: string): ActionStatus {
  if (s === 'completed' || s === 'success') return 'success';
  if (s === 'error') return 'error';
  return 'pending';
}

// Voice transport selection happens once at module load so the same hook
// is invoked on every render (preserving rules-of-hooks). Default is the
// direct WebRTC path; flip VITE_VOICE_TRANSPORT=websocket to fall back to
// the legacy backend WS relay if a demo network blocks WebRTC.
const VOICE_TRANSPORT = (import.meta.env.VITE_VOICE_TRANSPORT as string | undefined) ?? 'webrtc';
const useVoiceAgentHook = VOICE_TRANSPORT === 'websocket' ? useVoiceAgent : useVoiceAgentWebRTC;

export default function App() {
  const [mode, setMode] = useState<AppMode>('chat');
  const [isMuted, setIsMuted] = useState(false);

  // Voice agent hook
  const {
    connectionStatus,
    error: voiceError,
    session,
    scenarios,
    voiceState,
    inputVolume,
    isAutoListening,
    messages: voiceMessages,
    partialTranscript,
    connect,
    disconnect,
    createSession,
    provideConsent,
    startAutoListening,
    stopAutoListening,
    sendText,
    switchScenario,
  } = useVoiceAgentHook();

  // Chat hook
  const {
    messages: chatMessages,
    isLoading: chatLoading,
    error: chatError,
    sendMessage,
    clearChat,
  } = useChat();

  const [showSidebar, setShowSidebar] = useState(true);
  const [showConsentDialog, setShowConsentDialog] = useState(false);

  // Auto-connect voice on mount
  useEffect(() => {
    connect();
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show consent dialog when needed (voice mode)
  useEffect(() => {
    if (
      mode === 'voice' &&
      connectionStatus === 'session_active' &&
      !session.consentGiven &&
      session.consentMessage
    ) {
      setShowConsentDialog(true);
    }
  }, [mode, connectionStatus, session.consentGiven, session.consentMessage]);

  // Auto-start listening when consent is given in voice mode
  useEffect(() => {
    if (mode === 'voice' && session.consentGiven && !isAutoListening) {
      const timer = setTimeout(() => {
        startAutoListening();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [mode, session.consentGiven, isAutoListening, startAutoListening]);

  const handleConsentAccept = () => {
    provideConsent();
    setShowConsentDialog(false);
  };

  const handleScenarioSelect = (scenarioId: string) => {
    if (session.sessionId) {
      switchScenario(scenarioId);
    } else {
      createSession(scenarioId);
    }
  };

  const handleStarterSelect = (utterance: string) => {
    if (mode === 'voice') {
      sendText(utterance);
    } else {
      sendMessage(utterance);
    }
  };

  const handlePersonaSelect = (p: DemoPersona) => {
    if (mode === 'voice') {
      sendText(p.opener);
    } else {
      sendMessage(p.opener);
    }
  };

  const handleChatSend = async (content: string, files: File[]) => {
    await sendMessage(content, files);
  };

  const error = mode === 'voice' ? voiceError : chatError;

  // --- Derived state for the new TrustBar + ActionPanel -------------------

  // Pull action packets from whichever message stream is active so the
  // right rail stays in sync as tools fire.
  const actionPackets: ActionPacket[] = useMemo(() => {
    const source = mode === 'voice' ? voiceMessages : chatMessages;
    const out: ActionPacket[] = [];
    for (const m of source) {
      const calls = (m as { toolCalls?: Array<{ name: string; status: string }> })
        .toolCalls;
      if (!calls || calls.length === 0) continue;
      calls.forEach((tc, idx) => {
        out.push({
          id: `${m.id}-${tc.name}-${idx}`,
          tool: tc.name,
          status: statusFromToolCall(tc.status),
          timestamp: m.timestamp ?? new Date(),
        });
      });
    }
    return out;
  }, [mode, voiceMessages, chatMessages]);

  // "Has any verification tool succeeded?" drives the Verified chip.
  const verified = useMemo(() => {
    return actionPackets.some(
      (p) =>
        p.status === 'success' &&
        (p.tool === 'verify_member_identity' || p.tool === 'verify_mfa_code'),
    );
  }, [actionPackets]);

  // Best-effort: name of the agent currently driving the chat.
  const agentName =
    AGENT_LABELS[session.scenarioId ?? ''] ??
    (mode === 'voice'
      ? session.scenarioName ?? undefined
      : brand.coordinatorLabel);

  const handleClear = () => {
    if (mode === 'chat') {
      clearChat();
    } else {
      disconnect();
      connect();
    }
  };

  // ========================================================================
  // CHAT MODE
  // ========================================================================
  if (mode === 'chat') {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 via-white to-slate-50">
        <TrustBar
          mode="chat"
          onModeChange={setMode}
          connection={
            chatLoading
              ? 'connecting'
              : chatMessages.length > 0
              ? 'session_active'
              : 'connected'
          }
          agentName={agentName}
          scenarioName={null}
          verified={chatMessages.length > 0 ? verified : undefined}
          onClear={chatMessages.length > 0 ? handleClear : undefined}
          clearLabel="Clear conversation"
        />

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex flex-col min-w-0">
            {error && (
              <div className="bg-rose-50 border-b border-rose-200 px-4 py-2.5 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                <span className="text-sm text-rose-700">{error}</span>
              </div>
            )}

            {chatMessages.length === 0 ? (
              <div className="flex-1 overflow-y-auto">
                <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">
                  <div className="text-center space-y-3">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-acme-primary to-acme-secondary mx-auto flex items-center justify-center shadow-md ring-1 ring-acme-primary/20">
                      <MessageSquare className="w-7 h-7 text-white" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-semibold text-slate-800 tracking-tight">
                        How can we help today?
                      </h2>
                      <p className="text-sm text-slate-500 mt-1">
                        Ask about prescriptions, lab results, providers, billing, or appointments.
                      </p>
                    </div>
                  </div>

                  <PersonaTiles onSelect={handlePersonaSelect} disabled={chatLoading} />

                  <div className="border-t border-slate-200/70 pt-6">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 text-center mb-3">
                      Or start with a quick task
                    </p>
                    <QuickActions onActionSelect={handleStarterSelect} disabled={chatLoading} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                <div className="max-w-3xl mx-auto px-4 py-6">
                  <ChatMessageList messages={chatMessages} isTyping={chatLoading} />
                </div>
              </div>
            )}

            <div className="border-t border-slate-200/80 bg-white/90 backdrop-blur-md">
              <div className="max-w-3xl mx-auto px-4 py-3">
                {chatMessages.length > 0 && (
                  <div className="mb-2.5">
                    <QuickActions
                      onActionSelect={handleStarterSelect}
                      disabled={chatLoading}
                      compact
                    />
                  </div>
                )}
                <ChatInput
                  onSend={handleChatSend}
                  disabled={false}
                  isLoading={chatLoading}
                  placeholder="Type a message or ask about your healthcare needs…"
                />
                <p className="text-[11px] text-slate-400 text-center mt-2">
                  Attach images, PDFs, or documents · synthetic data only
                </p>
              </div>
            </div>
          </div>

          <ActionPanel packets={actionPackets} />
        </div>
      </div>
    );
  }

  // ========================================================================
  // VOICE MODE - disconnected / connecting wrappers
  // ========================================================================
  if (connectionStatus === 'disconnected') {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-white">
        <TrustBar
          mode="voice"
          onModeChange={setMode}
          connection="disconnected"
          agentName={agentName}
        />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center space-y-4">
            <WifiOff className="w-16 h-16 text-slate-400 mx-auto" />
            <h2 className="text-xl font-semibold text-slate-700">Voice agent disconnected</h2>
            <p className="text-slate-500">Try reconnecting or switch to chat.</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={connect}
                className="px-6 py-2 bg-acme-primary text-white rounded-lg hover:bg-acme-secondary transition-colors inline-flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Reconnect
              </button>
              <button
                onClick={() => setMode('chat')}
                className="px-6 py-2 border border-acme-primary text-acme-primary rounded-lg hover:bg-acme-primary/5 transition-colors inline-flex items-center gap-2"
              >
                <MessageSquare className="w-4 h-4" />
                Use chat
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (connectionStatus === 'connecting') {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-white">
        <TrustBar
          mode="voice"
          onModeChange={setMode}
          connection="connecting"
          agentName={agentName}
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 border-4 border-acme-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-slate-600">Connecting to {brand.orgName} voice agent…</p>
            <button
              onClick={() => setMode('chat')}
              className="text-acme-primary hover:underline text-sm"
            >
              Use chat instead
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ========================================================================
  // VOICE MODE - connected
  // ========================================================================
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-white">
      <TrustBar
        mode="voice"
        onModeChange={setMode}
        connection={connectionStatus as 'connected' | 'session_active' | 'error'}
        agentName={agentName}
        scenarioName={session.scenarioName}
        verified={voiceMessages.length > 0 ? verified : undefined}
      />

      <div className="flex-1 flex overflow-hidden">
        {showSidebar && (
          <aside className="w-72 bg-white/70 backdrop-blur-sm border-r border-slate-200/80 p-4 overflow-y-auto hidden lg:block">
            <ScenarioSelector
              scenarios={scenarios}
              selectedId={session.scenarioId}
              onSelect={handleScenarioSelect}
            />
            <div className="mt-6 p-3 bg-amber-50 rounded-lg border border-amber-200">
              <p className="text-xs text-amber-800 font-medium">🔬 Demo mode active</p>
              <p className="text-xs text-amber-700 mt-1">All data is synthetic. No PHI.</p>
            </div>
          </aside>
        )}

        <main className="flex-1 flex flex-col min-w-0">
          {voiceError && (
            <div className="bg-rose-50 border-b border-rose-200 px-4 py-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500" />
              <span className="text-sm text-rose-700">{voiceError}</span>
            </div>
          )}

          {connectionStatus === 'connected' && !session.sessionId && (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center max-w-md space-y-4">
                <div className="w-20 h-20 bg-acme-primary/10 rounded-full flex items-center justify-center mx-auto">
                  <Wifi className="w-10 h-10 text-acme-primary" />
                </div>
                <h2 className="text-xl font-semibold text-slate-800">Ready when you are</h2>
                <p className="text-slate-500">
                  Pick a scenario in the sidebar to start a voice session.
                </p>
                <div className="lg:hidden mt-6">
                  <ScenarioSelector
                    scenarios={scenarios}
                    selectedId={session.scenarioId}
                    onSelect={handleScenarioSelect}
                  />
                </div>
                <button
                  onClick={() => setShowSidebar(!showSidebar)}
                  className="hidden lg:inline-flex text-sm text-acme-primary hover:underline"
                >
                  {showSidebar ? 'Hide' : 'Show'} scenarios
                </button>
              </div>
            </div>
          )}

          {connectionStatus === 'session_active' && (
            <>
              <div className="flex-1 overflow-y-auto">
                <div className="max-w-3xl mx-auto px-4 py-6">
                  <MessageList messages={voiceMessages} partialTranscript={partialTranscript} />
                </div>
              </div>

              {session.consentGiven &&
                voiceMessages.length <= 1 &&
                session.conversationStarters.length > 0 && (
                  <div className="px-4 pb-2 max-w-3xl mx-auto w-full">
                    <ConversationStarters
                      starters={session.conversationStarters}
                      onSelect={handleStarterSelect}
                    />
                  </div>
                )}

              <div className="p-6 bg-white/90 backdrop-blur-md border-t border-slate-200/80 safe-bottom">
                <div className="max-w-2xl mx-auto space-y-4">
                  {isAutoListening || isMuted ? (
                    <div className="flex flex-col items-center py-4 space-y-4">
                      <div className="relative">
                        <div
                          className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg ${
                            isMuted
                              ? 'bg-gradient-to-br from-slate-400 to-slate-500'
                              : voiceState === 'listening'
                              ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 animate-pulse'
                              : voiceState === 'speaking'
                              ? 'bg-gradient-to-br from-sky-500 to-sky-600'
                              : voiceState === 'processing'
                              ? 'bg-gradient-to-br from-amber-500 to-amber-600'
                              : 'bg-gradient-to-br from-acme-primary to-acme-secondary'
                          }`}
                        >
                          {isMuted ? (
                            <VolumeX className="w-10 h-10 text-white" />
                          ) : voiceState === 'speaking' ? (
                            <Volume2 className="w-10 h-10 text-white animate-pulse" />
                          ) : (
                            <Mic className="w-10 h-10 text-white" />
                          )}
                        </div>
                        {!isMuted && voiceState === 'listening' && inputVolume > 0.1 && (
                          <>
                            <div className="absolute inset-0 rounded-full border-4 border-emerald-400 animate-ping opacity-30" />
                            <div
                              className="absolute -inset-2 rounded-full border-2 border-emerald-300 animate-ping opacity-20"
                              style={{ animationDelay: '0.2s' }}
                            />
                          </>
                        )}
                      </div>

                      <div className="text-center">
                        <p
                          className={`text-lg font-semibold ${
                            isMuted
                              ? 'text-slate-600'
                              : voiceState === 'listening'
                              ? 'text-emerald-600'
                              : voiceState === 'speaking'
                              ? 'text-sky-600'
                              : voiceState === 'processing'
                              ? 'text-amber-600'
                              : 'text-slate-600'
                          }`}
                        >
                          {isMuted && 'Muted'}
                          {!isMuted && voiceState === 'listening' && 'Listening…'}
                          {!isMuted && voiceState === 'speaking' && 'Agent speaking'}
                          {!isMuted && voiceState === 'processing' && 'Processing…'}
                          {!isMuted && voiceState === 'idle' && 'Ready'}
                        </p>
                        <p className="text-sm text-slate-500 mt-1">
                          {isMuted
                            ? 'Unmute to resume the conversation.'
                            : voiceState === 'listening'
                            ? "Speak naturally — I'll wait until you're done."
                            : voiceState === 'speaking'
                            ? 'Let the agent finish, then reply.'
                            : voiceState === 'processing'
                            ? 'Analyzing your request…'
                            : 'Voice detection active.'}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => {
                            if (isMuted) {
                              setIsMuted(false);
                              startAutoListening();
                            } else {
                              setIsMuted(true);
                              stopAutoListening();
                            }
                          }}
                          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm hover:shadow ${
                            isMuted
                              ? 'bg-rose-100 hover:bg-rose-200 text-rose-700 border border-rose-300'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          }`}
                        >
                          {isMuted ? (
                            <>
                              <VolumeX className="w-4 h-4" />
                              Unmute
                            </>
                          ) : (
                            <>
                              <MicOff className="w-4 h-4" />
                              Mute
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => {
                            setIsMuted(false);
                            stopAutoListening();
                            disconnect();
                            setMode('chat');
                          }}
                          className="flex items-center gap-2 px-5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 hover:text-rose-700 rounded-xl font-medium text-sm transition-all shadow-sm hover:shadow border border-rose-200"
                        >
                          <PhoneOff className="w-4 h-4" />
                          End call
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center py-4 space-y-4">
                      <button
                        onClick={startAutoListening}
                        disabled={!session.consentGiven}
                        className={`w-24 h-24 rounded-full flex items-center justify-center transition-all shadow-lg hover:shadow-xl transform hover:scale-105 ${
                          session.consentGiven
                            ? 'bg-gradient-to-br from-acme-primary to-acme-secondary'
                            : 'bg-slate-300 cursor-not-allowed'
                        }`}
                      >
                        <Mic className="w-10 h-10 text-white" />
                      </button>
                      <p className="text-sm text-slate-500 font-medium">
                        {session.consentGiven
                          ? 'Tap to start voice conversation'
                          : 'Please provide consent to continue'}
                      </p>
                      {session.consentGiven && (
                        <button
                          onClick={() => setMode('chat')}
                          className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:text-acme-primary rounded-lg transition-colors"
                        >
                          <MessageSquare className="w-4 h-4" />
                          Switch to chat
                        </button>
                      )}
                    </div>
                  )}

                  <TextInput
                    onSend={sendText}
                    disabled={!session.consentGiven}
                    placeholder={
                      session.consentGiven
                        ? 'Or type your message here…'
                        : 'Please provide consent to continue'
                    }
                  />
                </div>
              </div>
            </>
          )}
        </main>

        <ActionPanel packets={actionPackets} />
      </div>

      {showConsentDialog && session.consentMessage && (
        <ConsentDialog message={session.consentMessage} onAccept={handleConsentAccept} />
      )}
    </div>
  );
}
