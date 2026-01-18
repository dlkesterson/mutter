/**
 * Migration Module
 *
 * Handles one-time migration from legacy VaultMetadataDoc (single monolithic document)
 * to the split document format (ManifestDoc + individual NoteDoc per note).
 *
 * Migration is triggered automatically when:
 * 1. A legacy vault_metadata_doc_url exists
 * 2. No manifest_doc_url exists yet
 *
 * The migration process:
 * 1. Load the legacy VaultMetadataDoc
 * 2. Create a new ManifestDoc
 * 3. Create individual NoteDoc for each note (in batches)
 * 4. Build GraphCacheDoc from existing graph data
 * 5. Update vault state with new manifest_doc_url
 * 6. Mark migration as complete in manifest
 */

import type { Repo, DocHandle } from '@automerge/automerge-repo';
import type { VaultMetadataDoc } from './vaultMetadataDoc';
import {
  type ManifestDoc,
  MANIFEST_SCHEMA_VERSION,
  ensureManifestDocShape,
} from './manifestDoc';
import {
  type NoteDoc,
  NOTE_SCHEMA_VERSION,
} from './noteDoc';
import {
  type GraphCacheDoc,
  GRAPH_CACHE_SCHEMA_VERSION,
} from './graphCacheDoc';

/** Migration progress callback */
export type MigrationProgressCallback = (progress: MigrationProgress) => void;

/** Migration progress state */
export interface MigrationProgress {
  phase: 'starting' | 'creating-manifest' | 'migrating-notes' | 'building-graph' | 'finalizing' | 'complete' | 'error';
  notesTotal: number;
  notesMigrated: number;
  message: string;
}

/** Migration result */
export interface MigrationResult {
  success: boolean;
  manifestHandle: DocHandle<ManifestDoc> | null;
  graphCacheHandle: DocHandle<GraphCacheDoc> | null;
  notesMigrated: number;
  edgesMigrated: number;
  error?: string;
}

/**
 * Migrate from legacy VaultMetadataDoc to split document format.
 *
 * This is a one-time migration that:
 * 1. Creates a new ManifestDoc with note URLs and path indexes
 * 2. Creates individual NoteDoc for each note
 * 3. Creates a GraphCacheDoc with pre-computed edges and backlinks
 *
 * The old VaultMetadataDoc is NOT deleted - it remains as a backup.
 */
export async function migrateToSplitDocuments(
  repo: Repo,
  legacyDoc: VaultMetadataDoc,
  onProgress?: MigrationProgressCallback
): Promise<MigrationResult> {
  const report = (progress: Partial<MigrationProgress>) => {
    onProgress?.({
      phase: 'starting',
      notesTotal: 0,
      notesMigrated: 0,
      message: '',
      ...progress,
    });
  };

  try {
    const noteIds = Object.keys(legacyDoc.notes ?? {});
    const totalNotes = noteIds.length;

    console.log(`[Migration] Starting migration of ${totalNotes} notes...`);
    report({
      phase: 'starting',
      notesTotal: totalNotes,
      notesMigrated: 0,
      message: `Starting migration of ${totalNotes} notes...`,
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Step 1: Create manifest
    // ─────────────────────────────────────────────────────────────────────────
    report({
      phase: 'creating-manifest',
      notesTotal: totalNotes,
      notesMigrated: 0,
      message: 'Creating manifest document...',
    });

    const manifestData: ManifestDoc = {
      schema_version: MANIFEST_SCHEMA_VERSION,
      vault_id: legacyDoc.meta?.vault_id ?? crypto.randomUUID(),
      created_at: legacyDoc.meta?.created_at ?? Date.now(),
      note_urls: {},
      path_index: {},
      id_to_path: {},
      supertag_definitions: legacyDoc.supertag_definitions ?? {},
      graph_cache_url: null,
      migrated_from_single_doc: true,
      migration_completed_at: null,
    };

    const manifestHandle = repo.create<ManifestDoc>(manifestData);
    await manifestHandle.whenReady();
    console.log(`[Migration] Manifest created: ${manifestHandle.url}`);

    // ─────────────────────────────────────────────────────────────────────────
    // Step 2: Migrate notes in batches
    // ─────────────────────────────────────────────────────────────────────────
    const BATCH_SIZE = 20;
    let notesMigrated = 0;

    for (let i = 0; i < noteIds.length; i += BATCH_SIZE) {
      const batch = noteIds.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (noteId) => {
          const oldNote = legacyDoc.notes[noteId];
          if (!oldNote) return;

          // Create note document
          const noteData: NoteDoc = {
            schema_version: NOTE_SCHEMA_VERSION,
            id: noteId,
            rel_path: oldNote.rel_path,
            title: oldNote.title,
            created_at: oldNote.created_at,
            updated_at: oldNote.updated_at,
            last_opened_at: oldNote.last_opened_at ?? null,
            tags: oldNote.tags ?? [],
            links: oldNote.links ?? [],
            blocks: oldNote.blocks ?? {},
            block_order: oldNote.block_order ?? [],
            supertags: oldNote.supertags ?? [],
          };

          const noteHandle = repo.create<NoteDoc>(noteData);
          await noteHandle.whenReady();

          // Register in manifest (use change to ensure CRDT updates)
          manifestHandle.change((doc: any) => {
            ensureManifestDocShape(doc, doc.vault_id);
            doc.note_urls[noteId] = noteHandle.url;
            doc.path_index[oldNote.rel_path] = noteId;
            doc.id_to_path[noteId] = oldNote.rel_path;
          });
        })
      );

      notesMigrated = Math.min(i + BATCH_SIZE, noteIds.length);
      console.log(`[Migration] Migrated ${notesMigrated}/${totalNotes} notes`);

      report({
        phase: 'migrating-notes',
        notesTotal: totalNotes,
        notesMigrated,
        message: `Migrated ${notesMigrated}/${totalNotes} notes...`,
      });

      // Yield to main thread to keep UI responsive
      await new Promise((r) => setTimeout(r, 0));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 3: Build graph cache from existing edges
    // ─────────────────────────────────────────────────────────────────────────
    report({
      phase: 'building-graph',
      notesTotal: totalNotes,
      notesMigrated,
      message: 'Building graph cache...',
    });

    const oldEdges = legacyDoc.graph_edges ?? {};
    const oldBacklinks = legacyDoc.backlink_index ?? {};
    const edgeCount = Object.keys(oldEdges).length;

    console.log(`[Migration] Migrating ${edgeCount} graph edges...`);

    // Create graph cache document
    const graphCacheData: GraphCacheDoc = {
      schema_version: GRAPH_CACHE_SCHEMA_VERSION,
      edges: {},
      backlink_index: {},
      last_built_at: Date.now(),
      notes_included: totalNotes,
      edge_count: edgeCount,
      status: 'valid',
      dirty_note_ids: [],
    };

    // Copy edges
    for (const [edgeId, edge] of Object.entries(oldEdges)) {
      graphCacheData.edges[edgeId] = {
        id: edge.id,
        sourceNoteId: edge.sourceNoteId,
        targetNoteId: edge.targetNoteId,
        sourceBlockId: edge.sourceBlockId ?? null,
        targetBlockId: edge.targetBlockId ?? null,
        type: edge.type, // GraphEdgeType from legacy doc
        created_at: edge.created_at,
      };
    }

    // Copy backlinks
    for (const [noteId, sourceIds] of Object.entries(oldBacklinks)) {
      graphCacheData.backlink_index[noteId] = [...sourceIds];
    }

    const graphCacheHandle = repo.create<GraphCacheDoc>(graphCacheData);
    await graphCacheHandle.whenReady();
    console.log(`[Migration] Graph cache created: ${graphCacheHandle.url}`);

    // Update manifest with graph cache URL
    manifestHandle.change((doc: any) => {
      doc.graph_cache_url = graphCacheHandle.url;
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Step 4: Mark migration complete
    // ─────────────────────────────────────────────────────────────────────────
    report({
      phase: 'finalizing',
      notesTotal: totalNotes,
      notesMigrated,
      message: 'Finalizing migration...',
    });

    manifestHandle.change((doc: any) => {
      doc.migration_completed_at = Date.now();
    });

    console.log('[Migration] Migration complete!');
    report({
      phase: 'complete',
      notesTotal: totalNotes,
      notesMigrated,
      message: `Migration complete! Migrated ${totalNotes} notes and ${edgeCount} edges.`,
    });

    return {
      success: true,
      manifestHandle,
      graphCacheHandle,
      notesMigrated: totalNotes,
      edgesMigrated: edgeCount,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[Migration] Migration failed:', errorMsg);

    report({
      phase: 'error',
      notesTotal: 0,
      notesMigrated: 0,
      message: `Migration failed: ${errorMsg}`,
    });

    return {
      success: false,
      manifestHandle: null,
      graphCacheHandle: null,
      notesMigrated: 0,
      edgesMigrated: 0,
      error: errorMsg,
    };
  }
}

/**
 * Check if a vault needs migration.
 *
 * A vault needs migration if:
 * 1. It has a legacy vault_metadata_doc_url
 * 2. It does NOT have a manifest_doc_url
 */
export function needsMigration(state: {
  vault_metadata_doc_url?: string | null;
  manifest_doc_url?: string | null;
}): boolean {
  const hasLegacy = !!state.vault_metadata_doc_url;
  const hasManifest = !!state.manifest_doc_url;
  return hasLegacy && !hasManifest;
}
