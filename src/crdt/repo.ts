import {
	BroadcastChannelNetworkAdapter,
	IndexedDBStorageAdapter,
	Repo,
} from '@automerge/react';
import { BrowserWebSocketClientAdapter } from '@automerge/automerge-repo-network-websocket';
import type { NetworkAdapterInterface } from '@automerge/automerge-repo';

let repo: Repo | null = null;

export function getCrdtRepo(): Repo {
	if (repo) return repo;

	const network: NetworkAdapterInterface[] = [
		new BroadcastChannelNetworkAdapter({ channelName: 'mutter-crdt' }),
	];
	const wsUrl = window.localStorage.getItem('mutter:crdt_ws_url')?.trim() ?? '';
	if (wsUrl) {
		network.push(new BrowserWebSocketClientAdapter(wsUrl));
	}

	repo = new Repo({
		storage: new IndexedDBStorageAdapter('mutter-crdt'),
		network,
	});

	return repo;
}
