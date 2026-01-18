/**
 * Graph Cache Document Schema
 *
 * The graph cache stores pre-computed graph edges and backlinks,
 * avoiding the need to load all note documents just to display the graph.
 *
 * This cache is:
 * - Rebuilt periodically in the background
 * - Invalidated when notes are modified
 * - Optional (graph can be built on-demand from loaded notes)
 *
 * Trade-off: Slightly stale graph data vs. not loading 840+ documents on startup.
 */

import type { DocHandle } from '@automerge/react';
import type { GraphEdge } from './vaultMetadataDoc';

export const GRAPH_CACHE_SCHEMA_VERSION = 1;

// Re-export for convenience
export type { GraphEdge, GraphEdgeType } from './vaultMetadataDoc';

/**
 * Cached graph data - rebuilt periodically from note documents.
 * Avoids loading all notes just to show the graph.
 */
export type GraphCacheDoc = {
  schema_version: typeof GRAPH_CACHE_SCHEMA_VERSION;

  // ─────────────────────────────────────────────────────────────────────────
  // Graph Edges
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * All edges in the graph (edgeId -> GraphEdge)
   * Rebuilt by scanning all note documents
   */
  edges: Record<string, GraphEdge>;

  // ─────────────────────────────────────────────────────────────────────────
  // Backlink Index
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Inverted index for fast backlink queries
   * Maps targetNoteId -> array of sourceNoteIds that link to it
   *
   * Note: Stores note IDs directly (not edge IDs) for faster lookup
   * when you just need "what notes link here?"
   */
  backlink_index: Record<string, string[]>;

  // ─────────────────────────────────────────────────────────────────────────
  // Cache Metadata
  // ─────────────────────────────────────────────────────────────────────────

  /** When the cache was last fully rebuilt */
  last_built_at: number;

  /** Number of notes included when cache was built */
  notes_included: number;

  /** Number of edges in the cache */
  edge_count: number;

  /**
   * Build status for UI feedback
   * - 'valid': Cache is up-to-date
   * - 'stale': Cache may be outdated (notes modified since build)
   * - 'building': Currently rebuilding
   * - 'empty': No cache data yet
   */
  status: 'valid' | 'stale' | 'building' | 'empty';

  /**
   * Notes that have been modified since last cache build
   * Used to determine if cache needs rebuild
   */
  dirty_note_ids: string[];
};

/**
 * Create an empty graph cache document
 */
export function createEmptyGraphCache(): Omit<GraphCacheDoc, 'schema_version'> & { schema_version: number } {
  return {
    schema_version: GRAPH_CACHE_SCHEMA_VERSION,
    edges: {},
    backlink_index: {},
    last_built_at: 0,
    notes_included: 0,
    edge_count: 0,
    status: 'empty',
    dirty_note_ids: [],
  };
}

/**
 * Ensure graph cache document has correct shape
 */
export function ensureGraphCacheDocShape(doc: any): void {
  if (doc.schema_version === undefined) doc.schema_version = GRAPH_CACHE_SCHEMA_VERSION;
  if (!doc.edges) doc.edges = {};
  if (!doc.backlink_index) doc.backlink_index = {};
  if (!doc.last_built_at) doc.last_built_at = 0;
  if (!doc.notes_included) doc.notes_included = 0;
  if (!doc.edge_count) doc.edge_count = 0;
  if (!doc.status) doc.status = 'empty';
  if (!doc.dirty_note_ids) doc.dirty_note_ids = [];
}

// ============================================================================
// Cache Query Functions (Read-only, no loading required)
// ============================================================================

/**
 * Get backlinks to a note (O(1) lookup)
 */
export function getBacklinks(doc: GraphCacheDoc | null, noteId: string): string[] {
  if (!doc) return [];
  return doc.backlink_index[noteId] ?? [];
}

/**
 * Get outgoing links from a note
 */
export function getOutgoingLinks(doc: GraphCacheDoc | null, noteId: string): GraphEdge[] {
  if (!doc) return [];
  return Object.values(doc.edges).filter(edge => edge.sourceNoteId === noteId);
}

/**
 * Get all edges involving a note (incoming + outgoing)
 */
export function getEdgesForNote(doc: GraphCacheDoc | null, noteId: string): GraphEdge[] {
  if (!doc) return [];
  return Object.values(doc.edges).filter(
    edge => edge.sourceNoteId === noteId || edge.targetNoteId === noteId
  );
}

/**
 * Check if a link exists between two notes
 */
export function hasLinkBetween(
  doc: GraphCacheDoc | null,
  sourceNoteId: string,
  targetNoteId: string
): boolean {
  if (!doc) return false;
  return Object.values(doc.edges).some(
    edge => edge.sourceNoteId === sourceNoteId && edge.targetNoteId === targetNoteId
  );
}

/**
 * Get edge count for a note
 */
export function getEdgeCount(doc: GraphCacheDoc | null, noteId: string): { incoming: number; outgoing: number } {
  if (!doc) return { incoming: 0, outgoing: 0 };
  const incoming = doc.backlink_index[noteId]?.length ?? 0;
  const outgoing = Object.values(doc.edges).filter(e => e.sourceNoteId === noteId).length;
  return { incoming, outgoing };
}

/**
 * Check if cache is stale and needs rebuild
 */
export function isCacheStale(doc: GraphCacheDoc | null, maxAgeMs: number = 5 * 60 * 1000): boolean {
  if (!doc) return true;
  if (doc.status === 'empty') return true;
  if (doc.status === 'stale') return true;
  if (doc.dirty_note_ids.length > 0) return true;
  if (Date.now() - doc.last_built_at > maxAgeMs) return true;
  return false;
}

// ============================================================================
// Cache Mutation Functions
// ============================================================================

/**
 * Mark a note as dirty (needs rebuild)
 * Called when a note's links change
 */
export function markNoteDirty(handle: DocHandle<GraphCacheDoc>, noteId: string): void {
  handle.change((doc: any) => {
    ensureGraphCacheDocShape(doc);
    if (!doc.dirty_note_ids.includes(noteId)) {
      doc.dirty_note_ids.push(noteId);
    }
    if (doc.status === 'valid') {
      doc.status = 'stale';
    }
  });
}

/**
 * Mark cache as building
 */
export function markCacheBuilding(handle: DocHandle<GraphCacheDoc>): void {
  handle.change((doc: any) => {
    ensureGraphCacheDocShape(doc);
    doc.status = 'building';
  });
}

/**
 * Replace all edges (full rebuild)
 */
export function replaceAllEdges(handle: DocHandle<GraphCacheDoc>, edges: GraphEdge[]): void {
  handle.change((doc: any) => {
    ensureGraphCacheDocShape(doc);

    // Clear existing data
    doc.edges = {};
    doc.backlink_index = {};

    // Add all edges
    for (const edge of edges) {
      doc.edges[edge.id] = edge;

      // Build backlink index
      if (!doc.backlink_index[edge.targetNoteId]) {
        doc.backlink_index[edge.targetNoteId] = [];
      }
      if (!doc.backlink_index[edge.targetNoteId].includes(edge.sourceNoteId)) {
        doc.backlink_index[edge.targetNoteId].push(edge.sourceNoteId);
      }
    }

    doc.edge_count = edges.length;
    doc.last_built_at = Date.now();
    doc.dirty_note_ids = [];
    doc.status = 'valid';
  });
}

/**
 * Update edges for a single note (incremental update)
 * Removes old edges from this note and adds new ones
 */
export function updateEdgesForNote(
  handle: DocHandle<GraphCacheDoc>,
  noteId: string,
  newEdges: GraphEdge[]
): void {
  handle.change((doc: any) => {
    ensureGraphCacheDocShape(doc);

    // Remove old edges from this note
    const oldEdgeIds = Object.entries(doc.edges)
      .filter(([, edge]: [string, any]) => edge.sourceNoteId === noteId)
      .map(([id]) => id);

    for (const edgeId of oldEdgeIds) {
      const edge = doc.edges[edgeId];
      if (edge) {
        // Remove from backlink index
        const backlinks = doc.backlink_index[edge.targetNoteId];
        if (backlinks) {
          const idx = backlinks.indexOf(noteId);
          if (idx >= 0) backlinks.splice(idx, 1);
          if (backlinks.length === 0) delete doc.backlink_index[edge.targetNoteId];
        }
      }
      delete doc.edges[edgeId];
    }

    // Add new edges
    for (const edge of newEdges) {
      doc.edges[edge.id] = edge;

      // Update backlink index
      if (!doc.backlink_index[edge.targetNoteId]) {
        doc.backlink_index[edge.targetNoteId] = [];
      }
      if (!doc.backlink_index[edge.targetNoteId].includes(edge.sourceNoteId)) {
        doc.backlink_index[edge.targetNoteId].push(edge.sourceNoteId);
      }
    }

    // Remove note from dirty list
    const dirtyIdx = doc.dirty_note_ids.indexOf(noteId);
    if (dirtyIdx >= 0) doc.dirty_note_ids.splice(dirtyIdx, 1);

    // Update metadata
    doc.edge_count = Object.keys(doc.edges).length;
    if (doc.dirty_note_ids.length === 0 && doc.status === 'stale') {
      doc.status = 'valid';
    }
  });
}

/**
 * Clear all cache data
 */
export function clearCache(handle: DocHandle<GraphCacheDoc>): void {
  handle.change((doc: any) => {
    doc.edges = {};
    doc.backlink_index = {};
    doc.last_built_at = 0;
    doc.notes_included = 0;
    doc.edge_count = 0;
    doc.status = 'empty';
    doc.dirty_note_ids = [];
  });
}

// ============================================================================
// Graph Statistics
// ============================================================================

/**
 * Get overall graph statistics
 */
export function getGraphStats(doc: GraphCacheDoc | null): {
  nodeCount: number;
  edgeCount: number;
  avgDegree: number;
  mostConnected: { noteId: string; connections: number } | null;
} {
  if (!doc || doc.status === 'empty') {
    return { nodeCount: 0, edgeCount: 0, avgDegree: 0, mostConnected: null };
  }

  // Count unique nodes
  const nodeIds = new Set<string>();
  for (const edge of Object.values(doc.edges)) {
    nodeIds.add(edge.sourceNoteId);
    nodeIds.add(edge.targetNoteId);
  }

  const nodeCount = nodeIds.size;
  const edgeCount = Object.keys(doc.edges).length;
  const avgDegree = nodeCount > 0 ? (edgeCount * 2) / nodeCount : 0;

  // Find most connected node
  const connectionCounts = new Map<string, number>();
  for (const edge of Object.values(doc.edges)) {
    connectionCounts.set(
      edge.sourceNoteId,
      (connectionCounts.get(edge.sourceNoteId) ?? 0) + 1
    );
    connectionCounts.set(
      edge.targetNoteId,
      (connectionCounts.get(edge.targetNoteId) ?? 0) + 1
    );
  }

  let mostConnected: { noteId: string; connections: number } | null = null;
  for (const [noteId, count] of connectionCounts) {
    if (!mostConnected || count > mostConnected.connections) {
      mostConnected = { noteId, connections: count };
    }
  }

  return { nodeCount, edgeCount, avgDegree, mostConnected };
}
