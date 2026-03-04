/**
 * useBacklinks Hook
 *
 * Provides backlink information for a note using the vault index.
 * Uses the pre-computed backlink_index for O(1) lookups.
 */

import { useMemo } from 'react';
import { useVaultMetadata } from '@/context/VaultMetadataContext';
import type { GraphEdge } from '@/types/vault';

/**
 * Backlink information with source note metadata
 */
export interface BacklinkInfo {
  /** The graph edge */
  edge: GraphEdge;
  /** Source note ID */
  sourceNoteId: string;
  /** Source note path (if available) */
  sourcePath: string | null;
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
  const { ready, graphCache, manifest } = useVaultMetadata();

  const backlinks = useMemo(() => {
    if (!ready || !noteId || !graphCache) {
      return [];
    }

    // Get source note IDs from backlink index
    const sourceIds = graphCache.backlink_index[noteId] ?? [];
    if (sourceIds.length === 0) {
      return [];
    }

    // Find edges that point to this note
    const result: BacklinkInfo[] = [];
    for (const edge of Object.values(graphCache.edges)) {
      if (edge.targetNoteId === noteId) {
        result.push({
          edge,
          sourceNoteId: edge.sourceNoteId,
          sourcePath: manifest?.id_to_path[edge.sourceNoteId] ?? null,
        });
      }
    }

    return result;
  }, [graphCache, manifest, noteId, ready]);

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
      const key = bl.sourceNoteId;
      const existing = map.get(key) || [];
      existing.push(bl);
      map.set(key, existing);
    }

    return map;
  }, [backlinks]);

  return { groups, count, loading };
}
