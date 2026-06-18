/**
 * Acme Health - Chat Message List Component
 * 
 * Displays chat messages with text, attachment support, and tool calls.
 */

import { useRef, useEffect } from 'react';
import { User, Bot, FileText, Download, ExternalLink, CheckCircle } from 'lucide-react';

export interface ChatAttachment {
  id: string;
  type: 'image' | 'file';
  name: string;
  url: string;
  mimetype: string;
  size: number;
}

export interface ToolCallInfo {
  name: string;
  status: 'success' | 'error' | 'pending';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments: ChatAttachment[];
  timestamp: Date;
  toolCalls?: ToolCallInfo[];
}

interface ChatMessageListProps {
  messages: ChatMessage[];
  isTyping?: boolean;
}

// Tool name to friendly label mapping
const TOOL_LABELS: Record<string, string> = {
  verify_member_identity: 'Verify Member Identity',
  send_mfa_code: 'Send MFA Verification',
  verify_mfa_code: 'Verify MFA Code',
  lookup_prescriptions: 'Lookup Prescriptions',
  get_full_medical_records: 'Get Full Medical Records',
  calculate_medication_price: 'Calculate Medication Price',
  find_in_network_providers: 'Find In-Network Providers',
  transfer_prescription: 'Transfer Prescription',
  request_refill: 'Request Refill',
  schedule_appointment: 'Schedule Appointment',
  retrieve_patient_context: 'Retrieve Patient Context',
  log_action_audit_event: 'Log Action Audit Event',
};

interface ChatMessageListProps {
  messages: ChatMessage[];
  isTyping?: boolean;
}

export function ChatMessageList({ messages, isTyping = false }: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const formatTime = (date: Date): string => {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const renderAttachment = (attachment: ChatAttachment) => {
    if (attachment.type === 'image') {
      return (
        <a
          key={attachment.id}
          href={attachment.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block max-w-xs rounded-lg overflow-hidden border border-gray-200 hover:border-acme-primary transition-colors"
        >
          <img
            src={attachment.url}
            alt={attachment.name}
            className="w-full h-auto max-h-64 object-cover"
            loading="lazy"
          />
          <div className="px-2 py-1 bg-gray-50 text-xs text-gray-500 flex items-center gap-1">
            <ExternalLink className="w-3 h-3" />
            {attachment.name}
          </div>
        </a>
      );
    }

    return (
      <a
        key={attachment.id}
        href={attachment.url}
        download={attachment.name}
        className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200
                 hover:border-acme-primary hover:bg-gray-100 transition-colors max-w-xs"
      >
        <div className="p-2 bg-acme-primary/10 rounded-lg">
          <FileText className="w-6 h-6 text-acme-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-700 truncate">{attachment.name}</p>
          <p className="text-xs text-gray-400">{formatFileSize(attachment.size)}</p>
        </div>
        <Download className="w-4 h-4 text-gray-400" />
      </a>
    );
  };

  const renderMessage = (message: ChatMessage) => {
    const isUser = message.role === 'user';
    const isSystem = message.role === 'system';

    if (isSystem) {
      return (
        <div key={message.id} className="flex justify-center my-4">
          <div className="px-4 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-full text-sm text-blue-700">
            {message.content}
          </div>
        </div>
      );
    }

    return (
      <div
        key={message.id}
        className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} animate-fadeIn`}
      >
        {/* Avatar with role label */}
        <div className="flex flex-col items-center gap-1">
          <div
            className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center shadow-sm ${
              isUser
                ? 'bg-gradient-to-br from-acme-primary to-acme-secondary ring-2 ring-acme-primary/30'
                : 'bg-gradient-to-br from-emerald-500 to-teal-600 ring-2 ring-emerald-200'
            }`}
          >
            {isUser ? (
              <User className="w-4 h-4 text-white" />
            ) : (
              <Bot className="w-4 h-4 text-white" />
            )}
          </div>
          <span
            className={`text-[10px] font-semibold uppercase tracking-wider ${
              isUser ? 'text-acme-primary' : 'text-emerald-700'
            }`}
          >
            {isUser ? 'You' : 'Agent'}
          </span>
        </div>

        {/* Message content */}
        <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[80%]`}>
          {/* Tool calls indicator */}
          {message.toolCalls && message.toolCalls.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {message.toolCalls.map((tool, idx) => (
                <div
                  key={idx}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 border border-green-200 rounded-full text-xs text-green-700"
                >
                  <CheckCircle className="w-3 h-3" />
                  {TOOL_LABELS[tool.name] || tool.name}
                </div>
              ))}
            </div>
          )}

          {/* Attachments */}
          {message.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {message.attachments.map(renderAttachment)}
            </div>
          )}

          {/* Text content */}
          {message.content && (
            <div
              className={`px-4 py-3 rounded-2xl shadow-sm border-2 ${
                isUser
                  ? 'bg-gradient-to-br from-acme-primary to-acme-secondary text-white border-acme-primary/40 rounded-tr-sm'
                  : 'bg-emerald-50 border-emerald-200 text-gray-800 rounded-tl-sm'
              }`}
            >
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
            </div>
          )}

          {/* Timestamp */}
          <span className="text-xs text-gray-400 mt-1 px-1">
            {formatTime(message.timestamp)}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-gray-50/50 to-white">
      {messages.map(renderMessage)}

      {/* Typing indicator */}
      {isTyping && (
        <div className="flex gap-3 animate-fadeIn">
          <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center shadow-sm">
            <Bot className="w-4 h-4 text-gray-600" />
          </div>
          <div className="px-4 py-3 bg-white border border-gray-100 rounded-2xl rounded-tl-sm shadow-sm">
            <div className="flex gap-1.5">
              <span className="w-2 h-2 bg-acme-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-acme-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-acme-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
