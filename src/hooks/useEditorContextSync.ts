/**
 * useEditorContextSync Hook
 *
 * Syncs CodeMirror editor state to the EditorContext.
 * Call this hook from Editor.tsx to keep context in sync.
 */

import { useEffect, useRef } from 'react';
import type { EditorView } from '@codemirror/view';
import { useEditorContext } from '@/context/EditorContextProvider';
import { getBlockAtCursor } from '@/editor/blockIdExtension';
import type { CursorState, CursorLocation } from '@/types/editorContext';

/**
 * Detect what type of content the cursor is in
 */
function detectCursorLocation(view: EditorView, pos: number): CursorLocation {
  const line = view.state.doc.lineAt(pos);
  const lineText = line.text.trim();

  // Empty line
  if (!lineText) {
    return 'empty';
  }

  // Heading (# to ######)
  if (/^#{1,6}\s/.test(lineText)) {
    return 'heading';
  }

  // Task list item (- [ ] or - [x])
  if (/^[-*+]\s+\[[ x]\]\s/.test(lineText)) {
    return 'task';
  }

  // List item (bullet or numbered)
  if (/^[-*+]\s/.test(lineText) || /^\d+\.\s/.test(lineText)) {
    return 'list';
  }

  // Blockquote
  if (lineText.startsWith('>')) {
    return 'blockquote';
  }

  // Check if we're inside a code block by looking for fences above
  const docText = view.state.doc.toString();
  const textBefore = docText.slice(0, pos);
  const openFences = (textBefore.match(/^```/gm) || []).length;
  if (openFences % 2 === 1) {
    return 'code-block';
  }

  // Default: paragraph
  return 'paragraph';
}

/**
 * Build cursor state from CodeMirror selection
 */
function buildCursorState(view: EditorView): CursorState {
  const selection = view.state.selection.main;

  if (selection.empty) {
    return { type: 'no-selection' };
  }

  const selectedText = view.state.sliceDoc(selection.from, selection.to);

  // Check if selection spans multiple lines
  const lineCount = selectedText.split('\n').length;

  if (lineCount > 1) {
    // Multi-line selection - could be block selection
    // For now, treat as multi-block
    return {
      type: 'multi-block',
      blockCount: lineCount,
    };
  }

  // Single line selection
  return {
    type: 'inline-selection',
    text: selectedText,
    length: selectedText.length,
  };
}

interface UseEditorContextSyncOptions {
  /** Current file path */
  filePath: string | null;
  /** Note ID from CRDT */
  noteId: string | null;
  /** Whether document has unsaved changes */
  hasUnsavedChanges: boolean;
}

/**
 * Hook to sync CodeMirror state to EditorContext
 *
 * @param viewRef - Ref to the CodeMirror EditorView
 * @param options - Additional context options
 */
export function useEditorContextSync(
  viewRef: React.RefObject<EditorView | null>,
  options: UseEditorContextSyncOptions
) {
  const { updateCursor, setDocumentInfo } = useEditorContext();
  const lastUpdateRef = useRef<string>('');

  // Sync document info when it changes
  useEffect(() => {
    setDocumentInfo({
      noteId: options.noteId,
      notePath: options.filePath,
      hasUnsavedChanges: options.hasUnsavedChanges,
    });
  }, [options.noteId, options.filePath, options.hasUnsavedChanges, setDocumentInfo]);

  // Sync cursor state periodically and on focus
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const syncCursor = () => {
      if (!viewRef.current) return;

      const cursorState = buildCursorState(viewRef.current);
      const pos = viewRef.current.state.selection.main.head;
      const cursorLocation = detectCursorLocation(viewRef.current, pos);
      const block = getBlockAtCursor(viewRef.current);
      const blockId = block?.id ?? null;

      // Create a key to avoid redundant updates
      const updateKey = `${JSON.stringify(cursorState)}-${cursorLocation}-${blockId}`;
      if (updateKey === lastUpdateRef.current) return;
      lastUpdateRef.current = updateKey;

      updateCursor(cursorState, cursorLocation, blockId);
    };

    // Initial sync
    syncCursor();

    // Sync on selection changes via a timer (since we can't easily add listeners here)
    // The actual sync is done via the EditorView.updateListener in Editor.tsx
    // This effect just handles the initial sync and document info

  }, [viewRef, updateCursor]);

  return {
    // Expose manual sync function for use in update listeners
    syncCursor: () => {
      const view = viewRef.current;
      if (!view) return;

      const cursorState = buildCursorState(view);
      const pos = view.state.selection.main.head;
      const cursorLocation = detectCursorLocation(view, pos);
      const block = getBlockAtCursor(view);
      const blockId = block?.id ?? null;

      updateCursor(cursorState, cursorLocation, blockId);
    },
  };
}
