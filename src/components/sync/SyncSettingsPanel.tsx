/**
 * Sync Settings Panel
 *
 * Settings panel for configuring CRDT sync servers.
 * Supports local server mode (sidecar) and remote server connections.
 */

import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { useSyncServer } from '@/hooks/useSyncServer';
import { useSyncStatus, formatTimeSince } from '@/hooks/useSyncStatus';
import { connectToSyncServer, disconnectFromSyncServer } from '@/crdt/repo';
import { getStorageItem, setStorageItem } from '@/utils/storage';

type SyncMode = 'disabled' | 'local' | 'remote';

export function SyncSettingsPanel() {
  const [mode, setMode] = useState<SyncMode>('disabled');
  const [remoteUrl, setRemoteUrl] = useState('');
  const [autoStartLocal, setAutoStartLocal] = useState(false);

  const { status: serverStatus, serverUrl, start, stop, isRunning, isStarting } =
    useSyncServer();
  const syncStatus = useSyncStatus();

  // Load saved settings
  useEffect(() => {
    const loadSettings = async () => {
      const savedMode = await getStorageItem<SyncMode>('sync_mode');
      const savedUrl = await getStorageItem<string>('sync_remote_url');
      const savedAutoStart = await getStorageItem<boolean>('sync_auto_start_local');

      if (savedMode) setMode(savedMode);
      if (savedUrl) setRemoteUrl(savedUrl);
      if (savedAutoStart !== null) setAutoStartLocal(savedAutoStart);

      // Auto-start local server if configured
      if (savedMode === 'local' && savedAutoStart) {
        start().catch(console.error);
      }
    };

    loadSettings();
  }, [start]);

  const handleModeChange = async (newMode: SyncMode) => {
    // Stop current connections
    if (isRunning) {
      await stop();
    }
    disconnectFromSyncServer();

    setMode(newMode);
    await setStorageItem('sync_mode', newMode);

    if (newMode === 'local') {
      try {
        const port = await start();
        connectToSyncServer(`ws://127.0.0.1:${port}`);
      } catch (e) {
        console.error('[SyncSettings] Failed to start local server:', e);
      }
    } else if (newMode === 'remote' && remoteUrl.trim()) {
      connectToSyncServer(remoteUrl.trim());
    }
  };

  const handleConnectRemote = () => {
    if (remoteUrl.trim()) {
      setStorageItem('sync_remote_url', remoteUrl.trim());
      connectToSyncServer(remoteUrl.trim());
    }
  };

  const handleDisconnectRemote = () => {
    disconnectFromSyncServer();
  };

  const handleAutoStartChange = async (enabled: boolean) => {
    setAutoStartLocal(enabled);
    await setStorageItem('sync_auto_start_local', enabled);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold border-b border-border pb-2">
          Sync Settings
        </h3>
        <p className="text-sm text-muted-foreground mt-2">
          Sync your vault metadata across devices using Automerge CRDTs.
        </p>
      </div>

      {/* Mode Selection */}
      <div className="space-y-4">
        <Label className="font-medium">Sync Mode</Label>

        <div className="space-y-2">
          <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors">
            <input
              type="radio"
              name="sync-mode"
              value="disabled"
              checked={mode === 'disabled'}
              onChange={() => handleModeChange('disabled')}
              className="mt-1 h-4 w-4 accent-primary"
            />
            <div>
              <div className="font-medium">Disabled</div>
              <div className="text-sm text-muted-foreground">
                Don't sync vault metadata
              </div>
            </div>
          </label>

          <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors">
            <input
              type="radio"
              name="sync-mode"
              value="local"
              checked={mode === 'local'}
              onChange={() => handleModeChange('local')}
              className="mt-1 h-4 w-4 accent-primary"
            />
            <div className="flex-1">
              <div className="font-medium">Local Server</div>
              <div className="text-sm text-muted-foreground">
                Sync between tabs and windows on this device
              </div>
            </div>
          </label>

          <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors">
            <input
              type="radio"
              name="sync-mode"
              value="remote"
              checked={mode === 'remote'}
              onChange={() => handleModeChange('remote')}
              className="mt-1 h-4 w-4 accent-primary"
            />
            <div>
              <div className="font-medium">Remote Server</div>
              <div className="text-sm text-muted-foreground">
                Sync across multiple devices via a remote server
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* Local Server Panel */}
      {mode === 'local' && (
        <div className="p-4 bg-muted/30 rounded-lg space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-sm">Local Server Status</div>
              <div className="text-sm text-muted-foreground">
                {isStarting && 'Starting...'}
                {isRunning && serverUrl && `Running on ${serverUrl}`}
                {serverStatus.state === 'failed' && (
                  <span className="text-destructive">
                    Error: {serverStatus.error}
                  </span>
                )}
                {serverStatus.state === 'stopped' && !isStarting && 'Stopped'}
              </div>
            </div>
            <button
              onClick={() => (isRunning ? stop() : start())}
              disabled={isStarting}
              className={`
                px-4 py-2 rounded-md text-sm font-medium transition-colors
                ${
                  isRunning
                    ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                }
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
            >
              {isStarting ? 'Starting...' : isRunning ? 'Stop Server' : 'Start Server'}
            </button>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoStartLocal}
              onChange={(e) => handleAutoStartChange(e.target.checked)}
              className="h-4 w-4 rounded border-primary text-primary focus:ring-primary accent-primary"
            />
            <span className="text-sm">Auto-start on app launch</span>
          </label>
        </div>
      )}

      {/* Remote Server Panel */}
      {mode === 'remote' && (
        <div className="p-4 bg-muted/30 rounded-lg space-y-4">
          <div>
            <Label htmlFor="remote-url" className="text-sm font-medium">
              Remote Server URL
            </Label>
            <div className="flex gap-2 mt-2">
              <input
                id="remote-url"
                type="text"
                value={remoteUrl}
                onChange={(e) => setRemoteUrl(e.target.value)}
                placeholder="wss://sync.example.com"
                className="flex-1 px-3 py-2 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {syncStatus.isConnected ? (
                <button
                  onClick={handleDisconnectRemote}
                  className="px-4 py-2 bg-destructive text-destructive-foreground rounded-md text-sm font-medium hover:bg-destructive/90"
                >
                  Disconnect
                </button>
              ) : (
                <button
                  onClick={handleConnectRemote}
                  disabled={!remoteUrl.trim()}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Connect
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Enter a WebSocket URL (ws:// or wss://) for your Automerge sync server.
            </p>
          </div>
        </div>
      )}

      {/* Connection Status */}
      {mode !== 'disabled' && (
        <div className="p-4 border border-border rounded-lg space-y-3">
          <div className="font-medium text-sm">Connection Status</div>

          <div className="grid grid-cols-2 gap-y-2 text-sm">
            <span className="text-muted-foreground">Status:</span>
            <span className="capitalize flex items-center gap-2">
              <span
                className={`
                  inline-block w-2 h-2 rounded-full
                  ${syncStatus.state === 'synced' ? 'bg-green-500' : ''}
                  ${syncStatus.state === 'syncing' ? 'bg-yellow-500 animate-pulse' : ''}
                  ${syncStatus.state === 'disconnected' ? 'bg-gray-400' : ''}
                  ${syncStatus.state === 'error' ? 'bg-red-500' : ''}
                `}
              />
              {syncStatus.state}
            </span>

            <span className="text-muted-foreground">Server:</span>
            <span className="font-mono text-xs truncate">
              {syncStatus.serverUrl || 'Not connected'}
            </span>

            <span className="text-muted-foreground">Last sync:</span>
            <span>{formatTimeSince(syncStatus.lastSyncAt)}</span>
          </div>

          {syncStatus.error && (
            <div className="p-2 bg-destructive/10 text-destructive text-sm rounded">
              {syncStatus.error}
            </div>
          )}
        </div>
      )}

      {/* Help Text */}
      <div className="text-xs text-muted-foreground space-y-1">
        <p>
          <strong>Local Server:</strong> Best for syncing between multiple windows
          on the same computer.
        </p>
        <p>
          <strong>Remote Server:</strong> Required for syncing across different
          devices. You can host your own Automerge sync server or use a hosted
          service.
        </p>
      </div>
    </div>
  );
}

export default SyncSettingsPanel;
