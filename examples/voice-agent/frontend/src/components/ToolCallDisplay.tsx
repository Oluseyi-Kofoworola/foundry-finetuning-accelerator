/**
 * Acme Health - Tool Call Display Component
 * 
 * Shows tool/function calls made by the AI assistant in a user-friendly way.
 */

import { useState } from 'react';
import { 
  ChevronDown, 
  ChevronRight, 
  CheckCircle, 
  Clock, 
  XCircle,
  Pill,
  User,
  FileText,
  MapPin,
  Calendar,
  ShieldCheck,
  CreditCard,
  Search
} from 'lucide-react';

interface ToolCall {
  id: string;
  name: string;
  status: 'pending' | 'success' | 'error';
  result?: string;
}

interface ToolCallDisplayProps {
  toolCalls: ToolCall[];
}

const TOOL_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  verify_member_identity: {
    icon: <User className="w-4 h-4" />,
    label: 'Verifying Identity',
    color: 'text-blue-600 bg-blue-50',
  },
  send_mfa_code: {
    icon: <ShieldCheck className="w-4 h-4" />,
    label: 'Sending Verification Code',
    color: 'text-purple-600 bg-purple-50',
  },
  verify_mfa_code: {
    icon: <ShieldCheck className="w-4 h-4" />,
    label: 'Verifying Code',
    color: 'text-purple-600 bg-purple-50',
  },
  lookup_prescriptions: {
    icon: <Pill className="w-4 h-4" />,
    label: 'Looking Up Prescriptions',
    color: 'text-green-600 bg-green-50',
  },
  get_full_medical_records: {
    icon: <FileText className="w-4 h-4" />,
    label: 'Retrieving Medical Records',
    color: 'text-teal-600 bg-teal-50',
  },
  find_in_network_providers: {
    icon: <MapPin className="w-4 h-4" />,
    label: 'Finding Providers',
    color: 'text-orange-600 bg-orange-50',
  },
  schedule_appointment: {
    icon: <Calendar className="w-4 h-4" />,
    label: 'Scheduling Appointment',
    color: 'text-indigo-600 bg-indigo-50',
  },
  calculate_medication_price: {
    icon: <CreditCard className="w-4 h-4" />,
    label: 'Calculating Price',
    color: 'text-emerald-600 bg-emerald-50',
  },
  request_refill: {
    icon: <Pill className="w-4 h-4" />,
    label: 'Processing Refill',
    color: 'text-green-600 bg-green-50',
  },
  transfer_prescription: {
    icon: <Pill className="w-4 h-4" />,
    label: 'Transferring Prescription',
    color: 'text-cyan-600 bg-cyan-50',
  },
  retrieve_patient_context: {
    icon: <Search className="w-4 h-4" />,
    label: 'Getting Patient Info',
    color: 'text-gray-600 bg-gray-50',
  },
  log_action_audit_event: {
    icon: <FileText className="w-4 h-4" />,
    label: 'Logging Action',
    color: 'text-gray-500 bg-gray-50',
  },
};

export function ToolCallDisplay({ toolCalls }: ToolCallDisplayProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (toolCalls.length === 0) return null;

  return (
    <div className="space-y-1.5 my-2">
      {toolCalls.map((tool) => {
        const config = TOOL_CONFIG[tool.name] || {
          icon: <Search className="w-4 h-4" />,
          label: tool.name.replace(/_/g, ' '),
          color: 'text-gray-600 bg-gray-50',
        };
        
        const isExpanded = expanded === tool.id;

        return (
          <div
            key={tool.id}
            className={`rounded-lg border ${
              tool.status === 'success' 
                ? 'border-green-200 bg-green-50/50' 
                : tool.status === 'error'
                ? 'border-red-200 bg-red-50/50'
                : 'border-gray-200 bg-gray-50/50'
            }`}
          >
            <button
              onClick={() => setExpanded(isExpanded ? null : tool.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left"
            >
              <span className={`p-1.5 rounded-md ${config.color}`}>
                {config.icon}
              </span>
              <span className="flex-1 text-sm font-medium text-gray-700">
                {config.label}
              </span>
              {tool.status === 'pending' && (
                <Clock className="w-4 h-4 text-gray-400 animate-pulse" />
              )}
              {tool.status === 'success' && (
                <CheckCircle className="w-4 h-4 text-green-500" />
              )}
              {tool.status === 'error' && (
                <XCircle className="w-4 h-4 text-red-500" />
              )}
              {tool.result && (
                isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                )
              )}
            </button>
            {isExpanded && tool.result && (
              <div className="px-3 pb-2">
                <pre className="text-xs text-gray-600 bg-white/50 rounded p-2 overflow-x-auto">
                  {tool.result}
                </pre>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default ToolCallDisplay;
