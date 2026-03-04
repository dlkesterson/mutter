/**
 * Editor Context Types for Mutter
 *
 * These types define the context signals used for cursor tracking
 * and document metadata.
 */

/**
 * Cursor/Selection state
 */
export type CursorState =
  | { type: 'no-selection' }
  | { type: 'inline-selection'; text: string; length: number }
  | { type: 'block-selection'; blockCount: number; blockIds: string[] }
  | { type: 'multi-block'; blockCount: number };

/**
 * What type of content is the cursor currently in?
 */
export type CursorLocation =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'task'
  | 'code-block'
  | 'blockquote'
  | 'empty';

/**
 * Complete editor context snapshot
 */
export interface EditorContext {
  // Cursor/Selection
  cursor: CursorState;
  cursorLocation: CursorLocation;
  currentBlockId: string | null;

  // Document metadata
  noteId: string | null;
  notePath: string | null;
  hasUnsavedChanges: boolean;
}

/**
 * Default context when no document is open
 */
export const DEFAULT_EDITOR_CONTEXT: EditorContext = {
  cursor: { type: 'no-selection' },
  cursorLocation: 'empty',
  currentBlockId: null,
  noteId: null,
  notePath: null,
  hasUnsavedChanges: false,
};
