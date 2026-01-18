# Split Document Format Refactoring Plan

This document outlines the plan to refactor temporarily disabled features to work with the split document format (ManifestDoc + NoteDocs + GraphCacheDoc).

## Background

The split document architecture separates concerns:
- **ManifestDoc** → lightweight index for O(1) lookups (loads in <100ms)
- **NoteDoc** → per-note metadata, lazy-loaded on demand via NoteDocManager
- **GraphCacheDoc** → pre-computed graph edges, avoids loading 840+ notes

Each stubbed feature needs different data sources:
- AI Query: manifest + file system (read actual content)
- Query Engine: manifest + NoteDoc (for supertag field values)
- Supertags: NoteDoc via noteHandle + manifest for definitions

---

## 1. `useSupertagDefinitions` - **Low complexity** ✅

**Current state:** Reads from `manifest.supertag_definitions` (works), CRUD is disabled.

**What needs updating:**
The CRDT functions already exist in `manifestDoc.ts` - just need to wire them up.

**Implementation:**
```typescript
// In useSupertagDefinitions.ts

const create = useCallback(
  (params: { name: string; fields: SupertagField[]; icon?: string }) => {
    if (!manifestHandle) return null;
    const id = crypto.randomUUID();
    manifestHandle.change((doc: any) => {
      doc.supertag_definitions[id] = {
        id,
        name: params.name.trim().toLowerCase(),
        icon: params.icon,
        fields: params.fields,
        created_at: Date.now(),
        updated_at: Date.now(),
      };
    });
    return id;
  },
  [manifestHandle]
);
```

**Estimated changes:** ~30 lines in `useSupertagDefinitions.ts`

---

## 2. `useNoteSuperTags` - **Medium complexity**

**Current state:** Uses `activeNoteDoc` but CRUD is disabled.

**What needs updating:**
- The `NoteDoc` type already has `supertags: SupertagInstance[]`
- Functions `applySupertagToNote` and `removeSupertagFromNote` exist in `noteDoc.ts`
- Need a `noteHandle` for the active note (not just the doc)

**Problem:** Context provides `activeNoteDoc` (the data) but not `activeNoteHandle` (the mutation handle).

**Implementation steps:**
1. Add `activeNoteHandle: DocHandle<NoteDoc> | null` to VaultMetadataContext
2. Wire it from `useVaultMetadataCrdt` (the handle is available from `noteManager.loadNote()`)
3. Use the handle in `useNoteSuperTags`:

```typescript
const apply = useCallback(
  (definitionId: string, values: Record<string, any>) => {
    if (!noteHandle) return;
    applySupertagToNote(noteHandle, { definitionId, values });
  },
  [noteHandle]
);
```

**Estimated changes:**
- ~10 lines in VaultMetadataContext
- ~20 lines in useVaultMetadataCrdt
- ~30 lines in useNoteSuperTags

---

## 3. `useQueryEngine` - **High complexity**

**Current state:** Query execution disabled. Uses legacy `VaultMetadataDoc`.

**What needs updating:**
The query executor (`executor.ts`) operates on `VaultMetadataDoc.notes` which doesn't exist in split format.

**Analysis of query types:**

| Filter | Data Source | Requires Loading |
|--------|-------------|------------------|
| `type:project` | NoteDoc.supertags | Yes (scan all) |
| `tag:todo` | NoteDoc.tags | Yes (scan all) |
| `linked:MyNote` | GraphCacheDoc.edges | No |
| `from:MyNote` | GraphCacheDoc.backlink_index | No |
| `created:>=2024-01-01` | NoteDoc.created_at | Yes (scan all) |
| `has:supertags` | NoteDoc.supertags | Yes (scan all) |
| Text search (title) | Manifest.id_to_path | No (derive title) |

**Strategy: Progressive query execution**

1. **Phase 1 - Manifest-only queries:** Support title search and basic counts
2. **Phase 2 - GraphCache queries:** `linked:`, `from:`, `has:links`
3. **Phase 3 - Full queries:** Load NoteDocs for filters that need them

**Implementation:**

Create `executeSplitQuery()` in a new `src/query/splitExecutor.ts`:

```typescript
export async function executeSplitQuery(params: {
  query: ParsedQuery;
  manifest: ManifestDoc;
  graphCache: GraphCacheDoc | null;
  noteManager: NoteDocManager;
}): Promise<QueryResult> {
  // 1. Start with all note IDs from manifest
  let candidateIds = Object.keys(params.manifest.note_urls);

  // 2. Apply manifest-only filters (path/title matching)
  candidateIds = applyManifestFilters(candidateIds, params.query, params.manifest);

  // 3. Apply graph cache filters (linked:, from:, has:links)
  if (hasGraphFilters(params.query) && params.graphCache) {
    candidateIds = applyGraphFilters(candidateIds, params.query, params.graphCache);
  }

  // 4. If query needs NoteDoc data, load documents
  if (needsNoteDocFilters(params.query)) {
    const notes = await loadNotesForQuery(candidateIds, params.noteManager);
    candidateIds = applyNoteDocFilters(notes, params.query);
  }

  // 5. Build result with minimal metadata
  return buildQueryResult(candidateIds, params.manifest);
}
```

**Estimated changes:**
- New file: ~200 lines `splitExecutor.ts`
- Update: ~50 lines in `useQueryEngine.ts`

---

## 4. `useAIQuery` - **Medium complexity**

**Current state:** Both `buildIndex` and `query` are disabled.

**What needs updating:**
- `buildVaultEmbeddings` uses `doc.notes` → needs manifest + file read
- `searchVault` uses `doc.notes` → needs manifest for metadata
- `queryVault` returns `VaultNote` objects → need a lighter type

**Implementation:**

Update `ai-query.ts` to work with split format:

```typescript
// In ai-query.ts

export async function buildVaultEmbeddings(params: {
  manifest: ManifestDoc;
  vaultPath: string;
  onProgress?: (current: number, total: number) => void;
}): Promise<{ processed: number; cached: number; failed: number }> {
  const noteIds = Object.keys(params.manifest.id_to_path);
  const normalizedVault = params.vaultPath.replaceAll('\\', '/').replace(/\/+$/g, '');

  let processed = 0, cached = 0, failed = 0;

  for (let i = 0; i < noteIds.length; i++) {
    const noteId = noteIds[i];
    const relPath = params.manifest.id_to_path[noteId];
    params.onProgress?.(i + 1, noteIds.length);

    try {
      const fullPath = `${normalizedVault}/${relPath}`;
      const content = await readTextFile(fullPath);
      const contentHash = hashString(content);

      const cached_entry = embeddingCache.get(noteId);
      if (cached_entry && cached_entry.contentHash === contentHash) {
        cached++;
        continue;
      }

      // Derive title from path
      const title = relPath.split('/').pop()?.replace(/\.md$/i, '') ?? 'Untitled';
      const textForEmbedding = title + '\n\n' + content.slice(0, 500);
      const response = await getEmbedding(textForEmbedding);

      embeddingCache.set(noteId, {
        noteId,
        embedding: response.embedding,
        contentHash,
      });
      processed++;
    } catch (err) {
      console.warn(`[AI Query] Failed to embed ${relPath}:`, err);
      failed++;
    }
  }

  return { processed, cached, failed };
}
```

**New lightweight type for results:**

```typescript
export interface LightNote {
  id: string;
  relPath: string;
  title: string;
}

export interface QueryResult {
  answer: string;
  sources: Array<{
    note: LightNote;
    relevance: number;
    excerpt: string;
  }>;
  processingTime: number;
}
```

**Estimated changes:**
- Update: ~100 lines in `ai-query.ts`
- Update: ~20 lines in `useAIQuery.ts`

---

## Implementation Order

| Priority | Feature | Complexity | Dependencies |
|----------|---------|------------|--------------|
| 1 | `useSupertagDefinitions` | Low | None |
| 2 | `useNoteSuperTags` | Medium | Needs activeNoteHandle in context |
| 3 | `useAIQuery` | Medium | Independent |
| 4 | `useQueryEngine` | High | Benefits from above |

---

## Required Context Changes

Add to `VaultMetadataContextValue`:

```typescript
interface VaultMetadataContextValue {
  // ... existing fields ...

  /** Handle to the active note's document (for mutations) */
  activeNoteHandle: DocHandle<NoteDoc> | null;
}
```

Update `useVaultMetadataCrdt` to track the handle when loading notes:

```typescript
// When setting activeNoteDoc, also store the handle
const [activeNoteHandle, setActiveNoteHandle] = useState<DocHandle<NoteDoc> | null>(null);

// In loadNote callback:
const { doc, handle } = await noteManager.loadNote(noteId);
setActiveNoteDoc(doc);
setActiveNoteHandle(handle);
```

---

## Summary

The refactoring can be done incrementally:

1. **Quick win:** `useSupertagDefinitions` - just wire up existing `manifestHandle.change()` calls (~30 min)
2. **Medium effort:** Add `activeNoteHandle` to context, then fix `useNoteSuperTags` (~1-2 hours)
3. **Medium effort:** Update `ai-query.ts` to use manifest + file system (~1-2 hours)
4. **Larger effort:** Create `splitExecutor.ts` for query engine (~3-4 hours)
