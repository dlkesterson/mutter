/**
 * useSyncStatus Hook
 *
 * Tracks the overall sync status by monitoring:
 * - WebSocket connection state
 * - Sync activity indicators
 */

import { useState, useEffect } from 'react';
import { getSyncManager } from '@/crdt/repo';
import type { SyncConnectionState } from '@/crdt/syncAdapter';

/**
 * Overall sync state for UI display
 */
export type SyncState = 'synced' | 'syncing' | 'disconnected' | 'error';

/**
 * Combined sync status information
 */
export interface SyncStatus {
  /** Current sync state */
  state: SyncState;
  /** Number of connected peers (if available) */
  peerCount: number;
  /** Timestamp of last successful sync */
  lastSyncAt: number | null;
  /** Number of pending changes */
  pendingChanges: number;
  /** Error message if any */
  error: string | null;
  /** WebSocket URL we're connected to */
  serverUrl: string | null;
  /** Whether we're connected to a sync server */
  isConnected: boolean;
}

/**
 * Hook to get comprehensive sync status
 */
export function useSyncStatus(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>({
    state: 'disconnected',
    peerCount: 0,
    lastSyncAt: null,
    pendingChanges: 0,
    error: null,
    serverUrl: null,
    isConnected: false,
  });

  // Track connection state changes
  useEffect(() => {
    const syncManager = getSyncManager();
    if (!syncManager) return;

    const handleStateChange = (connectionState: SyncConnectionState) => {
      setStatus((prev) => ({
        ...prev,
        state: connectionState.connected
          ? 'synced'
          : connectionState.lastError
            ? 'error'
            : 'disconnected',
        error: connectionState.lastError,
        serverUrl: connectionState.url,
        isConnected: connectionState.connected,
        lastSyncAt: connectionState.connected
          ? connectionState.lastConnectedAt ?? Date.now()
          : prev.lastSyncAt,
      }));
    };

    syncManager.setStateChangeHandler(handleStateChange);

    // Get initial state
    const initialState = syncManager.getState();
    handleStateChange(initialState);

    return () => {
      syncManager.setStateChangeHandler(() => {});
    };
  }, []);

  return status;
}

/**
 * Format time since last sync for display
 */
export function formatTimeSince(timestamp: number | null): string {
  if (!timestamp) return 'Never';

  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 5) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
