/**
 * useVaultIndex Hook
 *
 * Manages an in-memory vault index.
 * Builds the index from the filesystem on vault open, updates it
 * on content saves, renames, and file watcher events.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { VaultIndex, toVaultRelativePath, normalizePath } from '@/vault/vaultIndex';
import type { GraphEdge } from '@/types/vault';

/** Loading phase for UI feedback */
export type VaultLoadingPhase = 'idle' | 'building' | 'ready' | 'error';

export interface VaultIndexResult {
  ready: boolean;
  activeNoteId: string | null;
  noteCount: number;
  /** Manifest shim: { id_to_path, path_index } */
  manifest: { id_to_path: Record<string, string>; path_index: Record<string, string> } | null;
  /** Graph cache shim: { edges, backlink_index } */
  graphCache: { edges: Record<string, GraphEdge>; backlink_index: Record<string, string[]> } | null;
  recordContent: (content: string) => void;
  recordRename: (oldPath: string, newPath: string) => void;
  vaultPath: string | null;
  normalizedVaultPath: string | null;
  loadingPhase: VaultLoadingPhase;
  lastError: string | null;
}

export function useVaultIndex(params: {
  vaultPath: string | null;
  activeFilePath: string | null;
}): VaultIndexResult {
  const vaultPath = params.vaultPath?.trim() || null;
  const activeFilePath = params.activeFilePath?.trim() || null;

  const indexRef = useRef<VaultIndex | null>(null);
  const [ready, setReady] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<VaultLoadingPhase>('idle');
  const [lastError, setLastError] = useState<string | null>(null);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  // Bump this counter to force re-derivation of shims after mutations
  const [revision, setRevision] = useState(0);
  // Guard against concurrent rebuilds from vault-changed events
  const rebuildInFlightRef = useRef(false);

  // ─────────────────────────────────────────────────────────────────────────
  // Boot effect: Build index when vault path changes
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    // Reset
    indexRef.current = null;
    setReady(false);
    setActiveNoteId(null);
    setLastError(null);
    setLoadingPhase('idle');
    setRevision(0);

    if (!vaultPath) return;

    setLoadingPhase('building');

    const build = async () => {
      try {
        const index = await VaultIndex.buildFromVault(vaultPath);
        if (cancelled) return;

        indexRef.current = index;
        setReady(true);
        setLoadingPhase('ready');
        setRevision((r) => r + 1);
      } catch (e) {
        if (cancelled) return;
        console.error('[VaultIndex] Build error:', e);
        setLastError(e instanceof Error ? e.message : String(e));
        setLoadingPhase('error');
      }
    };

    build();

    return () => {
      cancelled = true;
      indexRef.current = null;
    };
  }, [vaultPath]);

  // ─────────────────────────────────────────────────────────────────────────
  // Listen for file watcher events → rebuild index
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!vaultPath || !ready) return;

    let cancelled = false;
    let unlistenFn: (() => void) | null = null;

    listen('vault-changed', async () => {
      if (cancelled || rebuildInFlightRef.current) return;
      rebuildInFlightRef.current = true;

      try {
        const index = await VaultIndex.buildFromVault(vaultPath);
        if (cancelled) return;
        indexRef.current = index;
        setRevision((r) => r + 1);
      } catch (e) {
        console.error('[VaultIndex] Rebuild error:', e);
      } finally {
        rebuildInFlightRef.current = false;
      }
    }).then((fn) => {
      if (cancelled) { fn(); return; }
      unlistenFn = fn;
    });

    return () => {
      cancelled = true;
      unlistenFn?.();
    };
  }, [vaultPath, ready]);

  // ─────────────────────────────────────────────────────────────────────────
  // Active note tracking
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ready || !vaultPath || !activeFilePath) {
      setActiveNoteId(null);
      return;
    }

    const index = indexRef.current;
    if (!index) {
      setActiveNoteId(null);
      return;
    }

    const rel = toVaultRelativePath(vaultPath, activeFilePath);
    if (!rel) {
      setActiveNoteId(null);
      return;
    }

    // Ensure note is registered (for newly created files)
    let noteId = index.findNoteIdByPath(rel);
    if (!noteId) {
      const entry = index.addNote(rel);
      noteId = entry.id;
      setRevision((r) => r + 1);
    }

    setActiveNoteId(noteId);
  }, [ready, activeFilePath, vaultPath]);

  // ─────────────────────────────────────────────────────────────────────────
  // Callbacks
  // ─────────────────────────────────────────────────────────────────────────

  const recordContent = useCallback((content: string) => {
    const index = indexRef.current;
    if (!index || !activeNoteId) return;
    index.updateNoteContent(activeNoteId, content);
    setRevision((r) => r + 1);
  }, [activeNoteId]);

  const recordRename = useCallback((oldPath: string, newPath: string) => {
    if (!vaultPath) return;
    const index = indexRef.current;
    if (!index) return;

    const oldRel = toVaultRelativePath(vaultPath, oldPath);
    const newRel = toVaultRelativePath(vaultPath, newPath);
    if (!oldRel || !newRel) return;

    index.renameNote(oldRel, newRel);
    setRevision((r) => r + 1);
  }, [vaultPath]);

  // ─────────────────────────────────────────────────────────────────────────
  // Memoized shim objects (VaultIndex caches internally for referential stability)
  // ─────────────────────────────────────────────────────────────────────────

  const manifest = useMemo(() => {
    const index = indexRef.current;
    if (!ready || !index) return null;
    return index.toManifestShim();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, revision]);

  const graphCache = useMemo(() => {
    const index = indexRef.current;
    if (!ready || !index) return null;
    return index.toGraphCacheShim();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, revision]);

  const normalizedVaultPath = useMemo(() => {
    if (!vaultPath) return null;
    return normalizePath(vaultPath);
  }, [vaultPath]);

  const noteCount = useMemo(() => {
    return indexRef.current?.notes.size ?? 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, revision]);

  return {
    ready,
    activeNoteId,
    noteCount,
    manifest,
    graphCache,
    recordContent,
    recordRename,
    vaultPath,
    normalizedVaultPath,
    loadingPhase,
    lastError,
  };
}
