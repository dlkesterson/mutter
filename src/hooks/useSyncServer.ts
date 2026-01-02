/**
 * useSyncServer Hook
 *
 * Manages the local Automerge sync server sidecar.
 * Provides controls to start/stop the server and monitor its status.
 */

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

/**
 * Sync server status from the Rust backend
 */
export type SyncServerStatus =
  | { type: 'Stopped' }
  | { type: 'Starting' }
  | { type: 'Running'; port: number }
  | { type: 'Failed'; error: string };

/**
 * Normalized status for easier UI handling
 */
export type NormalizedStatus =
  | { state: 'stopped' }
  | { state: 'starting' }
  | { state: 'running'; port: number }
  | { state: 'failed'; error: string };

function normalizeStatus(status: SyncServerStatus): NormalizedStatus {
  if ('type' in status) {
    switch (status.type) {
      case 'Stopped':
        return { state: 'stopped' };
      case 'Starting':
        return { state: 'starting' };
      case 'Running':
        return { state: 'running', port: status.port };
      case 'Failed':
        return { state: 'failed', error: status.error };
    }
  }
  return { state: 'stopped' };
}

/**
 * Hook to control and monitor the sync server sidecar
 */
export function useSyncServer() {
  const [status, setStatus] = useState<NormalizedStatus>({ state: 'stopped' });
  const [serverUrl, setServerUrl] = useState<string | null>(null);

  // Fetch initial status
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const rawStatus = await invoke<SyncServerStatus>('get_sync_server_status');
        const normalized = normalizeStatus(rawStatus);
        setStatus(normalized);

        if (normalized.state === 'running') {
          const url = await invoke<string | null>('get_sync_server_url');
          setServerUrl(url);
        }
      } catch (e) {
        console.error('[useSyncServer] Failed to get status:', e);
      }
    };

    fetchStatus();
  }, []);

  // Listen for status change events
  useEffect(() => {
    let unlistenStart: (() => void) | null = null;
    let unlistenStop: (() => void) | null = null;

    const setupListeners = async () => {
      unlistenStart = await listen<number>('sync-server-started', (event) => {
        console.log('[useSyncServer] Server started on port', event.payload);
        setStatus({ state: 'running', port: event.payload });
        setServerUrl(`ws://127.0.0.1:${event.payload}`);
      });

      unlistenStop = await listen('sync-server-stopped', () => {
        console.log('[useSyncServer] Server stopped');
        setStatus({ state: 'stopped' });
        setServerUrl(null);
      });
    };

    setupListeners();

    return () => {
      unlistenStart?.();
      unlistenStop?.();
    };
  }, []);

  /**
   * Start the sync server
   * @returns The port number on success
   */
  const start = useCallback(async (): Promise<number> => {
    setStatus({ state: 'starting' });
    try {
      const port = await invoke<number>('start_sync_server');
      setStatus({ state: 'running', port });
      setServerUrl(`ws://127.0.0.1:${port}`);
      return port;
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      setStatus({ state: 'failed', error });
      throw e;
    }
  }, []);

  /**
   * Stop the sync server
   */
  const stop = useCallback(async (): Promise<void> => {
    try {
      await invoke('stop_sync_server');
      setStatus({ state: 'stopped' });
      setServerUrl(null);
    } catch (e) {
      console.error('[useSyncServer] Failed to stop:', e);
      throw e;
    }
  }, []);

  /**
   * Check server health (is the process still running?)
   */
  const checkHealth = useCallback(async (): Promise<boolean> => {
    try {
      return await invoke<boolean>('check_sync_server_health');
    } catch (e) {
      console.error('[useSyncServer] Health check failed:', e);
      return false;
    }
  }, []);

  return {
    status,
    serverUrl,
    start,
    stop,
    checkHealth,
    isRunning: status.state === 'running',
    isStarting: status.state === 'starting',
    isFailed: status.state === 'failed',
  };
}
