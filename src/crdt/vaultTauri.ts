import { invoke } from '@tauri-apps/api/core';

export type VaultState = {
  vault_id: string;
  created_at: string;
  vault_metadata_doc_url?: string | null;
};

export async function getMutterDeviceId(): Promise<string> {
  return invoke<string>('get_mutter_device_id_cmd');
}

export async function getOrCreateVaultState(vaultPath: string): Promise<VaultState> {
  return invoke<VaultState>('get_or_create_vault_state_cmd', { vaultPath });
}

export async function setVaultMetadataDocUrl(vaultPath: string, docUrl: string | null): Promise<void> {
  return invoke<void>('set_vault_metadata_doc_url_cmd', { vaultPath, docUrl });
}

export type CrdtSnapshotInfo = {
  device_id: string;
  modified_ms: number;
  bytes: number;
};

export async function writeVaultCrdtSnapshot(vaultPath: string, docId: string, deviceId: string, dataBase64: string): Promise<void> {
  return invoke<void>('write_vault_crdt_snapshot_cmd', {
    vaultPath,
    docId,
    deviceId,
    dataBase64,
  });
}

export async function listVaultCrdtSnapshots(vaultPath: string, docId: string): Promise<CrdtSnapshotInfo[]> {
  return invoke<CrdtSnapshotInfo[]>('list_vault_crdt_snapshots_cmd', { vaultPath, docId });
}

export async function readVaultCrdtSnapshot(vaultPath: string, docId: string, deviceId: string): Promise<string> {
  return invoke<string>('read_vault_crdt_snapshot_cmd', { vaultPath, docId, deviceId });
}

export async function vaultCrdtSnapshotRelativePath(docId: string, deviceId: string): Promise<string> {
  return invoke<string>('vault_crdt_snapshot_relative_path_cmd', { docId, deviceId });
}

export async function pruneVaultCrdtSnapshots(params: {
  vaultPath: string;
  docId: string;
  keepLast?: number;
  keepDeviceId?: string | null;
}): Promise<number> {
  return invoke<number>('prune_vault_crdt_snapshots_cmd', {
    vaultPath: params.vaultPath,
    docId: params.docId,
    keepLast: params.keepLast ?? 32,
    keepDeviceId: params.keepDeviceId ?? null,
  });
}

