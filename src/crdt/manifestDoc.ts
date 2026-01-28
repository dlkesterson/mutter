/**
 * Manifest Document Schema
 *
 * The manifest is a lightweight "root" document that loads instantly on startup.
 * It contains only note IDs and path mappings - no note content or metadata.
 *
 * This enables sub-100ms cold start by deferring note loading until needed.
 */

import type { DocHandle } from '@automerge/react';

export const MANIFEST_SCHEMA_VERSION = 1;

/**
 * Lightweight manifest document - loads instantly on startup.
 * Contains only note IDs and path mappings, no content.
 */
export type ManifestDoc = {
  schema_version: typeof MANIFEST_SCHEMA_VERSION;
  vault_id: string;
  created_at: number;

  /**
   * Note document references (noteId -> Automerge document URL)
   * The URL can be used with repo.find() to lazy-load the note
   */
  note_urls: Record<string, string>;

  /**
   * Path index for fast lookup (relPath -> noteId)
   * Enables O(1) lookup when opening a file by path
   */
  path_index: Record<string, string>;

  /**
   * Reverse index (noteId -> relPath) for navigation
   * Enables O(1) lookup when you have a noteId and need the path
   */
  id_to_path: Record<string, string>;

  /**
   * Graph cache document URL (optional)
   * Points to a separate document that caches graph edges
   */
  graph_cache_url: string | null;

  /**
   * Migration metadata
   * Tracks whether migration from single-doc format has completed
   */
  migrated_from_single_doc: boolean;
  migration_completed_at: number | null;
};

/**
 * Create a new empty manifest document shape
 */
export function createEmptyManifest(vaultId: string): Omit<ManifestDoc, 'schema_version'> & { schema_version: number } {
  return {
    schema_version: MANIFEST_SCHEMA_VERSION,
    vault_id: vaultId,
    created_at: Date.now(),
    note_urls: {},
    path_index: {},
    id_to_path: {},
    graph_cache_url: null,
    migrated_from_single_doc: false,
    migration_completed_at: null,
  };
}

/**
 * Ensure manifest document has correct shape (for migrations/upgrades)
 */
export function ensureManifestDocShape(doc: any, vaultId: string): void {
  if (doc.schema_version === undefined) doc.schema_version = MANIFEST_SCHEMA_VERSION;
  if (!doc.vault_id) doc.vault_id = vaultId;
  if (!doc.created_at) doc.created_at = Date.now();
  if (!doc.note_urls) doc.note_urls = {};
  if (!doc.path_index) doc.path_index = {};
  if (!doc.id_to_path) doc.id_to_path = {};
  if (doc.graph_cache_url === undefined) doc.graph_cache_url = null;
  if (doc.migrated_from_single_doc === undefined) doc.migrated_from_single_doc = false;
  if (doc.migration_completed_at === undefined) doc.migration_completed_at = null;
}

// ============================================================================
// Path/ID Lookup Functions (No note loading required)
// ============================================================================

/**
 * Find note ID by relative path (O(1) from path_index)
 */
export function findNoteIdByPath(doc: ManifestDoc | null, relPath: string): string | null {
  if (!doc) return null;
  const id = doc.path_index[relPath];
  return typeof id === 'string' && id ? id : null;
}

/**
 * Find relative path by note ID (O(1) from id_to_path)
 */
export function findPathByNoteId(doc: ManifestDoc | null, noteId: string): string | null {
  if (!doc) return null;
  const path = doc.id_to_path[noteId];
  return typeof path === 'string' && path ? path : null;
}

/**
 * Get all note IDs (from manifest, no loading required)
 */
export function getAllNoteIds(doc: ManifestDoc | null): string[] {
  if (!doc) return [];
  return Object.keys(doc.note_urls);
}

/**
 * Get total note count (from manifest, no loading required)
 */
export function getNoteCount(doc: ManifestDoc | null): number {
  if (!doc) return 0;
  return Object.keys(doc.note_urls).length;
}

/**
 * Check if a note exists by path
 */
export function hasNoteAtPath(doc: ManifestDoc | null, relPath: string): boolean {
  return findNoteIdByPath(doc, relPath) !== null;
}

/**
 * Check if a note exists by ID
 */
export function hasNoteWithId(doc: ManifestDoc | null, noteId: string): boolean {
  if (!doc) return false;
  return noteId in doc.note_urls;
}

// ============================================================================
// Manifest Mutation Functions
// ============================================================================

/**
 * Register a new note in the manifest
 * Called after creating a NoteDoc
 */
export function registerNote(params: {
  handle: DocHandle<ManifestDoc>;
  noteId: string;
  relPath: string;
  docUrl: string;
}): void {
  params.handle.change((doc: any) => {
    ensureManifestDocShape(doc, doc.vault_id || 'unknown');
    doc.note_urls[params.noteId] = params.docUrl;
    doc.path_index[params.relPath] = params.noteId;
    doc.id_to_path[params.noteId] = params.relPath;
  });
}

/**
 * Unregister a note from the manifest
 * Called when deleting a note
 */
export function unregisterNote(params: {
  handle: DocHandle<ManifestDoc>;
  noteId: string;
}): void {
  params.handle.change((doc: any) => {
    ensureManifestDocShape(doc, doc.vault_id || 'unknown');
    const relPath = doc.id_to_path[params.noteId];
    delete doc.note_urls[params.noteId];
    delete doc.id_to_path[params.noteId];
    if (relPath) {
      delete doc.path_index[relPath];
    }
  });
}

/**
 * Update note path in manifest (for renames)
 * Does not modify the NoteDoc itself
 */
export function updateNotePath(params: {
  handle: DocHandle<ManifestDoc>;
  noteId: string;
  oldPath: string;
  newPath: string;
}): void {
  params.handle.change((doc: any) => {
    ensureManifestDocShape(doc, doc.vault_id || 'unknown');
    delete doc.path_index[params.oldPath];
    doc.path_index[params.newPath] = params.noteId;
    doc.id_to_path[params.noteId] = params.newPath;
  });
}

/**
 * Set the graph cache document URL
 */
export function setGraphCacheUrl(params: {
  handle: DocHandle<ManifestDoc>;
  url: string;
}): void {
  params.handle.change((doc: any) => {
    ensureManifestDocShape(doc, doc.vault_id || 'unknown');
    doc.graph_cache_url = params.url;
  });
}

/**
 * Mark migration as complete
 */
export function markMigrationComplete(handle: DocHandle<ManifestDoc>): void {
  handle.change((doc: any) => {
    doc.migrated_from_single_doc = true;
    doc.migration_completed_at = Date.now();
  });
}

