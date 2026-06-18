/**
 * Acme Health - Header Component
 */

import { Phone, Settings } from 'lucide-react';
import type { ConnectionStatus } from '../types';
import { clsx } from 'clsx';

interface HeaderProps {
  connectionStatus: ConnectionStatus;
  scenarioName: string | null;
  onSettingsClick?: () => void;
}

export function Header({ connectionStatus, scenarioName, onSettingsClick }: HeaderProps) {
  return (
    <header className="bg-acme-primary text-white shadow-lg">
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Logo and title */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
            <Phone className="w-6 h-6 text-acme-primary" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight">Acme Health — Patient Access Voice Agent</h1>
            <p className="text-xs text-acme-accent leading-tight">Powered by Azure AI Foundry</p>
          </div>
        </div>

        {/* Center - Scenario name */}
        {scenarioName && (
          <div className="hidden sm:block text-center">
            <p className="text-sm text-acme-accent">Active Scenario</p>
            <p className="font-medium">{scenarioName}</p>
          </div>
        )}

        {/* Right - Status and settings */}
        <div className="flex items-center gap-4">
          {/* Connection status */}
          <div className="flex items-center gap-2">
            <div
              className={clsx('w-2 h-2 rounded-full', {
                'bg-green-400': connectionStatus === 'session_active',
                'bg-yellow-400 animate-pulse': connectionStatus === 'connecting',
                'bg-blue-400': connectionStatus === 'connected',
                'bg-red-400': connectionStatus === 'error',
                'bg-gray-400': connectionStatus === 'disconnected',
              })}
            />
            <span className="text-xs text-acme-accent capitalize">
              {connectionStatus.replace('_', ' ')}
            </span>
          </div>

          {/* Settings button */}
          {onSettingsClick && (
            <button
              onClick={onSettingsClick}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              aria-label="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
