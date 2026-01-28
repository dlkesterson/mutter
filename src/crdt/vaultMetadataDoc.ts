import type { DocHandle } from '@automerge/react';
import type { BlockInfo } from '../editor/blockIds';

export const VAULT_METADATA_SCHEMA_VERSION = 3 as const;

// Re-export BlockInfo for convenience
export type { BlockInfo } from '../editor/blockIds';

// Simplified block info for CRDT storage (excludes line numbers which change)
export type StoredBlockInfo = {
  id: string;
  type: 'heading' | 'paragraph' | 'list-item' | 'code-block' | 'blockquote';
  level?: number;
  text: string; // First 100 chars
};

// ============================================================================
// Graph Edge Types (v3)
// ============================================================================

/**
 * Link types for graph edges
 */
export type GraphEdgeType = 'wiki-link' | 'embed' | 'reference';

/**
 * Graph edge representing a link between notes/blocks
 * Enables bidirectional link tracking and backlinks
 */
export type GraphEdge = {
  id: string;
  sourceNoteId: string;
  sourceBlockId: string | null; // null = note-level link
  targetNoteId: string;
  targetBlockId: string | null;
  type: GraphEdgeType;
  created_at: number;
};

export type VaultNote = {
  id: string;
  rel_path: string;
  title: string;
  tags: string[];
  links: string[]; // Keep for backwards compat (simple link targets)
  created_at: number;
  updated_at: number;
  last_opened_at: number | null;
  // v2: Block-level tracking
  blocks: Record<string, StoredBlockInfo>;
  block_order: string[]; // Ordered list of block IDs
};

export type VaultMetadataDoc = {
  schema_version: typeof VAULT_METADATA_SCHEMA_VERSION;
  meta: {
    created_at: number;
    vault_id: string;
  };
  notes: Record<string, VaultNote>;
  note_id_by_path: Record<string, string>;
  // v3: Graph edges for link tracking
  graph_edges: Record<string, GraphEdge>;
  // v3: Bidirectional index for fast backlink queries
  // Maps targetNoteId → array of edge IDs pointing to it
  backlink_index: Record<string, string[]>;
};

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function normalizePath(p: string): string {
  return p.replaceAll('\\', '/').replace(/\/+$/g, '');
}

export function toVaultRelativePath(vaultPath: string, fullPath: string): string | null {
  const vp = normalizePath(vaultPath);
  const fp = normalizePath(fullPath);
  if (fp === vp) return '';
  if (!fp.startsWith(vp + '/')) return null;
  return fp.slice(vp.length + 1);
}

function titleFromRelPath(relPath: string): string {
  const base = relPath.split('/').pop() ?? relPath;
  return base.replace(/\.md$/i, '') || 'Untitled';
}

function sanitizeTags(tags: string[]): string[] {
  const set = new Set(
    tags
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => t.toLowerCase())
  );
  return Array.from(set).sort();
}

function extractLinksFromText(text: string): string[] {
  const links = new Set<string>();
  const wiki = /\[\[([^[\]]+)\]\]/g;
  for (const m of text.matchAll(wiki)) {
    const raw = (m[1] ?? '').trim();
    if (!raw) continue;
    links.add(raw);
  }
  return Array.from(links).sort();
}

/**
 * Migrate CRDT schema from older versions
 * Runs incrementally through each version upgrade
 */
function migrateVaultMetadataDoc(doc: any): void {
  const currentVersion = doc.schema_version ?? 1;

  // v1 → v2: Add block-level tracking
  if (currentVersion < 2) {
    console.log('[CRDT] Migrating vault metadata v1 -> v2');

    // Add new fields to existing notes
    for (const noteId of Object.keys(doc.notes ?? {})) {
      const note = doc.notes[noteId];
      if (!note.blocks) note.blocks = {};
      if (!note.block_order) note.block_order = [];
    }

    doc.schema_version = 2;
  }

  // v2 → v3: Add graph edges
  if (doc.schema_version < 3) {
    console.log('[CRDT] Migrating vault metadata v2 -> v3');

    // Add new top-level fields
    if (!doc.graph_edges) doc.graph_edges = {};
    if (!doc.backlink_index) doc.backlink_index = {};

    doc.schema_version = 3;
  }
}

export function ensureVaultMetadataDocShape(doc: any, vaultId: string): void {
  // Run migrations first
  migrateVaultMetadataDoc(doc);

  // Ensure current schema version
  if (doc.schema_version !== VAULT_METADATA_SCHEMA_VERSION) {
    doc.schema_version = VAULT_METADATA_SCHEMA_VERSION;
  }

  // Ensure top-level structure (v1 fields)
  if (!doc.meta) doc.meta = { created_at: Date.now(), vault_id: vaultId };
  if (!doc.meta.created_at) doc.meta.created_at = Date.now();
  if (!doc.meta.vault_id) doc.meta.vault_id = vaultId;
  if (!doc.notes) doc.notes = {};
  if (!doc.note_id_by_path) doc.note_id_by_path = {};

  // Ensure v3 fields
  if (!doc.graph_edges) doc.graph_edges = {};
  if (!doc.backlink_index) doc.backlink_index = {};
}

export async function ensureNoteForRelPath(
  handle: DocHandle<VaultMetadataDoc>,
  relPath: string
): Promise<string> {
  const rel = relPath.trim();
  if (!rel) throw new Error('relPath cannot be empty');

  let createdId: string | null = null;
  const now = Date.now();

  handle.change((doc: any) => {
    ensureVaultMetadataDocShape(doc, doc?.meta?.vault_id ?? 'unknown');

    const existing = doc.note_id_by_path[rel];
    if (typeof existing === 'string' && existing) return;

    const id = createdId ?? (createdId = newId());
    doc.note_id_by_path[rel] = id;
    if (!doc.notes[id]) {
      doc.notes[id] = {
        id,
        rel_path: rel,
        title: titleFromRelPath(rel),
        tags: [],
        links: [],
        created_at: now,
        updated_at: now,
        last_opened_at: null,
        blocks: {},
        block_order: [],
      };
    } else {
      doc.notes[id].rel_path = rel;
      doc.notes[id].updated_at = now;
    }
  });

  // If we didn't create (because it existed), read it back.
  const doc = handle.doc();
  const id = doc.note_id_by_path[rel];
  if (!id) throw new Error('Failed to ensure note id');
  return id;
}

export function recordNoteOpened(params: {
  handle: DocHandle<VaultMetadataDoc>;
  relPath: string;
}): void {
  const rel = params.relPath.trim();
  if (!rel) return;
  const now = Date.now();

  params.handle.change((doc: any) => {
    ensureVaultMetadataDocShape(doc, doc?.meta?.vault_id ?? 'unknown');
    const id = doc.note_id_by_path[rel];
    if (!id || typeof id !== 'string') return;
    const note = doc.notes[id];
    if (!note) return;
    note.last_opened_at = now;
    note.updated_at = now;
    if (!note.title) note.title = titleFromRelPath(rel);
    note.rel_path = rel;
  });
}

export function recordNoteRenamed(params: {
  handle: DocHandle<VaultMetadataDoc>;
  oldRelPath: string;
  newRelPath: string;
}): void {
  const oldRel = params.oldRelPath.trim();
  const newRel = params.newRelPath.trim();
  if (!oldRel || !newRel || oldRel === newRel) return;
  const now = Date.now();

  params.handle.change((doc: any) => {
    ensureVaultMetadataDocShape(doc, doc?.meta?.vault_id ?? 'unknown');
    const id = doc.note_id_by_path[oldRel];
    if (!id || typeof id !== 'string') return;
    delete doc.note_id_by_path[oldRel];
    doc.note_id_by_path[newRel] = id;
    const note = doc.notes[id];
    if (!note) return;
    note.rel_path = newRel;
    note.title = note.title || titleFromRelPath(newRel);
    note.updated_at = now;
  });
}

export function setNoteTags(params: { handle: DocHandle<VaultMetadataDoc>; noteId: string; tags: string[] }): void {
  const id = params.noteId.trim();
  if (!id) return;
  const next = sanitizeTags(params.tags);
  const now = Date.now();

  params.handle.change((doc: any) => {
    ensureVaultMetadataDocShape(doc, doc?.meta?.vault_id ?? 'unknown');
    const note = doc.notes[id];
    if (!note) return;
    note.tags = next;
    note.updated_at = now;
  });
}

export function setNoteLinksFromContent(params: { handle: DocHandle<VaultMetadataDoc>; noteId: string; content: string }): void {
  const id = params.noteId.trim();
  if (!id) return;
  const next = extractLinksFromText(params.content);
  const now = Date.now();

  params.handle.change((doc: any) => {
    ensureVaultMetadataDocShape(doc, doc?.meta?.vault_id ?? 'unknown');
    const note = doc.notes[id];
    if (!note) return;
    note.links = next;
    note.updated_at = now;
  });
}

export function findNoteIdByRelPath(doc: VaultMetadataDoc, relPath: string): string | null {
  const rel = relPath.trim();
  if (!rel) return null;
  const id = doc.note_id_by_path[rel];
  return typeof id === 'string' && id ? id : null;
}

export function findRelPathByNoteId(doc: VaultMetadataDoc, noteId: string): string | null {
  const id = noteId.trim();
  if (!id) return null;
  const note = doc.notes[id];
  if (!note) return null;
  return note.rel_path || null;
}

/**
 * Update the blocks for a note
 * Called after saving a document with block IDs
 */
export function updateNoteBlocks(params: {
  handle: DocHandle<VaultMetadataDoc>;
  noteId: string;
  blocks: BlockInfo[];
}): void {
  const id = params.noteId.trim();
  if (!id) return;
  const now = Date.now();

  params.handle.change((doc: any) => {
    ensureVaultMetadataDocShape(doc, doc?.meta?.vault_id ?? 'unknown');
    const note = doc.notes[id];
    if (!note) return;

    // Clear existing blocks
    note.blocks = {};
    note.block_order = [];

    // Add new blocks (only store blocks that have IDs)
    for (const block of params.blocks) {
      if (!block.id) continue;

      note.blocks[block.id] = {
        id: block.id,
        type: block.type,
        text: block.text,
      };
      // Only set level for headings (Automerge rejects undefined values)
      if (block.level !== undefined) {
        note.blocks[block.id].level = block.level;
      }
      note.block_order.push(block.id);
    }

    note.updated_at = now;
  });
}

/**
 * Get a specific block from a note
 */
export function getBlockFromNote(doc: VaultMetadataDoc, noteId: string, blockId: string): StoredBlockInfo | null {
  const note = doc.notes[noteId];
  if (!note) return null;
  return note.blocks[blockId] || null;
}

/**
 * Find which note contains a specific block ID
 */
export function findNoteByBlockId(doc: VaultMetadataDoc, blockId: string): { noteId: string; block: StoredBlockInfo } | null {
  for (const [noteId, note] of Object.entries(doc.notes)) {
    if (note.blocks[blockId]) {
      return { noteId, block: note.blocks[blockId] };
    }
  }
  return null;
}

// ============================================================================
// Graph Edge Management Functions (v3)
// ============================================================================

/**
 * Add a graph edge (link between notes/blocks)
 * Automatically maintains the backlink_index for O(1) backlink queries
 */
export function addGraphEdge(params: {
  handle: DocHandle<VaultMetadataDoc>;
  sourceNoteId: string;
  sourceBlockId: string | null;
  targetNoteId: string;
  targetBlockId: string | null;
  type: GraphEdgeType;
}): string {
  const id = newId();
  const now = Date.now();

  params.handle.change((doc: any) => {
    ensureVaultMetadataDocShape(doc, doc?.meta?.vault_id ?? 'unknown');

    // Create the edge
    doc.graph_edges[id] = {
      id,
      sourceNoteId: params.sourceNoteId,
      sourceBlockId: params.sourceBlockId,
      targetNoteId: params.targetNoteId,
      targetBlockId: params.targetBlockId,
      type: params.type,
      created_at: now,
    };

    // Maintain backlink_index for fast lookups
    if (!doc.backlink_index[params.targetNoteId]) {
      doc.backlink_index[params.targetNoteId] = [];
    }
    if (!doc.backlink_index[params.targetNoteId].includes(id)) {
      doc.backlink_index[params.targetNoteId].push(id);
    }
  });

  return id;
}

/**
 * Remove a graph edge
 * Automatically maintains the backlink_index
 */
export function removeGraphEdge(params: {
  handle: DocHandle<VaultMetadataDoc>;
  edgeId: string;
}): void {
  params.handle.change((doc: any) => {
    ensureVaultMetadataDocShape(doc, doc?.meta?.vault_id ?? 'unknown');

    const edge = doc.graph_edges[params.edgeId];
    if (!edge) return;

    // Remove from backlink_index
    const targetNoteId = edge.targetNoteId;
    if (doc.backlink_index[targetNoteId]) {
      doc.backlink_index[targetNoteId] = doc.backlink_index[targetNoteId].filter(
        (id: string) => id !== params.edgeId
      );
      // Clean up empty arrays
      if (doc.backlink_index[targetNoteId].length === 0) {
        delete doc.backlink_index[targetNoteId];
      }
    }

    // Remove the edge itself
    delete doc.graph_edges[params.edgeId];
  });
}

/**
 * Remove all edges originating from a note
 * Useful when re-parsing a note's links
 */
export function removeEdgesFromNote(params: {
  handle: DocHandle<VaultMetadataDoc>;
  sourceNoteId: string;
}): void {
  params.handle.change((doc: any) => {
    ensureVaultMetadataDocShape(doc, doc?.meta?.vault_id ?? 'unknown');

    // Find all edges from this note
    const edgesToRemove: string[] = [];
    for (const [edgeId, edge] of Object.entries(doc.graph_edges) as [string, GraphEdge][]) {
      if (edge.sourceNoteId === params.sourceNoteId) {
        edgesToRemove.push(edgeId);
      }
    }

    // Remove each edge (maintaining backlink_index)
    for (const edgeId of edgesToRemove) {
      const edge = doc.graph_edges[edgeId];
      if (edge && doc.backlink_index[edge.targetNoteId]) {
        doc.backlink_index[edge.targetNoteId] = doc.backlink_index[edge.targetNoteId].filter(
          (id: string) => id !== edgeId
        );
        if (doc.backlink_index[edge.targetNoteId].length === 0) {
          delete doc.backlink_index[edge.targetNoteId];
        }
      }
      delete doc.graph_edges[edgeId];
    }
  });
}

/**
 * Get backlinks to a note (O(1) lookup via backlink_index)
 * Optionally filter to specific block
 */
export function getBacklinks(params: {
  doc: VaultMetadataDoc;
  noteId: string;
  blockId?: string;
}): GraphEdge[] {
  const edgeIds = params.doc.backlink_index[params.noteId] ?? [];
  const edges = edgeIds
    .map(id => params.doc.graph_edges[id])
    .filter((edge): edge is GraphEdge => edge !== undefined);

  // Filter by blockId if specified
  if (params.blockId) {
    return edges.filter(edge => edge.targetBlockId === params.blockId);
  }

  return edges;
}

/**
 * Get outgoing links from a note
 */
export function getOutgoingLinks(params: {
  doc: VaultMetadataDoc;
  noteId: string;
}): GraphEdge[] {
  return Object.values(params.doc.graph_edges).filter(
    edge => edge.sourceNoteId === params.noteId
  );
}

/**
 * Get a specific graph edge by ID
 */
export function getGraphEdge(doc: VaultMetadataDoc, edgeId: string): GraphEdge | null {
  return doc.graph_edges[edgeId] || null;
}

/**
 * Check if a link exists between two notes
 */
export function hasLinkBetween(params: {
  doc: VaultMetadataDoc;
  sourceNoteId: string;
  targetNoteId: string;
  type?: GraphEdgeType;
}): boolean {
  return Object.values(params.doc.graph_edges).some(edge =>
    edge.sourceNoteId === params.sourceNoteId &&
    edge.targetNoteId === params.targetNoteId &&
    (params.type === undefined || edge.type === params.type)
  );
}

// ============================================================================
// Query Helper Functions (v3)
// ============================================================================

/**
 * Get all notes that link to a specific note (convenience wrapper)
 */
export function getNotesLinkingTo(params: {
  doc: VaultMetadataDoc;
  noteId: string;
}): VaultNote[] {
  const backlinks = getBacklinks({ doc: params.doc, noteId: params.noteId });
  const sourceNoteIds = [...new Set(backlinks.map(edge => edge.sourceNoteId))];
  return sourceNoteIds
    .map(id => params.doc.notes[id])
    .filter((note): note is VaultNote => note !== undefined);
}

/**
 * Get graph statistics for a note
 */
export function getNoteGraphStats(params: {
  doc: VaultMetadataDoc;
  noteId: string;
}): { incomingCount: number; outgoingCount: number; totalConnections: number } {
  const incoming = getBacklinks({ doc: params.doc, noteId: params.noteId });
  const outgoing = getOutgoingLinks({ doc: params.doc, noteId: params.noteId });
  return {
    incomingCount: incoming.length,
    outgoingCount: outgoing.length,
    totalConnections: incoming.length + outgoing.length,
  };
}
