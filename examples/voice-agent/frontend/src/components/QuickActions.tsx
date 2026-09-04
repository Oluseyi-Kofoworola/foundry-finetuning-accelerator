/**
 * Acme Health - Quick Actions Component
 * 
 * Provides one-click access to common healthcare actions.
 */

import { 
  Pill, 
  FileText, 
  Calendar, 
  MapPin, 
  CreditCard,
  Stethoscope,
  Activity,
  ShieldCheck,
  AlertCircle,
  Phone
} from 'lucide-react';

interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  prompt: string;
  category: 'health' | 'prescriptions' | 'appointments' | 'billing' | 'support';
}

// Conversational prompts that feel natural and human-like
const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'view-prescriptions',
    label: 'My Prescriptions',
    icon: <Pill className="w-4 h-4" />,
    prompt: "Hi, I'd like to check on my current prescriptions please.",
    category: 'prescriptions',
  },
  {
    id: 'lab-results',
    label: 'Lab Results',
    icon: <Activity className="w-4 h-4" />,
    prompt: "Hello, I recently had some lab work done and I'd like to see my results.",
    category: 'health',
  },
  {
    id: 'medical-records',
    label: 'Medical Records',
    icon: <FileText className="w-4 h-4" />,
    prompt: "Hi there, could you help me access my medical records?",
    category: 'health',
  },
  {
    id: 'find-doctor',
    label: 'Find a Doctor',
    icon: <Stethoscope className="w-4 h-4" />,
    prompt: "I'm looking for a doctor in my area. Can you help me find one that's in-network?",
    category: 'appointments',
  },
  {
    id: 'schedule-appointment',
    label: 'Schedule Visit',
    icon: <Calendar className="w-4 h-4" />,
    prompt: "I need to schedule an appointment with my doctor. What do I need to do?",
    category: 'appointments',
  },
  {
    id: 'refill-prescription',
    label: 'Refill Rx',
    icon: <ShieldCheck className="w-4 h-4" />,
    prompt: "Hi, I'm running low on my medication and need to request a refill.",
    category: 'prescriptions',
  },
  {
    id: 'check-price',
    label: 'Drug Pricing',
    icon: <CreditCard className="w-4 h-4" />,
    prompt: "Can you tell me how much my medications will cost with my insurance?",
    category: 'billing',
  },
  {
    id: 'find-pharmacy',
    label: 'Find Pharmacy',
    icon: <MapPin className="w-4 h-4" />,
    prompt: "I need to find a pharmacy near me that accepts my insurance. Can you help?",
    category: 'appointments',
  },
  {
    id: 'urgent-care',
    label: 'Urgent Care',
    icon: <AlertCircle className="w-4 h-4" />,
    prompt: "I'm not feeling well and need to find an urgent care facility nearby.",
    category: 'health',
  },
  {
    id: 'talk-to-human',
    label: 'Talk to Agent',
    icon: <Phone className="w-4 h-4" />,
    prompt: "I have a complex issue and would prefer to speak with a human representative.",
    category: 'support',
  },
];

interface QuickActionsProps {
  onActionSelect: (prompt: string) => void;
  disabled?: boolean;
  compact?: boolean;
}

export function QuickActions({ 
  onActionSelect, 
  disabled = false,
  compact = false 
}: QuickActionsProps) {
  if (compact) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {QUICK_ACTIONS.slice(0, 5).map((action) => (
          <button
            key={action.id}
            onClick={() => onActionSelect(action.prompt)}
            disabled={disabled}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium
                     rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed
                     ${action.category === 'support' 
                       ? 'text-orange-600 bg-orange-50 hover:bg-orange-100 border border-orange-200' 
                       : 'text-gray-600 bg-gray-100 hover:bg-acme-primary hover:text-white'}`}
          >
            {action.icon}
            {action.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-gray-500">Quick Actions</p>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.id}
            onClick={() => onActionSelect(action.prompt)}
            disabled={disabled}
            className={`flex flex-col items-center gap-2 p-3 border 
                     rounded-xl transition-all group disabled:opacity-50 disabled:cursor-not-allowed
                     ${action.category === 'support'
                       ? 'bg-orange-50 border-orange-200 hover:border-orange-400 hover:bg-orange-100'
                       : 'bg-white border-gray-200 hover:border-acme-primary hover:bg-acme-primary/5'}`}
          >
            <div className={`p-2 rounded-lg transition-colors ${
              action.category === 'support' 
                ? 'bg-orange-100 group-hover:bg-orange-200' 
                : 'bg-gray-100 group-hover:bg-acme-primary/10'
            }`}>
              <span className={`transition-colors ${
                action.category === 'support' 
                  ? 'text-orange-600' 
                  : 'text-gray-600 group-hover:text-acme-primary'
              }`}>
                {action.icon}
              </span>
            </div>
            <span className={`text-xs font-medium text-center ${
              action.category === 'support' ? 'text-orange-700' : 'text-gray-700'
            }`}>
              {action.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default QuickActions;
