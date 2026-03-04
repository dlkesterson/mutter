/**
 * useEditorContextSync Hook
 *
 * Syncs CodeMirror editor state to the EditorContext.
 * Call this hook from Editor.tsx to keep context in sync.
 */

import { useEffect, useRef } from 'react';
import type { EditorView } from '@codemirror/view';
import { useEditorContext } from '@/context/EditorContextProvider';
import type { CursorState, CursorLocation } from '@/types/editorContext';

/**
 * Detect what type of content the cursor is in
 */
function detectCursorLocation(view: EditorView, pos: number): CursorLocation {
  const line = view.state.doc.lineAt(pos);
  const lineText = line.text.trim();

  if (!lineText) return 'empty';
  if (/^#{1,6}\s/.test(lineText)) return 'heading';
  if (/^[-*+]\s+\[[ x]\]\s/.test(lineText)) return 'task';
  if (/^[-*+]\s/.test(lineText) || /^\d+\.\s/.test(lineText)) return 'list';
  if (lineText.startsWith('>')) return 'blockquote';

  // Check if inside a code block
  const docText = view.state.doc.toString();
  const textBefore = docText.slice(0, pos);
  const openFences = (textBefore.match(/^```/gm) || []).length;
  if (openFences % 2 === 1) return 'code-block';

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
  const lineCount = selectedText.split('\n').length;

  if (lineCount > 1) {
    return { type: 'multi-block', blockCount: lineCount };
  }

  return {
    type: 'inline-selection',
    text: selectedText,
    length: selectedText.length,
  };
}

interface UseEditorContextSyncOptions {
  filePath: string | null;
  noteId: string | null;
  hasUnsavedChanges: boolean;
}

/**
 * Hook to sync CodeMirror state to EditorContext
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

  // Initial sync
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const syncCursor = () => {
      if (!viewRef.current) return;

      const cursorState = buildCursorState(viewRef.current);
      const pos = viewRef.current.state.selection.main.head;
      const cursorLocation = detectCursorLocation(viewRef.current, pos);

      const updateKey = `${JSON.stringify(cursorState)}-${cursorLocation}`;
      if (updateKey === lastUpdateRef.current) return;
      lastUpdateRef.current = updateKey;

      updateCursor(cursorState, cursorLocation);
    };

    syncCursor();
  }, [viewRef, updateCursor]);

  return {
    syncCursor: () => {
      const view = viewRef.current;
      if (!view) return;

      const cursorState = buildCursorState(view);
      const pos = view.state.selection.main.head;
      const cursorLocation = detectCursorLocation(view, pos);

      updateCursor(cursorState, cursorLocation);
    },
  };
}
