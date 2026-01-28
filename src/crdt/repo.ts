import {
	BroadcastChannelNetworkAdapter,
	IndexedDBStorageAdapter,
	Repo,
} from '@automerge/react';
import type { NetworkAdapterInterface } from '@automerge/automerge-repo';

let repo: Repo | null = null;

/**
 * Get the CRDT repository instance (singleton)
 *
 * Uses IndexedDB for persistence and BroadcastChannel for same-machine tab sync.
 * No remote sync - this is a local-only CRDT setup.
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

	return repo;
}
