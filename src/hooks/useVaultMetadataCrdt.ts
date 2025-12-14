import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DocHandle } from '@automerge/react';
import { isValidAutomergeUrl } from '@automerge/react';
import { getCrdtRepo } from '@/crdt/repo';
import { startVaultCrdtFsSnapshotSync, type CrdtFsSyncStatus } from '@/crdt/vaultFsSnapshotSync';
import { getMutterDeviceId, getOrCreateVaultState, setVaultMetadataDocUrl } from '@/crdt/vaultTauri';
import {
  ensureVaultMetadataDocShape,
  findNoteIdByRelPath,
  findRelPathByNoteId,
  ensureNoteForRelPath,
  recordNoteOpened,
  recordNoteRenamed,
  setNoteLinksFromContent,
  setNoteTags,
  toVaultRelativePath,
  type VaultMetadataDoc,
} from '@/crdt/vaultMetadataDoc';

type Result = {
  ready: boolean;
  vaultId: string | null;
  docUrl: string | null;
  lastError: string | null;
  fsSyncStatus: CrdtFsSyncStatus;
  activeNoteId: string | null;
  openNoteById: (noteId: string) => string | null;
  setActiveNoteTags: (tags: string[]) => void;
  recordRename: (oldPath: string, newPath: string) => void;
  recordContent: (content: string) => void;
};

export function useVaultMetadataCrdt(params: {
  vaultPath: string | null;
  activeFilePath: string | null;
}): Result {
  const repo = useMemo(() => getCrdtRepo(), []);
  const vaultPath = params.vaultPath?.trim() || null;
  const activeFilePath = params.activeFilePath?.trim() || null;

  const handleRef = useRef<DocHandle<VaultMetadataDoc> | null>(null);
  const stopSyncRef = useRef<null | (() => void)>(null);
  const detachRef = useRef<null | (() => void)>(null);

  const [ready, setReady] = useState(false);
  const [vaultId, setVaultId] = useState<string | null>(null);
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [fsSyncStatus, setFsSyncStatus] = useState<CrdtFsSyncStatus>({
    lastExportAtMs: null,
    lastImportAtMs: null,
    peers: [],
    lastError: null,
  });

  useEffect(() => {
    let cancelled = false;

    detachRef.current?.();
    detachRef.current = null;
    stopSyncRef.current?.();
    stopSyncRef.current = null;
    handleRef.current = null;
    setReady(false);
    setVaultId(null);
    setDocUrl(null);
    setLastError(null);
    setActiveNoteId(null);
    setFsSyncStatus({ lastExportAtMs: null, lastImportAtMs: null, peers: [], lastError: null });

    if (!vaultPath) return;

    const boot = async () => {
      try {
        const deviceId = await getMutterDeviceId();
        const state = await getOrCreateVaultState(vaultPath);
        if (cancelled) return;

        setVaultId(state.vault_id);

        let handle: DocHandle<VaultMetadataDoc>;
        if (state.vault_metadata_doc_url && isValidAutomergeUrl(state.vault_metadata_doc_url)) {
          handle = await repo.find<VaultMetadataDoc>(state.vault_metadata_doc_url);
        } else {
          handle = repo.create<VaultMetadataDoc>({
            schema_version: 1,
            meta: { created_at: Date.now(), vault_id: state.vault_id },
            notes: {},
            note_id_by_path: {},
          });
          await setVaultMetadataDocUrl(vaultPath, handle.url);
        }

        await handle.whenReady();
        if (cancelled) return;

        handle.change((doc: any) => ensureVaultMetadataDocShape(doc, state.vault_id));

        handleRef.current = handle;
        setDocUrl(handle.url);
        setReady(true);
        setLastError(null);

        stopSyncRef.current = startVaultCrdtFsSnapshotSync({
          repo,
          handle,
          vaultPath,
          deviceId,
          pollMs: 2000,
          onStatus: setFsSyncStatus,
        });
      } catch (e) {
        if (cancelled) return;
        setLastError(e instanceof Error ? e.message : String(e));
      }
    };

    const p = Promise.resolve(boot());
    return () => {
      cancelled = true;
      stopSyncRef.current?.();
      stopSyncRef.current = null;
      detachRef.current?.();
      detachRef.current = null;
      void p;
      handleRef.current = null;
    };
  }, [repo, vaultPath]);

  useEffect(() => {
    const handle = handleRef.current;
    if (!handle?.isReady?.()) {
      setActiveNoteId(null);
      return;
    }
    if (!vaultPath) return;
    if (!activeFilePath) {
      setActiveNoteId(null);
      return;
    }
    const rel = toVaultRelativePath(vaultPath, activeFilePath);
    if (!rel || rel === '') {
      setActiveNoteId(null);
      return;
    }

    const doc = handle.doc();
    setActiveNoteId(findNoteIdByRelPath(doc, rel));
  }, [activeFilePath, vaultPath]);

  useEffect(() => {
    const handle = handleRef.current;
    if (!handle?.isReady?.()) return;
    if (!vaultPath) return;
    if (!activeFilePath) return;
    const rel = toVaultRelativePath(vaultPath, activeFilePath);
    if (!rel || rel === '') return;

    let cancelled = false;
    void (async () => {
      try {
        await ensureNoteForRelPath(handle, rel);
        if (cancelled) return;
        recordNoteOpened({ handle, relPath: rel });
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeFilePath, vaultPath, ready]);

  const openNoteById = useCallback(
    (noteId: string) => {
      const handle = handleRef.current;
      if (!handle?.isReady?.()) return null;
      if (!vaultPath) return null;
      const rel = findRelPathByNoteId(handle.doc(), noteId);
      if (!rel) return null;
      const vp = vaultPath.replaceAll('\\', '/').replace(/\/+$/g, '');
      return `${vp}/${rel}`;
    },
    [vaultPath]
  );

  const setActiveNoteTags = useCallback(
    (tags: string[]) => {
      const handle = handleRef.current;
      if (!handle?.isReady?.()) return;
      if (!activeNoteId) return;
      setNoteTags({ handle, noteId: activeNoteId, tags });
    },
    [activeNoteId]
  );

  const recordRename = useCallback(
    (oldPath: string, newPath: string) => {
      const handle = handleRef.current;
      if (!handle?.isReady?.()) return;
      if (!vaultPath) return;
      const oldRel = toVaultRelativePath(vaultPath, oldPath);
      const newRel = toVaultRelativePath(vaultPath, newPath);
      if (!oldRel || !newRel) return;
      recordNoteRenamed({ handle, oldRelPath: oldRel, newRelPath: newRel });
    },
    [vaultPath]
  );

  const recordContent = useCallback(
    (content: string) => {
      const handle = handleRef.current;
      if (!handle?.isReady?.()) return;
      if (!activeNoteId) return;
      setNoteLinksFromContent({ handle, noteId: activeNoteId, content });
    },
    [activeNoteId]
  );

  return { ready, vaultId, docUrl, lastError, fsSyncStatus, activeNoteId, openNoteById, setActiveNoteTags, recordRename, recordContent };
}
