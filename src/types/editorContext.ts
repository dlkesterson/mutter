/**
 * Editor Context Types for Mutter
 *
 * These types define the context signals used for:
 * - Smart command ranking (surface relevant commands)
 * - Tiered UI (show context-appropriate options)
 * - Voice intelligence (understand user intent)
 */

/**
 * Cursor/Selection state - highest weight for command ranking
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
 * Voice session state machine phases
 *
 * Flow: idle → listening → processing → command-recognized/ambiguous
 *       → awaiting-confirmation (optional) → executed → undo-window → idle
 */
export type VoicePhase =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'command-recognized'
  | 'command-ambiguous'
  | 'awaiting-confirmation'
  | 'executed'
  | 'undo-window';

/**
 * View mode for the editor
 */
export type ViewMode =
  | 'editor'
  | 'preview'
  | 'split'
  | 'graph'
  | 'canvas';

/**
 * Intent buckets for tracking recent user actions
 * Used to predict likely next commands
 */
export type IntentBucket =
  | 'edit-selection'      // Bold, italic, delete selection
  | 'format-text'         // Heading, quote, code
  | 'structure-document'  // Lists, sections, reorganize
  | 'navigate'            // Jump to, find, open note
  | 'link-reference'      // Wiki links, embeds, backlinks
  | 'query-ai'            // Ask AI, summarize, explain
  | 'meta';               // Undo, help, cancel, settings

/**
 * Complete editor context snapshot
 * Used for command ranking and UI decisions
 */
export interface EditorContext {
  // Cursor/Selection (highest weight for ranking)
  cursor: CursorState;
  cursorLocation: CursorLocation;
  currentBlockId: string | null;

  // Voice session state
  voicePhase: VoicePhase;

  // Recent intent (last 3 actions for prediction)
  recentIntents: IntentBucket[];

  // Document/View mode
  viewMode: ViewMode;

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
  voicePhase: 'idle',
  recentIntents: [],
  viewMode: 'editor',
  noteId: null,
  notePath: null,
  hasUnsavedChanges: false,
};

