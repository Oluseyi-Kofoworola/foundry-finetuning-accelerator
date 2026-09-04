/**
 * Acme Health - Message List Component
 * 
 * Displays conversation history with the voice agent.
 */

import { useEffect, useRef } from 'react';
import { User, Bot, Settings, Wrench } from 'lucide-react';
import { clsx } from 'clsx';
import type { Message } from '../types';

interface MessageListProps {
  messages: Message[];
  partialTranscript: string;
}

export function MessageList({ messages, partialTranscript }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages, partialTranscript]);

  if (messages.length === 0 && !partialTranscript) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <p>Start a conversation by pressing the microphone button</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto p-4 space-y-4"
    >
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}

      {/* Partial transcript */}
      {partialTranscript && (
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-acme-primary flex items-center justify-center flex-shrink-0">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div className="bg-gray-100 rounded-2xl rounded-tl-none px-4 py-3 max-w-[80%]">
            <p className="text-gray-600 italic">{partialTranscript}...</p>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const isAssistant = message.role === 'assistant';

  if (isSystem) {
    return (
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-acme-warning flex items-center justify-center flex-shrink-0">
          <Settings className="w-4 h-4 text-white" />
        </div>
        <div className="bg-acme-warning/10 border border-acme-warning/30 rounded-2xl rounded-tl-none px-4 py-3 max-w-[85%]">
          <p className="text-gray-700 text-sm whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={clsx('flex items-start gap-3', {
        'flex-row-reverse': isUser,
      })}
    >
      {/* Avatar */}
      <div
        className={clsx(
          'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
          {
            'bg-acme-secondary': isUser,
            'bg-acme-primary': isAssistant,
          }
        )}
      >
        {isUser ? (
          <User className="w-4 h-4 text-white" />
        ) : (
          <Bot className="w-4 h-4 text-white" />
        )}
      </div>

      {/* Message content */}
      <div
        className={clsx('max-w-[80%] space-y-2', {
          'items-end': isUser,
        })}
      >
        {/* Main message bubble */}
        <div
          className={clsx('rounded-2xl px-4 py-3', {
            'bg-acme-secondary text-white rounded-tr-none': isUser,
            'bg-gray-100 text-gray-800 rounded-tl-none': isAssistant,
          })}
        >
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>

        {/* Tool calls */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {message.toolCalls.map((tool, index) => (
              <div
                key={index}
                className="inline-flex items-center gap-1 px-2 py-1 bg-acme-light rounded-full text-xs text-gray-600"
              >
                <Wrench className="w-3 h-3" />
                <span>{formatToolName(tool.name)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Timestamp */}
        <div
          className={clsx('text-xs text-gray-400', {
            'text-right': isUser,
          })}
        >
          {formatTime(message.timestamp)}
        </div>
      </div>
    </div>
  );
}

function formatToolName(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
