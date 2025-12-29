/**
 * useBacklinks Hook
 *
 * Provides backlink information for a note.
 * Uses the CRDT backlink_index for O(1) lookups.
 */

import { useMemo } from 'react';
import { useVaultMetadata } from '@/context/VaultMetadataContext';
import { getBacklinks } from '@/crdt/vaultMetadataDoc';
import type { VaultNote, GraphEdge } from '@/crdt/vaultMetadataDoc';

/**
 * Backlink information with source note metadata
 */
export interface BacklinkInfo {
  /** The graph edge */
  edge: GraphEdge;
  /** Source note that contains the link */
  sourceNote: VaultNote;
  /** Preview context around the link (optional) */
  context?: string;
}

/**
 * Hook result
 */
export interface UseBacklinksResult {
  /** List of backlinks with metadata */
  backlinks: BacklinkInfo[];
  /** Number of backlinks */
  count: number;
  /** Whether data is still loading */
  loading: boolean;
}

/**
 * Get backlinks for a note
 *
 * @param noteId - ID of the note to get backlinks for
 * @returns Backlinks, count, and loading state
 */
export function useBacklinks(noteId: string | null): UseBacklinksResult {
  const { doc, ready } = useVaultMetadata();

  const backlinks = useMemo(() => {
    if (!ready || !doc || !noteId) {
      return [];
    }

    // Get edges pointing to this note
    const edges = getBacklinks({ doc, noteId });

    // Map to backlink info with source note
    return edges
      .map((edge) => {
        const sourceNote = doc.notes[edge.sourceNoteId];
        if (!sourceNote) return null;

        return {
          edge,
          sourceNote,
          // TODO: Load context from file content
          // Would need to read the file and extract text around the link
        };
      })
      .filter((bl): bl is BacklinkInfo => bl !== null);
  }, [doc, noteId, ready]);

  return {
    backlinks,
    count: backlinks.length,
    loading: !ready,
  };
}

/**
 * Get backlinks grouped by source note
 * Useful when a note links to the same target multiple times
 */
export function useBacklinksGrouped(noteId: string | null): {
  groups: Map<string, BacklinkInfo[]>;
  count: number;
  loading: boolean;
} {
  const { backlinks, count, loading } = useBacklinks(noteId);

  const groups = useMemo(() => {
    const map = new Map<string, BacklinkInfo[]>();

    for (const bl of backlinks) {
      const key = bl.sourceNote.id;
      const existing = map.get(key) || [];
      existing.push(bl);
      map.set(key, existing);
    }

    return map;
  }, [backlinks]);

  return { groups, count, loading };
}
