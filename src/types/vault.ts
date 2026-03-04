/**
 * Vault Index Types
 *
 * Shared types for the in-memory vault index.
 * These types are used by the vault index, graph view, backlinks, and search.
 */

/** Type of graph edge (link between notes) */
export type GraphEdgeType = 'wiki-link' | 'embed';

/**
 * Graph edge representing a link between notes/blocks.
 * Core vault metadata types used across the application.
 */
export interface GraphEdge {
  id: string;
  sourceNoteId: string;
  sourceBlockId: string | null;
  targetNoteId: string;
  targetBlockId: string | null;
  type: GraphEdgeType;
  created_at: number;
}

/**
 * A note entry in the vault index.
 * Minimal metadata derived from the filesystem.
 */
export interface NoteEntry {
  /** Deterministic ID: hash of relPath */
  id: string;
  /** Path relative to vault root (e.g. "folder/My Note.md") */
  relPath: string;
  /** Display title: basename without .md extension */
  title: string;
}
