/**
 * Vault Index
 *
 * In-memory index of vault notes and their relationships.
 * In-memory vault index derived from the filesystem.
 * Source of truth is always the files on disk — index is rebuilt each session.
 */

import { readDir, readTextFile } from '@tauri-apps/plugin-fs';
import { parseLinks } from './linkParser';
import type { GraphEdge, NoteEntry } from '@/types/vault';

/**
 * Generate a deterministic note ID from a relative path.
 * Uses a simple hash so IDs are stable across rebuilds.
 */
export function generateNoteId(relPath: string): string {
  let hash = 0;
  for (let i = 0; i < relPath.length; i++) {
    const char = relPath.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  // Convert to unsigned hex string, pad to 8 chars
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Derive a note title from its relative path (basename without .md)
 */
export function titleFromPath(relPath: string): string {
  const basename = relPath.split('/').pop() || relPath;
  return basename.replace(/\.md$/i, '') || 'Untitled';
}

/**
 * Normalize a path (forward slashes, no trailing slash)
 */
export function normalizePath(p: string): string {
  return p.replaceAll('\\', '/').replace(/\/+$/g, '');
}

/**
 * Convert an absolute path to a vault-relative path.
 */
export function toVaultRelativePath(vaultPath: string, fullPath: string): string | null {
  const vp = normalizePath(vaultPath);
  const fp = normalizePath(fullPath);
  if (fp === vp) return '';
  if (!fp.startsWith(vp + '/')) return null;
  return fp.slice(vp.length + 1);
}

/**
 * Resolve a wiki-link target to a note ID using the index.
 *
 * Handles:
 * - "Note Name" → matches filename without extension
 * - "folder/Note Name" → matches path
 * - "Note Name.md" → matches exact path
 */
function resolveLinkTarget(
  pathToId: Map<string, string>,
  target: string
): string | null {
  const normalized = target.trim();
  if (!normalized) return null;

  // Try exact path with .md
  const withMd = normalized.endsWith('.md') ? normalized : `${normalized}.md`;
  const byExact = pathToId.get(withMd);
  if (byExact) return byExact;

  // Try without extension
  const withoutMd = normalized.replace(/\.md$/i, '');
  const byNoExt = pathToId.get(withoutMd);
  if (byNoExt) return byNoExt;

  // Search by filename match (case-insensitive)
  const lowerTarget = normalized.toLowerCase();
  for (const [path, noteId] of pathToId) {
    const filename = path.split('/').pop()?.replace(/\.md$/i, '') ?? '';
    if (filename.toLowerCase() === lowerTarget) {
      return noteId;
    }
  }

  return null;
}

/**
 * Recursively collect all .md file paths under a directory.
 */
async function collectMarkdownFiles(
  basePath: string,
  relativePath: string = ''
): Promise<string[]> {
  const files: string[] = [];
  const fullPath = relativePath ? `${basePath}/${relativePath}` : basePath;

  try {
    const entries = await readDir(fullPath);
    const subDirPromises: Promise<string[]>[] = [];

    for (const entry of entries) {
      const entryRelPath = relativePath
        ? `${relativePath}/${entry.name}`
        : entry.name;

      // Skip hidden files/folders and .mutter directory
      if (entry.name.startsWith('.')) continue;

      if (entry.isDirectory) {
        subDirPromises.push(collectMarkdownFiles(basePath, entryRelPath));
      } else if (entry.name.endsWith('.md')) {
        files.push(entryRelPath);
      }
    }

    const subResults = await Promise.all(subDirPromises);
    for (const sub of subResults) files.push(...sub);
  } catch (err) {
    console.warn(`[VaultIndex] Failed to read directory: ${fullPath}`, err);
  }

  return files;
}

/**
 * The core in-memory vault index.
 */
export class VaultIndex {
  /** noteId → NoteEntry */
  notes = new Map<string, NoteEntry>();
  /** relPath → noteId */
  pathToId = new Map<string, string>();
  /** edgeId → GraphEdge */
  edges = new Map<string, GraphEdge>();
  /** targetNoteId → Set<sourceNoteId> */
  backlinkIndex = new Map<string, Set<string>>();
  /** sourceNoteId → Set<edgeId> — for fast outgoing edge lookup */
  private sourceIndex = new Map<string, Set<string>>();

  /** Cached shim objects — invalidated on structural changes */
  private _manifestShimCache: { id_to_path: Record<string, string>; path_index: Record<string, string> } | null = null;
  private _graphCacheShimCache: { edges: Record<string, GraphEdge>; backlink_index: Record<string, string[]> } | null = null;

  readonly vaultPath: string;

  constructor(vaultPath: string) {
    this.vaultPath = normalizePath(vaultPath);
  }

  /**
   * Build the full index by scanning all .md files and parsing their links.
   */
  static async buildFromVault(vaultPath: string): Promise<VaultIndex> {
    const index = new VaultIndex(vaultPath);
    const normalizedVault = normalizePath(vaultPath);

    // Phase 1: Collect all markdown files and register notes
    const mdFiles = await collectMarkdownFiles(normalizedVault);
    for (const relPath of mdFiles) {
      index.registerNote(relPath);
    }

    // Phase 2: Parse links from each file and build edges
    const readPromises = mdFiles.map(async (relPath) => {
      const noteId = index.pathToId.get(relPath);
      if (!noteId) return;

      try {
        const content = await readTextFile(`${normalizedVault}/${relPath}`);
        index.buildEdgesForNote(noteId, content);
      } catch {
        // File may have been deleted between listing and reading
      }
    });

    await Promise.all(readPromises);

    return index;
  }

  /**
   * Register a note in the index (without parsing content).
   */
  private registerNote(relPath: string): NoteEntry {
    const id = generateNoteId(relPath);
    const entry: NoteEntry = { id, relPath, title: titleFromPath(relPath) };
    this.notes.set(id, entry);
    this.pathToId.set(relPath, id);
    this.invalidateManifestCache();
    return entry;
  }

  /**
   * Build edges for a single note from its content.
   * Removes any existing edges from this note first.
   */
  private buildEdgesForNote(sourceNoteId: string, content: string): void {
    // Remove old edges from this source
    this.removeEdgesFromSource(sourceNoteId);

    // Parse links and create new edges
    const parsedLinks = parseLinks(content);
    const now = Date.now();

    for (let i = 0; i < parsedLinks.length; i++) {
      const link = parsedLinks[i];
      const targetNoteId = resolveLinkTarget(this.pathToId, link.target);

      // Skip unresolved links and self-links
      if (!targetNoteId || targetNoteId === sourceNoteId) continue;

      const edgeId = `${sourceNoteId}-${targetNoteId}-${now}-${i}`;
      const edge: GraphEdge = {
        id: edgeId,
        sourceNoteId,
        sourceBlockId: null,
        targetNoteId,
        targetBlockId: link.blockId,
        type: link.type,
        created_at: now,
      };

      this.edges.set(edgeId, edge);

      // Update source index
      let sourceEdges = this.sourceIndex.get(sourceNoteId);
      if (!sourceEdges) {
        sourceEdges = new Set();
        this.sourceIndex.set(sourceNoteId, sourceEdges);
      }
      sourceEdges.add(edgeId);

      // Update backlink index
      let backlinks = this.backlinkIndex.get(targetNoteId);
      if (!backlinks) {
        backlinks = new Set();
        this.backlinkIndex.set(targetNoteId, backlinks);
      }
      backlinks.add(sourceNoteId);
    }

    this.invalidateGraphCache();
  }

  /**
   * Remove all edges originating from a source note.
   * Uses the sourceIndex for O(outDegree) instead of O(totalEdges).
   */
  private removeEdgesFromSource(sourceNoteId: string): void {
    const edgeIds = this.sourceIndex.get(sourceNoteId);
    if (!edgeIds || edgeIds.size === 0) return;

    for (const edgeId of edgeIds) {
      const edge = this.edges.get(edgeId);
      if (edge) {
        // Clean up backlink index
        const backlinks = this.backlinkIndex.get(edge.targetNoteId);
        if (backlinks) {
          backlinks.delete(sourceNoteId);
          if (backlinks.size === 0) {
            this.backlinkIndex.delete(edge.targetNoteId);
          }
        }
        this.edges.delete(edgeId);
      }
    }

    this.sourceIndex.delete(sourceNoteId);
    this.invalidateGraphCache();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Cache invalidation
  // ─────────────────────────────────────────────────────────────────────────

  private invalidateManifestCache(): void {
    this._manifestShimCache = null;
  }

  private invalidateGraphCache(): void {
    this._graphCacheShimCache = null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public mutation methods (called by hook)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Re-parse links after a note's content is saved.
   */
  updateNoteContent(noteId: string, content: string): void {
    if (!this.notes.has(noteId)) return;
    this.buildEdgesForNote(noteId, content);
  }

  /**
   * Add a note (e.g. file created externally).
   */
  addNote(relPath: string): NoteEntry {
    // Check if already registered
    const existing = this.pathToId.get(relPath);
    if (existing) return this.notes.get(existing)!;
    return this.registerNote(relPath);
  }

  /**
   * Remove a note (e.g. file deleted externally).
   */
  removeNote(relPath: string): void {
    const noteId = this.pathToId.get(relPath);
    if (!noteId) return;

    // Remove outgoing edges
    this.removeEdgesFromSource(noteId);

    // Remove incoming edges (using backlinkIndex for O(inDegree))
    const backlinkSources = this.backlinkIndex.get(noteId);
    if (backlinkSources) {
      for (const sourceId of backlinkSources) {
        const sourceEdges = this.sourceIndex.get(sourceId);
        if (sourceEdges) {
          for (const edgeId of sourceEdges) {
            const edge = this.edges.get(edgeId);
            if (edge && edge.targetNoteId === noteId) {
              this.edges.delete(edgeId);
              sourceEdges.delete(edgeId);
            }
          }
        }
      }
      this.backlinkIndex.delete(noteId);
    }

    // Remove note
    this.notes.delete(noteId);
    this.pathToId.delete(relPath);
    this.invalidateManifestCache();
    this.invalidateGraphCache();
  }

  /**
   * Handle a note rename.
   */
  renameNote(oldPath: string, newPath: string): void {
    const noteId = this.pathToId.get(oldPath);
    if (!noteId) return;

    // Update maps
    this.pathToId.delete(oldPath);
    this.pathToId.set(newPath, noteId);

    const entry = this.notes.get(noteId);
    if (entry) {
      entry.relPath = newPath;
      entry.title = titleFromPath(newPath);
    }

    this.invalidateManifestCache();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Lookup methods
  // ─────────────────────────────────────────────────────────────────────────

  findNoteByPath(relPath: string): NoteEntry | null {
    const noteId = this.pathToId.get(relPath);
    return noteId ? this.notes.get(noteId) ?? null : null;
  }

  findNoteIdByPath(relPath: string): string | null {
    return this.pathToId.get(relPath) ?? null;
  }

  findNoteByName(name: string): NoteEntry | null {
    const lower = name.toLowerCase();
    for (const entry of this.notes.values()) {
      if (entry.title.toLowerCase() === lower) return entry;
    }
    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Snapshot methods (cached shim objects for consumer shapes)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create a manifest-shaped object for consumers.
   * Cached — returns same object until notes change.
   */
  toManifestShim(): { id_to_path: Record<string, string>; path_index: Record<string, string> } {
    if (this._manifestShimCache) return this._manifestShimCache;

    const id_to_path: Record<string, string> = {};
    const path_index: Record<string, string> = {};

    for (const [noteId, entry] of this.notes) {
      id_to_path[noteId] = entry.relPath;
      path_index[entry.relPath] = noteId;
    }

    this._manifestShimCache = { id_to_path, path_index };
    return this._manifestShimCache;
  }

  /**
   * Create a graphCache-shaped object for consumers.
   * Cached — returns same object until edges change.
   */
  toGraphCacheShim(): { edges: Record<string, GraphEdge>; backlink_index: Record<string, string[]> } {
    if (this._graphCacheShimCache) return this._graphCacheShimCache;

    const edges: Record<string, GraphEdge> = {};
    const backlink_index: Record<string, string[]> = {};

    for (const [edgeId, edge] of this.edges) {
      edges[edgeId] = edge;
    }

    for (const [targetId, sourceIds] of this.backlinkIndex) {
      backlink_index[targetId] = Array.from(sourceIds);
    }

    this._graphCacheShimCache = { edges, backlink_index };
    return this._graphCacheShimCache;
  }
}
