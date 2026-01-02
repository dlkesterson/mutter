/**
 * Supertag Types
 *
 * Re-exports CRDT types and adds UI-specific types
 * for supertag creation and application.
 */

// Re-export CRDT types for convenience
export type {
  SupertagDefinition,
  SupertagField,
  SupertagFieldType,
  SupertagInstance,
} from '@/crdt/vaultMetadataDoc';

/**
 * Form values for creating a new supertag template
 */
export interface SupertagFormValues {
  name: string;
  icon: string;
  fields: SupertagFieldInput[];
}

/**
 * Field input for the supertag creator form
 * Includes a temporary ID for React key management
 */
export interface SupertagFieldInput {
  id: string; // Temporary ID for React key
  name: string;
  type: 'text' | 'number' | 'date' | 'select' | 'multi-select' | 'checkbox';
  options?: string[];
  default?: string | number | boolean;
}

/**
 * Values for applying a supertag to a note
 */
export interface SupertagApplyValues {
  definitionId: string;
  values: Record<string, string | number | boolean | string[]>;
}
