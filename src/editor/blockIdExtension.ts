/**
 * CodeMirror Extension for Block IDs
 *
 * Provides:
 * - Cursor-aware hiding of block IDs (like existing live preview)
 * - State tracking for all blocks in document
 * - Helper functions to get block at cursor
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
import { cursorPosField } from './livePreview';

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
 * Scroll to a specific block by ID
 */
export function scrollToBlock(view: EditorView, blockId: string): boolean {
  const block = findBlockInView(view, blockId);
  if (!block) return false;

  const line = view.state.doc.line(block.lineStart + 1); // Convert to 1-indexed
  view.dispatch({
    effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
    selection: { anchor: line.from },
  });
  return true;
}

/**
 * Plugin that hides block IDs when cursor is not on that line
 * Uses the same pattern as livePreview.ts for consistency
 */
const blockIdDecorationPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view);
      }
    }

    buildDecorations(view: EditorView): DecorationSet {
      const decorations: { from: number; to: number; decoration: Decoration }[] = [];
      const cursorPos = view.state.field(cursorPosField);
      const doc = view.state.doc;

      for (const { from, to } of view.visibleRanges) {
        let pos = from;
        while (pos <= to) {
          const line = doc.lineAt(pos);
          const text = line.text;
          const lineStart = line.from;
          const lineEnd = line.to;

          // Check for block ID at end of line
          const match = text.match(BLOCK_ID_REGEX);
          if (match) {
            const idStart = lineEnd - match[0].length;
            const idEnd = lineEnd;

            // Hide if cursor is not on this line
            if (cursorPos < lineStart || cursorPos > lineEnd) {
              // Completely hide the block ID
              decorations.push({
                from: idStart,
                to: idEnd,
                decoration: Decoration.replace({}),
              });
            } else {
              // Cursor is on line - show ID with subtle styling
              decorations.push({
                from: idStart,
                to: idEnd,
                decoration: Decoration.mark({ class: 'cm-block-id' }),
              });
            }
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
 * CSS styles for block IDs (add to your theme)
 */
export const blockIdStyles = EditorView.baseTheme({
  '.cm-block-id': {
    color: 'var(--text-disabled, #666)',
    fontSize: '0.85em',
    fontFamily: 'var(--font-mono, monospace)',
    opacity: '0.6',
  },
});

/**
 * Full extension with styles
 */
export const blockIdExtensionWithStyles: Extension = [
  blockIdExtension,
  blockIdStyles,
];
