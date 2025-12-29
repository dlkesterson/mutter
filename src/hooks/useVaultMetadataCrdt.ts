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
  updateNoteBlocks,
  VAULT_METADATA_SCHEMA_VERSION,
  type VaultMetadataDoc,
} from '@/crdt/vaultMetadataDoc';
import { extractBlocks } from '@/editor/blockIds';
import { buildVaultGraph, buildGraphForNote, graphNeedsRebuild } from '@/graph/graphBuilder';
import { readTextFile } from '@tauri-apps/plugin-fs';

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
  /** Get current CRDT document (may be null if not ready) */
  doc: VaultMetadataDoc | null;
  /** Get CRDT handle for advanced operations */
  handle: DocHandle<VaultMetadataDoc> | null;
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
            schema_version: VAULT_METADATA_SCHEMA_VERSION,
            meta: { created_at: Date.now(), vault_id: state.vault_id },
            notes: {},
            note_id_by_path: {},
            // v3 fields
            supertag_definitions: {},
            graph_edges: {},
            backlink_index: {},
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

        // Build vault graph if needed (async, doesn't block ready state)
        const currentDoc = handle.doc();
        if (currentDoc && graphNeedsRebuild(currentDoc)) {
          console.log('[VaultMeta] Graph needs rebuild, starting...');
          const vaultPathNormalized = vaultPath.replaceAll('\\', '/').replace(/\/+$/g, '');
          buildVaultGraph({
            handle,
            readNoteContent: async (relPath: string) => {
              return await readTextFile(`${vaultPathNormalized}/${relPath}`);
            },
          }).then((result) => {
            console.log(`[VaultMeta] Graph built: ${result.edgesCreated} edges from ${result.notesProcessed} notes`);
          }).catch((err) => {
            console.error('[VaultMeta] Graph build failed:', err);
          });
        }
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

      // Extract and persist links
      setNoteLinksFromContent({ handle, noteId: activeNoteId, content });

      // Extract and persist blocks to CRDT
      const blocks = extractBlocks(content);
      if (blocks.length > 0) {
        updateNoteBlocks({ handle, noteId: activeNoteId, blocks });
        console.log(`[CRDT] Persisted ${blocks.length} blocks for note ${activeNoteId}`);
      }

      // Rebuild graph edges for this note (incremental update)
      const result = buildGraphForNote({
        handle,
        sourceNoteId: activeNoteId,
        sourceBlockId: null,
        content,
      });
      if (result.edgesCreated > 0 || result.unresolvedLinks.length > 0) {
        console.log(`[CRDT] Graph updated: ${result.edgesCreated} edges, ${result.unresolvedLinks.length} unresolved`);
      }
    },
    [activeNoteId]
  );

  // Get current doc snapshot (memoized to prevent unnecessary rerenders)
  const doc = useMemo(() => {
    return handleRef.current?.doc() ?? null;
  }, [ready, activeNoteId]); // Re-compute when ready or activeNoteId changes

  return {
    ready,
    vaultId,
    docUrl,
    lastError,
    fsSyncStatus,
    activeNoteId,
    openNoteById,
    setActiveNoteTags,
    recordRename,
    recordContent,
    doc,
    handle: handleRef.current,
  };
}
