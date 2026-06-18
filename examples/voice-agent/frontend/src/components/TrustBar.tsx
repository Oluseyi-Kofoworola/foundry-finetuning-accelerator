/**
 * Acme Health - TrustBar
 *
 * Unified, always-visible top strip showing brand, current AI agent,
 * scenario, session/verification state, and mode toggle. Designed to
 * mirror the "trust cues" pattern from executive-grade voice demos:
 * the user can tell at a glance who is on the line, what they're
 * authorized to do, and which AI persona is responding.
 */

import {
  MessageSquare,
  Mic,
  ShieldCheck,
  ShieldAlert,
  CircleDot,
  WifiOff,
  Loader2,
  Trash2,
  Sparkles,
} from 'lucide-react';

export type TrustBarMode = 'chat' | 'voice';
export type TrustBarConnection =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'session_active'
  | 'error';

interface TrustBarProps {
  mode: TrustBarMode;
  onModeChange: (mode: TrustBarMode) => void;
  connection?: TrustBarConnection;
  agentName?: string;
  scenarioName?: string | null;
  verified?: boolean;
  onClear?: () => void;
  clearLabel?: string;
}

function ConnectionPill({ status }: { status: TrustBarConnection }) {
  const map: Record<
    TrustBarConnection,
    { label: string; icon: React.ReactNode; cls: string }
  > = {
    disconnected: {
      label: 'Offline',
      icon: <WifiOff className="w-3 h-3" />,
      cls: 'bg-gray-100 text-gray-600 border-gray-200',
    },
    connecting: {
      label: 'Connecting',
      icon: <Loader2 className="w-3 h-3 animate-spin" />,
      cls: 'bg-amber-50 text-amber-700 border-amber-200',
    },
    connected: {
      label: 'Ready',
      icon: <CircleDot className="w-3 h-3" />,
      cls: 'bg-sky-50 text-sky-700 border-sky-200',
    },
    session_active: {
      label: 'Live',
      icon: <CircleDot className="w-3 h-3 animate-pulse" />,
      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    },
    error: {
      label: 'Error',
      icon: <ShieldAlert className="w-3 h-3" />,
      cls: 'bg-rose-50 text-rose-700 border-rose-200',
    },
  };
  const v = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${v.cls}`}
    >
      {v.icon}
      {v.label}
    </span>
  );
}

export function TrustBar({
  mode,
  onModeChange,
  connection,
  agentName,
  scenarioName,
  verified,
  onClear,
  clearLabel = 'Clear conversation',
}: TrustBarProps) {
  return (
    <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-md border-b border-slate-200/80">
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center gap-4">
        {/* Brand */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-acme-primary to-acme-secondary flex items-center justify-center shadow-sm ring-1 ring-acme-primary/20">
            <span className="text-white font-bold text-sm tracking-tight">SH</span>
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-slate-800">Acme Health Assistant</p>
            <p className="text-[11px] text-slate-500 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-acme-accent" />
              Azure AI Foundry · Demo mode
            </p>
          </div>
        </div>

        {/* Center cluster: agent + scenario + verification */}
        <div className="hidden md:flex items-center gap-2 flex-1 justify-center min-w-0">
          {agentName && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-50 text-slate-700 border border-slate-200 truncate max-w-[220px]">
              <span className="w-1.5 h-1.5 rounded-full bg-acme-accent" />
              {agentName}
            </span>
          )}
          {scenarioName && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 truncate max-w-[220px]">
              {scenarioName}
            </span>
          )}
          {typeof verified === 'boolean' && (
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${
                verified
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-50 text-slate-600 border-slate-200'
              }`}
              title={
                verified
                  ? 'Member identity verified'
                  : 'Member identity not yet verified'
              }
            >
              {verified ? (
                <ShieldCheck className="w-3 h-3" />
              ) : (
                <ShieldAlert className="w-3 h-3" />
              )}
              {verified ? 'Verified' : 'Unverified'}
            </span>
          )}
        </div>

        {/* Right cluster: connection + mode toggle + clear */}
        <div className="flex items-center gap-2 ml-auto md:ml-0 shrink-0">
          {connection && <ConnectionPill status={connection} />}

          <div className="flex bg-slate-100/80 rounded-lg p-0.5 ring-1 ring-slate-200/60">
            <button
              onClick={() => onModeChange('chat')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all ${
                mode === 'chat'
                  ? 'bg-white text-acme-primary shadow-sm ring-1 ring-slate-200/60'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
              aria-pressed={mode === 'chat'}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Chat
            </button>
            <button
              onClick={() => onModeChange('voice')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all ${
                mode === 'voice'
                  ? 'bg-white text-acme-primary shadow-sm ring-1 ring-slate-200/60'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
              aria-pressed={mode === 'voice'}
            >
              <Mic className="w-3.5 h-3.5" />
              Voice
            </button>
          </div>

          {onClear && (
            <button
              onClick={onClear}
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
              title={clearLabel}
              aria-label={clearLabel}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Mobile center cluster (below) */}
      {(agentName || scenarioName || typeof verified === 'boolean') && (
        <div className="md:hidden px-4 pb-2 flex flex-wrap gap-1.5">
          {agentName && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-50 text-slate-700 border border-slate-200">
              <span className="w-1.5 h-1.5 rounded-full bg-acme-accent" />
              {agentName}
            </span>
          )}
          {scenarioName && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
              {scenarioName}
            </span>
          )}
          {typeof verified === 'boolean' && (
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                verified
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-50 text-slate-600 border-slate-200'
              }`}
            >
              {verified ? (
                <ShieldCheck className="w-3 h-3" />
              ) : (
                <ShieldAlert className="w-3 h-3" />
              )}
              {verified ? 'Verified' : 'Unverified'}
            </span>
          )}
        </div>
      )}
    </header>
  );
}
