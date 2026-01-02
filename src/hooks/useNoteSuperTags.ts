/**
 * useNoteSuperTags Hook
 *
 * Manages supertag instances applied to a specific note.
 * Uses VaultMetadataContext for CRDT access.
 */

import { useMemo, useCallback } from 'react';
import { useVaultMetadata } from '@/context/VaultMetadataContext';
import {
  getNoteSupertagInstances,
  applySupertagToNote,
  removeSupertagFromNote,
  type SupertagInstance,
} from '@/crdt/vaultMetadataDoc';

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
  const { handle, doc, ready } = useVaultMetadata();

  const instances = useMemo(() => {
    if (!doc || !noteId) return [];
    return getNoteSupertagInstances(doc, noteId);
  }, [doc, noteId]);

  const apply = useCallback(
    (definitionId: string, values: Record<string, any>) => {
      if (!handle || !noteId) return;
      applySupertagToNote({ handle, noteId, definitionId, values });
    },
    [handle, noteId]
  );

  const remove = useCallback(
    (definitionId: string) => {
      if (!handle || !noteId) return;
      removeSupertagFromNote({ handle, noteId, definitionId });
    },
    [handle, noteId]
  );

  const updateValues = useCallback(
    (definitionId: string, values: Record<string, any>) => {
      if (!handle || !noteId) return;
      // Remove and re-apply with new values
      removeSupertagFromNote({ handle, noteId, definitionId });
      applySupertagToNote({ handle, noteId, definitionId, values });
    },
    [handle, noteId]
  );

  return {
    instances,
    apply,
    remove,
    updateValues,
    ready,
  };
}
