/**
 * Graph Builder
 *
 * Builds and maintains the link graph from parsed markdown.
 * Handles:
 * - Building graph for entire vault on load
 * - Incremental updates when notes are saved
 * - Link target resolution
 */

import type { DocHandle } from '@automerge/react';
import type {
  VaultMetadataDoc,
  GraphEdgeType,
} from '@/crdt/vaultMetadataDoc';
import {
  addGraphEdge,
  removeEdgesFromNote,
  findNoteIdByRelPath,
} from '@/crdt/vaultMetadataDoc';
import { parseLinks } from './linkParser';

/**
 * Result of building graph for vault
 */
export interface GraphBuildResult {
  notesProcessed: number;
  edgesCreated: number;
  unresolvedLinks: Array<{ sourceNote: string; target: string }>;
}

/**
 * Result of building graph for a single note
 */
export interface NoteBuildResult {
  edgesCreated: number;
  unresolvedLinks: string[];
}

/**
 * Resolve a link target to a note ID
 *
 * Handles various formats:
 * - "Note Name" → find by title
 * - "folder/Note Name" → find by relative path
 * - "Note Name.md" → find by path with extension
 *
 * @param doc - Vault metadata document
 * @param target - Link target string
 * @returns Note ID if found, null otherwise
 */
export function resolveLinkTarget(
  doc: VaultMetadataDoc,
  target: string
): string | null {
  const normalizedTarget = target.trim();
  if (!normalizedTarget) return null;

  // Try exact path match first (with .md)
  const withMd = normalizedTarget.endsWith('.md')
    ? normalizedTarget
    : `${normalizedTarget}.md`;
  const byPathWithMd = findNoteIdByRelPath(doc, withMd);
  if (byPathWithMd) return byPathWithMd;

  // Try without .md extension
  const withoutMd = normalizedTarget.replace(/\.md$/i, '');
  const byPathNoExt = findNoteIdByRelPath(doc, withoutMd);
  if (byPathNoExt) return byPathNoExt;

  // Try title match (case-insensitive)
  const lowerTarget = normalizedTarget.toLowerCase();
  for (const note of Object.values(doc.notes)) {
    // Match by title
    if (note.title.toLowerCase() === lowerTarget) {
      return note.id;
    }

    // Match by filename without path or extension
    const pathParts = note.rel_path.split('/');
    const filename = pathParts[pathParts.length - 1] ?? '';
    const filenameNoExt = filename.replace(/\.md$/i, '');
    if (filenameNoExt.toLowerCase() === lowerTarget) {
      return note.id;
    }
  }

  return null;
}

/**
 * Build graph edges for a single note
 *
 * @param params - Build parameters
 * @returns Result with edge count and unresolved links
 */
export function buildGraphForNote(params: {
  handle: DocHandle<VaultMetadataDoc>;
  sourceNoteId: string;
  sourceBlockId: string | null;
  content: string;
}): NoteBuildResult {
  const doc = params.handle.doc();
  if (!doc) {
    return { edgesCreated: 0, unresolvedLinks: [] };
  }

  // Remove existing edges from this note (clean rebuild)
  removeEdgesFromNote({ handle: params.handle, sourceNoteId: params.sourceNoteId });

  // Parse links from content
  const links = parseLinks(params.content);
  const unresolvedLinks: string[] = [];
  let edgesCreated = 0;

  for (const link of links) {
    // Re-fetch doc after each change (CRDT might update)
    const currentDoc = params.handle.doc();
    if (!currentDoc) continue;

    const targetNoteId = resolveLinkTarget(currentDoc, link.target);

    if (!targetNoteId) {
      // Link target not found - might be forward reference
      unresolvedLinks.push(link.target);
      continue;
    }

    // Don't create self-links
    if (targetNoteId === params.sourceNoteId) {
      continue;
    }

    addGraphEdge({
      handle: params.handle,
      sourceNoteId: params.sourceNoteId,
      sourceBlockId: params.sourceBlockId,
      targetNoteId,
      targetBlockId: link.blockId,
      type: link.type as GraphEdgeType,
    });

    edgesCreated++;
  }

  return { edgesCreated, unresolvedLinks };
}

/**
 * Build graph for entire vault
 *
 * Called on vault load to index all links.
 *
 * @param params - Build parameters including content reader
 * @returns Result with counts and unresolved links
 */
export async function buildVaultGraph(params: {
  handle: DocHandle<VaultMetadataDoc>;
  readNoteContent: (relPath: string) => Promise<string>;
  onProgress?: (processed: number, total: number) => void;
}): Promise<GraphBuildResult> {
  const doc = params.handle.doc();
  if (!doc) {
    return { notesProcessed: 0, edgesCreated: 0, unresolvedLinks: [] };
  }

  const notes = Object.values(doc.notes);
  const result: GraphBuildResult = {
    notesProcessed: 0,
    edgesCreated: 0,
    unresolvedLinks: [],
  };

  console.log(`[Graph] Building vault graph for ${notes.length} notes...`);

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];

    try {
      // Read note content from disk
      const content = await params.readNoteContent(note.rel_path);

      // Build graph for this note
      const { edgesCreated, unresolvedLinks } = buildGraphForNote({
        handle: params.handle,
        sourceNoteId: note.id,
        sourceBlockId: null,
        content,
      });

      result.edgesCreated += edgesCreated;
      result.unresolvedLinks.push(
        ...unresolvedLinks.map((target) => ({
          sourceNote: note.rel_path,
          target,
        }))
      );
    } catch (err) {
      console.warn(`[Graph] Failed to process ${note.rel_path}:`, err);
    }

    result.notesProcessed++;
    params.onProgress?.(i + 1, notes.length);
  }

  console.log(
    `[Graph] Built vault graph: ${result.edgesCreated} edges from ${result.notesProcessed} notes`
  );

  if (result.unresolvedLinks.length > 0) {
    console.log(
      `[Graph] ${result.unresolvedLinks.length} unresolved links (forward references or typos)`
    );
  }

  return result;
}

/**
 * Check if the graph needs rebuilding
 * (e.g., after schema migration or corruption)
 */
export function graphNeedsRebuild(doc: VaultMetadataDoc): boolean {
  // Check if we have notes but no edges (might need initial build)
  const noteCount = Object.keys(doc.notes).length;
  const edgeCount = Object.keys(doc.graph_edges).length;

  // If we have notes but no edges, might need to build
  // (though empty vaults are also valid)
  if (noteCount > 0 && edgeCount === 0) {
    // Check if any note has links that should create edges
    for (const note of Object.values(doc.notes)) {
      if (note.links && note.links.length > 0) {
        return true; // Has links but no edges - needs rebuild
      }
    }
  }

  return false;
}

/**
 * Get statistics about the graph
 */
export function getGraphStatistics(doc: VaultMetadataDoc): {
  noteCount: number;
  edgeCount: number;
  orphanCount: number;
  avgConnections: number;
} {
  const noteCount = Object.keys(doc.notes).length;
  const edgeCount = Object.keys(doc.graph_edges).length;

  // Count notes with no incoming or outgoing links
  const connectedNotes = new Set<string>();
  for (const edge of Object.values(doc.graph_edges)) {
    connectedNotes.add(edge.sourceNoteId);
    connectedNotes.add(edge.targetNoteId);
  }
  const orphanCount = noteCount - connectedNotes.size;

  // Average connections per note
  const avgConnections = noteCount > 0 ? (edgeCount * 2) / noteCount : 0;

  return {
    noteCount,
    edgeCount,
    orphanCount,
    avgConnections: Math.round(avgConnections * 100) / 100,
  };
}

// Debug helper
if (typeof window !== 'undefined') {
  (window as any).__MUTTER_DEBUG__ = (window as any).__MUTTER_DEBUG__ || {};
  (window as any).__MUTTER_DEBUG__.buildGraphForNote = buildGraphForNote;
  (window as any).__MUTTER_DEBUG__.resolveLinkTarget = resolveLinkTarget;
  (window as any).__MUTTER_DEBUG__.getGraphStatistics = getGraphStatistics;
}
