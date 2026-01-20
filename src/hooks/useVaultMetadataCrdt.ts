/**
 * useVaultMetadataCrdt Hook
 *
 * Manages CRDT-based vault metadata using the split document architecture:
 * - ManifestDoc: Lightweight root document with note URLs and path indexes
 * - NoteDoc: Individual documents per note (lazy loaded)
 * - GraphCacheDoc: Pre-computed graph edges and backlinks
 *
 * If a legacy VaultMetadataDoc exists, it's migrated to split format on first load,
 * then the legacy URL is deleted.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DocHandle } from '@automerge/react';
import { isValidAutomergeUrl } from '@automerge/react';
import type { AnyDocumentId } from '@automerge/automerge-repo';
import { getCrdtRepo } from '@/crdt/repo';
import {
  getMutterDeviceId,
  getOrCreateVaultState,
  setManifestDocUrl,
  setVaultMetadataDocUrl,
} from '@/crdt/vaultTauri';
import {
  ensureVaultMetadataDocShape,
  toVaultRelativePath,
  type VaultMetadataDoc,
} from '@/crdt/vaultMetadataDoc';
import {
  type ManifestDoc,
  createEmptyManifest,
  ensureManifestDocShape,
  findNoteIdByPath,
  findPathByNoteId,
  getNoteCount,
} from '@/crdt/manifestDoc';
import {
  type NoteDoc,
  setNoteLinks,
  setNoteTags,
  updateNoteBlocks,
  recordNoteOpened,
} from '@/crdt/noteDoc';
import type { GraphCacheDoc, GraphEdge } from '@/crdt/graphCacheDoc';
import { updateEdgesForNote, createEmptyGraphCache } from '@/crdt/graphCacheDoc';
import { NoteDocManager, createNoteDocManager } from '@/crdt/noteDocManager';
import { migrateToSplitDocuments, type MigrationProgress } from '@/crdt/migration';
import { extractBlocks } from '@/editor/blockIds';
import { parseLinks } from '@/graph/linkParser';

/** CRDT loading phase for UI feedback */
export type CrdtLoadingPhase = 'idle' | 'starting' | 'loading-doc' | 'migrating' | 'ready' | 'error';

/**
 * Resolve a wiki link target to a note ID using the manifest
 *
 * Handles various link formats:
 * - "Note Name" → matches filename without extension
 * - "folder/Note Name" → matches path
 * - "Note Name.md" → matches exact path
 */
function resolveLinkTargetFromManifest(
  manifest: ManifestDoc,
  target: string
): string | null {
  const normalizedTarget = target.trim();
  if (!normalizedTarget) return null;

  // Try exact path match with .md extension
  const withMd = normalizedTarget.endsWith('.md')
    ? normalizedTarget
    : `${normalizedTarget}.md`;

  const byExactPath = manifest.path_index[withMd];
  if (byExactPath) return byExactPath;

  // Try path without extension (edge case)
  const withoutMd = normalizedTarget.replace(/\.md$/i, '');
  const byPathNoExt = manifest.path_index[withoutMd];
  if (byPathNoExt) return byPathNoExt;

  // Search for matching filename across all paths
  const lowerTarget = normalizedTarget.toLowerCase();
  for (const [path, noteId] of Object.entries(manifest.path_index)) {
    // Extract filename without extension
    const filename = path.split('/').pop()?.replace(/\.md$/i, '') ?? '';
    if (filename.toLowerCase() === lowerTarget) {
      return noteId;
    }
  }

  return null;
}

type Result = {
  ready: boolean;
  vaultId: string | null;
  docUrl: string | null;
  lastError: string | null;
  activeNoteId: string | null;
  openNoteById: (noteId: string) => string | null;
  setActiveNoteTags: (tags: string[]) => void;
  recordRename: (oldPath: string, newPath: string) => void;
  recordContent: (content: string) => void;
  normalizedVaultPath: string | null;
  loadingPhase: CrdtLoadingPhase;
  manifest: ManifestDoc | null;
  manifestHandle: DocHandle<ManifestDoc> | null;
  noteManager: NoteDocManager | null;
  activeNoteDoc: NoteDoc | null;
  /** Handle to the active note's document (for mutations) */
  activeNoteHandle: DocHandle<NoteDoc> | null;
  noteCount: number;
  migrationProgress: MigrationProgress | null;
  graphCache: GraphCacheDoc | null;
  graphCacheHandle: DocHandle<GraphCacheDoc> | null;
};

export function useVaultMetadataCrdt(params: {
  vaultPath: string | null;
  activeFilePath: string | null;
}): Result {
  const repo = useMemo(() => getCrdtRepo(), []);
  const vaultPath = params.vaultPath?.trim() || null;
  const activeFilePath = params.activeFilePath?.trim() || null;

  // Refs for document handles
  const manifestHandleRef = useRef<DocHandle<ManifestDoc> | null>(null);
  const graphCacheHandleRef = useRef<DocHandle<GraphCacheDoc> | null>(null);
  const noteManagerRef = useRef<NoteDocManager | null>(null);
  const activeNoteHandleRef = useRef<DocHandle<NoteDoc> | null>(null);

  // State
  const [ready, setReady] = useState(false);
  const [vaultId, setVaultId] = useState<string | null>(null);
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [loadingPhase, setLoadingPhase] = useState<CrdtLoadingPhase>('idle');
  const [activeNoteDoc, setActiveNoteDoc] = useState<NoteDoc | null>(null);
  const [migrationProgress, setMigrationProgress] = useState<MigrationProgress | null>(null);

  // ─────────────────────────────────────────────────────────────────────────
  // Boot effect: Load or create manifest
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    // Reset state
    manifestHandleRef.current = null;
    graphCacheHandleRef.current = null;
    noteManagerRef.current = null;
    activeNoteHandleRef.current = null;
    setReady(false);
    setVaultId(null);
    setDocUrl(null);
    setLastError(null);
    setActiveNoteId(null);
    setActiveNoteDoc(null);
    setLoadingPhase('idle');
    setMigrationProgress(null);

    if (!vaultPath) return;

    setLoadingPhase('starting');

    const boot = async () => {
      try {
        console.time('[VaultMeta] boot');

        // Get vault state (device ID is created as a side effect if needed)
        await getMutterDeviceId();
        const state = await getOrCreateVaultState(vaultPath);
        if (cancelled) return;

        setVaultId(state.vault_id);

        const hasManifest = state.manifest_doc_url && isValidAutomergeUrl(state.manifest_doc_url);
        const hasLegacy = state.vault_metadata_doc_url && isValidAutomergeUrl(state.vault_metadata_doc_url);

        if (hasManifest) {
          // ═══════════════════════════════════════════════════════════════════
          // SPLIT FORMAT: Load manifest (fast!)
          // ═══════════════════════════════════════════════════════════════════
          console.log('[VaultMeta] Loading manifest...');
          setLoadingPhase('loading-doc');

          const manifestHandle = await repo.find<ManifestDoc>(state.manifest_doc_url as AnyDocumentId);
          await manifestHandle.whenReady();
          if (cancelled) return;

          manifestHandle.change((doc: any) => ensureManifestDocShape(doc, state.vault_id));
          manifestHandleRef.current = manifestHandle;
          setDocUrl(manifestHandle.url);

          // Load or create graph cache
          const manifest = manifestHandle.doc();
          if (manifest?.graph_cache_url && isValidAutomergeUrl(manifest.graph_cache_url)) {
            const graphHandle = await repo.find<GraphCacheDoc>(manifest.graph_cache_url as AnyDocumentId);
            await graphHandle.whenReady();
            graphCacheHandleRef.current = graphHandle;
          } else {
            // Create new graph cache if missing
            console.log('[VaultMeta] Creating new graph cache...');
            const graphCacheData = createEmptyGraphCache() as GraphCacheDoc;
            const graphHandle = repo.create<GraphCacheDoc>(graphCacheData);
            await graphHandle.whenReady();
            graphCacheHandleRef.current = graphHandle;

            // Register graph cache URL in manifest
            manifestHandle.change((doc: any) => {
              doc.graph_cache_url = graphHandle.url;
            });
            console.log('[VaultMeta] Graph cache created:', graphHandle.url);
          }

          // Create note manager
          noteManagerRef.current = createNoteDocManager(repo, manifestHandle, {
            maxCacheSize: 100,
            debug: false,
          });

          setReady(true);
          setLoadingPhase('ready');
          console.timeEnd('[VaultMeta] boot');
          console.log(`[VaultMeta] Ready with ${getNoteCount(manifest)} notes`);

        } else if (hasLegacy) {
          // ═══════════════════════════════════════════════════════════════════
          // LEGACY: Migrate to split format, then delete legacy URL
          // ═══════════════════════════════════════════════════════════════════
          console.log('[VaultMeta] Migrating legacy vault...');
          setLoadingPhase('loading-doc');

          // Load legacy doc for migration
          const legacyHandle = await repo.find<VaultMetadataDoc>(state.vault_metadata_doc_url as AnyDocumentId);
          await legacyHandle.whenReady();
          if (cancelled) return;

          legacyHandle.change((doc: any) => ensureVaultMetadataDocShape(doc, state.vault_id));
          const legacyDoc = legacyHandle.doc();

          if (legacyDoc) {
            setLoadingPhase('migrating');
            console.log(`[VaultMeta] Migrating ${Object.keys(legacyDoc.notes ?? {}).length} notes...`);

            const result = await migrateToSplitDocuments(
              repo,
              legacyDoc,
              (progress) => setMigrationProgress(progress)
            );

            if (cancelled) return;

            if (result.success && result.manifestHandle) {
              // Save manifest URL and DELETE legacy URL
              await setManifestDocUrl(vaultPath, result.manifestHandle.url);
              await setVaultMetadataDocUrl(vaultPath, null); // Delete legacy!

              manifestHandleRef.current = result.manifestHandle;
              graphCacheHandleRef.current = result.graphCacheHandle;
              setDocUrl(result.manifestHandle.url);

              noteManagerRef.current = createNoteDocManager(repo, result.manifestHandle, {
                maxCacheSize: 100,
                debug: false,
              });

              setReady(true);
              setLoadingPhase('ready');
              setMigrationProgress(null);
              console.timeEnd('[VaultMeta] boot');
              console.log(`[VaultMeta] Migration complete! ${result.notesMigrated} notes, ${result.edgesMigrated} edges`);
            } else {
              throw new Error(result.error || 'Migration failed');
            }
          } else {
            // Empty legacy doc - just create new manifest
            await createNewManifest();
          }

        } else {
          // ═══════════════════════════════════════════════════════════════════
          // NEW VAULT: Create manifest
          // ═══════════════════════════════════════════════════════════════════
          await createNewManifest();
        }

        async function createNewManifest() {
          console.log('[VaultMeta] Creating new manifest...');
          setLoadingPhase('loading-doc');

          const manifestData = createEmptyManifest(state.vault_id);
          const manifestHandle = repo.create<ManifestDoc>(manifestData as ManifestDoc);
          await manifestHandle.whenReady();
          if (cancelled) return;

          // Create graph cache for new vault
          console.log('[VaultMeta] Creating graph cache for new vault...');
          const graphCacheData = createEmptyGraphCache() as GraphCacheDoc;
          const graphHandle = repo.create<GraphCacheDoc>(graphCacheData);
          await graphHandle.whenReady();
          if (cancelled) return;

          // Register graph cache URL in manifest
          manifestHandle.change((doc: any) => {
            doc.graph_cache_url = graphHandle.url;
          });

          // vaultPath is guaranteed non-null here (early return in effect)
          await setManifestDocUrl(vaultPath!, manifestHandle.url);

          manifestHandleRef.current = manifestHandle;
          graphCacheHandleRef.current = graphHandle;
          setDocUrl(manifestHandle.url);

          noteManagerRef.current = createNoteDocManager(repo, manifestHandle, {
            maxCacheSize: 100,
            debug: false,
          });

          setReady(true);
          setLoadingPhase('ready');
          console.timeEnd('[VaultMeta] boot');
          console.log('[VaultMeta] New vault created with graph cache');
        }

      } catch (e) {
        console.timeEnd('[VaultMeta] boot');
        if (cancelled) return;
        console.error('[VaultMeta] Boot error:', e);
        setLastError(e instanceof Error ? e.message : String(e));
        setLoadingPhase('error');
      }
    };

    boot();

    return () => {
      cancelled = true;
      manifestHandleRef.current = null;
      graphCacheHandleRef.current = null;
      noteManagerRef.current = null;
      activeNoteHandleRef.current = null;
    };
  }, [repo, vaultPath]);

  // ─────────────────────────────────────────────────────────────────────────
  // Active note tracking
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ready || !vaultPath || !activeFilePath) {
      setActiveNoteId(null);
      setActiveNoteDoc(null);
      return;
    }

    const rel = toVaultRelativePath(vaultPath, activeFilePath);
    if (!rel) {
      setActiveNoteId(null);
      setActiveNoteDoc(null);
      return;
    }

    const manifest = manifestHandleRef.current?.doc() ?? null;
    const noteId = findNoteIdByPath(manifest, rel);
    setActiveNoteId(noteId);

    // Load note document
    if (noteId && noteManagerRef.current) {
      noteManagerRef.current.loadNote(noteId)
        .then(handle => {
          activeNoteHandleRef.current = handle;
          setActiveNoteDoc(handle.doc() ?? null);
        })
        .catch(err => {
          console.error('[VaultMeta] Failed to load note:', err);
          setActiveNoteDoc(null);
        });
    } else {
      activeNoteHandleRef.current = null;
      setActiveNoteDoc(null);
    }
  }, [ready, activeFilePath, vaultPath]);

  // ─────────────────────────────────────────────────────────────────────────
  // Ensure note exists when opening file
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ready || !vaultPath || !activeFilePath) return;

    const rel = toVaultRelativePath(vaultPath, activeFilePath);
    if (!rel) return;

    const manager = noteManagerRef.current;
    if (!manager) return;

    let cancelled = false;

    (async () => {
      try {
        const noteHandle = await manager.getOrCreateNote(rel);
        if (cancelled) return;

        recordNoteOpened(noteHandle);
        activeNoteHandleRef.current = noteHandle;
        const noteDoc = noteHandle.doc();
        setActiveNoteId(noteDoc?.id ?? null);
        setActiveNoteDoc(noteDoc ?? null);
      } catch (err) {
        console.error('[VaultMeta] Failed to get/create note:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [ready, activeFilePath, vaultPath]);

  // ─────────────────────────────────────────────────────────────────────────
  // Callbacks
  // ─────────────────────────────────────────────────────────────────────────

  const openNoteById = useCallback((noteId: string) => {
    if (!vaultPath) return null;
    const manifest = manifestHandleRef.current?.doc() ?? null;
    const rel = findPathByNoteId(manifest, noteId);
    if (!rel) return null;
    const vp = vaultPath.replaceAll('\\', '/').replace(/\/+$/g, '');
    return `${vp}/${rel}`;
  }, [vaultPath]);

  const setActiveNoteTags = useCallback((tags: string[]) => {
    const noteHandle = activeNoteHandleRef.current;
    if (noteHandle) {
      setNoteTags(noteHandle, tags);
    }
  }, []);

  const recordRename = useCallback((oldPath: string, newPath: string) => {
    if (!vaultPath) return;
    const oldRel = toVaultRelativePath(vaultPath, oldPath);
    const newRel = toVaultRelativePath(vaultPath, newPath);
    if (!oldRel || !newRel) return;

    const manager = noteManagerRef.current;
    if (!manager) return;

    const noteId = manager.findNoteIdByPath(oldRel);
    if (noteId) {
      manager.renameNote(noteId, oldRel, newRel);
    }
  }, [vaultPath]);

  const recordContent = useCallback((content: string) => {
    const noteHandle = activeNoteHandleRef.current;
    if (!noteHandle) return;

    const noteDoc = noteHandle.doc();
    const sourceNoteId = noteDoc?.id;
    if (!sourceNoteId) return;

    // Parse links from content
    const parsedLinks = parseLinks(content);

    // Update links in note document
    setNoteLinks(noteHandle, parsedLinks.map(l => l.target));

    // Update blocks
    const blocks = extractBlocks(content);
    if (blocks.length > 0) {
      updateNoteBlocks(noteHandle, blocks);
    }

    // Update local state
    setActiveNoteDoc(noteHandle.doc() ?? null);

    // Update graph cache with resolved edges
    const graphCacheHandle = graphCacheHandleRef.current;
    const manifest = manifestHandleRef.current?.doc();
    if (graphCacheHandle && manifest) {
      const now = Date.now();
      const edges: GraphEdge[] = [];

      for (const link of parsedLinks) {
        const targetNoteId = resolveLinkTargetFromManifest(manifest, link.target);

        // Skip unresolved links and self-links
        if (!targetNoteId || targetNoteId === sourceNoteId) continue;

        edges.push({
          id: `${sourceNoteId}-${targetNoteId}-${now}-${edges.length}`,
          sourceNoteId,
          sourceBlockId: null,
          targetNoteId,
          targetBlockId: link.blockId,
          type: link.type,
          created_at: now,
        });
      }

      updateEdgesForNote(graphCacheHandle, sourceNoteId, edges);
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Memoized values
  // ─────────────────────────────────────────────────────────────────────────

  const manifest = useMemo(() => {
    return manifestHandleRef.current?.doc() ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const graphCache = useMemo(() => {
    return graphCacheHandleRef.current?.doc() ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const normalizedVaultPath = useMemo(() => {
    if (!vaultPath) return null;
    return vaultPath.replaceAll('\\', '/').replace(/\/+$/g, '');
  }, [vaultPath]);

  const noteCount = useMemo(() => {
    return getNoteCount(manifest);
  }, [manifest]);

  return {
    ready,
    vaultId,
    docUrl,
    lastError,
    activeNoteId,
    openNoteById,
    setActiveNoteTags,
    recordRename,
    recordContent,
    normalizedVaultPath,
    loadingPhase,
    manifest,
    manifestHandle: manifestHandleRef.current,
    noteManager: noteManagerRef.current,
    activeNoteDoc,
    activeNoteHandle: activeNoteHandleRef.current,
    noteCount,
    migrationProgress,
    graphCache,
    graphCacheHandle: graphCacheHandleRef.current,
  };
}
