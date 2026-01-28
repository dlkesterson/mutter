/**
 * Per-Note Document Schema
 *
 * Each note gets its own Automerge document that is lazy-loaded on demand.
 * This enables fast startup (only load notes you open) and efficient sync
 * (only sync notes that change).
 *
 * Note documents contain all metadata for a single note:
 * - Identity (id, path, title)
 * - Content metadata (tags, links, blocks)
 */

import type { DocHandle } from '@automerge/react';
import type { StoredBlockInfo } from './vaultMetadataDoc';

export const NOTE_SCHEMA_VERSION = 1;

/**
 * Per-note document - loaded on demand when note is accessed.
 * Contains all metadata for a single note.
 */
export type NoteDoc = {
  schema_version: typeof NOTE_SCHEMA_VERSION;

  // ─────────────────────────────────────────────────────────────────────────
  // Identity
  // ─────────────────────────────────────────────────────────────────────────

  /** UUID, stable across renames */
  id: string;

  /** Current path relative to vault root (e.g., "folder/note.md") */
  rel_path: string;

  /** Display title (derived from filename or frontmatter) */
  title: string;

  // ─────────────────────────────────────────────────────────────────────────
  // Timestamps
  // ─────────────────────────────────────────────────────────────────────────

  /** When the note was first created */
  created_at: number;

  /** Last modification timestamp */
  updated_at: number;

  /** Last time user opened this note in the editor */
  last_opened_at: number | null;

  // ─────────────────────────────────────────────────────────────────────────
  // Content Metadata
  // ─────────────────────────────────────────────────────────────────────────

  /** Tags extracted from content (e.g., #project, #todo) */
  tags: string[];

  /**
   * Outgoing wiki-link targets (note names/paths)
   * Used for quick link resolution without parsing content
   */
  links: string[];

  // ─────────────────────────────────────────────────────────────────────────
  // Block-Level Tracking
  // ─────────────────────────────────────────────────────────────────────────

  /** Block metadata by block ID (^abc123) */
  blocks: Record<string, StoredBlockInfo>;

  /** Ordered list of block IDs for sequential access */
  block_order: string[];
};

// Re-export shared types for convenience
export type { StoredBlockInfo } from './vaultMetadataDoc';

/**
 * Create a new note document with default values
 */
export function createNoteDoc(params: {
  id: string;
  relPath: string;
  title?: string;
}): Omit<NoteDoc, 'schema_version'> & { schema_version: number } {
  const now = Date.now();
  return {
    schema_version: NOTE_SCHEMA_VERSION,
    id: params.id,
    rel_path: params.relPath,
    title: params.title || titleFromPath(params.relPath),
    created_at: now,
    updated_at: now,
    last_opened_at: null,
    tags: [],
    links: [],
    blocks: {},
    block_order: [],
  };
}

/**
 * Extract title from file path
 */
function titleFromPath(relPath: string): string {
  const base = relPath.split('/').pop() ?? relPath;
  return base.replace(/\.md$/i, '') || 'Untitled';
}

/**
 * Ensure note document has correct shape (for migrations/upgrades)
 */
export function ensureNoteDocShape(doc: any): void {
  if (doc.schema_version === undefined) doc.schema_version = NOTE_SCHEMA_VERSION;
  if (!doc.id) doc.id = crypto.randomUUID();
  if (!doc.rel_path) doc.rel_path = '';
  if (!doc.title) doc.title = titleFromPath(doc.rel_path || '');
  if (!doc.created_at) doc.created_at = Date.now();
  if (!doc.updated_at) doc.updated_at = Date.now();
  if (doc.last_opened_at === undefined) doc.last_opened_at = null;
  if (!doc.tags) doc.tags = [];
  if (!doc.links) doc.links = [];
  if (!doc.blocks) doc.blocks = {};
  if (!doc.block_order) doc.block_order = [];
}

// ============================================================================
// Note Mutation Functions
// ============================================================================

/**
 * Record that the note was opened (updates last_opened_at)
 */
export function recordNoteOpened(handle: DocHandle<NoteDoc>): void {
  const now = Date.now();
  handle.change((doc: any) => {
    ensureNoteDocShape(doc);
    doc.last_opened_at = now;
    doc.updated_at = now;
  });
}

/**
 * Update the note's path (for renames)
 */
export function updateNotePath(handle: DocHandle<NoteDoc>, newPath: string, newTitle?: string): void {
  const now = Date.now();
  handle.change((doc: any) => {
    ensureNoteDocShape(doc);
    doc.rel_path = newPath;
    doc.title = newTitle || titleFromPath(newPath);
    doc.updated_at = now;
  });
}

/**
 * Set note tags
 */
export function setNoteTags(handle: DocHandle<NoteDoc>, tags: string[]): void {
  const now = Date.now();
  const sanitized = sanitizeTags(tags);
  handle.change((doc: any) => {
    ensureNoteDocShape(doc);
    doc.tags = sanitized;
    doc.updated_at = now;
  });
}

/**
 * Sanitize and normalize tags
 */
function sanitizeTags(tags: string[]): string[] {
  const set = new Set(
    tags
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => t.toLowerCase())
  );
  return Array.from(set).sort();
}

/**
 * Set note links (extracted from content)
 */
export function setNoteLinks(handle: DocHandle<NoteDoc>, links: string[]): void {
  const now = Date.now();
  handle.change((doc: any) => {
    ensureNoteDocShape(doc);
    doc.links = links;
    doc.updated_at = now;
  });
}

/**
 * Extract links from markdown content and set them
 */
export function setNoteLinksFromContent(handle: DocHandle<NoteDoc>, content: string): void {
  const links = extractLinksFromText(content);
  setNoteLinks(handle, links);
}

/**
 * Extract wiki-links from text
 */
function extractLinksFromText(text: string): string[] {
  const links = new Set<string>();
  const wiki = /\[\[([^[\]]+)\]\]/g;
  for (const m of text.matchAll(wiki)) {
    const raw = (m[1] ?? '').trim();
    if (!raw) continue;
    // Handle [[Note#heading]] and [[Note|alias]] syntax
    const target = raw.split('#')[0].split('|')[0].trim();
    if (target) links.add(target);
  }
  return Array.from(links).sort();
}

// ============================================================================
// Block Management Functions
// ============================================================================

/**
 * Update the blocks for this note
 * Called after saving a document with block IDs
 */
export function updateNoteBlocks(handle: DocHandle<NoteDoc>, blocks: Array<{
  id: string;
  type: 'heading' | 'paragraph' | 'list-item' | 'code-block' | 'blockquote';
  text: string;
  level?: number;
}>): void {
  const now = Date.now();
  handle.change((doc: any) => {
    ensureNoteDocShape(doc);

    // Clear existing blocks
    doc.blocks = {};
    doc.block_order = [];

    // Add new blocks
    for (const block of blocks) {
      if (!block.id) continue;

      doc.blocks[block.id] = {
        id: block.id,
        type: block.type,
        text: block.text,
      };
      // Only set level for headings (Automerge rejects undefined values)
      if (block.level !== undefined) {
        doc.blocks[block.id].level = block.level;
      }
      doc.block_order.push(block.id);
    }

    doc.updated_at = now;
  });
}

/**
 * Get a specific block from the note
 */
export function getBlock(doc: NoteDoc | null, blockId: string): StoredBlockInfo | null {
  if (!doc) return null;
  return doc.blocks[blockId] || null;
}

/**
 * Get all blocks in order
 */
export function getBlocksInOrder(doc: NoteDoc | null): StoredBlockInfo[] {
  if (!doc) return [];
  return doc.block_order
    .map(id => doc.blocks[id])
    .filter((block): block is StoredBlockInfo => block !== undefined);
}

