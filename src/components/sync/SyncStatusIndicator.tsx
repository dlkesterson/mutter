/**
 * Sync Status Indicator
 *
 * A compact status indicator for the status bar showing
 * the current sync connection state.
 */

import { useSyncStatus, formatTimeSince, SyncState } from '@/hooks/useSyncStatus';

/** Icons for each sync state */
const STATE_ICONS: Record<SyncState, string> = {
  synced: '●',      // Green filled circle
  syncing: '◐',     // Half-filled (animating)
  disconnected: '○', // Empty circle
  error: '⊗',       // Error circle
};

/** Tailwind classes for each sync state */
const STATE_COLORS: Record<SyncState, string> = {
  synced: 'text-green-500',
  syncing: 'text-yellow-500 animate-pulse',
  disconnected: 'text-gray-400',
  error: 'text-red-500',
};

/** Human-readable labels for each state */
const STATE_LABELS: Record<SyncState, string> = {
  synced: 'Synced',
  syncing: 'Syncing',
  disconnected: 'Not connected',
  error: 'Sync error',
};

interface SyncStatusIndicatorProps {
  /** Callback when indicator is clicked */
  onClick?: () => void;
  /** Whether to show the peer count */
  showPeerCount?: boolean;
  /** Whether to show text label */
  showLabel?: boolean;
}

export function SyncStatusIndicator({
  onClick,
  showPeerCount = false,
  showLabel = false,
}: SyncStatusIndicatorProps) {
  const { state, peerCount, lastSyncAt, error, serverUrl } = useSyncStatus();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      // Default: dispatch event to open settings dialog on sync tab
      window.dispatchEvent(
        new CustomEvent('mutter:open-settings', { detail: { tab: 'sync' } })
      );
    }
  };

  const tooltip = getTooltip(state, peerCount, lastSyncAt, error, serverUrl);

  return (
    <button
      className={`
        flex items-center gap-1 px-2 py-1 rounded
        hover:bg-muted transition-colors
        ${STATE_COLORS[state]}
      `}
      title={tooltip}
      onClick={handleClick}
      aria-label={`Sync status: ${STATE_LABELS[state]}`}
    >
      <span className="text-sm">{STATE_ICONS[state]}</span>
      {showPeerCount && peerCount > 0 && (
        <span className="text-xs text-muted-foreground">{peerCount}</span>
      )}
      {showLabel && (
        <span className="text-xs">{STATE_LABELS[state]}</span>
      )}
    </button>
  );
}

function getTooltip(
  state: SyncState,
  peerCount: number,
  lastSyncAt: number | null,
  error: string | null,
  serverUrl: string | null
): string {
  const lines: string[] = [];

  lines.push(STATE_LABELS[state]);

  if (serverUrl) {
    lines.push(`Server: ${serverUrl}`);
  }

  if (peerCount > 0) {
    lines.push(`${peerCount} peer${peerCount !== 1 ? 's' : ''} connected`);
  }

  if (lastSyncAt) {
    lines.push(`Last sync: ${formatTimeSince(lastSyncAt)}`);
  }

  if (error) {
    lines.push(`Error: ${error}`);
  }

  lines.push('Click to configure sync');

  return lines.join('\n');
}

export default SyncStatusIndicator;
