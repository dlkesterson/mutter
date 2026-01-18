# CRDT Document Splitting Plan

> **Goal:** Eliminate 46-second startup blocking by splitting the monolithic CRDT document into per-note documents with a lightweight manifest.

## Problem Statement

The current architecture uses a single Automerge CRDT document (`VaultMetadataDoc`) that stores metadata for all 840+ notes. On cold start, `repo.find()` takes **46 seconds** to parse this document from IndexedDB, blocking the main thread and freezing the UI.

### Current Timing (Cold Start)
```
[VaultMeta] repo.find/create: 46394.452ms  ← BLOCKING
[VaultMeta] boot total: 50498.472ms
```

### Current Document Size
```
840 notes, 272 graph edges, 248 backlink entries, 280 blocks
```

---

## Solution: Per-Note Document Architecture

### Design Principles

1. **Manifest loads instantly** - Tiny document with just note IDs and paths
2. **Notes load on-demand** - Only load note metadata when needed
3. **Graph computed lazily** - Build from loaded notes, cache in separate doc
4. **Obsidian-like UX** - Sidebar appears immediately, content loads as you navigate

### New Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│ IndexedDB                                                          │
│                                                                    │
│  ┌──────────────────┐                                              │
│  │ ManifestDoc      │  ← Loads in <100ms                           │
│  │ - vault_id       │                                              │
│  │ - note_urls{}    │  (noteId → automerge URL)                    │
│  │ - path_index{}   │  (relPath → noteId)                          │
│  │ - supertag_defs  │                                              │
│  └──────────────────┘                                              │
│                                                                    │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐                      │
│  │ NoteDoc 1  │ │ NoteDoc 2  │ │ NoteDoc N  │  ← Lazy loaded       │
│  │ - metadata │ │ - metadata │ │ - metadata │                      │
│  │ - blocks   │ │ - blocks   │ │ - blocks   │                      │
│  │ - links    │ │ - links    │ │ - links    │                      │
│  └────────────┘ └────────────┘ └────────────┘                      │
│                                                                    │
│  ┌──────────────────┐                                              │
│  │ GraphCacheDoc    │  ← Optional, rebuilt periodically            │
│  │ - edges{}        │                                              │
│  │ - backlinks{}    │                                              │
│  │ - last_built_at  │                                              │
│  └──────────────────┘                                              │
└────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: New Document Schemas

### File: `src/crdt/manifestDoc.ts`

```typescript
export const MANIFEST_SCHEMA_VERSION = 1;

/**
 * Lightweight manifest document - loads instantly on startup.
 * Contains only note IDs and path mappings, no content.
 */
export type ManifestDoc = {
  schema_version: typeof MANIFEST_SCHEMA_VERSION;
  vault_id: string;
  created_at: number;

  // Note document references (noteId → Automerge document URL)
  note_urls: Record<string, string>;

  // Path index for fast lookup (relPath → noteId)
  path_index: Record<string, string>;

  // Reverse index (noteId → relPath) for navigation
  id_to_path: Record<string, string>;

  // Supertag definitions (vault-wide, not per-note)
  supertag_definitions: Record<string, SupertagDefinition>;
};
```

### File: `src/crdt/noteDoc.ts`

```typescript
export const NOTE_SCHEMA_VERSION = 1;

/**
 * Per-note document - loaded on demand when note is accessed.
 * Contains all metadata for a single note.
 */
export type NoteDoc = {
  schema_version: typeof NOTE_SCHEMA_VERSION;

  // Identity
  id: string;           // UUID, stable across renames
  rel_path: string;     // Current path relative to vault
  title: string;        // Derived from filename or frontmatter

  // Timestamps
  created_at: number;
  updated_at: number;
  last_opened_at: number | null;

  // Content metadata
  tags: string[];
  links: string[];      // Outgoing wiki-link targets (note names)

  // Block-level tracking
  blocks: Record<string, StoredBlockInfo>;
  block_order: string[];

  // Supertag instances (references to definitions in manifest)
  supertags: SupertagInstance[];
};
```

### File: `src/crdt/graphCacheDoc.ts`

```typescript
export const GRAPH_CACHE_SCHEMA_VERSION = 1;

/**
 * Cached graph data - rebuilt periodically from note documents.
 * Avoids loading all notes just to show the graph.
 */
export type GraphCacheDoc = {
  schema_version: typeof GRAPH_CACHE_SCHEMA_VERSION;

  // Pre-computed edges
  edges: Record<string, GraphEdge>;

  // Backlink index (targetNoteId → sourceNoteIds[])
  backlink_index: Record<string, string[]>;

  // Cache metadata
  last_built_at: number;
  notes_included: number;  // Count of notes when cache was built
};
```

---

## Phase 2: Manifest & Note Document Management

### File: `src/crdt/noteDocManager.ts`

Responsibilities:
- Create/load/delete individual note documents
- Maintain manifest consistency
- Handle note renames (update path_index)
- Provide lazy loading with caching

```typescript
export class NoteDocManager {
  private repo: Repo;
  private manifestHandle: DocHandle<ManifestDoc>;
  private noteCache: Map<string, DocHandle<NoteDoc>>;
  private loadingPromises: Map<string, Promise<DocHandle<NoteDoc>>>;

  constructor(repo: Repo, manifestHandle: DocHandle<ManifestDoc>) {
    this.repo = repo;
    this.manifestHandle = manifestHandle;
    this.noteCache = new Map();
    this.loadingPromises = new Map();
  }

  /**
   * Get or create a note document for the given path.
   * Lazy loads from IndexedDB if not in cache.
   */
  async getOrCreateNote(relPath: string): Promise<DocHandle<NoteDoc>> {
    const manifest = this.manifestHandle.doc();
    const noteId = manifest?.path_index[relPath];

    if (noteId) {
      return this.loadNote(noteId);
    } else {
      return this.createNote(relPath);
    }
  }

  /**
   * Load a note by ID. Returns cached handle if available.
   */
  async loadNote(noteId: string): Promise<DocHandle<NoteDoc>> {
    // Check cache first
    if (this.noteCache.has(noteId)) {
      return this.noteCache.get(noteId)!;
    }

    // Check if already loading (dedup concurrent requests)
    if (this.loadingPromises.has(noteId)) {
      return this.loadingPromises.get(noteId)!;
    }

    // Load from repo
    const manifest = this.manifestHandle.doc();
    const docUrl = manifest?.note_urls[noteId];

    if (!docUrl) {
      throw new Error(`Note ${noteId} not found in manifest`);
    }

    const loadPromise = (async () => {
      const handle = await this.repo.find<NoteDoc>(docUrl);
      await handle.whenReady();
      this.noteCache.set(noteId, handle);
      this.loadingPromises.delete(noteId);
      return handle;
    })();

    this.loadingPromises.set(noteId, loadPromise);
    return loadPromise;
  }

  /**
   * Create a new note document and register in manifest.
   */
  async createNote(relPath: string): Promise<DocHandle<NoteDoc>> {
    const noteId = crypto.randomUUID();
    const title = this.titleFromPath(relPath);

    // Create note document
    const noteHandle = this.repo.create<NoteDoc>({
      schema_version: NOTE_SCHEMA_VERSION,
      id: noteId,
      rel_path: relPath,
      title,
      created_at: Date.now(),
      updated_at: Date.now(),
      last_opened_at: null,
      tags: [],
      links: [],
      blocks: {},
      block_order: [],
      supertags: [],
    });

    await noteHandle.whenReady();

    // Register in manifest
    this.manifestHandle.change(doc => {
      doc.note_urls[noteId] = noteHandle.url;
      doc.path_index[relPath] = noteId;
      doc.id_to_path[noteId] = relPath;
    });

    // Cache it
    this.noteCache.set(noteId, noteHandle);

    return noteHandle;
  }

  /**
   * Handle note rename - update path_index in manifest.
   */
  renameNote(noteId: string, oldPath: string, newPath: string): void {
    this.manifestHandle.change(doc => {
      delete doc.path_index[oldPath];
      doc.path_index[newPath] = noteId;
      doc.id_to_path[noteId] = newPath;
    });

    // Update the note document too
    const noteHandle = this.noteCache.get(noteId);
    if (noteHandle) {
      noteHandle.change(note => {
        note.rel_path = newPath;
        note.title = this.titleFromPath(newPath);
        note.updated_at = Date.now();
      });
    }
  }

  /**
   * Delete a note document.
   */
  deleteNote(noteId: string): void {
    const manifest = this.manifestHandle.doc();
    const relPath = manifest?.id_to_path[noteId];

    this.manifestHandle.change(doc => {
      delete doc.note_urls[noteId];
      delete doc.id_to_path[noteId];
      if (relPath) {
        delete doc.path_index[relPath];
      }
    });

    // Remove from cache
    this.noteCache.delete(noteId);

    // Note: Automerge document will be garbage collected
    // when no references remain
  }

  /**
   * Get all note IDs (from manifest, no loading required).
   */
  getAllNoteIds(): string[] {
    const manifest = this.manifestHandle.doc();
    return Object.keys(manifest?.note_urls ?? {});
  }

  /**
   * Find note ID by path (from manifest, no loading required).
   */
  findNoteIdByPath(relPath: string): string | null {
    const manifest = this.manifestHandle.doc();
    return manifest?.path_index[relPath] ?? null;
  }

  /**
   * Find path by note ID (from manifest, no loading required).
   */
  findPathByNoteId(noteId: string): string | null {
    const manifest = this.manifestHandle.doc();
    return manifest?.id_to_path[noteId] ?? null;
  }

  private titleFromPath(relPath: string): string {
    const base = relPath.split('/').pop() ?? relPath;
    return base.replace(/\.md$/i, '') || 'Untitled';
  }
}
```

---

## Phase 3: Updated Hook - `useVaultMetadataCrdt`

The hook will now:
1. Load manifest instantly (<100ms)
2. Set `ready: true` once manifest is loaded
3. Lazy-load note documents as needed
4. Provide `getNoteDoc(noteId)` for on-demand access

### Key Changes

```typescript
export function useVaultMetadataCrdt(params: {
  vaultPath: string | null;
  activeFilePath: string | null;
}): Result {
  // ... existing setup ...

  const [manifestReady, setManifestReady] = useState(false);
  const noteManagerRef = useRef<NoteDocManager | null>(null);

  // Boot process - now loads manifest only
  useEffect(() => {
    const boot = async () => {
      // Load or create manifest (tiny, <100ms)
      const manifestHandle = await loadOrCreateManifest(repo, vaultPath);

      // Create note manager
      noteManagerRef.current = new NoteDocManager(repo, manifestHandle);

      // Ready immediately!
      setManifestReady(true);
      setReady(true);
    };

    boot();
  }, [repo, vaultPath]);

  // Load active note's document when path changes
  useEffect(() => {
    if (!manifestReady || !activeFilePath) return;

    const loadActiveNote = async () => {
      const relPath = toVaultRelativePath(vaultPath, activeFilePath);
      if (!relPath) return;

      const noteHandle = await noteManagerRef.current?.getOrCreateNote(relPath);
      // ... use noteHandle for active note operations
    };

    loadActiveNote();
  }, [manifestReady, activeFilePath, vaultPath]);

  return {
    ready: manifestReady,  // True once manifest loads (~100ms)
    // ... other fields ...
    noteManager: noteManagerRef.current,
  };
}
```

---

## Phase 4: Graph Building Strategy

### Option A: On-Demand Graph (Simpler)

Build graph edges by traversing loaded notes. Only shows edges for notes that have been opened.

```typescript
function buildGraphFromLoadedNotes(
  noteManager: NoteDocManager,
  loadedNoteIds: string[]
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  for (const noteId of loadedNoteIds) {
    const noteHandle = noteManager.getCachedNote(noteId);
    if (!noteHandle) continue;

    const note = noteHandle.doc();
    nodes.push({ id: noteId, label: note.title });

    for (const linkTarget of note.links) {
      const targetId = noteManager.findNoteIdByPath(linkTarget);
      if (targetId) {
        edges.push({
          id: `${noteId}->${targetId}`,
          source: noteId,
          target: targetId,
          type: 'wiki-link',
        });
      }
    }
  }

  return { nodes, edges };
}
```

### Option B: Background Graph Cache (Better UX)

Rebuild graph cache periodically in the background.

```typescript
async function rebuildGraphCache(
  repo: Repo,
  noteManager: NoteDocManager,
  graphCacheHandle: DocHandle<GraphCacheDoc>
): Promise<void> {
  const noteIds = noteManager.getAllNoteIds();
  const edges: Record<string, GraphEdge> = {};
  const backlinks: Record<string, string[]> = {};

  // Load all notes in batches to avoid memory pressure
  const BATCH_SIZE = 50;
  for (let i = 0; i < noteIds.length; i += BATCH_SIZE) {
    const batch = noteIds.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async (noteId) => {
      const noteHandle = await noteManager.loadNote(noteId);
      const note = noteHandle.doc();

      for (const linkTarget of note.links) {
        const targetId = noteManager.findNoteIdByPath(linkTarget);
        if (targetId) {
          const edgeId = `${noteId}->${targetId}`;
          edges[edgeId] = {
            id: edgeId,
            sourceNoteId: noteId,
            targetNoteId: targetId,
            type: 'wiki-link',
            created_at: Date.now(),
          };

          // Build backlink index
          if (!backlinks[targetId]) backlinks[targetId] = [];
          if (!backlinks[targetId].includes(noteId)) {
            backlinks[targetId].push(noteId);
          }
        }
      }
    }));

    // Yield to main thread between batches
    await new Promise(r => setTimeout(r, 0));
  }

  // Update cache document
  graphCacheHandle.change(doc => {
    doc.edges = edges;
    doc.backlink_index = backlinks;
    doc.last_built_at = Date.now();
    doc.notes_included = noteIds.length;
  });
}
```

---

## Phase 5: Migration from Single Document

### Migration Strategy

1. **Detect old format** - Check if `VaultMetadataDoc` exists with notes
2. **Create manifest** - Extract note IDs and paths
3. **Create note documents** - One per note, copy metadata
4. **Build initial graph cache** - From migrated notes
5. **Mark migration complete** - Store flag in manifest

### File: `src/crdt/migration.ts`

```typescript
export async function migrateToSplitDocuments(
  repo: Repo,
  oldDoc: VaultMetadataDoc,
  vaultPath: string
): Promise<DocHandle<ManifestDoc>> {
  console.log('[Migration] Starting migration to split documents...');
  console.log(`[Migration] Migrating ${Object.keys(oldDoc.notes).length} notes`);

  // Create manifest
  const manifestHandle = repo.create<ManifestDoc>({
    schema_version: MANIFEST_SCHEMA_VERSION,
    vault_id: oldDoc.meta.vault_id,
    created_at: Date.now(),
    note_urls: {},
    path_index: {},
    id_to_path: {},
    supertag_definitions: oldDoc.supertag_definitions ?? {},
  });

  await manifestHandle.whenReady();

  // Migrate notes in batches
  const noteIds = Object.keys(oldDoc.notes);
  const BATCH_SIZE = 20;

  for (let i = 0; i < noteIds.length; i += BATCH_SIZE) {
    const batch = noteIds.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async (noteId) => {
      const oldNote = oldDoc.notes[noteId];

      // Create note document
      const noteHandle = repo.create<NoteDoc>({
        schema_version: NOTE_SCHEMA_VERSION,
        id: noteId,
        rel_path: oldNote.rel_path,
        title: oldNote.title,
        created_at: oldNote.created_at,
        updated_at: oldNote.updated_at,
        last_opened_at: oldNote.last_opened_at,
        tags: oldNote.tags,
        links: oldNote.links,
        blocks: oldNote.blocks,
        block_order: oldNote.block_order,
        supertags: oldNote.supertags ?? [],
      });

      await noteHandle.whenReady();

      // Register in manifest
      manifestHandle.change(doc => {
        doc.note_urls[noteId] = noteHandle.url;
        doc.path_index[oldNote.rel_path] = noteId;
        doc.id_to_path[noteId] = oldNote.rel_path;
      });
    }));

    console.log(`[Migration] Migrated ${Math.min(i + BATCH_SIZE, noteIds.length)}/${noteIds.length} notes`);

    // Yield to main thread
    await new Promise(r => setTimeout(r, 0));
  }

  console.log('[Migration] Migration complete!');
  return manifestHandle;
}
```

---

## Phase 6: Implementation Order

### Step 1: Create New Schema Files (Day 1) ✅ COMPLETE
- [x] `src/crdt/manifestDoc.ts` - Manifest type and helpers
- [x] `src/crdt/noteDoc.ts` - Note document type and helpers
- [x] `src/crdt/graphCacheDoc.ts` - Graph cache type

### Step 2: Implement NoteDocManager (Day 1-2) ✅ COMPLETE
- [x] `src/crdt/noteDocManager.ts` - Core lazy loading logic
- [ ] Unit tests for NoteDocManager (deferred to Phase 6)

### Step 3: Update useVaultMetadataCrdt Hook (Day 2)
- [ ] Load manifest instead of full document
- [ ] Integrate NoteDocManager
- [ ] Update return type to expose note manager

### Step 4: Update Consumers (Day 2-3)
- [ ] `src/context/VaultMetadataContext.tsx` - Expose note manager
- [ ] `src/components/BacklinksPanel.tsx` - Use lazy loading
- [ ] `src/components/graph/GraphPanel.tsx` - Use graph cache or on-demand
- [ ] `src/graph/graphBuilder.ts` - Work with split documents

### Step 5: Implement Migration (Day 3)
- [ ] `src/crdt/migration.ts` - Migration logic
- [ ] Detection of old format
- [ ] One-time migration on startup

### Step 6: Testing & Polish (Day 4)
- [ ] Test cold start performance
- [ ] Test with large vault (1000+ notes)
- [ ] Handle edge cases (deleted notes, conflicts)
- [ ] Remove old VaultMetadataDoc code

---

## Expected Results

| Metric | Before | After |
|--------|--------|-------|
| Cold start to UI ready | 46+ seconds | <500ms |
| Manifest load time | N/A | ~50-100ms |
| Note load time (first access) | N/A | ~5-20ms per note |
| Graph view (full vault) | Instant (preloaded) | ~2-5s (lazy build) |
| Memory usage | All notes in RAM | Only loaded notes |

---

## Risks & Mitigations

### Risk 1: Sync Complexity
**Issue:** Multiple documents to sync instead of one.
**Mitigation:** Automerge-repo handles multi-doc sync natively. Manifest acts as the "root" document.

### Risk 2: Orphaned Documents
**Issue:** Note documents without manifest references.
**Mitigation:** Periodic cleanup job that checks for orphans.

### Risk 3: Graph Cache Staleness
**Issue:** Graph cache doesn't reflect recent changes.
**Mitigation:** Rebuild cache when opening graph view if stale (>5 min).

### Risk 4: Migration Failure
**Issue:** Migration crashes mid-way.
**Mitigation:** Atomic migration - only switch to new format if fully complete. Keep old doc as backup.

---

## Open Questions

1. **Graph cache storage:** Separate document or rebuild on-demand?
   - Recommendation: Start with on-demand, add cache if too slow

2. **Note document cleanup:** When to delete orphaned note docs?
   - Recommendation: Manual cleanup command initially

3. **Supertag definitions:** Stay in manifest or separate doc?
   - Recommendation: Keep in manifest (small, vault-wide)

4. **Sync indicator:** How to show sync status for 840 documents?
   - Recommendation: Aggregate status in manifest metadata

---

## References

- Current implementation: `src/crdt/vaultMetadataDoc.ts`
- Automerge-repo docs: https://automerge.org/docs/repositories/
- Obsidian sync design (inspiration): Uses per-file sync with lightweight index
