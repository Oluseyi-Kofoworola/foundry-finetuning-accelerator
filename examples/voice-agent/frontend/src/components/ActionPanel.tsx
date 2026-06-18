/**
 * Acme Health - ActionPanel
 *
 * Right-rail "action packet" timeline. Surfaces every tool the assistant
 * invokes during the conversation as a discrete, time-stamped event so
 * operations staff (or a reviewing leader) can see *what was actually
 * done* without parsing the chat transcript. Mirrors the action-packet
 * + handoff pattern from executive demo consoles.
 */

import { useMemo } from 'react';
import {
  ShieldCheck,
  KeyRound,
  Pill,
  FileText,
  DollarSign,
  Stethoscope,
  ArrowRightLeft,
  RefreshCw,
  CalendarClock,
  UserSearch,
  ClipboardList,
  Search,
  Activity,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Wand2,
} from 'lucide-react';

export type ActionStatus = 'pending' | 'success' | 'error';

export interface ActionPacket {
  id: string;
  tool: string;
  status: ActionStatus;
  timestamp: Date;
}

interface ActionPanelProps {
  packets: ActionPacket[];
  className?: string;
}

interface ToolMeta {
  title: string;
  icon: React.ReactNode;
  tone: 'identity' | 'rx' | 'records' | 'billing' | 'providers' | 'audit' | 'support';
}

const TOOL_META: Record<string, ToolMeta> = {
  verify_member_identity: {
    title: 'Verified member identity',
    icon: <ShieldCheck className="w-4 h-4" />,
    tone: 'identity',
  },
  send_mfa_code: {
    title: 'Sent MFA verification',
    icon: <KeyRound className="w-4 h-4" />,
    tone: 'identity',
  },
  send_mfa_verification: {
    title: 'Sent MFA verification',
    icon: <KeyRound className="w-4 h-4" />,
    tone: 'identity',
  },
  verify_mfa_code: {
    title: 'Confirmed MFA code',
    icon: <ShieldCheck className="w-4 h-4" />,
    tone: 'identity',
  },
  lookup_prescriptions: {
    title: 'Looked up prescriptions',
    icon: <Pill className="w-4 h-4" />,
    tone: 'rx',
  },
  request_refill: {
    title: 'Requested refill',
    icon: <RefreshCw className="w-4 h-4" />,
    tone: 'rx',
  },
  transfer_prescription: {
    title: 'Transferred prescription',
    icon: <ArrowRightLeft className="w-4 h-4" />,
    tone: 'rx',
  },
  calculate_medication_price: {
    title: 'Calculated medication price',
    icon: <DollarSign className="w-4 h-4" />,
    tone: 'billing',
  },
  find_in_network_providers: {
    title: 'Found in-network providers',
    icon: <Stethoscope className="w-4 h-4" />,
    tone: 'providers',
  },
  retrieve_patient_context: {
    title: 'Pulled patient context',
    icon: <UserSearch className="w-4 h-4" />,
    tone: 'records',
  },
  get_full_medical_records: {
    title: 'Retrieved medical records',
    icon: <FileText className="w-4 h-4" />,
    tone: 'records',
  },
  schedule_appointment: {
    title: 'Scheduled appointment',
    icon: <CalendarClock className="w-4 h-4" />,
    tone: 'providers',
  },
  log_action_audit_event: {
    title: 'Audit event logged',
    icon: <ClipboardList className="w-4 h-4" />,
    tone: 'audit',
  },
  search_acme_knowledge: {
    title: 'Searched knowledge base',
    icon: <Search className="w-4 h-4" />,
    tone: 'support',
  },
};

const TONE_STYLES: Record<ToolMeta['tone'], string> = {
  identity: 'bg-emerald-50 text-emerald-600 ring-emerald-200',
  rx: 'bg-sky-50 text-sky-600 ring-sky-200',
  records: 'bg-indigo-50 text-indigo-600 ring-indigo-200',
  billing: 'bg-amber-50 text-amber-600 ring-amber-200',
  providers: 'bg-purple-50 text-purple-600 ring-purple-200',
  audit: 'bg-slate-100 text-slate-600 ring-slate-200',
  support: 'bg-teal-50 text-teal-600 ring-teal-200',
};

function StatusBadge({ status }: { status: ActionStatus }) {
  if (status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700">
        <Loader2 className="w-3 h-3 animate-spin" />
        Running
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-rose-700">
        <AlertCircle className="w-3 h-3" />
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700">
      <CheckCircle2 className="w-3 h-3" />
      Completed
    </span>
  );
}

function formatTime(d: Date): string {
  return new Date(d).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function humanize(tool: string): string {
  return tool
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ActionPanel({ packets, className = '' }: ActionPanelProps) {
  const ordered = useMemo(
    () =>
      [...packets].sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      ),
    [packets],
  );

  return (
    <aside
      className={`hidden xl:flex flex-col w-80 shrink-0 border-l border-slate-200/80 bg-white/60 backdrop-blur-sm ${className}`}
    >
      <div className="px-4 py-3 border-b border-slate-200/80 bg-white/70">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-acme-primary" />
          <h2 className="text-sm font-semibold text-slate-800">Actions taken</h2>
          {ordered.length > 0 && (
            <span className="ml-auto text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              {ordered.length}
            </span>
          )}
        </div>
        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
          Every tool the assistant invokes appears here as an audit-grade
          record. No PHI is sent off the demo.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {ordered.length === 0 ? (
          <div className="flex flex-col items-center text-center px-4 py-10 text-slate-400">
            <div className="w-12 h-12 rounded-2xl bg-slate-50 ring-1 ring-slate-200/70 flex items-center justify-center mb-3">
              <Wand2 className="w-5 h-5" />
            </div>
            <p className="text-xs font-medium text-slate-500">
              No actions yet
            </p>
            <p className="text-[11px] mt-1 leading-relaxed">
              Ask about prescriptions, providers, or appointments and the
              assistant will run the right tool.
            </p>
          </div>
        ) : (
          <ol className="relative space-y-2">
            {ordered.map((p) => {
              const meta = TOOL_META[p.tool];
              const tone = meta?.tone ?? 'support';
              return (
                <li
                  key={p.id}
                  className="group rounded-xl border border-slate-200/70 bg-white hover:border-acme-accent/40 hover:shadow-sm transition-all p-3 animate-fadeIn"
                >
                  <div className="flex items-start gap-2.5">
                    <div
                      className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ring-1 ${TONE_STYLES[tone]}`}
                    >
                      {meta?.icon ?? <Activity className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13px] font-medium text-slate-800 leading-snug truncate">
                          {meta?.title ?? humanize(p.tool)}
                        </p>
                        <span className="text-[10px] text-slate-400 shrink-0 mt-0.5">
                          {formatTime(p.timestamp)}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 font-mono truncate">
                        {p.tool}
                      </p>
                      <div className="mt-1.5">
                        <StatusBadge status={p.status} />
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </aside>
  );
}
