/**
 * Acme Health - Audio Service
 * 
 * Handles microphone input, audio playback, and audio processing.
 * Supports continuous listening with voice activity detection.
 */

export class AudioService {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private audioQueue: ArrayBuffer[] = [];
  private isPlaying = false;
  private onAudioData: ((data: string) => void) | null = null;
  private onVolumeChange: ((volume: number) => void) | null = null;
  
  // Track recording nodes for proper cleanup
  private recordingSource: MediaStreamAudioSourceNode | null = null;
  private recordingProcessor: ScriptProcessorNode | null = null;
  private isRecording = false;
  private volumeAnimationId: number | null = null;

  /**
   * Initialize audio context and request microphone permission
   */
  async initialize(): Promise<void> {
    try {
      // Create audio context with correct sample rate for OpenAI Realtime API
      this.audioContext = new AudioContext({ sampleRate: 24000 });

      // Request microphone permission with optimal settings
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 24000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Setup analyser for volume visualization
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;

      // Connect microphone to analyser for visualization
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      source.connect(this.analyser);

      console.log('[Audio] Initialized successfully');
      console.log('[Audio] Sample rate:', this.audioContext.sampleRate);
      console.log('[Audio] Media stream active:', this.mediaStream.active);
    } catch (error) {
      console.error('[Audio] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Start recording audio continuously
   */
  async startRecording(onAudioData: (data: string) => void): Promise<void> {
    if (!this.mediaStream || !this.audioContext) {
      throw new Error('Audio not initialized');
    }

    // Stop any existing recording first
    if (this.isRecording) {
      this.stopRecording();
    }

    // Resume audio context if suspended (browser security requirement)
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
      console.log('[Audio] AudioContext resumed');
    }

    this.onAudioData = onAudioData;
    this.isRecording = true;

    // Create new source from media stream
    this.recordingSource = this.audioContext.createMediaStreamSource(this.mediaStream);
    
    // Create script processor for raw PCM data
    // Buffer size of 4096 at 24kHz = ~170ms chunks
    this.recordingProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);

    let audioChunkCount = 0;

    this.recordingProcessor.onaudioprocess = (event) => {
      if (!this.isRecording || !this.onAudioData) {
        return;
      }

      const inputData = event.inputBuffer.getChannelData(0);
      
      // Check if there's actual audio data (not just silence)
      const hasAudio = inputData.some(sample => Math.abs(sample) > 0.001);
      
      if (!hasAudio) {
        return; // Skip silent chunks
      }

      // Convert Float32 to Int16 PCM (required by OpenAI Realtime API)
      const pcmData = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const sample = Math.max(-1, Math.min(1, inputData[i]));
        pcmData[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      }

      // Convert to base64
      const base64 = this.arrayBufferToBase64(pcmData.buffer);
      
      audioChunkCount++;
      if (audioChunkCount % 10 === 0) {
        console.log('[Audio] Sent', audioChunkCount, 'audio chunks');
      }

      this.onAudioData(base64);
    };

    // Connect: source -> processor -> destination
    this.recordingSource.connect(this.recordingProcessor);
    this.recordingProcessor.connect(this.audioContext.destination);

    // Start volume monitoring
    this.startVolumeMonitoring();

    console.log('[Audio] Recording started - continuous mode');
  }

  /**
   * Stop recording
   */
  stopRecording(): void {
    this.isRecording = false;
    this.onAudioData = null;

    // Disconnect and cleanup processor
    if (this.recordingProcessor) {
      this.recordingProcessor.disconnect();
      this.recordingProcessor.onaudioprocess = null;
      this.recordingProcessor = null;
    }

    // Disconnect source
    if (this.recordingSource) {
      this.recordingSource.disconnect();
      this.recordingSource = null;
    }

    // Stop volume monitoring
    if (this.volumeAnimationId) {
      cancelAnimationFrame(this.volumeAnimationId);
      this.volumeAnimationId = null;
    }

    console.log('[Audio] Recording stopped');
  }

  /**
   * Check if currently recording
   */
  get recording(): boolean {
    return this.isRecording;
  }

  /**
   * Play audio from base64 PCM data
   */
  async playAudio(base64Data: string): Promise<void> {
    if (!this.audioContext) {
      throw new Error('Audio not initialized');
    }

    // Decode base64 to ArrayBuffer
    const pcmData = this.base64ToArrayBuffer(base64Data);
    this.audioQueue.push(pcmData);

    // Start playback if not already playing
    if (!this.isPlaying) {
      this.processAudioQueue();
    }
  }

  /**
   * Process queued audio for playback
   */
  private async processAudioQueue(): Promise<void> {
    if (!this.audioContext || this.audioQueue.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;

    const pcmData = this.audioQueue.shift()!;
    
    // Convert Int16 PCM to Float32
    const int16Data = new Int16Array(pcmData);
    const float32Data = new Float32Array(int16Data.length);
    
    for (let i = 0; i < int16Data.length; i++) {
      float32Data[i] = int16Data[i] / (int16Data[i] < 0 ? 0x8000 : 0x7fff);
    }

    // Create audio buffer
    const audioBuffer = this.audioContext.createBuffer(
      1,
      float32Data.length,
      24000
    );
    audioBuffer.copyToChannel(float32Data, 0);

    // Create and play buffer source
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);

    source.onended = () => {
      this.processAudioQueue();
    };

    source.start();
  }

  /**
   * Stop audio playback
   */
  stopPlayback(): void {
    this.audioQueue = [];
    this.isPlaying = false;
  }

  /**
   * Start monitoring input volume
   */
  private startVolumeMonitoring(): void {
    if (!this.analyser) return;

    // Stop any existing monitoring
    if (this.volumeAnimationId) {
      cancelAnimationFrame(this.volumeAnimationId);
    }

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

    const checkVolume = () => {
      if (!this.analyser || !this.isRecording) {
        this.volumeAnimationId = null;
        return;
      }

      this.analyser.getByteFrequencyData(dataArray);
      
      // Calculate average volume
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      const normalizedVolume = average / 255;

      this.onVolumeChange?.(normalizedVolume);

      this.volumeAnimationId = requestAnimationFrame(checkVolume);
    };

    checkVolume();
  }

  /**
   * Set volume change callback
   */
  setVolumeCallback(callback: (volume: number) => void): void {
    this.onVolumeChange = callback;
  }

  /**
   * Get current input volume
   */
  getInputVolume(): number {
    if (!this.analyser) return 0;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    
    const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
    return average / 255;
  }

  /**
   * Convert ArrayBuffer to base64
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert base64 to ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.stopRecording();
    this.stopPlayback();

    // Stop volume monitoring
    if (this.volumeAnimationId) {
      cancelAnimationFrame(this.volumeAnimationId);
      this.volumeAnimationId = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
    }

    if (this.audioContext) {
      this.audioContext.close();
    }

    this.audioContext = null;
    this.mediaStream = null;
    this.analyser = null;
    this.recordingSource = null;
    this.recordingProcessor = null;
  }

  /**
   * Check if audio is supported
   */
  static isSupported(): boolean {
    return !!(
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function' &&
      typeof window !== 'undefined' &&
      window.AudioContext
    );
  }
}

// Singleton instance
export const audioService = new AudioService();
