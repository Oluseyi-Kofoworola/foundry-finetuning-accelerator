/**
 * Acme Health - Voice Button Component
 * 
 * Main push-to-talk button for voice interaction.
 */

import { Mic, MicOff, Loader2, Volume2 } from 'lucide-react';
import { clsx } from 'clsx';
import type { VoiceState } from '../types';

interface VoiceButtonProps {
  state: VoiceState;
  volume: number;
  disabled?: boolean;
  onPressStart: () => void;
  onPressEnd: () => void;
}

export function VoiceButton({
  state,
  volume,
  disabled = false,
  onPressStart,
  onPressEnd,
}: VoiceButtonProps) {
  const isActive = state === 'listening' || state === 'speaking';
  const isListening = state === 'listening';
  const isSpeaking = state === 'speaking';
  const isProcessing = state === 'processing';
  const isError = state === 'error';

  // Calculate pulse size based on volume
  const pulseScale = isListening ? 1 + volume * 0.5 : 1;

  return (
    <div className="relative flex items-center justify-center">
      {/* Pulse ring animation */}
      {isListening && (
        <div
          className="absolute w-32 h-32 rounded-full bg-acme-accent/30 animate-ping"
          style={{ transform: `scale(${pulseScale})` }}
        />
      )}

      {/* Speaking indicator */}
      {isSpeaking && (
        <div className="absolute w-32 h-32 rounded-full bg-acme-success/20 animate-pulse-slow" />
      )}

      {/* Main button */}
      <button
        type="button"
        disabled={disabled || isProcessing}
        onMouseDown={onPressStart}
        onMouseUp={onPressEnd}
        onMouseLeave={onPressEnd}
        onTouchStart={(e) => {
          e.preventDefault();
          onPressStart();
        }}
        onTouchEnd={(e) => {
          e.preventDefault();
          onPressEnd();
        }}
        className={clsx(
          'relative z-10 w-24 h-24 rounded-full flex items-center justify-center',
          'transition-all duration-200 ease-out',
          'focus:outline-none focus:ring-4 focus:ring-acme-accent/50',
          'shadow-lg',
          {
            'bg-acme-primary hover:bg-acme-secondary cursor-pointer':
              !disabled && !isActive && !isProcessing && !isError,
            'bg-acme-accent': isListening,
            'bg-acme-success': isSpeaking,
            'bg-acme-secondary': isProcessing,
            'bg-acme-error': isError,
            'bg-gray-400 cursor-not-allowed': disabled,
          }
        )}
        aria-label={
          isListening
            ? 'Release to stop'
            : isSpeaking
            ? 'Agent speaking'
            : 'Hold to speak'
        }
      >
        {isProcessing ? (
          <Loader2 className="w-10 h-10 text-white animate-spin" />
        ) : isSpeaking ? (
          <Volume2 className="w-10 h-10 text-white animate-bounce-gentle" />
        ) : isListening ? (
          <Mic className="w-10 h-10 text-white" />
        ) : disabled ? (
          <MicOff className="w-10 h-10 text-white" />
        ) : (
          <Mic className="w-10 h-10 text-white" />
        )}
      </button>

      {/* Status text */}
      <div className="absolute -bottom-8 text-center">
        <span
          className={clsx('text-sm font-medium', {
            'text-acme-accent': isListening,
            'text-acme-success': isSpeaking,
            'text-acme-secondary': isProcessing,
            'text-acme-error': isError,
            'text-gray-500': !isActive && !isProcessing && !isError,
          })}
        >
          {isListening
            ? 'Listening...'
            : isSpeaking
            ? 'Speaking...'
            : isProcessing
            ? 'Processing...'
            : isError
            ? 'Error'
            : 'Hold to speak'}
        </span>
      </div>
    </div>
  );
}
