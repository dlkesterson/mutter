/**
 * useSupertagDefinitions Hook
 *
 * Manages supertag template definitions.
 * Reads definitions from ManifestDoc.supertag_definitions.
 * CRUD operations use manifestHandle.change() for mutations.
 */

import { useMemo, useCallback } from 'react';
import { useVaultMetadata } from '@/context/VaultMetadataContext';
import { ensureManifestDocShape } from '@/crdt/manifestDoc';
import type { SupertagDefinition, SupertagField } from '@/crdt/vaultMetadataDoc';

// Re-export types for consumers
export type { SupertagDefinition, SupertagField };

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
  const { manifest, manifestHandle, ready } = useVaultMetadata();

  const definitions = useMemo(() => {
    if (!manifest?.supertag_definitions) return [];
    return Object.values(manifest.supertag_definitions);
  }, [manifest]);

  /**
   * Create a new supertag definition
   * Returns the new definition ID, or null if creation failed
   */
  const create = useCallback(
    (params: { name: string; fields: SupertagField[]; icon?: string }): string | null => {
      if (!manifestHandle) {
        console.warn('[useSupertagDefinitions] No manifest handle available');
        return null;
      }

      const id = crypto.randomUUID();
      const now = Date.now();

      manifestHandle.change((doc: any) => {
        ensureManifestDocShape(doc, doc.vault_id || 'unknown');
        doc.supertag_definitions[id] = {
          id,
          name: params.name.trim().toLowerCase(),
          icon: params.icon,
          fields: params.fields,
          created_at: now,
          updated_at: now,
        };
      });

      return id;
    },
    [manifestHandle]
  );

  /**
   * Update an existing supertag definition
   */
  const update = useCallback(
    (id: string, updates: Partial<{ name: string; fields: SupertagField[]; icon: string }>): void => {
      if (!manifestHandle) {
        console.warn('[useSupertagDefinitions] No manifest handle available');
        return;
      }

      const now = Date.now();

      manifestHandle.change((doc: any) => {
        ensureManifestDocShape(doc, doc.vault_id || 'unknown');
        const def = doc.supertag_definitions[id];
        if (!def) return;

        if (updates.name !== undefined) {
          def.name = updates.name.trim().toLowerCase();
        }
        if (updates.fields !== undefined) {
          def.fields = updates.fields;
        }
        if (updates.icon !== undefined) {
          def.icon = updates.icon;
        }
        def.updated_at = now;
      });
    },
    [manifestHandle]
  );

  /**
   * Delete a supertag definition
   * Note: This does NOT remove instances from notes - that requires loading each NoteDoc
   */
  const remove = useCallback(
    (id: string): void => {
      if (!manifestHandle) {
        console.warn('[useSupertagDefinitions] No manifest handle available');
        return;
      }

      manifestHandle.change((doc: any) => {
        ensureManifestDocShape(doc, doc.vault_id || 'unknown');
        delete doc.supertag_definitions[id];
      });
    },
    [manifestHandle]
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
