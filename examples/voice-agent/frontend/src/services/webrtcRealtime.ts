/**
 * Acme Health - WebRTC Realtime Service
 *
 * Browser-direct transport to Azure OpenAI Realtime API. Replaces the
 * backend-WebSocket relay for the voice path: backend still mints the
 * ephemeral key and executes tool calls, but audio frames travel direct
 * from the browser to Azure, eliminating ~150-300ms of repackaging
 * latency that the PCM16-over-WS path incurs.
 *
 * Wire-compatible with useVoiceAgent's expectations via the emitter-style
 * `on()` API so we can swap transports with a single env flag.
 */

const BACKEND_HOST = 'ca-shuttervoice-backend-dev.redbeach-e3c7b4de.eastus.azurecontainerapps.io';

function getApiBase(): string {
  const envUrl = (import.meta as { env?: Record<string, string> }).env?.VITE_API_URL;
  if (envUrl && envUrl.length > 0 && envUrl !== 'undefined') return envUrl.replace(/\/$/, '');
  if (window.location.protocol === 'https:') return `https://${BACKEND_HOST}`;
  return 'http://localhost:3001';
}

// -----------------------------------------------------------------------------
// Event taxonomy — mirrors the WS service shape so useVoiceAgent can subscribe
// to the same set of names from either transport.
// -----------------------------------------------------------------------------

export type WebRtcEventName =
  | 'connected'
  | 'session.created'
  | 'transcript.partial'
  | 'transcript.final'
  | 'tool.calling'
  | 'tool.completed'
  | 'audio.speech_started'
  | 'audio.speech_ended'
  | 'response.done'
  | 'error'
  | 'disconnected';

export interface WebRtcEvent {
  type: WebRtcEventName;
  payload?: Record<string, unknown>;
}

type Handler = (event: WebRtcEvent) => void;

// -----------------------------------------------------------------------------
// Service
// -----------------------------------------------------------------------------

interface ConnectResult {
  sessionId: string;
  scenario: {
    id: string;
    name: string;
    conversationStarters: string[];
    requiresConsent: boolean;
    consentMessage?: string;
  };
}

export class WebRtcRealtimeService {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private localStream: MediaStream | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private sessionId: string | null = null;
  private handlers = new Map<WebRtcEventName, Set<Handler>>();

  // Coalesce overlapping connect() calls. React 18 StrictMode mounts the
  // hook twice in dev (effect runs, cleanup runs, effect runs again). Without
  // this guard, two peer connections + two <audio> sinks end up live at the
  // same time and you literally hear the assistant speak in stereo — the
  // exact "two voices at once" symptom we kept seeing.
  private connectInFlight: Promise<ConnectResult> | null = null;
  private cachedScenario: ConnectResult['scenario'] | null = null;

  // Bump on every disconnect so in-flight connect() calls can detect they've
  // been superseded and abort cleanup instead of trampling a newer session.
  private generation = 0;

  /** Subscribe to a transport event. Returns an unsubscribe function. */
  on(name: WebRtcEventName, handler: Handler): () => void {
    if (!this.handlers.has(name)) this.handlers.set(name, new Set());
    this.handlers.get(name)!.add(handler);
    return () => this.handlers.get(name)?.delete(handler);
  }

  private emit(name: WebRtcEventName, payload?: Record<string, unknown>): void {
    this.handlers.get(name)?.forEach((h) => {
      try { h({ type: name, payload }); } catch (err) { console.error('[WebRTC] handler error', err); }
    });
  }

  /**
   * Establish a direct peer connection to Azure OpenAI Realtime.
   * Idempotent: calling while already connected returns the existing session;
   * calling while another connect is in flight returns the same promise.
   */
  async connect(scenarioId?: string): Promise<ConnectResult> {
    if (this.connectInFlight) return this.connectInFlight;
    if (this.pc && this.sessionId && this.cachedScenario) {
      return { sessionId: this.sessionId, scenario: this.cachedScenario };
    }
    this.connectInFlight = this._doConnect(scenarioId).finally(() => {
      this.connectInFlight = null;
    });
    return this.connectInFlight;
  }

  private async _doConnect(scenarioId?: string): Promise<ConnectResult> {
    const myGeneration = ++this.generation;

    // Defensive sweep: if disconnect() ran during a previous in-flight
    // connect, there may be an orphan <audio> element still in the DOM. Kill
    // anything we previously tagged.
    this._purgeOrphanAudio();

    const apiBase = getApiBase();
    const mintResp = await fetch(`${apiBase}/api/realtime/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioId }),
    });
    if (!mintResp.ok) {
      const text = await mintResp.text();
      throw new Error(`Failed to mint realtime session: ${mintResp.status} ${text.slice(0, 200)}`);
    }
    const mintBody = await mintResp.json();
    if (!mintBody?.success) {
      throw new Error(mintBody?.error?.message ?? 'Realtime session mint returned unsuccessful response');
    }
    const minted = mintBody.data as {
      sessionId: string;
      clientSecret: string;
      webrtcUrl: string;
      sessionConfig: Record<string, unknown>;
      scenario: ConnectResult['scenario'];
    };
    this.sessionId = minted.sessionId;

    // Mic capture — let the browser handle PCM/Opus encoding natively
    // instead of the 24kHz Int16 conversion we do over WS. Echo / noise
    // suppression on so callers don't hear themselves through the agent.
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });

    // If a disconnect() raced ahead while we were awaiting getUserMedia, bail
    // out before we leak a peer connection + audio sink into the page.
    if (myGeneration !== this.generation) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
      throw new Error('Connect superseded by disconnect');
    }

    this.pc = new RTCPeerConnection();

    // Remote audio sink — Azure sends a single inbound audio track that we
    // pipe straight into a hidden <audio> element for native playback. Tag it
    // so we can find and kill orphans even if our service instance loses the
    // reference (StrictMode races, HMR reloads).
    this.audioEl = document.createElement('audio');
    this.audioEl.autoplay = true;
    this.audioEl.style.display = 'none';
    this.audioEl.dataset.acmeVoice = 'true';
    this.audioEl.dataset.acmeGen = String(myGeneration);
    document.body.appendChild(this.audioEl);
    this.pc.addEventListener('track', (e) => {
      if (this.audioEl && e.streams[0]) {
        this.audioEl.srcObject = e.streams[0];
      }
    });

    this.localStream.getTracks().forEach((track) => {
      this.pc!.addTrack(track, this.localStream!);
    });

    // The data channel name "oai-events" is required by the realtime API.
    this.dc = this.pc.createDataChannel('oai-events');
    this.dc.addEventListener('open', () => {
      // Push the server-authored session config as the first event so the
      // model knows its tools, voice, VAD, and instructions.
      this.sendRaw(minted.sessionConfig);
      this.emit('session.created', { sessionId: minted.sessionId, scenario: minted.scenario });
    });
    this.dc.addEventListener('message', (e) => this.handleEvent(e.data));
    this.dc.addEventListener('close', () => this.emit('disconnected'));

    this.pc.addEventListener('connectionstatechange', () => {
      if (!this.pc) return;
      const state = this.pc.connectionState;
      if (state === 'connected') this.emit('connected');
      if (state === 'failed' || state === 'disconnected' || state === 'closed') {
        this.emit('disconnected', { state });
      }
    });

    // SDP offer/answer dance — POST raw SDP to Azure with the ephemeral key.
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    const sdpResp = await fetch(minted.webrtcUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${minted.clientSecret}`,
        'Content-Type': 'application/sdp',
      },
      body: offer.sdp,
    });
    if (!sdpResp.ok) {
      const text = await sdpResp.text();
      throw new Error(`Azure realtime SDP exchange failed: ${sdpResp.status} ${text.slice(0, 200)}`);
    }
    const answerSdp = await sdpResp.text();
    await this.pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

    // Final superseded check after the SDP round-trip. If the user clicked
    // End Session while Azure was answering, tear everything we just built
    // down instead of leaving a live track playing.
    if (myGeneration !== this.generation) {
      this._teardown();
      throw new Error('Connect superseded by disconnect');
    }

    this.cachedScenario = minted.scenario;
    return { sessionId: minted.sessionId, scenario: minted.scenario };
  }

  /**
   * Send a text-only user message into the live conversation (used by
   * the persona-tile opener and the text fallback input).
   */
  sendText(text: string): void {
    if (!this.dc || this.dc.readyState !== 'open') return;
    this.sendRaw({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }],
      },
    });
    this.sendRaw({ type: 'response.create' });
  }

  /** Cancel the agent's in-flight response (barge-in). */
  cancelResponse(): void {
    if (!this.dc || this.dc.readyState !== 'open') return;
    this.sendRaw({ type: 'response.cancel' });
  }

  /** Tear down everything and detach the audio sink. */
  disconnect(): void {
    // Bump generation FIRST so any in-flight connect promise bails out.
    this.generation += 1;
    this._teardown();
  }

  private _teardown(): void {
    if (this.dc) { try { this.dc.close(); } catch { /* ignore */ } this.dc = null; }
    if (this.pc) { try { this.pc.close(); } catch { /* ignore */ } this.pc = null; }
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    if (this.audioEl) {
      try {
        this.audioEl.pause();
        this.audioEl.srcObject = null;
      } catch { /* ignore */ }
      this.audioEl.remove();
      this.audioEl = null;
    }
    this.sessionId = null;
    this.cachedScenario = null;
    // Sweep any orphans created by previous connect-races or HMR reloads.
    this._purgeOrphanAudio();
  }

  /**
   * Remove every <audio data-acme-voice="true"> element currently in the
   * DOM. This catches the StrictMode-race orphan where a stale connect
   * resolved AFTER the cleanup that was supposed to kill it.
   */
  private _purgeOrphanAudio(): void {
    if (typeof document === 'undefined') return;
    const nodes = document.querySelectorAll<HTMLAudioElement>(
      'audio[data-acme-voice="true"]',
    );
    nodes.forEach((node) => {
      try {
        node.pause();
        node.srcObject = null;
      } catch { /* ignore */ }
      node.remove();
    });
  }

  /** Mute / unmute the local mic without tearing the connection down. */
  setMuted(muted: boolean): void {
    if (!this.localStream) return;
    this.localStream.getAudioTracks().forEach((t) => { t.enabled = !muted; });
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private sendRaw(payload: Record<string, unknown>): void {
    if (!this.dc || this.dc.readyState !== 'open') return;
    this.dc.send(JSON.stringify(payload));
  }

  /** Route a single realtime server event to the emitter taxonomy. */
  private async handleEvent(raw: string): Promise<void> {
    let event: { type?: string; [k: string]: unknown };
    try { event = JSON.parse(raw); } catch { return; }
    if (!event?.type) return;

    switch (event.type) {
      case 'input_audio_buffer.speech_started':
        this.emit('audio.speech_started');
        break;
      case 'input_audio_buffer.speech_stopped':
        this.emit('audio.speech_ended');
        break;
      case 'response.audio_transcript.delta':
        if (typeof event.delta === 'string') {
          this.emit('transcript.partial', { text: event.delta, role: 'assistant' });
        }
        break;
      case 'response.audio_transcript.done':
        if (typeof event.transcript === 'string') {
          this.emit('transcript.final', { text: event.transcript, role: 'assistant' });
        }
        break;
      case 'conversation.item.input_audio_transcription.completed':
        if (typeof event.transcript === 'string') {
          this.emit('transcript.final', { text: event.transcript, role: 'user' });
        }
        break;
      case 'response.function_call_arguments.done':
        await this.handleFunctionCall(event as {
          name?: string; arguments?: string; call_id?: string;
        });
        break;
      case 'response.done':
        this.emit('response.done');
        break;
      case 'error':
        this.emit('error', {
          message: ((event as { error?: { message?: string } }).error?.message) ?? 'realtime error',
        });
        break;
      default:
        // Many low-level events (audio.delta chunks, rate-limit pings, etc.)
        // are intentionally ignored: the audio comes over the media track,
        // not the data channel.
        break;
    }
  }

  /**
   * Round-trip a function call to the server, then push the JSON result
   * back into the conversation so the model can use it in its reply.
   */
  private async handleFunctionCall(event: {
    name?: string; arguments?: string; call_id?: string;
  }): Promise<void> {
    if (!event.name || !event.call_id || !this.sessionId) return;

    this.emit('tool.calling', { toolName: event.name, callId: event.call_id });

    let outputJson: string;
    try {
      const apiBase = getApiBase();
      const resp = await fetch(`${apiBase}/api/realtime/tool`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: this.sessionId,
          name: event.name,
          arguments: event.arguments ?? '{}',
        }),
      });
      const body = await resp.json();
      const data = body?.data?.data ?? { error: 'no result' };
      outputJson = JSON.stringify(data);
      this.emit('tool.completed', { toolName: event.name, callId: event.call_id });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      outputJson = JSON.stringify({ success: false, error: message });
      this.emit('tool.completed', { toolName: event.name, callId: event.call_id, error: message });
    }

    this.sendRaw({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: event.call_id,
        output: outputJson,
      },
    });
    this.sendRaw({ type: 'response.create' });
  }
}

export const webrtcRealtimeService = new WebRtcRealtimeService();
