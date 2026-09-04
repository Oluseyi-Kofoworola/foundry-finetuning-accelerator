/**
 * Acme Health - Scenario Selector Component
 * 
 * Allows users to select and switch between scenarios.
 */

import { clsx } from 'clsx';
import type { ScenarioSummary } from '../types';

interface ScenarioSelectorProps {
  scenarios: ScenarioSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ScenarioSelector({
  scenarios,
  selectedId,
  onSelect,
}: ScenarioSelectorProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
        Select Scenario
      </h3>
      <div className="grid grid-cols-1 gap-3">
        {scenarios.map((scenario) => (
          <ScenarioCard
            key={scenario.id}
            scenario={scenario}
            isSelected={scenario.id === selectedId}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

interface ScenarioCardProps {
  scenario: ScenarioSummary;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

function ScenarioCard({ scenario, isSelected, onSelect }: ScenarioCardProps) {
  return (
    <button
      onClick={() => onSelect(scenario.id)}
      className={clsx(
        'w-full text-left p-4 rounded-xl border-2 transition-all duration-200',
        'hover:shadow-md focus:outline-none focus:ring-2 focus:ring-acme-accent',
        {
          'border-acme-primary bg-acme-primary/5': isSelected,
          'border-gray-200 hover:border-acme-accent/50': !isSelected,
        }
      )}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl" role="img" aria-label={scenario.name}>
          {scenario.icon}
        </span>
        <div className="flex-1 min-w-0">
          <h4
            className={clsx('font-semibold truncate', {
              'text-acme-primary': isSelected,
              'text-gray-800': !isSelected,
            })}
          >
            {scenario.name}
          </h4>
          <p className="text-sm text-gray-500 line-clamp-2">
            {scenario.description}
          </p>
          <span className="inline-block mt-2 text-xs text-acme-secondary bg-acme-accent/10 px-2 py-0.5 rounded-full">
            {scenario.category}
          </span>
        </div>
      </div>
    </button>
  );
}
