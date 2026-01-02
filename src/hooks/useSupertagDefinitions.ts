/**
 * useSupertagDefinitions Hook
 *
 * Manages supertag template definitions.
 * Uses VaultMetadataContext for CRDT access.
 */

import { useMemo, useCallback } from 'react';
import { useVaultMetadata } from '@/context/VaultMetadataContext';
import {
  getAllSupertagDefinitions,
  createSupertagDefinition,
  updateSupertagDefinition,
  deleteSupertagDefinition,
  type SupertagDefinition,
  type SupertagField,
} from '@/crdt/vaultMetadataDoc';

export interface UseSupertagDefinitionsResult {
  /** All supertag definitions in the vault */
  definitions: SupertagDefinition[];
  /** Create a new supertag definition */
  create: (params: { name: string; fields: SupertagField[]; icon?: string }) => string | null;
  /** Update an existing supertag definition */
  update: (id: string, updates: Partial<{ name: string; fields: SupertagField[]; icon: string }>) => void;
  /** Delete a supertag definition */
  remove: (id: string) => void;
  /** Get a definition by ID */
  getById: (id: string) => SupertagDefinition | null;
  /** Whether the CRDT is ready */
  ready: boolean;
}

/**
 * Hook for managing supertag definitions
 * 
 * @returns Supertag definitions and CRUD operations
 */
export function useSupertagDefinitions(): UseSupertagDefinitionsResult {
  const { handle, doc, ready } = useVaultMetadata();

  const definitions = useMemo(() => {
    if (!doc) return [];
    return getAllSupertagDefinitions(doc);
  }, [doc]);

  const create = useCallback(
    (params: { name: string; fields: SupertagField[]; icon?: string }) => {
      if (!handle) return null;
      return createSupertagDefinition({ handle, ...params });
    },
    [handle]
  );

  const update = useCallback(
    (id: string, updates: Partial<{ name: string; fields: SupertagField[]; icon: string }>) => {
      if (!handle) return;
      updateSupertagDefinition({ handle, definitionId: id, ...updates });
    },
    [handle]
  );

  const remove = useCallback(
    (id: string) => {
      if (!handle) return;
      deleteSupertagDefinition({ handle, definitionId: id });
    },
    [handle]
  );

  const getById = useCallback(
    (id: string) => definitions.find((d) => d.id === id) ?? null,
    [definitions]
  );

  return {
    definitions,
    create,
    update,
    remove,
    getById,
    ready,
  };
}
