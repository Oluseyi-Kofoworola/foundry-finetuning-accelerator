/**
 * Acme Health - Conversation Starters Component
 * 
 * Shows suggested conversation starters for the active scenario.
 */

import { MessageCircle } from 'lucide-react';
import type { ConversationStarter } from '../types';

interface ConversationStartersProps {
  starters: ConversationStarter[];
  onSelect: (utterance: string) => void;
}

export function ConversationStarters({
  starters,
  onSelect,
}: ConversationStartersProps) {
  if (starters.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
        <MessageCircle className="w-3 h-3" />
        Try saying
      </h4>
      <div className="flex flex-wrap gap-2">
        {starters.map((starter, index) => (
          <button
            key={index}
            onClick={() => onSelect(starter.utterance)}
            className="text-left px-3 py-2 bg-acme-light hover:bg-acme-accent/10 
                     rounded-lg text-sm text-gray-700 hover:text-acme-primary
                     transition-colors border border-transparent hover:border-acme-accent/30"
            title={starter.description}
          >
            "{starter.label}"
          </button>
        ))}
      </div>
    </div>
  );
}
