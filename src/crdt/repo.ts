import {
	BroadcastChannelNetworkAdapter,
	IndexedDBStorageAdapter,
	Repo,
} from '@automerge/react';
import type { NetworkAdapterInterface } from '@automerge/automerge-repo';
import { SyncConnectionManager, SyncConnectionState } from './syncAdapter';

let repo: Repo | null = null;
let syncManager: SyncConnectionManager | null = null;

/**
 * Get the CRDT repository instance (singleton)
 */
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

	// Auto-connect if we have a stored URL
	const wsUrl = window.localStorage.getItem('mutter:crdt_ws_url')?.trim() ?? '';
	if (wsUrl) {
		console.log('[CRDT Repo] Auto-connecting to stored sync URL:', wsUrl);
		syncManager.connect(wsUrl);
	}

	return repo;
}

/**
 * Get the sync connection manager
 */
export function getSyncManager(): SyncConnectionManager | null {
	// Ensure repo is initialized
	if (!syncManager) {
		getCrdtRepo();
	}
	return syncManager;
}

/**
 * Connect to a sync server
 * @param url WebSocket URL (e.g., ws://localhost:3030)
 */
export function connectToSyncServer(url: string): void {
	const manager = getSyncManager();
	if (!manager) {
		console.error('[CRDT Repo] Cannot connect: sync manager not initialized');
		return;
	}

	console.log('[CRDT Repo] Connecting to sync server:', url);
	manager.connect(url);

	// Persist the URL for auto-reconnect on app restart
	window.localStorage.setItem('mutter:crdt_ws_url', url);
}

/**
 * Disconnect from the sync server
 */
export function disconnectFromSyncServer(): void {
	const manager = getSyncManager();
	if (!manager) {
		return;
	}

	console.log('[CRDT Repo] Disconnecting from sync server');
	manager.disconnect();

	// Remove stored URL
	window.localStorage.removeItem('mutter:crdt_ws_url');
}

/**
 * Get the current sync connection state
 */
export function getSyncConnectionState(): SyncConnectionState | null {
	const manager = getSyncManager();
	return manager?.getState() ?? null;
}

/**
 * Check if connected to a sync server
 */
export function isSyncConnected(): boolean {
	const manager = getSyncManager();
	return manager?.isConnected() ?? false;
}
