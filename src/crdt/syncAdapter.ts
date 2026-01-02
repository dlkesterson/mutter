/**
 * Sync Connection Manager
 *
 * Manages WebSocket connections to Automerge sync servers with
 * automatic reconnection and status monitoring.
 */

import { BrowserWebSocketClientAdapter } from '@automerge/automerge-repo-network-websocket';
import type { Repo } from '@automerge/react';

/**
 * Connection state information
 */
export interface SyncConnectionState {
  connected: boolean;
  url: string | null;
  reconnectAttempts: number;
  lastError: string | null;
  lastConnectedAt: number | null;
}

/**
 * Manages WebSocket sync connection with automatic reconnection
 */
export class SyncConnectionManager {
  private repo: Repo;
  private adapter: BrowserWebSocketClientAdapter | null = null;
  private url: string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private baseReconnectDelay = 1000; // 1 second
  private maxReconnectDelay = 30000; // 30 seconds
  private lastConnectedAt: number | null = null;
  private lastError: string | null = null;
  private onStateChange: ((state: SyncConnectionState) => void) | null = null;
  private connected = false;

  constructor(repo: Repo) {
    this.repo = repo;
  }

  /**
   * Set a callback to be notified of state changes
   */
  setStateChangeHandler(handler: (state: SyncConnectionState) => void): void {
    this.onStateChange = handler;
  }

  /**
   * Emit the current state to listeners
   */
  private emitState(): void {
    this.onStateChange?.({
      connected: this.connected,
      url: this.url,
      reconnectAttempts: this.reconnectAttempts,
      lastError: this.lastError,
      lastConnectedAt: this.lastConnectedAt,
    });
  }

  /**
   * Connect to a sync server
   */
  connect(url: string): void {
    // Disconnect existing connection first
    this.disconnect();

    this.url = url;
    this.reconnectAttempts = 0;
    this.lastError = null;

    console.log('[SyncConnectionManager] Connecting to', url);

    try {
      this.adapter = new BrowserWebSocketClientAdapter(url);

      // The adapter manages its own WebSocket internally
      // We can't easily get connection events from it, so we'll
      // assume connected after a short delay and rely on reconnect
      // logic if messages fail

      // Add to repo network
      const networkSubsystem = (this.repo as any).networkSubsystem;
      if (networkSubsystem && typeof networkSubsystem.addNetworkAdapter === 'function') {
        networkSubsystem.addNetworkAdapter(this.adapter);
      }

      // Mark as connected after a brief delay
      // (The WebSocket handshake should complete by then)
      setTimeout(() => {
        if (this.adapter) {
          this.connected = true;
          this.lastConnectedAt = Date.now();
          this.lastError = null;
          this.reconnectAttempts = 0;
          console.log('[SyncConnectionManager] Connected to', url);
          this.emitState();

          // Start health check monitoring
          this.startHealthCheck();
        }
      }, 500);
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      this.connected = false;
      console.error('[SyncConnectionManager] Connection failed:', this.lastError);
      this.emitState();
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from the sync server
   */
  disconnect(): void {
    console.log('[SyncConnectionManager] Disconnecting');

    // Clear timers
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    // Remove adapter from repo
    if (this.adapter) {
      try {
        const networkSubsystem = (this.repo as any).networkSubsystem;
        if (networkSubsystem && typeof networkSubsystem.removeNetworkAdapter === 'function') {
          networkSubsystem.removeNetworkAdapter(this.adapter);
        }
      } catch (e) {
        console.warn('[SyncConnectionManager] Error removing adapter:', e);
      }
      this.adapter = null;
    }

    this.connected = false;
    this.url = null;
    this.reconnectAttempts = 0;
    this.emitState();
  }

  /**
   * Schedule a reconnection attempt with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('[SyncConnectionManager] Max reconnect attempts reached');
      this.lastError = 'Max reconnection attempts reached';
      this.emitState();
      return;
    }

    if (!this.url) {
      return;
    }

    // Exponential backoff with jitter
    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts) + Math.random() * 1000,
      this.maxReconnectDelay
    );
    this.reconnectAttempts++;

    console.log(
      `[SyncConnectionManager] Scheduling reconnect in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts})`
    );

    this.reconnectTimer = setTimeout(() => {
      if (this.url) {
        this.connect(this.url);
      }
    }, delay);

    this.emitState();
  }

  /**
   * Start periodic health checks
   */
  private startHealthCheck(): void {
    // Check every 30 seconds
    this.healthCheckTimer = setInterval(() => {
      // If we haven't seen activity in a while, we might be disconnected
      // For now, we just emit the current state
      // A more robust implementation would send ping messages
      this.emitState();
    }, 30000);
  }

  /**
   * Get the current connection state
   */
  getState(): SyncConnectionState {
    return {
      connected: this.connected,
      url: this.url,
      reconnectAttempts: this.reconnectAttempts,
      lastError: this.lastError,
      lastConnectedAt: this.lastConnectedAt,
    };
  }

  /**
   * Check if currently connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get the current URL
   */
  getUrl(): string | null {
    return this.url;
  }

  /**
   * Reset reconnect attempts (call after successful operations)
   */
  resetReconnectAttempts(): void {
    this.reconnectAttempts = 0;
    this.emitState();
  }
}
