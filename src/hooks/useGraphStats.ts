/**
 * useGraphStats Hook
 *
 * Provides graph statistics for a note or the entire vault.
 * Uses the vault index manifest for note metadata and graph cache for edge data.
 */

import { useMemo } from 'react';
import { useVaultMetadata } from '@/context/VaultMetadataContext';

/**
 * Graph stats for a single note
 */
export interface NoteGraphStats {
  /** Number of notes linking TO this note */
  incomingCount: number;
  /** Number of notes this note links TO */
  outgoingCount: number;
  /** Total connections (incoming + outgoing) */
  totalConnections: number;
}

/**
 * Graph stats for the entire vault
 */
export interface VaultGraphStats {
  /** Total notes in vault */
  noteCount: number;
  /** Total edges (links) in graph */
  edgeCount: number;
  /** Notes with no connections */
  orphanCount: number;
  /** Average connections per note */
  avgConnections: number;
}

/**
 * Get graph statistics for a specific note
 *
 * @param noteId - ID of the note
 * @returns Stats about the note's connections
 */
export function useGraphStats(noteId: string | null): NoteGraphStats & { loading: boolean } {
  const { ready, graphCache } = useVaultMetadata();

  return useMemo(() => {
    if (!ready || !graphCache || !noteId) {
      return {
        incomingCount: 0,
        outgoingCount: 0,
        totalConnections: 0,
        loading: !ready,
      };
    }

    // Count incoming links (backlinks)
    const incomingCount = graphCache.backlink_index[noteId]?.length ?? 0;

    // Count outgoing links
    let outgoingCount = 0;
    for (const edge of Object.values(graphCache.edges)) {
      if (edge.sourceNoteId === noteId) {
        outgoingCount++;
      }
    }

    return {
      incomingCount,
      outgoingCount,
      totalConnections: incomingCount + outgoingCount,
      loading: false,
    };
  }, [graphCache, noteId, ready]);
}

/**
 * Get graph statistics for the entire vault
 *
 * @returns Stats about the vault's link graph
 */
export function useVaultGraphStats(): VaultGraphStats & { loading: boolean } {
  const { ready, manifest, graphCache, noteCount } = useVaultMetadata();

  return useMemo(() => {
    if (!ready || !manifest) {
      return {
        noteCount: 0,
        edgeCount: 0,
        orphanCount: 0,
        avgConnections: 0,
        loading: !ready,
      };
    }

    const edgeCount = graphCache ? Object.keys(graphCache.edges).length : 0;

    // Calculate orphan count (notes with no connections)
    let orphanCount = 0;
    const connectedNotes = new Set<string>();

    if (graphCache) {
      for (const edge of Object.values(graphCache.edges)) {
        connectedNotes.add(edge.sourceNoteId);
        connectedNotes.add(edge.targetNoteId);
      }
    }

    orphanCount = noteCount - connectedNotes.size;

    // Average connections per note
    const avgConnections = noteCount > 0 ? (edgeCount * 2) / noteCount : 0;

    return {
      noteCount,
      edgeCount,
      orphanCount,
      avgConnections,
      loading: false,
    };
  }, [ready, manifest, graphCache, noteCount]);
}

/**
 * Get the most connected notes in the vault
 *
 * @param limit - Max number of notes to return
 * @returns Most connected notes sorted by connection count
 */
export function useMostConnectedNotes(limit: number = 10): {
  notes: Array<{ noteId: string; title: string; connections: number }>;
  loading: boolean;
} {
  const { ready, manifest, graphCache } = useVaultMetadata();

  return useMemo(() => {
    if (!ready || !manifest || !graphCache) {
      return { notes: [], loading: !ready };
    }

    // Count connections for each note
    const connectionCounts = new Map<string, number>();

    for (const edge of Object.values(graphCache.edges)) {
      connectionCounts.set(
        edge.sourceNoteId,
        (connectionCounts.get(edge.sourceNoteId) ?? 0) + 1
      );
      connectionCounts.set(
        edge.targetNoteId,
        (connectionCounts.get(edge.targetNoteId) ?? 0) + 1
      );
    }

    // Build result with title derived from path
    const noteStats = Array.from(connectionCounts.entries())
      .map(([noteId, connections]) => {
        const relPath = manifest.id_to_path[noteId];
        const title = relPath
          ? relPath.split('/').pop()?.replace(/\.md$/i, '') ?? noteId
          : noteId;
        return { noteId, title, connections };
      })
      .sort((a, b) => b.connections - a.connections)
      .slice(0, limit);

    return { notes: noteStats, loading: false };
  }, [ready, manifest, graphCache, limit]);
}

/**
 * Get orphan notes (no incoming or outgoing links)
 */
export function useOrphanNotes(): {
  notes: Array<{ noteId: string; title: string; relPath: string }>;
  count: number;
  loading: boolean;
} {
  const { ready, manifest, graphCache } = useVaultMetadata();

  return useMemo(() => {
    if (!ready || !manifest) {
      return { notes: [], count: 0, loading: !ready };
    }

    // Get all connected notes
    const connectedNotes = new Set<string>();
    if (graphCache) {
      for (const edge of Object.values(graphCache.edges)) {
        connectedNotes.add(edge.sourceNoteId);
        connectedNotes.add(edge.targetNoteId);
      }
    }

    // Find orphans
    const orphans: Array<{ noteId: string; title: string; relPath: string }> = [];
    for (const [noteId, relPath] of Object.entries(manifest.id_to_path)) {
      if (!connectedNotes.has(noteId)) {
        const title = relPath.split('/').pop()?.replace(/\.md$/i, '') ?? noteId;
        orphans.push({ noteId, title, relPath });
      }
    }

    return {
      notes: orphans,
      count: orphans.length,
      loading: false,
    };
  }, [ready, manifest, graphCache]);
}
