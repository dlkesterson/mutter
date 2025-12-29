/**
 * useGraphStats Hook
 *
 * Provides graph statistics for a note or the entire vault.
 */

import { useMemo } from 'react';
import { useVaultMetadata } from '@/context/VaultMetadataContext';
import { getNoteGraphStats, getBacklinks, getOutgoingLinks } from '@/crdt/vaultMetadataDoc';
import type { VaultNote } from '@/crdt/vaultMetadataDoc';
import { getGraphStatistics } from '@/graph/graphBuilder';

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
  const { doc, ready } = useVaultMetadata();

  return useMemo(() => {
    if (!ready || !doc || !noteId) {
      return {
        incomingCount: 0,
        outgoingCount: 0,
        totalConnections: 0,
        loading: !ready,
      };
    }

    const stats = getNoteGraphStats({ doc, noteId });
    return {
      ...stats,
      loading: false,
    };
  }, [doc, noteId, ready]);
}

/**
 * Get graph statistics for the entire vault
 *
 * @returns Stats about the vault's link graph
 */
export function useVaultGraphStats(): VaultGraphStats & { loading: boolean } {
  const { doc, ready } = useVaultMetadata();

  return useMemo(() => {
    if (!ready || !doc) {
      return {
        noteCount: 0,
        edgeCount: 0,
        orphanCount: 0,
        avgConnections: 0,
        loading: !ready,
      };
    }

    const stats = getGraphStatistics(doc);
    return {
      ...stats,
      loading: false,
    };
  }, [doc, ready]);
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
  const { doc, ready } = useVaultMetadata();

  return useMemo(() => {
    if (!ready || !doc) {
      return { notes: [], loading: !ready };
    }

    // Calculate connections for each note
    const noteStats = Object.values(doc.notes).map((note: VaultNote) => {
      const incoming = getBacklinks({ doc, noteId: note.id }).length;
      const outgoing = getOutgoingLinks({ doc, noteId: note.id }).length;

      return {
        noteId: note.id,
        title: note.title,
        connections: incoming + outgoing,
      };
    });

    // Sort by connections (descending) and take top N
    const sorted = noteStats
      .sort((a, b) => b.connections - a.connections)
      .slice(0, limit);

    return { notes: sorted, loading: false };
  }, [doc, ready, limit]);
}

/**
 * Get orphan notes (no incoming or outgoing links)
 */
export function useOrphanNotes(): {
  notes: Array<{ noteId: string; title: string; relPath: string }>;
  count: number;
  loading: boolean;
} {
  const { doc, ready } = useVaultMetadata();

  return useMemo(() => {
    if (!ready || !doc) {
      return { notes: [], count: 0, loading: !ready };
    }

    // Find notes with no connections
    const orphans = Object.values(doc.notes)
      .filter((note: VaultNote) => {
        const incoming = getBacklinks({ doc, noteId: note.id }).length;
        const outgoing = getOutgoingLinks({ doc, noteId: note.id }).length;
        return incoming === 0 && outgoing === 0;
      })
      .map((note: VaultNote) => ({
        noteId: note.id,
        title: note.title,
        relPath: note.rel_path,
      }));

    return {
      notes: orphans,
      count: orphans.length,
      loading: false,
    };
  }, [doc, ready]);
}
