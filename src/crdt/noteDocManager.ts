/**
 * Note Document Manager
 *
 * Manages lazy loading of per-note CRDT documents.
 * This is the core class that enables fast startup by deferring
 * note loading until actually needed.
 *
 * Key features:
 * - Lazy loading: Notes loaded on-demand, not at startup
 * - Caching: Loaded notes stay in memory for fast access
 * - Deduplication: Concurrent requests for same note share one load
 * - LRU eviction: Optional memory pressure relief
 * - Manifest consistency: All operations keep manifest in sync
 */

import type { DocHandle, Repo } from '@automerge/react';
import { isValidAutomergeUrl } from '@automerge/react';
import type { AnyDocumentId } from '@automerge/automerge-repo';
import {
  type ManifestDoc,
  registerNote,
  unregisterNote,
  updateNotePath as updateManifestNotePath,
} from './manifestDoc';
import {
  type NoteDoc,
  createNoteDoc,
  ensureNoteDocShape,
  updateNotePath as updateNoteDocPath,
  recordNoteOpened,
} from './noteDoc';

/** Events emitted by NoteDocManager */
export type NoteDocManagerEvent =
  | { type: 'note-loaded'; noteId: string }
  | { type: 'note-created'; noteId: string; relPath: string }
  | { type: 'note-deleted'; noteId: string }
  | { type: 'note-renamed'; noteId: string; oldPath: string; newPath: string }
  | { type: 'cache-evicted'; noteId: string };

type EventListener = (event: NoteDocManagerEvent) => void;

/** Configuration for NoteDocManager */
export interface NoteDocManagerConfig {
  /** Maximum number of notes to keep in cache (0 = unlimited) */
  maxCacheSize: number;
  /** Enable debug logging */
  debug: boolean;
}

const DEFAULT_CONFIG: NoteDocManagerConfig = {
  maxCacheSize: 100, // Keep last 100 notes in memory
  debug: false,
};

/**
 * Manages lazy loading and caching of per-note CRDT documents.
 *
 * Usage:
 * ```ts
 * const manager = new NoteDocManager(repo, manifestHandle);
 *
 * // Load a note (lazy - from cache or IndexedDB)
 * const noteHandle = await manager.getOrCreateNote('folder/note.md');
 *
 * // Check if loaded (sync, no await)
 * const cached = manager.getCachedNote(noteId);
 *
 * // Get note count (from manifest, instant)
 * const count = manager.getNoteCount();
 * ```
 */
export class NoteDocManager {
  private repo: Repo;
  private manifestHandle: DocHandle<ManifestDoc>;
  private config: NoteDocManagerConfig;

  /** Cache of loaded note documents */
  private noteCache: Map<string, DocHandle<NoteDoc>>;

  /** Tracks in-flight load promises to deduplicate concurrent requests */
  private loadingPromises: Map<string, Promise<DocHandle<NoteDoc>>>;

  /** LRU tracking: noteId -> last access timestamp */
  private accessOrder: Map<string, number>;

  /** Event listeners */
  private listeners: Set<EventListener>;

  constructor(
    repo: Repo,
    manifestHandle: DocHandle<ManifestDoc>,
    config: Partial<NoteDocManagerConfig> = {}
  ) {
    this.repo = repo;
    this.manifestHandle = manifestHandle;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.noteCache = new Map();
    this.loadingPromises = new Map();
    this.accessOrder = new Map();
    this.listeners = new Set();

    this.log('NoteDocManager initialized');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API: Loading Notes
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get or create a note document for the given path.
   * - If note exists in manifest: loads from IndexedDB (or cache)
   * - If note doesn't exist: creates new document and registers in manifest
   *
   * @param relPath - Path relative to vault root (e.g., "folder/note.md")
   * @returns DocHandle for the note
   */
  async getOrCreateNote(relPath: string): Promise<DocHandle<NoteDoc>> {
    const normalizedPath = this.normalizePath(relPath);
    const manifest = this.manifestHandle.doc();
    const existingNoteId = manifest?.path_index[normalizedPath];

    if (existingNoteId) {
      return this.loadNote(existingNoteId);
    } else {
      return this.createNote(normalizedPath);
    }
  }

  /**
   * Load a note by ID. Returns cached handle if available.
   * Throws if note doesn't exist in manifest.
   *
   * @param noteId - The note's UUID
   * @returns DocHandle for the note
   */
  async loadNote(noteId: string): Promise<DocHandle<NoteDoc>> {
    // Check cache first (O(1))
    const cached = this.noteCache.get(noteId);
    if (cached) {
      this.touchNote(noteId);
      return cached;
    }

    // Check if already loading (dedup concurrent requests)
    const inFlight = this.loadingPromises.get(noteId);
    if (inFlight) {
      this.log(`Deduping load request for note ${noteId}`);
      return inFlight;
    }

    // Get document URL from manifest
    const manifest = this.manifestHandle.doc();
    const docUrl = manifest?.note_urls[noteId];

    if (!docUrl) {
      throw new Error(`Note ${noteId} not found in manifest`);
    }

    if (!isValidAutomergeUrl(docUrl)) {
      throw new Error(`Invalid Automerge URL for note ${noteId}: ${docUrl}`);
    }

    // Start loading
    const loadPromise = this.doLoadNote(noteId, docUrl);
    this.loadingPromises.set(noteId, loadPromise);

    try {
      const handle = await loadPromise;
      return handle;
    } finally {
      this.loadingPromises.delete(noteId);
    }
  }

  /**
   * Get a note from cache without loading.
   * Returns null if not cached (doesn't trigger load).
   *
   * Use this for sync access when you only want cached notes.
   */
  getCachedNote(noteId: string): DocHandle<NoteDoc> | null {
    const cached = this.noteCache.get(noteId);
    if (cached) {
      this.touchNote(noteId);
    }
    return cached ?? null;
  }

  /**
   * Check if a note is currently cached.
   */
  isNoteCached(noteId: string): boolean {
    return this.noteCache.has(noteId);
  }

  /**
   * Preload multiple notes in parallel.
   * Useful for warming the cache before showing a view.
   *
   * @param noteIds - Note IDs to preload
   * @param concurrency - Max concurrent loads (default 5)
   */
  async preloadNotes(noteIds: string[], concurrency: number = 5): Promise<void> {
    const queue = [...noteIds];
    const inProgress: Promise<void>[] = [];

    while (queue.length > 0 || inProgress.length > 0) {
      // Start new loads up to concurrency limit
      while (queue.length > 0 && inProgress.length < concurrency) {
        const noteId = queue.shift()!;
        if (this.noteCache.has(noteId)) continue; // Already cached

        const promise = this.loadNote(noteId)
          .then(() => {})
          .catch((err) => {
            this.log(`Failed to preload note ${noteId}: ${err}`);
          });
        inProgress.push(promise);
      }

      // Wait for at least one to complete
      if (inProgress.length > 0) {
        await Promise.race(inProgress);
        // Remove completed promises
        const stillPending = inProgress.filter(
          (p) => !this.isPromiseSettled(p)
        );
        inProgress.length = 0;
        inProgress.push(...stillPending);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API: Creating Notes
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create a new note document and register it in the manifest.
   *
   * @param relPath - Path relative to vault root
   * @param title - Optional title (defaults to filename)
   * @returns DocHandle for the new note
   */
  async createNote(relPath: string, title?: string): Promise<DocHandle<NoteDoc>> {
    const normalizedPath = this.normalizePath(relPath);
    const noteId = this.generateId();

    this.log(`Creating note: ${normalizedPath} (${noteId})`);

    // Create the note document
    const noteData = createNoteDoc({
      id: noteId,
      relPath: normalizedPath,
      title,
    });

    // Cast needed because createNoteDoc returns a wider type for flexibility
    const noteHandle = this.repo.create<NoteDoc>(noteData as NoteDoc);
    await noteHandle.whenReady();

    // Ensure shape (for any future migrations)
    noteHandle.change((doc: any) => ensureNoteDocShape(doc));

    // Register in manifest
    registerNote({
      handle: this.manifestHandle,
      noteId,
      relPath: normalizedPath,
      docUrl: noteHandle.url,
    });

    // Cache it
    this.noteCache.set(noteId, noteHandle);
    this.touchNote(noteId);
    this.maybeEvictCache();

    // Emit event
    this.emit({ type: 'note-created', noteId, relPath: normalizedPath });

    return noteHandle;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API: Modifying Notes
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Rename a note (update path in both manifest and note document).
   *
   * @param noteId - The note's UUID
   * @param oldPath - Current path
   * @param newPath - New path
   */
  renameNote(noteId: string, oldPath: string, newPath: string): void {
    const normalizedOld = this.normalizePath(oldPath);
    const normalizedNew = this.normalizePath(newPath);

    if (normalizedOld === normalizedNew) return;

    this.log(`Renaming note ${noteId}: ${normalizedOld} -> ${normalizedNew}`);

    // Update manifest
    updateManifestNotePath({
      handle: this.manifestHandle,
      noteId,
      oldPath: normalizedOld,
      newPath: normalizedNew,
    });

    // Update note document if cached
    const noteHandle = this.noteCache.get(noteId);
    if (noteHandle) {
      updateNoteDocPath(noteHandle, normalizedNew);
    }

    // Emit event
    this.emit({
      type: 'note-renamed',
      noteId,
      oldPath: normalizedOld,
      newPath: normalizedNew,
    });
  }

  /**
   * Mark a note as opened (updates last_opened_at).
   * Only works if note is cached.
   */
  markNoteOpened(noteId: string): void {
    const noteHandle = this.noteCache.get(noteId);
    if (noteHandle) {
      recordNoteOpened(noteHandle);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API: Deleting Notes
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Delete a note from the manifest and cache.
   * The Automerge document will be garbage collected.
   *
   * @param noteId - The note's UUID
   */
  deleteNote(noteId: string): void {
    this.log(`Deleting note: ${noteId}`);

    // Unregister from manifest
    unregisterNote({
      handle: this.manifestHandle,
      noteId,
    });

    // Remove from cache
    this.noteCache.delete(noteId);
    this.accessOrder.delete(noteId);
    this.loadingPromises.delete(noteId);

    // Emit event
    this.emit({ type: 'note-deleted', noteId });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API: Querying (No Loading Required)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get all note IDs from manifest (instant, no loading).
   */
  getAllNoteIds(): string[] {
    const manifest = this.manifestHandle.doc();
    return Object.keys(manifest?.note_urls ?? {});
  }

  /**
   * Get total note count from manifest (instant).
   */
  getNoteCount(): number {
    const manifest = this.manifestHandle.doc();
    return Object.keys(manifest?.note_urls ?? {}).length;
  }

  /**
   * Find note ID by path (O(1) from manifest).
   */
  findNoteIdByPath(relPath: string): string | null {
    const normalizedPath = this.normalizePath(relPath);
    const manifest = this.manifestHandle.doc();
    return manifest?.path_index[normalizedPath] ?? null;
  }

  /**
   * Find path by note ID (O(1) from manifest).
   */
  findPathByNoteId(noteId: string): string | null {
    const manifest = this.manifestHandle.doc();
    return manifest?.id_to_path[noteId] ?? null;
  }

  /**
   * Check if a note exists by path.
   */
  hasNoteAtPath(relPath: string): boolean {
    return this.findNoteIdByPath(relPath) !== null;
  }

  /**
   * Check if a note exists by ID.
   */
  hasNoteWithId(noteId: string): boolean {
    const manifest = this.manifestHandle.doc();
    return noteId in (manifest?.note_urls ?? {});
  }

  /**
   * Get IDs of all currently cached notes.
   */
  getCachedNoteIds(): string[] {
    return Array.from(this.noteCache.keys());
  }

  /**
   * Get cache statistics.
   */
  getCacheStats(): { cached: number; total: number; hitRate: string } {
    const cached = this.noteCache.size;
    const total = this.getNoteCount();
    const hitRate = total > 0 ? `${Math.round((cached / total) * 100)}%` : '0%';
    return { cached, total, hitRate };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API: Event Handling
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Subscribe to manager events.
   * @returns Unsubscribe function
   */
  on(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API: Cache Management
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Clear all cached notes (frees memory).
   * Notes will be reloaded on next access.
   */
  clearCache(): void {
    this.log(`Clearing cache (${this.noteCache.size} notes)`);
    this.noteCache.clear();
    this.accessOrder.clear();
    this.loadingPromises.clear();
  }

  /**
   * Evict a specific note from cache.
   */
  evictNote(noteId: string): void {
    if (this.noteCache.has(noteId)) {
      this.noteCache.delete(noteId);
      this.accessOrder.delete(noteId);
      this.emit({ type: 'cache-evicted', noteId });
    }
  }

  /**
   * Get the manifest handle (for direct access when needed).
   */
  getManifestHandle(): DocHandle<ManifestDoc> {
    return this.manifestHandle;
  }

  /**
   * Get the manifest document snapshot.
   */
  getManifest(): ManifestDoc | null {
    return this.manifestHandle.doc() ?? null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: Loading
  // ─────────────────────────────────────────────────────────────────────────

  private async doLoadNote(noteId: string, docUrl: string): Promise<DocHandle<NoteDoc>> {
    this.log(`Loading note ${noteId} from ${docUrl}`);
    const startTime = performance.now();

    const handle = await this.repo.find<NoteDoc>(docUrl as AnyDocumentId);
    await handle.whenReady();

    // Ensure shape (for migrations)
    handle.change((doc: any) => ensureNoteDocShape(doc));

    // Cache it
    this.noteCache.set(noteId, handle);
    this.touchNote(noteId);
    this.maybeEvictCache();

    const elapsed = (performance.now() - startTime).toFixed(1);
    this.log(`Loaded note ${noteId} in ${elapsed}ms`);

    // Emit event
    this.emit({ type: 'note-loaded', noteId });

    return handle;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: Cache Management
  // ─────────────────────────────────────────────────────────────────────────

  private touchNote(noteId: string): void {
    this.accessOrder.set(noteId, Date.now());
  }

  private maybeEvictCache(): void {
    if (this.config.maxCacheSize <= 0) return; // Unlimited cache
    if (this.noteCache.size <= this.config.maxCacheSize) return;

    // Find LRU note
    let oldestId: string | null = null;
    let oldestTime = Infinity;

    for (const [noteId, accessTime] of this.accessOrder) {
      if (accessTime < oldestTime) {
        oldestTime = accessTime;
        oldestId = noteId;
      }
    }

    if (oldestId) {
      this.log(`Evicting LRU note: ${oldestId}`);
      this.evictNote(oldestId);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: Utilities
  // ─────────────────────────────────────────────────────────────────────────

  private normalizePath(path: string): string {
    return path.replaceAll('\\', '/').replace(/\/+$/g, '').trim();
  }

  private generateId(): string {
    try {
      return crypto.randomUUID();
    } catch {
      return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
  }

  private emit(event: NoteDocManagerEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[NoteDocManager] Event listener error:', err);
      }
    }
  }

  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[NoteDocManager] ${message}`);
    }
  }

  // Utility to check if a promise is settled (hacky but works)
  private isPromiseSettled(promise: Promise<unknown>): boolean {
    const marker = {};
    return Promise.race([promise, Promise.resolve(marker)]).then(
      (v) => v !== marker
    ) as unknown as boolean;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a NoteDocManager instance.
 * Convenience function for creating manager with common options.
 */
export function createNoteDocManager(
  repo: Repo,
  manifestHandle: DocHandle<ManifestDoc>,
  options?: Partial<NoteDocManagerConfig>
): NoteDocManager {
  return new NoteDocManager(repo, manifestHandle, options);
}
