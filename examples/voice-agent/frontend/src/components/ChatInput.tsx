/**
 * Acme Health - Chat Input Component
 * 
 * Enhanced text input with file/image attachment support.
 */

import { useState, useRef, KeyboardEvent, ChangeEvent } from 'react';
import { Send, Paperclip, X, Image, FileText, Loader2 } from 'lucide-react';

interface AttachedFile {
  file: File;
  preview?: string;
  isImage: boolean;
}

interface ChatInputProps {
  onSend: (content: string, files: File[]) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  isLoading?: boolean;
}

export function ChatInput({
  onSend,
  disabled = false,
  placeholder = 'Type a message...',
  isLoading = false,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = async () => {
    if ((text.trim() || attachedFiles.length > 0) && !disabled && !isLoading) {
      const files = attachedFiles.map((af) => af.file);
      await onSend(text.trim(), files);
      setText('');
      setAttachedFiles([]);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    addFiles(files);
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const addFiles = (files: File[]) => {
    const newAttachments: AttachedFile[] = files.slice(0, 5 - attachedFiles.length).map((file) => {
      const isImage = file.type.startsWith('image/');
      const attachment: AttachedFile = { file, isImage };

      if (isImage) {
        attachment.preview = URL.createObjectURL(file);
      }

      return attachment;
    });

    setAttachedFiles((prev) => [...prev, ...newAttachments].slice(0, 5));
  };

  const removeFile = (index: number) => {
    setAttachedFiles((prev) => {
      const file = prev[index];
      if (file.preview) {
        URL.revokeObjectURL(file.preview);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    addFiles(files);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div
      className={`bg-white border rounded-xl transition-colors ${
        isDragging ? 'border-acme-primary border-2 bg-acme-primary/5' : 'border-gray-200'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Attached files preview */}
      {attachedFiles.length > 0 && (
        <div className="p-3 border-b border-gray-100">
          <div className="flex flex-wrap gap-2">
            {attachedFiles.map((attachment, index) => (
              <div
                key={index}
                className="relative group flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200"
              >
                {attachment.isImage ? (
                  <div className="flex items-center gap-2">
                    {attachment.preview ? (
                      <img
                        src={attachment.preview}
                        alt={attachment.file.name}
                        className="w-10 h-10 object-cover rounded"
                      />
                    ) : (
                      <Image className="w-5 h-5 text-gray-400" />
                    )}
                    <div className="max-w-[120px]">
                      <p className="text-xs font-medium text-gray-700 truncate">
                        {attachment.file.name}
                      </p>
                      <p className="text-xs text-gray-400">
                        {formatFileSize(attachment.file.size)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-acme-primary" />
                    <div className="max-w-[120px]">
                      <p className="text-xs font-medium text-gray-700 truncate">
                        {attachment.file.name}
                      </p>
                      <p className="text-xs text-gray-400">
                        {formatFileSize(attachment.file.size)}
                      </p>
                    </div>
                  </div>
                )}
                <button
                  onClick={() => removeFile(index)}
                  className="absolute -top-2 -right-2 p-1 bg-gray-600 text-white rounded-full
                           opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-700"
                  aria-label="Remove file"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          {attachedFiles.length >= 5 && (
            <p className="text-xs text-gray-400 mt-2">Maximum 5 files allowed</p>
          )}
        </div>
      )}

      {/* Input area */}
      <div className="flex items-end gap-2 p-2">
        {/* File attachment button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || attachedFiles.length >= 5}
          className="p-2 text-gray-400 hover:text-acme-primary transition-colors
                   disabled:opacity-50 disabled:cursor-not-allowed rounded-lg hover:bg-gray-50"
          aria-label="Attach file"
          title="Attach files (images, PDFs, documents)"
        >
          <Paperclip className="w-5 h-5" />
        </button>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Text input */}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={isDragging ? 'Drop files here...' : placeholder}
          rows={1}
          className="flex-1 px-3 py-2 bg-transparent outline-none text-gray-800 resize-none
                   placeholder-gray-400 disabled:opacity-50 max-h-32 min-h-[40px]"
          style={{ height: 'auto' }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = 'auto';
            target.style.height = Math.min(target.scrollHeight, 128) + 'px';
          }}
        />

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={disabled || isLoading || (!text.trim() && attachedFiles.length === 0)}
          className="p-2 bg-acme-primary text-white rounded-lg
                   hover:bg-acme-secondary transition-colors
                   disabled:opacity-50 disabled:cursor-not-allowed
                   focus:outline-none focus:ring-2 focus:ring-acme-accent"
          aria-label="Send message"
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Drop zone overlay */}
      {isDragging && (
        <div className="absolute inset-0 flex items-center justify-center bg-acme-primary/10 rounded-xl pointer-events-none">
          <div className="text-acme-primary font-medium">Drop files here</div>
        </div>
      )}
    </div>
  );
}
