/**
 * Vault Metadata Context
 *
 * Provides access to the vault index throughout the component tree.
 * Backed by an in-memory vault index built from the filesystem.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { GraphEdge } from '@/types/vault';
import type { VaultLoadingPhase } from '@/hooks/useVaultIndex';

interface VaultMetadataContextValue {
  ready: boolean;
  activeNoteId: string | null;
  vaultPath: string | null;
  normalizedVaultPath: string | null;
  loadingPhase: VaultLoadingPhase;
  manifest: { id_to_path: Record<string, string>; path_index: Record<string, string> } | null;
  noteCount: number;
  graphCache: { edges: Record<string, GraphEdge>; backlink_index: Record<string, string[]> } | null;
}

const VaultMetadataContext = createContext<VaultMetadataContextValue | null>(null);

interface VaultMetadataProviderProps {
  children: ReactNode;
  ready: boolean;
  activeNoteId: string | null;
  vaultPath: string | null;
  normalizedVaultPath: string | null;
  loadingPhase: VaultLoadingPhase;
  manifest: { id_to_path: Record<string, string>; path_index: Record<string, string> } | null;
  noteCount: number;
  graphCache: { edges: Record<string, GraphEdge>; backlink_index: Record<string, string[]> } | null;
}

export function VaultMetadataProvider({
  children,
  ready,
  activeNoteId,
  vaultPath,
  normalizedVaultPath,
  loadingPhase,
  manifest,
  noteCount,
  graphCache,
}: VaultMetadataProviderProps) {
  const contextValue = useMemo<VaultMetadataContextValue>(
    () => ({
      ready,
      activeNoteId,
      vaultPath,
      normalizedVaultPath,
      loadingPhase,
      manifest,
      noteCount,
      graphCache,
    }),
    [ready, activeNoteId, vaultPath, normalizedVaultPath, loadingPhase, manifest, noteCount, graphCache]
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
      activeNoteId: null,
      vaultPath: null,
      normalizedVaultPath: null,
      loadingPhase: 'idle',
      manifest: null,
      noteCount: 0,
      graphCache: null,
    };
  }
  return ctx;
}
