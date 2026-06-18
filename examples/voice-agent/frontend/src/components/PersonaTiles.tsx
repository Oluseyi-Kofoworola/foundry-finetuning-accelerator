/**
 * Acme Health - PersonaTiles
 *
 * Welcome-screen persona picker. Surfaces the four mock patients baked
 * into the demo so a presenter can launch a realistic conversation in
 * one click. Each tile seeds the chat with an in-character opening line
 * that references the persona's member ID so verification tools can
 * succeed without the presenter memorizing data.
 */

import { ChevronRight, HeartPulse, Wind, Activity, Droplet } from 'lucide-react';

export interface DemoPersona {
  id: string;
  memberId: string;
  name: string;
  age: number;
  preferredName: string;
  plan: string;
  conditions: string[];
  opener: string;
  icon: React.ReactNode;
  accent: string;
}

export const DEMO_PERSONAS: DemoPersona[] = [
  {
    id: 'MEM-001',
    memberId: 'MEM-001',
    preferredName: 'Sarah',
    name: 'Sarah Johnson',
    age: 38,
    plan: 'Acme Gold PPO',
    conditions: ['Type 2 Diabetes', 'Hypertension'],
    opener:
      "Hi, this is Sarah Johnson. My member ID is MEM-001 and I need to check on my prescription refills.",
    icon: <Droplet className="w-4 h-4" />,
    accent: 'from-rose-500 to-pink-500',
  },
  {
    id: 'MEM-002',
    memberId: 'MEM-002',
    preferredName: 'Bob',
    name: 'Robert "Bob" Martinez',
    age: 62,
    plan: 'Acme Platinum Premier',
    conditions: ['CAD', 'A-fib', 'Hyperlipidemia'],
    opener:
      "Hello, my name is Bob Martinez, member ID MEM-002. I have questions about my Eliquis prescription.",
    icon: <HeartPulse className="w-4 h-4" />,
    accent: 'from-red-500 to-orange-500',
  },
  {
    id: 'MEM-003',
    memberId: 'MEM-003',
    preferredName: 'Emily',
    name: 'Emily Chen',
    age: 28,
    plan: 'Acme Silver HMO',
    conditions: ['Asthma', 'Anxiety'],
    opener:
      "Hi there, I'm Emily Chen, member MEM-003. My rescue inhaler is about to expire and I need a renewal.",
    icon: <Wind className="w-4 h-4" />,
    accent: 'from-sky-500 to-cyan-500',
  },
  {
    id: 'MEM-004',
    memberId: 'MEM-004',
    preferredName: 'Jim',
    name: 'James "Jim" Wilson',
    age: 72,
    plan: 'Acme Medicare Advantage Platinum',
    conditions: ['COPD', 'Osteoarthritis', 'CKD Stage 3'],
    opener:
      "Hello, this is Jim Wilson, member MEM-004. I'd like to find an in-network pulmonologist near me.",
    icon: <Activity className="w-4 h-4" />,
    accent: 'from-emerald-500 to-teal-500',
  },
];

interface PersonaTilesProps {
  onSelect: (persona: DemoPersona) => void;
  disabled?: boolean;
}

export function PersonaTiles({ onSelect, disabled = false }: PersonaTilesProps) {
  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="text-center mb-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-acme-primary/70">
          Demo personas
        </p>
        <p className="text-sm text-slate-500 mt-1">
          Pick a synthetic patient to start a realistic conversation
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {DEMO_PERSONAS.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelect(p)}
            disabled={disabled}
            className="group text-left rounded-2xl border border-slate-200/80 bg-white hover:border-acme-accent/60 hover:shadow-md hover:-translate-y-0.5 transition-all p-4 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-start gap-3">
              <div
                className={`shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br ${p.accent} flex items-center justify-center text-white shadow-sm`}
              >
                {p.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {p.name}
                  </p>
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-acme-primary group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {p.age} · {p.plan}
                </p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {p.conditions.map((c) => (
                    <span
                      key={c}
                      className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-slate-50 text-slate-600 border border-slate-200"
                    >
                      {c}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500 italic mt-2 line-clamp-2 leading-snug">
                  "{p.opener}"
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>

      <p className="text-[11px] text-slate-400 text-center mt-4">
        All data is synthetic. No PHI is processed.
      </p>
    </div>
  );
}
