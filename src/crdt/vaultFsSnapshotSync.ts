import type { DocHandle, Repo } from '@automerge/react';
import { base64ToBytes, bytesToBase64 } from '@/crdt/base64';
import {
  listVaultCrdtSnapshots,
  pruneVaultCrdtSnapshots,
  readVaultCrdtSnapshot,
  vaultCrdtSnapshotRelativePath,
  writeVaultCrdtSnapshot,
} from '@/crdt/vaultTauri';

export type CrdtSnapshotPeer = {
  deviceId: string;
  modifiedMs: number;
  bytes: number;
  relativePath: string;
};

export type CrdtFsSyncStatus = {
  lastExportAtMs: number | null;
  lastImportAtMs: number | null;
  peers: CrdtSnapshotPeer[];
  lastError: string | null;
};

export function startVaultCrdtFsSnapshotSync(params: {
  repo: Repo;
  handle: DocHandle<unknown>;
  vaultPath: string;
  deviceId: string;
  pollMs?: number;
  onStatus?: (status: CrdtFsSyncStatus) => void;
}): () => void {
  const pollMs = Math.max(500, params.pollMs ?? 2000);
  const docId = params.handle.documentId as unknown as string;
  const vaultPath = params.vaultPath;
  const deviceId = params.deviceId;

  let stopped = false;
  let dirty = true;
  let lastExportAtMs: number | null = null;
  let lastImportAtMs: number | null = null;
  let lastError: string | null = null;
  const seenModifiedByDevice = new Map<string, number>();

  const emit = (peers: CrdtSnapshotPeer[]) => {
    params.onStatus?.({
      lastExportAtMs,
      lastImportAtMs,
      peers,
      lastError,
    });
  };

  const onChange = () => {
    dirty = true;
  };
  params.handle.on('change', onChange);

  const exportTick = async () => {
    if (stopped) return;
    if (!dirty) return;
    if (!params.handle.isReady?.()) return;

    try {
      const binary = await params.repo.export(docId as any);
      if (!binary) return;
      await writeVaultCrdtSnapshot(vaultPath, docId, deviceId, bytesToBase64(binary));
      await pruneVaultCrdtSnapshots({ vaultPath, docId, keepLast: 32, keepDeviceId: deviceId }).catch(() => {});
      lastExportAtMs = Date.now();
      lastError = null;
      dirty = false;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  };

  const importTick = async () => {
    if (stopped) return;
    if (!params.handle.isReady?.()) return;

    try {
      const infos = await listVaultCrdtSnapshots(vaultPath, docId);
      const peers: CrdtSnapshotPeer[] = [];

      for (const info of infos) {
        const relativePath = await vaultCrdtSnapshotRelativePath(docId, info.device_id);
        peers.push({
          deviceId: info.device_id,
          modifiedMs: info.modified_ms,
          bytes: info.bytes,
          relativePath,
        });

        if (info.device_id === deviceId) continue;
        const prev = seenModifiedByDevice.get(info.device_id) ?? 0;
        if (info.modified_ms <= prev) continue;

        const b64 = await readVaultCrdtSnapshot(vaultPath, docId, info.device_id);
        const bytes = base64ToBytes(b64);
        params.repo.import(bytes, { docId: docId as any });
        seenModifiedByDevice.set(info.device_id, info.modified_ms);
        dirty = true;
        lastImportAtMs = Date.now();
      }

      lastError = null;
      emit(peers);
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  };

  const exportTimer = window.setInterval(() => void exportTick(), pollMs);
  const importTimer = window.setInterval(() => void importTick(), pollMs);

  void exportTick();
  void importTick();

  return () => {
    stopped = true;
    window.clearInterval(exportTimer);
    window.clearInterval(importTimer);
    params.handle.off('change', onChange);
  };
}

