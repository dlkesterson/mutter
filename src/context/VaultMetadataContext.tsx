/**
 * Vault Metadata Context
 *
 * Provides access to the CRDT vault metadata document
 * throughout the component tree.
 */

import { createContext, useContext, type ReactNode } from 'react';
import type { DocHandle } from '@automerge/react';
import type { VaultMetadataDoc } from '@/crdt/vaultMetadataDoc';

interface VaultMetadataContextValue {
  /** Whether the CRDT is ready */
  ready: boolean;
  /** Current CRDT document snapshot (null if not ready) */
  doc: VaultMetadataDoc | null;
  /** CRDT handle for mutations */
  handle: DocHandle<VaultMetadataDoc> | null;
  /** Current active note ID */
  activeNoteId: string | null;
  /** Vault path */
  vaultPath: string | null;
}

const VaultMetadataContext = createContext<VaultMetadataContextValue | null>(null);

interface VaultMetadataProviderProps {
  children: ReactNode;
  ready: boolean;
  doc: VaultMetadataDoc | null;
  handle: DocHandle<VaultMetadataDoc> | null;
  activeNoteId: string | null;
  vaultPath: string | null;
}

/**
 * Provider component for vault metadata
 * Should be rendered near the top of the app, below the useVaultMetadataCrdt hook
 */
export function VaultMetadataProvider({
  children,
  ready,
  doc,
  handle,
  activeNoteId,
  vaultPath,
}: VaultMetadataProviderProps) {
  return (
    <VaultMetadataContext.Provider
      value={{ ready, doc, handle, activeNoteId, vaultPath }}
    >
      {children}
    </VaultMetadataContext.Provider>
  );
}

/**
 * Hook to access vault metadata from context
 * Must be used within VaultMetadataProvider
 */
export function useVaultMetadata(): VaultMetadataContextValue {
  const ctx = useContext(VaultMetadataContext);
  if (!ctx) {
    // Return safe defaults if not in provider (for standalone usage)
    return {
      ready: false,
      doc: null,
      handle: null,
      activeNoteId: null,
      vaultPath: null,
    };
  }
  return ctx;
}

/**
 * Hook to get just the doc (convenience)
 */
export function useVaultDoc(): VaultMetadataDoc | null {
  const { doc } = useVaultMetadata();
  return doc;
}
