/**
 * Acme Health - Consent Dialog Component
 * 
 * Displays consent message and captures user agreement.
 */

import { Shield, AlertTriangle } from 'lucide-react';

interface ConsentDialogProps {
  message: string;
  onAccept: () => void;
}

export function ConsentDialog({ message, onAccept }: ConsentDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
        {/* Header */}
        <div className="bg-acme-primary px-6 py-4">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-white" />
            <h2 className="text-lg font-semibold text-white">
              Before We Begin
            </h2>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Warning banner */}
          <div className="flex items-start gap-3 p-3 bg-acme-warning/10 rounded-lg border border-acme-warning/30">
            <AlertTriangle className="w-5 h-5 text-acme-warning flex-shrink-0 mt-0.5" />
            <p className="text-sm text-gray-700">
              <strong>Demo System:</strong> This is a demonstration. Do not share real 
              personal health information.
            </p>
          </div>

          {/* Consent message */}
          <div className="text-gray-600 text-sm whitespace-pre-wrap leading-relaxed">
            {message}
          </div>

          {/* Key points */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">By continuing, you understand:</p>
            <ul className="text-sm text-gray-600 space-y-1">
              <li className="flex items-start gap-2">
                <span className="text-acme-success">✓</span>
                <span>This is a demonstration system</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-acme-success">✓</span>
                <span>The assistant cannot provide medical advice</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-acme-success">✓</span>
                <span>For emergencies, call 911</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 bg-gray-50 border-t flex justify-end gap-3">
          <button
            onClick={onAccept}
            className="px-6 py-2 bg-acme-primary text-white font-medium rounded-lg
                     hover:bg-acme-secondary transition-colors
                     focus:outline-none focus:ring-2 focus:ring-acme-accent"
          >
            I Agree - Continue
          </button>
        </div>
      </div>
    </div>
  );
}
