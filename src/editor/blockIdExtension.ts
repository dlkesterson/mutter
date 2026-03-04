/**
 * CodeMirror Extension for Block IDs
 *
 * Phase 2: Block IDs are now ALWAYS hidden in the editor.
 *
 * Provides:
 * - Complete visual hiding of block IDs (^abc123 syntax)
 * - State tracking for all blocks in document
 * - Helper functions to get block at cursor
 *
 * Block IDs remain in the markdown file for Obsidian compatibility
 * and transclusion/linking functionality, but are never shown to users.
 * This solves the "data poisoning" issue identified in the research PDF
 * while maintaining full functionality.
 */

import {
  EditorView,
  Decoration,
  DecorationSet,
  ViewPlugin,
  ViewUpdate,
} from '@codemirror/view';
import { StateField, Extension } from '@codemirror/state';
import {
  BlockInfo,
  extractBlocks,
  getBlockAtLine,
} from './blockIds';
// Note: cursorPosField no longer needed since we always hide IDs

// Regex to match block ID at end of line
const BLOCK_ID_REGEX = / \^[a-z0-9]{6}$/;

/**
 * State field to track all blocks in the document
 */
export const blocksField = StateField.define<BlockInfo[]>({
  create(state) {
    return extractBlocks(state.doc.toString());
  },
  update(blocks, tr) {
    if (tr.docChanged) {
      return extractBlocks(tr.newDoc.toString());
    }
    return blocks;
  },
});

/**
 * Get all blocks in the current document
 */
export function getAllBlocks(view: EditorView): BlockInfo[] {
  return view.state.field(blocksField);
}

/**
 * Get the block at the current cursor position
 */
export function getBlockAtCursor(view: EditorView): BlockInfo | null {
  const cursorPos = view.state.selection.main.head;
  const line = view.state.doc.lineAt(cursorPos);
  const lineNumber = line.number - 1; // Convert to 0-indexed
  const blocks = view.state.field(blocksField);
  return getBlockAtLine(blocks, lineNumber);
}

/**
 * Get the block ID at the current cursor position
 */
export function getBlockIdAtCursor(view: EditorView): string | null {
  const block = getBlockAtCursor(view);
  return block?.id || null;
}

/**
 * Find a block by its ID
 */
export function findBlockInView(view: EditorView, blockId: string): BlockInfo | null {
  const blocks = view.state.field(blocksField);
  return blocks.find(b => b.id === blockId) || null;
}

/**
 * Debug flag to show block IDs (for development only)
 * Access via window.__MUTTER_DEBUG__.showBlockIds = true
 */
let debugShowBlockIds = false;

// Expose debug toggle
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__MUTTER_DEBUG__ =
    (window as unknown as Record<string, unknown>).__MUTTER_DEBUG__ || {};
  Object.defineProperty(
    (window as unknown as Record<string, Record<string, unknown>>).__MUTTER_DEBUG__,
    'showBlockIds',
    {
      get: () => debugShowBlockIds,
      set: (value: boolean) => {
        debugShowBlockIds = value;
        console.log(`[BlockIds] Debug visibility: ${value ? 'ON' : 'OFF'}`);
      },
    }
  );
}

/**
 * Plugin that ALWAYS hides block IDs from the user
 *
 * Phase 2 change: Block IDs are now completely invisible.
 * Previously, IDs would show when cursor was on that line.
 * Now they are always hidden via Decoration.replace({}).
 *
 * The IDs remain in the markdown file for:
 * - Obsidian compatibility
 * - Transclusion references
 * - Block linking
 *
 * But users never see or interact with them directly.
 */
const blockIdDecorationPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
      // Only rebuild on doc changes or viewport changes
      // Selection changes no longer matter since we always hide
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view);
      }
    }

    buildDecorations(view: EditorView): DecorationSet {
      // Debug mode: show all IDs
      if (debugShowBlockIds) {
        return Decoration.none;
      }

      const decorations: { from: number; to: number; decoration: Decoration }[] = [];
      const doc = view.state.doc;

      for (const { from, to } of view.visibleRanges) {
        let pos = from;
        while (pos <= to) {
          const line = doc.lineAt(pos);
          const text = line.text;
          const lineEnd = line.to;

          // Check for block ID at end of line
          const match = text.match(BLOCK_ID_REGEX);
          if (match) {
            const idStart = lineEnd - match[0].length;
            const idEnd = lineEnd;

            // Always hide block IDs - they are internal infrastructure
            decorations.push({
              from: idStart,
              to: idEnd,
              decoration: Decoration.replace({}),
            });
          }

          pos = line.to + 1;
        }
      }

      // Sort by position and convert to DecorationSet
      return Decoration.set(
        decorations
          .sort((a, b) => a.from - b.from)
          .map(d => d.decoration.range(d.from, d.to)),
        true
      );
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

/**
 * Complete block ID extension
 * Includes state tracking and decorations
 */
export const blockIdExtension: Extension = [
  blocksField,
  blockIdDecorationPlugin,
];

/**
 * CSS styles for block IDs
 *
 * @deprecated Phase 2: Block IDs are now always hidden, so these styles are unused.
 * Kept for backward compatibility in case any code references blockIdStyles.
 */
export const blockIdStyles = EditorView.baseTheme({
  // Styles no longer needed since IDs are always hidden
  // Kept as empty theme for backward compatibility
});

/**
 * Full extension with styles
 *
 * @deprecated Use blockIdExtension directly. Styles are no longer needed
 * since block IDs are always hidden in Phase 2.
 */
export const blockIdExtensionWithStyles: Extension = [
  blockIdExtension,
  blockIdStyles,
];
