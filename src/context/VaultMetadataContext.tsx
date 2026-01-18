/**
 * Vault Metadata Context
 *
 * Provides access to the CRDT vault metadata (split document format)
 * throughout the component tree.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { DocHandle } from '@automerge/react';
import type { ManifestDoc } from '@/crdt/manifestDoc';
import type { NoteDoc } from '@/crdt/noteDoc';
import type { GraphCacheDoc } from '@/crdt/graphCacheDoc';
import type { NoteDocManager } from '@/crdt/noteDocManager';
import type { CrdtLoadingPhase } from '@/hooks/useVaultMetadataCrdt';
import type { MigrationProgress } from '@/crdt/migration';

interface VaultMetadataContextValue {
  ready: boolean;
  vaultId: string | null;
  activeNoteId: string | null;
  vaultPath: string | null;
  normalizedVaultPath: string | null;
  loadingPhase: CrdtLoadingPhase;
  manifest: ManifestDoc | null;
  manifestHandle: DocHandle<ManifestDoc> | null;
  noteManager: NoteDocManager | null;
  activeNoteDoc: NoteDoc | null;
  /** Handle to the active note's document (for mutations) */
  activeNoteHandle: DocHandle<NoteDoc> | null;
  noteCount: number;
  migrationProgress: MigrationProgress | null;
  graphCache: GraphCacheDoc | null;
  graphCacheHandle: DocHandle<GraphCacheDoc> | null;
}

const VaultMetadataContext = createContext<VaultMetadataContextValue | null>(null);

interface VaultMetadataProviderProps {
  children: ReactNode;
  ready: boolean;
  vaultId: string | null;
  activeNoteId: string | null;
  vaultPath: string | null;
  normalizedVaultPath: string | null;
  loadingPhase: CrdtLoadingPhase;
  manifest: ManifestDoc | null;
  manifestHandle: DocHandle<ManifestDoc> | null;
  noteManager: NoteDocManager | null;
  activeNoteDoc: NoteDoc | null;
  activeNoteHandle: DocHandle<NoteDoc> | null;
  noteCount: number;
  migrationProgress: MigrationProgress | null;
  graphCache: GraphCacheDoc | null;
  graphCacheHandle: DocHandle<GraphCacheDoc> | null;
}

export function VaultMetadataProvider({
  children,
  ready,
  vaultId,
  activeNoteId,
  vaultPath,
  normalizedVaultPath,
  loadingPhase,
  manifest,
  manifestHandle,
  noteManager,
  activeNoteDoc,
  activeNoteHandle,
  noteCount,
  migrationProgress,
  graphCache,
  graphCacheHandle,
}: VaultMetadataProviderProps) {
  const contextValue = useMemo<VaultMetadataContextValue>(
    () => ({
      ready,
      vaultId,
      activeNoteId,
      vaultPath,
      normalizedVaultPath,
      loadingPhase,
      manifest,
      manifestHandle,
      noteManager,
      activeNoteDoc,
      activeNoteHandle,
      noteCount,
      migrationProgress,
      graphCache,
      graphCacheHandle,
    }),
    [ready, vaultId, activeNoteId, vaultPath, normalizedVaultPath, loadingPhase, manifest, manifestHandle, noteManager, activeNoteDoc, activeNoteHandle, noteCount, migrationProgress, graphCache, graphCacheHandle]
  );

  return (
    <VaultMetadataContext.Provider value={contextValue}>
      {children}
    </VaultMetadataContext.Provider>
  );
}

export function useVaultMetadata(): VaultMetadataContextValue {
  const ctx = useContext(VaultMetadataContext);
  if (!ctx) {
    return {
      ready: false,
      vaultId: null,
      activeNoteId: null,
      vaultPath: null,
      normalizedVaultPath: null,
      loadingPhase: 'idle',
      manifest: null,
      manifestHandle: null,
      noteManager: null,
      activeNoteDoc: null,
      activeNoteHandle: null,
      noteCount: 0,
      migrationProgress: null,
      graphCache: null,
      graphCacheHandle: null,
    };
  }
  return ctx;
}
