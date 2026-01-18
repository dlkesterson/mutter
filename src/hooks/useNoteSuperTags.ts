/**
 * useNoteSuperTags Hook
 *
 * Manages supertag instances applied to a specific note.
 * Uses activeNoteHandle for mutations via NoteDoc functions.
 */

import { useMemo, useCallback } from 'react';
import { useVaultMetadata } from '@/context/VaultMetadataContext';
import {
  applySupertagToNote,
  removeSupertagFromNote,
  getSupertagInstances,
} from '@/crdt/noteDoc';
import type { SupertagInstance } from '@/crdt/vaultMetadataDoc';

// Re-export type for consumers
export type { SupertagInstance };

export interface UseNoteSuperTagsResult {
  /** Supertag instances applied to this note */
  instances: SupertagInstance[];
  /** Apply a supertag to the note */
  apply: (definitionId: string, values: Record<string, any>) => void;
  /** Remove a supertag from the note */
  remove: (definitionId: string) => void;
  /** Update supertag values (removes and re-applies) */
  updateValues: (definitionId: string, values: Record<string, any>) => void;
  /** Whether the CRDT is ready */
  ready: boolean;
}

/**
 * Hook for managing supertags applied to a note
 *
 * @param noteId - ID of the note (or null)
 * @returns Applied supertags and operations
 */
export function useNoteSuperTags(noteId: string | null): UseNoteSuperTagsResult {
  const { ready, activeNoteDoc, activeNoteHandle, activeNoteId } = useVaultMetadata();

  // Get supertag instances from the active NoteDoc
  const instances = useMemo(() => {
    // Only return instances if this is the active note
    if (!activeNoteDoc || !noteId || noteId !== activeNoteId) return [];
    return getSupertagInstances(activeNoteDoc);
  }, [activeNoteDoc, noteId, activeNoteId]);

  /**
   * Apply a supertag to the note
   */
  const apply = useCallback(
    (definitionId: string, values: Record<string, any>) => {
      if (!activeNoteHandle || !noteId || noteId !== activeNoteId) {
        console.warn('[useNoteSuperTags] Cannot apply: no active note handle or note ID mismatch');
        return;
      }
      applySupertagToNote(activeNoteHandle, { definitionId, values });
    },
    [activeNoteHandle, noteId, activeNoteId]
  );

  /**
   * Remove a supertag from the note
   */
  const remove = useCallback(
    (definitionId: string) => {
      if (!activeNoteHandle || !noteId || noteId !== activeNoteId) {
        console.warn('[useNoteSuperTags] Cannot remove: no active note handle or note ID mismatch');
        return;
      }
      removeSupertagFromNote(activeNoteHandle, definitionId);
    },
    [activeNoteHandle, noteId, activeNoteId]
  );

  /**
   * Update supertag values (removes and re-applies with new values)
   */
  const updateValues = useCallback(
    (definitionId: string, values: Record<string, any>) => {
      if (!activeNoteHandle || !noteId || noteId !== activeNoteId) {
        console.warn('[useNoteSuperTags] Cannot update: no active note handle or note ID mismatch');
        return;
      }
      // applySupertagToNote handles update if already applied
      applySupertagToNote(activeNoteHandle, { definitionId, values });
    },
    [activeNoteHandle, noteId, activeNoteId]
  );

  return {
    instances,
    apply,
    remove,
    updateValues,
    ready,
  };
}
