# Week 4 Technical Specification: Sync Server + Query Engine + Polish

**Duration:** 5 days
**Goal:** Build sync server sidecar, sync UI, confirmation system, and query DSL

**Prerequisites:** Week 1-3 complete (Block IDs, Context Signals, CRDT Schema v3, Command Ranking, Graph Indexing, Supertags, Transclusion, AI Voice Queries)

---

## Overview

Week 4 completes the implementation roadmap with sync infrastructure and polish features:

| Days | Feature | Unlocks |
|------|---------|---------|
| 1-2 | Automerge Sync Server Sidecar | Real-time CRDT sync across devices, WebSocket relay |
| 3 | Sync UI | Server configuration, connection status, conflict awareness |
| 4 | Confirmation UI + Progressive Disclosure | Safe destructive commands, adaptive UX based on expertise |
| 5 | Query Engine | `type:project status:open` DSL for structured note queries |

---

## Pre-Week 4 Verification

Before starting Week 4 features, verify Week 3 completion:

### Verification Checklist

```bash
# Supertags
# 1. Create supertag definition → badge appears
# 2. Apply to note → field values editable
# 3. Voice "tag this as project" → dialog opens

# Transclusion
# 1. Add ![[Note#block]] → content renders inline
# 2. Edit/Jump buttons work on hover

# AI Queries
# 1. "Summarize notes about X" → returns synthesized answer
# 2. Sources are clickable
```

---

## Days 1-2: Automerge Sync Server Sidecar

### Problem Statement

Currently, CRDT sync uses:
- `BroadcastChannelNetworkAdapter` (same-device tabs only)
- Manual WebSocket URL entry in localStorage
- File-based snapshot sync via `.mutter/crdt/` directory

**Goal:** Bundle `automerge-repo-sync-server` as a Tauri sidecar process that:
1. Runs locally as a WebSocket relay
2. Can be pointed at remote servers
3. Provides automatic reconnection and status monitoring

### Design Decisions

#### Sync Architecture

```
                        ┌─────────────────────────────────────┐
                        │         Tauri Main Process          │
                        │  ┌─────────────────────────────────┐│
                        │  │       Sync Manager (Rust)       ││
                        │  │  - Spawn/kill sidecar           ││
                        │  │  - Health monitoring            ││
                        │  │  - Port allocation              ││
                        │  └─────────────────────────────────┘│
                        └────────────────┬────────────────────┘
                                         │ spawn
                                         ▼
┌───────────────────┐        ┌─────────────────────────────┐
│   Mutter Window   │◄──────►│   Sync Server Sidecar       │
│   (WebSocket)     │  ws:// │   (Node.js process)         │
└───────────────────┘        │   - automerge-repo-sync-srv │
                             │   - Listens on dynamic port │
         ▲                   └─────────────────────────────┘
         │                              │
         │                              │ (optional)
         │                              ▼
         │                   ┌─────────────────────────────┐
         └───────────────────│   Remote Sync Server        │
             (fallback)      │   (cloud/self-hosted)       │
                             └─────────────────────────────┘
```

#### Sidecar Strategy

| Approach | Pros | Cons | Decision |
|----------|------|------|----------|
| **Embedded Node.js** | Full control, single binary | Binary size bloat, complexity | ❌ |
| **Bundled sidecar** | Separate process, easy updates | Requires Node.js or bundled runtime | ✅ |
| **Rust native server** | Pure Rust, no Node | No official automerge-repo server in Rust | ❌ Future |

**Decision:** Bundle pre-compiled sync server as Tauri sidecar with embedded Node.js runtime (using `pkg` or `bun` compiled).

### Implementation Plan

#### Day 1: Sync Server Sidecar + Rust Manager

**File: `src-tauri/src/sync_server.rs`** (new)
```rust
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::net::TcpListener;
use tauri::{AppHandle, Manager};

/// Find an available port for the sync server
fn find_available_port() -> Result<u16, String> {
    TcpListener::bind("127.0.0.1:0")
        .map(|listener| listener.local_addr().unwrap().port())
        .map_err(|e| format!("Failed to find available port: {}", e))
}

/// Sync server state managed by Tauri
pub struct SyncServerState {
    process: Mutex<Option<Child>>,
    port: Mutex<Option<u16>>,
    status: Mutex<SyncServerStatus>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub enum SyncServerStatus {
    Stopped,
    Starting,
    Running { port: u16 },
    Failed { error: String },
}

impl Default for SyncServerState {
    fn default() -> Self {
        Self {
            process: Mutex::new(None),
            port: Mutex::new(None),
            status: Mutex::new(SyncServerStatus::Stopped),
        }
    }
}

impl SyncServerState {
    pub fn get_status(&self) -> SyncServerStatus {
        self.status.lock().unwrap().clone()
    }

    pub fn get_port(&self) -> Option<u16> {
        *self.port.lock().unwrap()
    }
}

/// Get the path to the bundled sync server executable
fn get_sync_server_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    // Tauri sidecar resolution
    let sidecar_name = if cfg!(target_os = "windows") {
        "sync-server.exe"
    } else {
        "sync-server"
    };

    app.path()
        .resource_dir()
        .map(|dir| dir.join("sidecar").join(sidecar_name))
        .map_err(|e| format!("Failed to get resource dir: {}", e))
}

#[tauri::command]
pub async fn start_sync_server(app: AppHandle) -> Result<u16, String> {
    let state = app.state::<SyncServerState>();

    // Check if already running
    {
        let status = state.status.lock().unwrap();
        if let SyncServerStatus::Running { port } = *status {
            return Ok(port);
        }
    }

    // Update status to starting
    {
        let mut status = state.status.lock().unwrap();
        *status = SyncServerStatus::Starting;
    }

    // Find available port
    let port = find_available_port()?;

    // Get sidecar path
    let server_path = get_sync_server_path(&app)?;

    if !server_path.exists() {
        let error = format!("Sync server not found at {:?}", server_path);
        let mut status = state.status.lock().unwrap();
        *status = SyncServerStatus::Failed { error: error.clone() };
        return Err(error);
    }

    // Spawn the sync server process
    let child = Command::new(&server_path)
        .arg("--port")
        .arg(port.to_string())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            let error = format!("Failed to start sync server: {}", e);
            let mut status = state.status.lock().unwrap();
            *status = SyncServerStatus::Failed { error: error.clone() };
            error
        })?;

    // Store state
    {
        let mut process = state.process.lock().unwrap();
        *process = Some(child);
    }
    {
        let mut port_lock = state.port.lock().unwrap();
        *port_lock = Some(port);
    }
    {
        let mut status = state.status.lock().unwrap();
        *status = SyncServerStatus::Running { port };
    }

    // Emit event to frontend
    app.emit("sync-server-started", port).ok();

    Ok(port)
}

#[tauri::command]
pub async fn stop_sync_server(app: AppHandle) -> Result<(), String> {
    let state = app.state::<SyncServerState>();

    let mut process = state.process.lock().unwrap();
    if let Some(ref mut child) = *process {
        child.kill().map_err(|e| format!("Failed to kill sync server: {}", e))?;
        child.wait().ok();
    }
    *process = None;

    {
        let mut port = state.port.lock().unwrap();
        *port = None;
    }
    {
        let mut status = state.status.lock().unwrap();
        *status = SyncServerStatus::Stopped;
    }

    app.emit("sync-server-stopped", ()).ok();

    Ok(())
}

#[tauri::command]
pub async fn get_sync_server_status(app: AppHandle) -> Result<SyncServerStatus, String> {
    let state = app.state::<SyncServerState>();
    Ok(state.get_status())
}

#[tauri::command]
pub async fn get_sync_server_url(app: AppHandle) -> Result<Option<String>, String> {
    let state = app.state::<SyncServerState>();
    let port = state.get_port();
    Ok(port.map(|p| format!("ws://127.0.0.1:{}", p)))
}
```

**Modify: `src-tauri/src/lib.rs`**
```rust
// Add to imports
mod sync_server;

// Add to Tauri builder
.manage(sync_server::SyncServerState::default())
.invoke_handler(tauri::generate_handler![
    // ... existing handlers
    sync_server::start_sync_server,
    sync_server::stop_sync_server,
    sync_server::get_sync_server_status,
    sync_server::get_sync_server_url,
])
```

#### Day 2: Frontend Sync Integration

**File: `src/hooks/useSyncServer.ts`** (new)
```typescript
import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export type SyncServerStatus =
  | { type: 'stopped' }
  | { type: 'starting' }
  | { type: 'running'; port: number }
  | { type: 'failed'; error: string };

export function useSyncServer() {
  const [status, setStatus] = useState<SyncServerStatus>({ type: 'stopped' });
  const [serverUrl, setServerUrl] = useState<string | null>(null);

  // Fetch initial status
  useEffect(() => {
    invoke<SyncServerStatus>('get_sync_server_status')
      .then((s) => {
        if ('Running' in s) {
          setStatus({ type: 'running', port: s.Running.port });
        } else if ('Failed' in s) {
          setStatus({ type: 'failed', error: s.Failed.error });
        } else if ('Starting' in s) {
          setStatus({ type: 'starting' });
        } else {
          setStatus({ type: 'stopped' });
        }
      })
      .catch(console.error);

    invoke<string | null>('get_sync_server_url')
      .then(setServerUrl)
      .catch(console.error);
  }, []);

  // Listen for status changes
  useEffect(() => {
    const unlistenStart = listen<number>('sync-server-started', (event) => {
      setStatus({ type: 'running', port: event.payload });
      setServerUrl(`ws://127.0.0.1:${event.payload}`);
    });

    const unlistenStop = listen('sync-server-stopped', () => {
      setStatus({ type: 'stopped' });
      setServerUrl(null);
    });

    return () => {
      unlistenStart.then((fn) => fn());
      unlistenStop.then((fn) => fn());
    };
  }, []);

  const start = useCallback(async () => {
    setStatus({ type: 'starting' });
    try {
      const port = await invoke<number>('start_sync_server');
      setStatus({ type: 'running', port });
      setServerUrl(`ws://127.0.0.1:${port}`);
      return port;
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      setStatus({ type: 'failed', error });
      throw e;
    }
  }, []);

  const stop = useCallback(async () => {
    await invoke('stop_sync_server');
    setStatus({ type: 'stopped' });
    setServerUrl(null);
  }, []);

  return {
    status,
    serverUrl,
    start,
    stop,
    isRunning: status.type === 'running',
  };
}
```

**File: `src/crdt/syncAdapter.ts`** (new)
```typescript
import { BrowserWebSocketClientAdapter } from '@automerge/automerge-repo-network-websocket';
import type { NetworkAdapterInterface } from '@automerge/automerge-repo';
import type { Repo } from '@automerge/react';

export interface SyncConnectionState {
  connected: boolean;
  url: string | null;
  reconnectAttempts: number;
  lastError: string | null;
}

/**
 * Manages WebSocket sync connection with automatic reconnection
 */
export class SyncConnectionManager {
  private repo: Repo;
  private adapter: BrowserWebSocketClientAdapter | null = null;
  private url: string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private baseReconnectDelay = 1000; // 1 second
  private onStateChange: ((state: SyncConnectionState) => void) | null = null;

  constructor(repo: Repo) {
    this.repo = repo;
  }

  setStateChangeHandler(handler: (state: SyncConnectionState) => void): void {
    this.onStateChange = handler;
  }

  private emitState(connected: boolean, error: string | null = null): void {
    this.onStateChange?.({
      connected,
      url: this.url,
      reconnectAttempts: this.reconnectAttempts,
      lastError: error,
    });
  }

  connect(url: string): void {
    // Disconnect existing connection
    this.disconnect();

    this.url = url;
    this.reconnectAttempts = 0;

    try {
      this.adapter = new BrowserWebSocketClientAdapter(url);

      // Add to repo network
      (this.repo as any).networkSubsystem.addNetworkAdapter(this.adapter);

      // Monitor connection state
      // Note: BrowserWebSocketClientAdapter doesn't expose connection events directly
      // We'll rely on successful message passing to confirm connection
      this.emitState(true);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      this.emitState(false, error);
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.adapter) {
      try {
        // Remove from repo
        (this.repo as any).networkSubsystem.removeNetworkAdapter(this.adapter);
      } catch (e) {
        console.warn('[SyncConnectionManager] Error removing adapter:', e);
      }
      this.adapter = null;
    }

    this.emitState(false);
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('[SyncConnectionManager] Max reconnect attempts reached');
      return;
    }

    const delay = this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    console.log(
      `[SyncConnectionManager] Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`
    );

    this.reconnectTimer = setTimeout(() => {
      if (this.url) {
        this.connect(this.url);
      }
    }, delay);
  }

  getState(): SyncConnectionState {
    return {
      connected: this.adapter !== null,
      url: this.url,
      reconnectAttempts: this.reconnectAttempts,
      lastError: null,
    };
  }
}
```

**Modify: `src/crdt/repo.ts`**
```typescript
import {
  BroadcastChannelNetworkAdapter,
  IndexedDBStorageAdapter,
  Repo,
} from '@automerge/react';
import { SyncConnectionManager } from './syncAdapter';
import type { NetworkAdapterInterface } from '@automerge/automerge-repo';

let repo: Repo | null = null;
let syncManager: SyncConnectionManager | null = null;

export function getCrdtRepo(): Repo {
  if (repo) return repo;

  const network: NetworkAdapterInterface[] = [
    new BroadcastChannelNetworkAdapter({ channelName: 'mutter-crdt' }),
  ];

  repo = new Repo({
    storage: new IndexedDBStorageAdapter('mutter-crdt'),
    network,
  });

  // Initialize sync manager
  syncManager = new SyncConnectionManager(repo);

  // Check for stored WebSocket URL
  const wsUrl = window.localStorage.getItem('mutter:crdt_ws_url')?.trim() ?? '';
  if (wsUrl) {
    syncManager.connect(wsUrl);
  }

  return repo;
}

export function getSyncManager(): SyncConnectionManager | null {
  return syncManager;
}

export function connectToSyncServer(url: string): void {
  if (!syncManager) {
    getCrdtRepo(); // Ensure repo and manager are initialized
  }
  syncManager?.connect(url);
  window.localStorage.setItem('mutter:crdt_ws_url', url);
}

export function disconnectFromSyncServer(): void {
  syncManager?.disconnect();
  window.localStorage.removeItem('mutter:crdt_ws_url');
}
```

### Sidecar Build Configuration

**File: `src-tauri/tauri.conf.json`** (modify)
```json
{
  "bundle": {
    "externalBin": [
      "sidecar/sync-server"
    ]
  }
}
```

**File: `sidecar/package.json`** (new)
```json
{
  "name": "mutter-sync-server",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "build": "bun build --compile --outfile=sync-server server.js"
  },
  "dependencies": {
    "@automerge/automerge-repo-sync-server": "^1.0.0",
    "ws": "^8.14.0"
  }
}
```

**File: `sidecar/server.js`** (new)
```javascript
import { WebSocketServer } from 'ws';
import { Repo } from '@automerge/automerge-repo';
import { NodeWSServerAdapter } from '@automerge/automerge-repo-network-websocket';

const port = parseInt(process.argv.find(a => a.startsWith('--port='))?.split('=')[1] || '3030', 10);

const wss = new WebSocketServer({ port });

const repo = new Repo({
  network: [new NodeWSServerAdapter(wss)],
});

console.log(`Automerge sync server running on ws://localhost:${port}`);

// Keep process alive
process.on('SIGINT', () => {
  console.log('Shutting down sync server...');
  wss.close();
  process.exit(0);
});
```

### Testing Checklist

- [ ] Sync server starts with `start_sync_server` command
- [ ] Dynamically allocates available port
- [ ] Frontend receives WebSocket URL
- [ ] CRDT documents sync between tabs via server
- [ ] Server stops cleanly with `stop_sync_server`
- [ ] Auto-restart on failure (up to 10 attempts)
- [ ] Status indicators update in real-time

---

## Day 3: Sync UI

### Problem Statement

Users need visibility into:
1. Sync server status (running/stopped/error)
2. Connection state (connected/reconnecting/disconnected)
3. Peer information (how many devices syncing)
4. Conflict awareness (when concurrent edits occur)

### Design Decisions

#### Sync UI Placement

```
┌─────────────────────────────────────────────────────────────────────┐
│ Settings Dialog                                                     │
│ ┌───────┬──────────────────────────────────────────────────────────┐│
│ │ Tabs  │                                                          ││
│ │       │  Sync Settings                                           ││
│ │ Editor│  ─────────────────                                       ││
│ │       │                                                          ││
│ │ Voice │  Server Mode                                             ││
│ │       │  ○ Local (runs on this device)                          ││
│ │ Stream│  ○ Remote (connect to existing server)                  ││
│ │       │                                                          ││
│ │ ►Sync │  ┌───────────────────────────────────────────────────┐  ││
│ │       │  │ [●] Local server running on port 3030            │  ││
│ │ API   │  │     Connected peers: 2                           │  ││
│ │       │  │     Last sync: 3 seconds ago                     │  ││
│ │       │  │                               [Stop Server]       │  ││
│ │       │  └───────────────────────────────────────────────────┘  ││
│ │       │                                                          ││
│ │       │  Remote Server URL                                       ││
│ │       │  ┌───────────────────────────────────┐ [Connect]        ││
│ │       │  │ wss://sync.example.com            │                  ││
│ │       │  └───────────────────────────────────┘                  ││
│ │       │                                                          ││
│ │       │  Sync Status                                             ││
│ │       │  ┌───────────────────────────────────────────────────┐  ││
│ │       │  │ ● Synced         Documents: 3                    │  ││
│ │       │  │                  Pending: 0                       │  ││
│ │       │  └───────────────────────────────────────────────────┘  ││
│ └───────┴──────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

#### Status Bar Indicator

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                          [●] [⟳] [?]│
│                                                          │   │   │  │
│                                                          │   │   └──│──► Help
│                                                          │   └──────│──► Sync status
│                                                          └──────────│──► Voice status
└─────────────────────────────────────────────────────────────────────┘
```

### Implementation Plan

**File: `src-tauri/src/config.rs`** (modify - add SyncSettings)
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncSettings {
    #[serde(default = "default_sync_mode")]
    pub mode: String, // "local" | "remote" | "disabled"
    pub remote_url: Option<String>,
    #[serde(default = "default_false")]
    pub auto_start_local: bool,
}

fn default_sync_mode() -> String {
    "disabled".to_string()
}

impl Default for SyncSettings {
    fn default() -> Self {
        Self {
            mode: "disabled".to_string(),
            remote_url: None,
            auto_start_local: false,
        }
    }
}

// Add to Settings struct:
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    // ... existing fields
    #[serde(default)]
    pub sync: SyncSettings,
}
```

**File: `src/components/sync/SyncStatusIndicator.tsx`** (new)
```typescript
import { useSyncStatus } from '@/hooks/useSyncStatus';

type SyncState = 'synced' | 'syncing' | 'disconnected' | 'error';

const STATE_ICONS: Record<SyncState, string> = {
  synced: '●',      // Green filled circle
  syncing: '◐',     // Half-filled (animating)
  disconnected: '○', // Empty circle
  error: '⊗',       // Error circle
};

const STATE_COLORS: Record<SyncState, string> = {
  synced: 'text-green-500',
  syncing: 'text-yellow-500 animate-pulse',
  disconnected: 'text-gray-400',
  error: 'text-red-500',
};

export function SyncStatusIndicator() {
  const { state, peerCount, lastSyncAt } = useSyncStatus();

  return (
    <button
      className={`flex items-center gap-1 px-2 py-1 rounded hover:bg-muted ${STATE_COLORS[state]}`}
      title={getTooltip(state, peerCount, lastSyncAt)}
      onClick={() => {
        window.dispatchEvent(
          new CustomEvent('mutter:open-settings', { detail: { tab: 'sync' } })
        );
      }}
    >
      <span className="text-sm">{STATE_ICONS[state]}</span>
      {peerCount > 0 && (
        <span className="text-xs text-muted-foreground">{peerCount}</span>
      )}
    </button>
  );
}

function getTooltip(state: SyncState, peerCount: number, lastSyncAt: number | null): string {
  switch (state) {
    case 'synced':
      return `Synced with ${peerCount} peer${peerCount !== 1 ? 's' : ''}`;
    case 'syncing':
      return 'Syncing...';
    case 'disconnected':
      return 'Not connected to sync server';
    case 'error':
      return 'Sync error - click to configure';
  }
}
```

**File: `src/hooks/useSyncStatus.ts`** (new)
```typescript
import { useState, useEffect } from 'react';
import { useVaultMetadataCrdt } from './useVaultMetadataCrdt';
import { getSyncManager, getCrdtRepo } from '@/crdt/repo';

export type SyncState = 'synced' | 'syncing' | 'disconnected' | 'error';

export interface SyncStatus {
  state: SyncState;
  peerCount: number;
  lastSyncAt: number | null;
  pendingChanges: number;
  error: string | null;
}

export function useSyncStatus(): SyncStatus {
  const { handle } = useVaultMetadataCrdt();
  const [status, setStatus] = useState<SyncStatus>({
    state: 'disconnected',
    peerCount: 0,
    lastSyncAt: null,
    pendingChanges: 0,
    error: null,
  });

  useEffect(() => {
    const syncManager = getSyncManager();
    if (!syncManager) return;

    const handleStateChange = (connectionState: any) => {
      setStatus((prev) => ({
        ...prev,
        state: connectionState.connected ? 'synced' : 'disconnected',
        error: connectionState.lastError,
      }));
    };

    syncManager.setStateChangeHandler(handleStateChange);

    // Initial state
    const state = syncManager.getState();
    handleStateChange(state);

    return () => {
      syncManager.setStateChangeHandler(() => {});
    };
  }, []);

  // Track document changes for pending count
  useEffect(() => {
    if (!handle) return;

    let lastChangeTime = Date.now();

    const onChange = () => {
      lastChangeTime = Date.now();
      setStatus((prev) => ({
        ...prev,
        lastSyncAt: lastChangeTime,
        state: 'syncing',
      }));

      // Mark as synced after debounce
      setTimeout(() => {
        setStatus((prev) => ({
          ...prev,
          state: prev.error ? 'error' : 'synced',
        }));
      }, 500);
    };

    handle.on('change', onChange);
    return () => {
      handle.off('change', onChange);
    };
  }, [handle]);

  return status;
}
```

**File: `src/components/dialogs/sync-settings-panel.tsx`** (new)
```typescript
import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useSyncServer } from '@/hooks/useSyncServer';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import { connectToSyncServer, disconnectFromSyncServer } from '@/crdt/repo';

type SyncMode = 'disabled' | 'local' | 'remote';

export function SyncSettingsPanel() {
  const [mode, setMode] = useState<SyncMode>('disabled');
  const [remoteUrl, setRemoteUrl] = useState('');
  const { status: serverStatus, serverUrl, start, stop, isRunning } = useSyncServer();
  const syncStatus = useSyncStatus();

  // Load saved settings
  useEffect(() => {
    const savedUrl = localStorage.getItem('mutter:crdt_ws_url');
    if (savedUrl) {
      if (savedUrl.startsWith('ws://127.0.0.1')) {
        setMode('local');
      } else {
        setMode('remote');
        setRemoteUrl(savedUrl);
      }
    }
  }, []);

  const handleModeChange = async (newMode: SyncMode) => {
    // Stop current connections
    if (isRunning) await stop();
    disconnectFromSyncServer();

    setMode(newMode);

    if (newMode === 'local') {
      const port = await start();
      connectToSyncServer(`ws://127.0.0.1:${port}`);
    } else if (newMode === 'remote' && remoteUrl) {
      connectToSyncServer(remoteUrl);
    }
  };

  const handleConnectRemote = () => {
    if (remoteUrl.trim()) {
      connectToSyncServer(remoteUrl.trim());
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-4">Sync Settings</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Sync your vault metadata across devices using Automerge CRDTs.
        </p>
      </div>

      <div className="space-y-4">
        <Label>Sync Mode</Label>
        <RadioGroup value={mode} onValueChange={(v) => handleModeChange(v as SyncMode)}>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="disabled" id="sync-disabled" />
            <Label htmlFor="sync-disabled" className="cursor-pointer">
              Disabled
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="local" id="sync-local" />
            <Label htmlFor="sync-local" className="cursor-pointer">
              Local server (sync between tabs/windows on this device)
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="remote" id="sync-remote" />
            <Label htmlFor="sync-remote" className="cursor-pointer">
              Remote server (sync across devices)
            </Label>
          </div>
        </RadioGroup>
      </div>

      {/* Local Server Status */}
      {mode === 'local' && (
        <div className="p-4 bg-muted rounded-lg space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Local Server</span>
            <span
              className={`text-sm ${
                isRunning ? 'text-green-500' : 'text-gray-500'
              }`}
            >
              {isRunning ? `Running on port ${serverUrl?.split(':').pop()}` : 'Stopped'}
            </span>
          </div>
          {serverStatus.type === 'failed' && (
            <p className="text-sm text-destructive">
              Error: {serverStatus.error}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={isRunning ? 'destructive' : 'default'}
              onClick={() => (isRunning ? stop() : start())}
            >
              {isRunning ? 'Stop Server' : 'Start Server'}
            </Button>
          </div>
        </div>
      )}

      {/* Remote Server Configuration */}
      {mode === 'remote' && (
        <div className="space-y-4">
          <div>
            <Label htmlFor="remote-url">Remote Server URL</Label>
            <div className="flex gap-2 mt-1">
              <Input
                id="remote-url"
                value={remoteUrl}
                onChange={(e) => setRemoteUrl(e.target.value)}
                placeholder="wss://sync.example.com"
              />
              <Button onClick={handleConnectRemote}>Connect</Button>
            </div>
          </div>
        </div>
      )}

      {/* Sync Status */}
      {mode !== 'disabled' && (
        <div className="p-4 border rounded-lg space-y-2">
          <h4 className="text-sm font-medium">Connection Status</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-muted-foreground">Status:</span>
            <span className="capitalize">{syncStatus.state}</span>
            <span className="text-muted-foreground">Peers:</span>
            <span>{syncStatus.peerCount}</span>
            <span className="text-muted-foreground">Last sync:</span>
            <span>
              {syncStatus.lastSyncAt
                ? new Date(syncStatus.lastSyncAt).toLocaleTimeString()
                : 'Never'}
            </span>
          </div>
          {syncStatus.error && (
            <p className="text-sm text-destructive mt-2">{syncStatus.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
```

### Testing Checklist

- [ ] Settings dialog shows Sync tab
- [ ] Local server mode starts/stops correctly
- [ ] Remote server URL can be entered and connected
- [ ] Status indicator shows current sync state
- [ ] Peer count updates when devices connect/disconnect
- [ ] Last sync time updates after changes
- [ ] Error states display meaningful messages

---

## Day 4: Confirmation UI + Progressive Disclosure

### Problem Statement

Voice commands with high destructiveness (`medium` or `high`) should require confirmation before execution. Additionally, the UI should adapt based on user experience level:

- **Novice**: Show more warnings, require confirmations
- **Intermediate**: Balanced confirmations
- **Expert**: Skip confirmations for reversible actions

### Design Decisions

#### Risk-Based Confirmation Flow

```
                    Voice Command Received
                             │
                             ▼
              ┌──────────────────────────────┐
              │ Check command.destructiveness │
              └──────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
          ▼                  ▼                  ▼
       'none'             'low'           'medium'/'high'
          │                  │                  │
          │                  │                  ▼
          │                  │      ┌───────────────────────┐
          │                  │      │ Check user.expertise  │
          │                  │      └───────────────────────┘
          │                  │                  │
          │                  │      ┌───────────┼───────────┐
          │                  │      │           │           │
          │                  │      ▼           ▼           ▼
          │                  │   'novice'  'intermediate' 'expert'
          │                  │      │           │           │
          │                  │      ▼           ▼           ▼
          │                  │   Always     If !reversible  If high
          │                  │   confirm      confirm      only
          │                  │      │           │           │
          │                  │      └─────┬─────┴───────────┘
          │                  │            │
          │                  │            ▼
          │                  │   ┌────────────────────┐
          │                  │   │ Show Confirmation  │
          │                  │   │ Dialog             │
          │                  │   └────────────────────┘
          │                  │            │
          │                  │     ┌──────┴──────┐
          │                  │     ▼             ▼
          │                  │  [Cancel]     [Confirm]
          │                  │     │             │
          │                  │     ▼             │
          │                  │   Abort           │
          │                  │                   │
          └──────────────────┴───────────────────┘
                             │
                             ▼
                      Execute Command
```

#### Confirmation Dialog Design

```
┌──────────────────────────────────────────────┐
│  ⚠️  Confirm Action                          │
├──────────────────────────────────────────────┤
│                                              │
│  Are you sure you want to delete all         │
│  content in this note?                       │
│                                              │
│  ┌──────────────────────────────────────────┐│
│  │ This action will remove:                 ││
│  │ • 1,234 words of content                 ││
│  │ • 3 embedded links                       ││
│  │ • 2 applied supertags                    ││
│  └──────────────────────────────────────────┘│
│                                              │
│  □ Don't ask again for reversible actions   │
│                                              │
│                    [Cancel]  [Delete]        │
└──────────────────────────────────────────────┘
```

### Implementation Plan

**File: `src/types/userProfile.ts`** (new)
```typescript
/**
 * User expertise level for progressive disclosure
 */
export type ExpertiseLevel = 'novice' | 'intermediate' | 'expert';

/**
 * User profile tracking experience and preferences
 */
export interface UserProfile {
  /** How experienced the user is with voice commands */
  expertiseLevel: ExpertiseLevel;

  /** Total commands executed (used to auto-level expertise) */
  commandsExecuted: number;

  /** Commands that should skip confirmation */
  skipConfirmationFor: string[]; // Command IDs

  /** When the user started using Mutter */
  firstUseAt: number;

  /** Last activity timestamp */
  lastActiveAt: number;
}

/**
 * Thresholds for auto-leveling expertise
 */
export const EXPERTISE_THRESHOLDS = {
  novice: 0,
  intermediate: 50,  // After 50 commands
  expert: 200,       // After 200 commands
} as const;

/**
 * Default profile for new users
 */
export function createDefaultProfile(): UserProfile {
  return {
    expertiseLevel: 'novice',
    commandsExecuted: 0,
    skipConfirmationFor: [],
    firstUseAt: Date.now(),
    lastActiveAt: Date.now(),
  };
}

/**
 * Calculate expertise level from command count
 */
export function calculateExpertise(commandCount: number): ExpertiseLevel {
  if (commandCount >= EXPERTISE_THRESHOLDS.expert) return 'expert';
  if (commandCount >= EXPERTISE_THRESHOLDS.intermediate) return 'intermediate';
  return 'novice';
}
```

**File: `src/hooks/useUserProfile.ts`** (new)
```typescript
import { useState, useEffect, useCallback } from 'react';
import {
  UserProfile,
  createDefaultProfile,
  calculateExpertise,
} from '@/types/userProfile';

const STORAGE_KEY = 'mutter:user_profile';

export function useUserProfile() {
  const [profile, setProfile] = useState<UserProfile>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return createDefaultProfile();
      }
    }
    return createDefaultProfile();
  });

  // Persist changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  }, [profile]);

  const recordCommandExecution = useCallback((commandId: string) => {
    setProfile((prev) => {
      const newCount = prev.commandsExecuted + 1;
      return {
        ...prev,
        commandsExecuted: newCount,
        expertiseLevel: calculateExpertise(newCount),
        lastActiveAt: Date.now(),
      };
    });
  }, []);

  const skipConfirmationForCommand = useCallback((commandId: string) => {
    setProfile((prev) => ({
      ...prev,
      skipConfirmationFor: [...prev.skipConfirmationFor, commandId],
    }));
  }, []);

  const shouldConfirm = useCallback(
    (commandId: string, destructiveness: string, reversible: boolean): boolean => {
      // Already skipped
      if (profile.skipConfirmationFor.includes(commandId)) return false;

      // Non-destructive: never confirm
      if (destructiveness === 'none') return false;

      // Low destructiveness: never confirm
      if (destructiveness === 'low') return false;

      // Expert: only confirm high destructiveness or irreversible
      if (profile.expertiseLevel === 'expert') {
        return destructiveness === 'high' || !reversible;
      }

      // Intermediate: confirm if not reversible
      if (profile.expertiseLevel === 'intermediate') {
        return !reversible || destructiveness === 'high';
      }

      // Novice: always confirm medium+ destructiveness
      return true;
    },
    [profile]
  );

  const setExpertiseLevel = useCallback((level: UserProfile['expertiseLevel']) => {
    setProfile((prev) => ({ ...prev, expertiseLevel: level }));
  }, []);

  return {
    profile,
    recordCommandExecution,
    skipConfirmationForCommand,
    shouldConfirm,
    setExpertiseLevel,
  };
}
```

**File: `src/components/dialogs/confirmation-dialog.tsx`** (new)
```typescript
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { VoiceCommand } from '@/types/voiceCommand';

interface ConfirmationDialogProps {
  open: boolean;
  command: VoiceCommand;
  context?: {
    affectedItems?: string[];
    additionalInfo?: string;
  };
  onConfirm: (skipInFuture: boolean) => void;
  onCancel: () => void;
}

const DESTRUCTIVENESS_ICONS: Record<string, string> = {
  none: '',
  low: 'ℹ️',
  medium: '⚠️',
  high: '🛑',
};

const DESTRUCTIVENESS_COLORS: Record<string, string> = {
  none: '',
  low: 'text-blue-500',
  medium: 'text-yellow-500',
  high: 'text-red-500',
};

export function ConfirmationDialog({
  open,
  command,
  context,
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  const [skipInFuture, setSkipInFuture] = useState(false);

  const icon = DESTRUCTIVENESS_ICONS[command.destructiveness];
  const colorClass = DESTRUCTIVENESS_COLORS[command.destructiveness];

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className={`flex items-center gap-2 ${colorClass}`}>
            {icon && <span>{icon}</span>}
            Confirm: {command.name}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to execute this command?
            {command.destructiveness === 'high' && (
              <span className="block mt-2 font-medium text-destructive">
                This action may have significant consequences.
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {context?.affectedItems && context.affectedItems.length > 0 && (
          <div className="mt-4 p-3 bg-muted rounded-lg text-sm">
            <p className="font-medium mb-2">This action will affect:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              {context.affectedItems.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {context?.additionalInfo && (
          <p className="text-sm text-muted-foreground mt-2">
            {context.additionalInfo}
          </p>
        )}

        {command.reversible && (
          <div className="flex items-center gap-2 mt-4">
            <Checkbox
              id="skip-future"
              checked={skipInFuture}
              onCheckedChange={(checked) => setSkipInFuture(checked === true)}
            />
            <Label htmlFor="skip-future" className="text-sm cursor-pointer">
              Don't ask again for this action (it's reversible)
            </Label>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => onConfirm(skipInFuture)}
            className={
              command.destructiveness === 'high'
                ? 'bg-destructive hover:bg-destructive/90'
                : ''
            }
          >
            {command.destructiveness === 'high' ? 'Yes, I understand' : 'Confirm'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

**File: `src/hooks/useConfirmableCommand.ts`** (new)
```typescript
import { useState, useCallback } from 'react';
import { useUserProfile } from './useUserProfile';
import type { VoiceCommand } from '@/types/voiceCommand';

interface ConfirmationState {
  open: boolean;
  command: VoiceCommand | null;
  context?: {
    affectedItems?: string[];
    additionalInfo?: string;
  };
  onResolved: ((confirmed: boolean) => void) | null;
}

export function useConfirmableCommand() {
  const { shouldConfirm, skipConfirmationForCommand, recordCommandExecution } =
    useUserProfile();

  const [confirmationState, setConfirmationState] = useState<ConfirmationState>({
    open: false,
    command: null,
    onResolved: null,
  });

  const executeWithConfirmation = useCallback(
    async (
      command: VoiceCommand,
      context?: { affectedItems?: string[]; additionalInfo?: string }
    ): Promise<boolean> => {
      // Check if confirmation is needed
      const needsConfirmation = shouldConfirm(
        command.id,
        command.destructiveness,
        command.reversible
      );

      if (!needsConfirmation) {
        // Execute directly
        await command.action();
        recordCommandExecution(command.id);
        return true;
      }

      // Show confirmation dialog
      return new Promise((resolve) => {
        setConfirmationState({
          open: true,
          command,
          context,
          onResolved: async (confirmed) => {
            setConfirmationState({
              open: false,
              command: null,
              onResolved: null,
            });

            if (confirmed) {
              await command.action();
              recordCommandExecution(command.id);
            }
            resolve(confirmed);
          },
        });
      });
    },
    [shouldConfirm, recordCommandExecution]
  );

  const handleConfirm = useCallback(
    (skipInFuture: boolean) => {
      if (skipInFuture && confirmationState.command) {
        skipConfirmationForCommand(confirmationState.command.id);
      }
      confirmationState.onResolved?.(true);
    },
    [confirmationState, skipConfirmationForCommand]
  );

  const handleCancel = useCallback(() => {
    confirmationState.onResolved?.(false);
  }, [confirmationState]);

  return {
    confirmationState,
    executeWithConfirmation,
    handleConfirm,
    handleCancel,
  };
}
```

**Modify: `src/hooks/useCommandRanking.ts`** (add confirmation integration)
```typescript
// Add to useCommandExecution:
import { useConfirmableCommand } from './useConfirmableCommand';

export function useCommandExecution() {
  const { recordIntent } = useEditorContext();
  const { executeWithConfirmation, confirmationState, handleConfirm, handleCancel } =
    useConfirmableCommand();

  return useMemo(
    () => ({
      execute: async (scored: ScoredCommand) => {
        try {
          const executed = await executeWithConfirmation(scored.command);
          if (executed) {
            recordIntent(scored.command.bucket);
          }
          return executed;
        } catch (error) {
          console.error('[CommandExecution] Failed:', error);
          return false;
        }
      },
      confirmationState,
      handleConfirm,
      handleCancel,
    }),
    [recordIntent, executeWithConfirmation, confirmationState, handleConfirm, handleCancel]
  );
}
```

### Progressive Disclosure Settings

**Add to settings-dialog.tsx:**
```typescript
// In a new "Experience" section
<div className="space-y-4">
  <Label>Experience Level</Label>
  <p className="text-sm text-muted-foreground">
    Adjust how many confirmations and hints you see.
  </p>
  <RadioGroup value={profile.expertiseLevel} onValueChange={setExpertiseLevel}>
    <div className="flex items-start space-x-2">
      <RadioGroupItem value="novice" id="exp-novice" />
      <div>
        <Label htmlFor="exp-novice">Novice</Label>
        <p className="text-xs text-muted-foreground">
          Show all confirmations and helpful hints
        </p>
      </div>
    </div>
    <div className="flex items-start space-x-2">
      <RadioGroupItem value="intermediate" id="exp-intermediate" />
      <div>
        <Label htmlFor="exp-intermediate">Intermediate</Label>
        <p className="text-xs text-muted-foreground">
          Confirm only irreversible actions
        </p>
      </div>
    </div>
    <div className="flex items-start space-x-2">
      <RadioGroupItem value="expert" id="exp-expert" />
      <div>
        <Label htmlFor="exp-expert">Expert</Label>
        <p className="text-xs text-muted-foreground">
          Minimal confirmations, faster workflow
        </p>
      </div>
    </div>
  </RadioGroup>
  <p className="text-xs text-muted-foreground mt-2">
    Commands executed: {profile.commandsExecuted}
  </p>
</div>
```

### Testing Checklist

- [ ] High destructiveness commands show confirmation dialog
- [ ] Novice users see confirmations for medium+ destructiveness
- [ ] Expert users only confirm high/irreversible
- [ ] "Don't ask again" checkbox works for reversible actions
- [ ] Command count tracks and auto-levels expertise
- [ ] Settings allow manual expertise override
- [ ] Cancel button prevents command execution

---

## Day 5: Query Engine

### Problem Statement

Enable structured queries against the vault using a simple DSL:
- `type:project` → Find notes with project supertag
- `status:active` → Filter by supertag field value
- `tag:work` → Filter by regular markdown tag
- `linked:[[Meeting Notes]]` → Find notes linking to specific note
- `created:>2024-01-01` → Date-based queries

### Design Decisions

#### Query DSL Grammar

```
query       := term+
term        := filter | text
filter      := key ':' value
key         := 'type' | 'status' | 'tag' | 'linked' | 'created' | 'updated' | field_name
value       := word | quoted_string | comparison
comparison  := operator date_or_number
operator    := '>' | '<' | '>=' | '<=' | '='
quoted_string := '"' [^"]* '"'
word        := [^\s:]+
```

#### Query Examples

| Query | Meaning |
|-------|---------|
| `type:project` | Notes with #project supertag |
| `type:project status:active` | Projects where status field = "active" |
| `tag:work tag:urgent` | Notes with both #work and #urgent tags |
| `linked:[[Meeting]]` | Notes that link to "Meeting" note |
| `created:>2024-01-01` | Notes created after Jan 1, 2024 |
| `"exact phrase"` | Full-text search for exact phrase |
| `project deadline` | Full-text search for project AND deadline |

### Implementation Plan

**File: `src/query/parser.ts`** (new)
```typescript
/**
 * Query DSL Parser for Mutter
 *
 * Parses queries like:
 *   type:project status:active
 *   tag:work linked:[[Meeting]]
 *   created:>2024-01-01 "exact phrase"
 */

export type FilterOperator = '=' | '>' | '<' | '>=' | '<=';

export interface FilterTerm {
  type: 'filter';
  key: string;
  operator: FilterOperator;
  value: string;
}

export interface TextTerm {
  type: 'text';
  value: string;
  exact: boolean; // true if quoted
}

export type QueryTerm = FilterTerm | TextTerm;

export interface ParsedQuery {
  terms: QueryTerm[];
  raw: string;
}

/**
 * Known filter keys with special handling
 */
const KNOWN_FILTERS = new Set([
  'type',     // Supertag type
  'tag',      // Markdown tag
  'linked',   // Links to note
  'from',     // Links from note
  'created',  // Creation date
  'updated',  // Update date
  'has',      // Has property (has:blocks, has:supertag)
]);

/**
 * Tokenize query string
 */
function tokenize(query: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < query.length; i++) {
    const char = query[i];

    if (char === '"') {
      if (inQuotes) {
        // End of quoted string
        tokens.push(`"${current}"`);
        current = '';
        inQuotes = false;
      } else {
        // Start of quoted string
        if (current) tokens.push(current);
        current = '';
        inQuotes = true;
      }
    } else if (char === ' ' && !inQuotes) {
      if (current) tokens.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  if (current) tokens.push(current);
  return tokens;
}

/**
 * Parse a filter token (key:value or key:>value)
 */
function parseFilterToken(token: string): FilterTerm | null {
  const colonIdx = token.indexOf(':');
  if (colonIdx === -1) return null;

  const key = token.slice(0, colonIdx).toLowerCase();
  let rest = token.slice(colonIdx + 1);

  // Check for comparison operator
  let operator: FilterOperator = '=';
  if (rest.startsWith('>=')) {
    operator = '>=';
    rest = rest.slice(2);
  } else if (rest.startsWith('<=')) {
    operator = '<=';
    rest = rest.slice(2);
  } else if (rest.startsWith('>')) {
    operator = '>';
    rest = rest.slice(1);
  } else if (rest.startsWith('<')) {
    operator = '<';
    rest = rest.slice(1);
  }

  // Handle [[wikilink]] syntax for linked filter
  if (key === 'linked' || key === 'from') {
    rest = rest.replace(/^\[\[|\]\]$/g, '');
  }

  return {
    type: 'filter',
    key,
    operator,
    value: rest,
  };
}

/**
 * Parse a text token (plain word or "quoted phrase")
 */
function parseTextToken(token: string): TextTerm {
  if (token.startsWith('"') && token.endsWith('"')) {
    return {
      type: 'text',
      value: token.slice(1, -1),
      exact: true,
    };
  }

  return {
    type: 'text',
    value: token,
    exact: false,
  };
}

/**
 * Parse a query string into structured terms
 */
export function parseQuery(query: string): ParsedQuery {
  const tokens = tokenize(query.trim());
  const terms: QueryTerm[] = [];

  for (const token of tokens) {
    const filter = parseFilterToken(token);
    if (filter && (KNOWN_FILTERS.has(filter.key) || filter.key.includes('.'))) {
      terms.push(filter);
    } else {
      terms.push(parseTextToken(token));
    }
  }

  return {
    terms,
    raw: query,
  };
}

/**
 * Validate query and return any errors
 */
export function validateQuery(parsed: ParsedQuery): string[] {
  const errors: string[] = [];

  for (const term of parsed.terms) {
    if (term.type === 'filter') {
      // Check date format for date filters
      if ((term.key === 'created' || term.key === 'updated') && term.operator !== '=') {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(term.value)) {
          errors.push(`Invalid date format for ${term.key}: use YYYY-MM-DD`);
        }
      }
    }
  }

  return errors;
}
```

**File: `src/query/executor.ts`** (new)
```typescript
/**
 * Query Executor for Mutter
 *
 * Executes parsed queries against the CRDT vault metadata
 */

import type { ParsedQuery, FilterTerm, TextTerm } from './parser';
import type { VaultMetadataDoc, VaultNote } from '@/crdt/vaultMetadataDoc';
import {
  findNotesBySupertag,
  findNotesBySupertagField,
  getBacklinks,
  getOutgoingLinks,
} from '@/crdt/vaultMetadataDoc';

export interface QueryResult {
  notes: VaultNote[];
  totalCount: number;
  executionTimeMs: number;
  query: ParsedQuery;
}

/**
 * Check if a note matches a filter term
 */
function matchesFilter(
  note: VaultNote,
  filter: FilterTerm,
  doc: VaultMetadataDoc
): boolean {
  switch (filter.key) {
    case 'type': {
      // Match supertag by definition name
      const definitions = Object.values(doc.supertag_definitions);
      const matchingDef = definitions.find(
        (d) => d.name.toLowerCase() === filter.value.toLowerCase()
      );
      if (!matchingDef) return false;
      return note.supertags?.some((st) => st.definitionId === matchingDef.id) ?? false;
    }

    case 'tag': {
      // Match markdown tag
      return note.tags.some(
        (t) => t.toLowerCase() === filter.value.toLowerCase()
      );
    }

    case 'linked': {
      // Note links TO the specified target
      return note.links.some(
        (l) => l.toLowerCase().includes(filter.value.toLowerCase())
      );
    }

    case 'from': {
      // Note is linked FROM the specified source
      const edges = getBacklinks({ doc, noteId: note.id });
      const sourceNote = Object.values(doc.notes).find(
        (n) => n.title.toLowerCase().includes(filter.value.toLowerCase())
      );
      if (!sourceNote) return false;
      return edges.some((e) => e.sourceNoteId === sourceNote.id);
    }

    case 'created': {
      const noteDate = new Date(note.created_at);
      const filterDate = new Date(filter.value);
      return compareDates(noteDate, filterDate, filter.operator);
    }

    case 'updated': {
      const noteDate = new Date(note.updated_at);
      const filterDate = new Date(filter.value);
      return compareDates(noteDate, filterDate, filter.operator);
    }

    case 'has': {
      switch (filter.value.toLowerCase()) {
        case 'blocks':
          return Object.keys(note.blocks).length > 0;
        case 'supertag':
        case 'supertags':
          return (note.supertags?.length ?? 0) > 0;
        case 'links':
          return note.links.length > 0;
        case 'tags':
          return note.tags.length > 0;
        default:
          return false;
      }
    }

    default: {
      // Check if it's a supertag field filter (e.g., status:active)
      // Format: fieldName:value or type.fieldName:value
      const parts = filter.key.split('.');
      if (parts.length === 2) {
        // type.field format
        const [typeName, fieldName] = parts;
        const def = Object.values(doc.supertag_definitions).find(
          (d) => d.name.toLowerCase() === typeName.toLowerCase()
        );
        if (!def) return false;
        const instance = note.supertags?.find((st) => st.definitionId === def.id);
        if (!instance) return false;
        return matchFieldValue(instance.values[fieldName], filter.value, filter.operator);
      }

      // Simple field name - check all supertags
      for (const instance of note.supertags ?? []) {
        const fieldValue = instance.values[filter.key];
        if (fieldValue !== undefined) {
          if (matchFieldValue(fieldValue, filter.value, filter.operator)) {
            return true;
          }
        }
      }
      return false;
    }
  }
}

function compareDates(
  noteDate: Date,
  filterDate: Date,
  operator: string
): boolean {
  const noteTime = noteDate.getTime();
  const filterTime = filterDate.getTime();

  switch (operator) {
    case '>': return noteTime > filterTime;
    case '>=': return noteTime >= filterTime;
    case '<': return noteTime < filterTime;
    case '<=': return noteTime <= filterTime;
    case '=': return noteDate.toDateString() === filterDate.toDateString();
    default: return false;
  }
}

function matchFieldValue(
  fieldValue: any,
  filterValue: string,
  operator: string
): boolean {
  if (fieldValue === undefined || fieldValue === null) return false;

  // String comparison
  if (typeof fieldValue === 'string') {
    if (operator === '=') {
      return fieldValue.toLowerCase() === filterValue.toLowerCase();
    }
    return fieldValue.toLowerCase().includes(filterValue.toLowerCase());
  }

  // Number comparison
  if (typeof fieldValue === 'number') {
    const filterNum = parseFloat(filterValue);
    if (isNaN(filterNum)) return false;

    switch (operator) {
      case '>': return fieldValue > filterNum;
      case '>=': return fieldValue >= filterNum;
      case '<': return fieldValue < filterNum;
      case '<=': return fieldValue <= filterNum;
      case '=': return fieldValue === filterNum;
      default: return false;
    }
  }

  // Boolean comparison
  if (typeof fieldValue === 'boolean') {
    return fieldValue === (filterValue.toLowerCase() === 'true');
  }

  // Array comparison (multi-select)
  if (Array.isArray(fieldValue)) {
    return fieldValue.some(
      (v) => String(v).toLowerCase() === filterValue.toLowerCase()
    );
  }

  return false;
}

/**
 * Check if a note matches a text term (full-text search)
 */
function matchesText(note: VaultNote, text: TextTerm): boolean {
  const searchValue = text.value.toLowerCase();
  const noteTitle = note.title.toLowerCase();

  if (text.exact) {
    // Exact phrase match in title
    return noteTitle.includes(searchValue);
  }

  // Word match - all words must appear
  const words = searchValue.split(/\s+/);
  return words.every((word) => noteTitle.includes(word));
}

/**
 * Execute a parsed query against the vault
 */
export function executeQuery(
  query: ParsedQuery,
  doc: VaultMetadataDoc
): QueryResult {
  const startTime = performance.now();

  let notes = Object.values(doc.notes);

  // Apply each term as a filter
  for (const term of query.terms) {
    if (term.type === 'filter') {
      notes = notes.filter((note) => matchesFilter(note, term, doc));
    } else {
      notes = notes.filter((note) => matchesText(note, term));
    }
  }

  // Sort by updated_at descending
  notes.sort((a, b) => b.updated_at - a.updated_at);

  const executionTimeMs = performance.now() - startTime;

  return {
    notes,
    totalCount: notes.length,
    executionTimeMs,
    query,
  };
}
```

**File: `src/hooks/useQueryEngine.ts`** (new)
```typescript
import { useState, useCallback, useMemo } from 'react';
import { useVaultMetadataCrdt } from './useVaultMetadataCrdt';
import { parseQuery, validateQuery } from '@/query/parser';
import { executeQuery, QueryResult } from '@/query/executor';

export function useQueryEngine() {
  const { doc } = useVaultMetadataCrdt();
  const [lastResult, setLastResult] = useState<QueryResult | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const search = useCallback(
    (queryString: string): QueryResult | null => {
      if (!doc) {
        setErrors(['Vault not loaded']);
        return null;
      }

      if (!queryString.trim()) {
        setLastResult(null);
        setErrors([]);
        return null;
      }

      const parsed = parseQuery(queryString);
      const validationErrors = validateQuery(parsed);

      if (validationErrors.length > 0) {
        setErrors(validationErrors);
        return null;
      }

      setErrors([]);
      const result = executeQuery(parsed, doc);
      setLastResult(result);
      return result;
    },
    [doc]
  );

  const recentQueries = useMemo(() => {
    const stored = localStorage.getItem('mutter:recent_queries');
    if (!stored) return [];
    try {
      return JSON.parse(stored) as string[];
    } catch {
      return [];
    }
  }, []);

  const saveRecentQuery = useCallback((query: string) => {
    const recent = [...new Set([query, ...recentQueries])].slice(0, 10);
    localStorage.setItem('mutter:recent_queries', JSON.stringify(recent));
  }, [recentQueries]);

  return {
    search,
    lastResult,
    errors,
    recentQueries,
    saveRecentQuery,
  };
}
```

**File: `src/components/QueryPanel.tsx`** (new)
```typescript
import { useState, useEffect } from 'react';
import { useQueryEngine } from '@/hooks/useQueryEngine';
import { Input } from '@/components/ui/input';

interface QueryPanelProps {
  onNavigate: (relPath: string) => void;
}

export function QueryPanel({ onNavigate }: QueryPanelProps) {
  const { search, lastResult, errors, recentQueries, saveRecentQuery } =
    useQueryEngine();
  const [input, setInput] = useState('');
  const [showRecent, setShowRecent] = useState(false);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (input.trim()) {
        search(input);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [input, search]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      saveRecentQuery(input.trim());
      search(input);
    }
  };

  return (
    <div className="query-panel p-4 space-y-4">
      <div>
        <h3 className="text-sm font-medium mb-2">Query Notes</h3>
        <form onSubmit={handleSubmit} className="relative">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setShowRecent(true)}
            onBlur={() => setTimeout(() => setShowRecent(false), 200)}
            placeholder="type:project status:active"
            className="w-full"
          />

          {/* Recent queries dropdown */}
          {showRecent && recentQueries.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded shadow-lg z-10">
              {recentQueries.map((q, i) => (
                <button
                  key={i}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                  onClick={() => {
                    setInput(q);
                    search(q);
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          )}
        </form>

        {/* Query syntax help */}
        <p className="text-xs text-muted-foreground mt-2">
          Examples: <code>type:project</code> <code>status:active</code>{' '}
          <code>tag:work</code> <code>created:{'>'} 2024-01-01</code>
        </p>
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div className="p-3 bg-destructive/10 text-destructive text-sm rounded">
          {errors.map((err, i) => (
            <p key={i}>{err}</p>
          ))}
        </div>
      )}

      {/* Results */}
      {lastResult && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {lastResult.totalCount} result{lastResult.totalCount !== 1 ? 's' : ''}
            </span>
            <span>{lastResult.executionTimeMs.toFixed(1)}ms</span>
          </div>

          <ul className="space-y-1 max-h-64 overflow-y-auto">
            {lastResult.notes.map((note) => (
              <li key={note.id}>
                <button
                  className="w-full text-left px-3 py-2 rounded hover:bg-muted transition-colors"
                  onClick={() => onNavigate(note.rel_path)}
                >
                  <span className="text-sm font-medium">{note.title}</span>
                  {note.supertags && note.supertags.length > 0 && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {note.supertags.length} tag{note.supertags.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

### Voice Commands for Query

**File: `src/voice/commands/search.ts`** (new)
```typescript
import { VoiceCommand } from '@/types/voiceCommand';
import { commandRegistry } from '../commandRegistry';

const searchCommands: VoiceCommand[] = [
  {
    id: 'query-notes',
    name: 'Query notes',
    examples: [
      'search for',
      'find notes where',
      'query notes',
      'filter by',
    ],
    bucket: 'query-ai',
    requiresSelection: false,
    requiresNote: false,
    allowedLocations: ['paragraph', 'heading', 'list', 'blockquote', 'empty'],
    allowedViewModes: ['editor', 'split', 'preview'],
    allowedVoicePhases: ['listening', 'command-recognized'],
    destructiveness: 'none',
    scope: 'vault',
    reversible: false,
    action: () => {
      window.dispatchEvent(
        new CustomEvent('mutter:execute-command', {
          detail: { command: 'open-query-panel' },
        })
      );
    },
  },
  {
    id: 'show-all-projects',
    name: 'Show all projects',
    examples: [
      'show all projects',
      'list projects',
      'find projects',
      'show project notes',
    ],
    bucket: 'query-ai',
    requiresSelection: false,
    requiresNote: false,
    allowedLocations: ['paragraph', 'heading', 'list', 'blockquote', 'empty'],
    allowedViewModes: ['editor', 'split', 'preview'],
    allowedVoicePhases: ['listening', 'command-recognized'],
    destructiveness: 'none',
    scope: 'vault',
    reversible: false,
    action: () => {
      window.dispatchEvent(
        new CustomEvent('mutter:execute-command', {
          detail: { command: 'query', value: 'type:project' },
        })
      );
    },
  },
  {
    id: 'show-active-items',
    name: 'Show active items',
    examples: [
      'show active items',
      'what is active',
      'list active',
      'find active projects',
    ],
    bucket: 'query-ai',
    requiresSelection: false,
    requiresNote: false,
    allowedLocations: ['paragraph', 'heading', 'list', 'blockquote', 'empty'],
    allowedViewModes: ['editor', 'split', 'preview'],
    allowedVoicePhases: ['listening', 'command-recognized'],
    destructiveness: 'none',
    scope: 'vault',
    reversible: false,
    action: () => {
      window.dispatchEvent(
        new CustomEvent('mutter:execute-command', {
          detail: { command: 'query', value: 'status:active' },
        })
      );
    },
  },
];

export function registerSearchCommands(): void {
  searchCommands.forEach((cmd) => commandRegistry.register(cmd));
}

export { searchCommands };
```

### Testing Checklist

- [ ] `type:project` returns notes with project supertag
- [ ] `type:project status:active` filters by field value
- [ ] `tag:work` matches markdown tags
- [ ] `linked:[[Note]]` finds notes linking to Note
- [ ] `created:>2024-01-01` filters by date
- [ ] `"exact phrase"` searches title
- [ ] Query panel shows results with count and timing
- [ ] Recent queries are saved and accessible
- [ ] Voice command "show all projects" executes query
- [ ] Invalid queries show helpful error messages

---

## Files to Create

| File | Purpose |
|------|---------|
| `src-tauri/src/sync_server.rs` | Sync server sidecar management |
| `sidecar/package.json` | Sync server Node.js package |
| `sidecar/server.js` | Sync server entry point |
| `src/hooks/useSyncServer.ts` | Sync server control hook |
| `src/crdt/syncAdapter.ts` | WebSocket connection manager |
| `src/components/sync/SyncStatusIndicator.tsx` | Status bar sync indicator |
| `src/hooks/useSyncStatus.ts` | Sync status tracking hook |
| `src/components/dialogs/sync-settings-panel.tsx` | Sync configuration UI |
| `src/types/userProfile.ts` | User expertise types |
| `src/hooks/useUserProfile.ts` | User profile management |
| `src/components/dialogs/confirmation-dialog.tsx` | Risk-based confirmation |
| `src/hooks/useConfirmableCommand.ts` | Confirmation flow hook |
| `src/query/parser.ts` | Query DSL parser |
| `src/query/executor.ts` | Query execution engine |
| `src/hooks/useQueryEngine.ts` | Query hook |
| `src/components/QueryPanel.tsx` | Query UI panel |
| `src/voice/commands/search.ts` | Query voice commands |

## Files to Modify

| File | Changes |
|------|---------|
| `src-tauri/src/lib.rs` | Register sync server commands and state |
| `src-tauri/src/config.rs` | Add SyncSettings struct |
| `src-tauri/tauri.conf.json` | Configure sidecar bundling |
| `src/crdt/repo.ts` | Integrate SyncConnectionManager |
| `src/hooks/useCommandRanking.ts` | Add confirmation integration |
| `src/voice/commands/index.ts` | Register search commands |
| `src/components/dialogs/settings-dialog.tsx` | Add Sync tab, Experience settings |
| `src/App.tsx` | Add SyncStatusIndicator, QueryPanel |

---

## End of Week 4 Verification

### Sync Server
```bash
# Start local sync server
# 1. Settings → Sync → Local mode → Start Server
# 2. Verify: "Running on port XXXX"
# 3. Open second tab/window
# 4. Make changes in one window
# 5. Verify changes appear in other window within ~2 seconds
```

### Confirmation UI
```typescript
// In DevTools console:
// 1. Set expertise to novice
localStorage.setItem('mutter:user_profile', JSON.stringify({
  expertiseLevel: 'novice',
  commandsExecuted: 0,
  skipConfirmationFor: []
}));

// 2. Trigger a medium-destructiveness command
// 3. Verify confirmation dialog appears

// 4. Change to expert
// 5. Verify only high-destructiveness commands confirm
```

### Query Engine
```
1. Create notes with supertags:
   - Note A: type:project, status:active
   - Note B: type:project, status:paused
   - Note C: type:meeting, tag:work

2. Query: type:project
   → Should return Notes A and B

3. Query: type:project status:active
   → Should return only Note A

4. Query: tag:work
   → Should return Note C

5. Voice: "Show all projects"
   → Query panel opens with type:project results
```

---

## Architecture Diagram

```
+------------------------------------------------------------------------------+
|                              WEEK 4 FEATURES                                  |
+------------------------------------------------------------------------------+
|                                                                               |
|  +-----------------------+  +-------------------+  +-----------------------+ |
|  |    SYNC SERVER       |  |  CONFIRMATION UI  |  |    QUERY ENGINE       | |
|  +-----------------------+  +-------------------+  +-----------------------+ |
|  |                       |  |                   |  |                       | |
|  | +-------------------+ |  | +---------------+ |  | +-------------------+ | |
|  | | Tauri Sidecar     | |  | | Risk-based    | |  | | DSL Parser        | | |
|  | | Manager (Rust)    | |  | | Confirmation  | |  | | type:project...   | | |
|  | +--------+----------+ |  | +-------+-------+ |  | +--------+----------+ | |
|  |          |            |  |         |         |  |          |            | |
|  |          v            |  |         v         |  |          v            | |
|  | +-------------------+ |  | +---------------+ |  | +-------------------+ | |
|  | | Node.js Sidecar   | |  | | User Profile  | |  | | Query Executor    | | |
|  | | automerge-repo-   | |  | | Expertise     | |  | | executeQuery()    | | |
|  | | sync-server       | |  | | Tracking      | |  | +--------+----------+ | |
|  | +--------+----------+ |  | +---------------+ |  |          |            | |
|  |          |            |  |                   |  |          v            | |
|  |          v            |  | +---------------+ |  | +-------------------+ | |
|  | +-------------------+ |  | | Progressive   | |  | | CRDT Doc         | | |
|  | | WebSocket Adapter | |  | | Disclosure    | |  | | Vault Metadata   | | |
|  | | Reconnection      | |  | | Settings      | |  | | (notes, tags,    | | |
|  | +-------------------+ |  | +---------------+ |  | |  supertags)      | | |
|  |                       |  |                   |  | +-------------------+ | |
|  +-----------------------+  +-------------------+  +-----------------------+ |
|                                                                               |
|  <------------------------ Built on Weeks 1-3 --------------------------->   |
|                                                                               |
|   Block IDs | Supertags | Transclusion | AI Queries | Command Ranking | Graph |
|                                                                               |
+------------------------------------------------------------------------------+
```

---

## Risk Assessment

| Feature | Risk | Mitigation |
|---------|------|------------|
| **Sync Server Sidecar** | High | Node.js bundling complexity; test early with `pkg` or `bun compile` |
| **WebSocket Reconnection** | Medium | Implement exponential backoff; cap at 10 attempts |
| **Confirmation UX** | Low | Keep it simple; one dialog fits all destructiveness levels |
| **Query DSL Parsing** | Low | Simple regex-based tokenizer; error on unknown filters |
| **Query Performance** | Medium | In-memory filtering; may need indexing for large vaults (>10k notes) |

---

## Dependencies on Weeks 1-3

| Week 4 Feature | Depends On |
|----------------|------------|
| Sync Server | CRDT Schema v3, `getCrdtRepo()`, `useVaultMetadataCrdt` |
| Sync UI | Settings dialog structure, config.rs patterns |
| Confirmation UI | Command ranking system, VoiceCommand types |
| Query Engine | Supertag definitions, backlink_index, note metadata |
| Query Voice | Command registry, voice phase handling |

---

## Success Criteria

By end of Week 4:
- [ ] Sync server runs as Tauri sidecar
- [ ] CRDT documents sync across tabs/devices via WebSocket
- [ ] Sync UI shows status, allows configuration
- [ ] Destructive commands require confirmation based on user expertise
- [ ] Progressive disclosure adapts to user experience level
- [ ] Query DSL parses `type:x field:y` filters
- [ ] Query results display in panel with timing
- [ ] Voice commands can trigger queries
- [ ] All Week 1-3 features remain functional

---

## Post-Week 4: Release Preparation

After Week 4 completion:

1. **Integration Testing**
   - Full workflow tests across all features
   - Cross-platform validation (Linux, Windows, macOS)

2. **Performance Profiling**
   - Measure query performance on large vaults
   - Profile sync latency

3. **Documentation**
   - User guide for voice commands
   - Sync setup instructions
   - Query DSL reference

4. **CI/CD Pipeline** (see Forgejo workflow)
   - Automated builds for all platforms
   - Sidecar bundling in build process

5. **Deferred Features** (v2.0)
   - E2EE via Beelay
   - Ambient listening mode
   - Multi-user collaboration
