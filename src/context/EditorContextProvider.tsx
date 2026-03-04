/**
 * Editor Context Provider
 *
 * Provides centralized access to editor state for cursor tracking
 * and document metadata.
 */

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import {
  type EditorContext,
  type CursorState,
  type CursorLocation,
  DEFAULT_EDITOR_CONTEXT,
} from '@/types/editorContext';

/**
 * Context value includes both state and updaters
 */
interface EditorContextValue {
  context: EditorContext;

  // Cursor updates (called by Editor on selection change)
  updateCursor: (
    cursor: CursorState,
    location: CursorLocation,
  ) => void;

  // Document metadata updates
  setDocumentInfo: (info: {
    noteId: string | null;
    notePath: string | null;
    hasUnsavedChanges: boolean;
  }) => void;
}

const EditorContextContext = createContext<EditorContextValue | null>(null);

interface EditorContextProviderProps {
  children: ReactNode;
}

export function EditorContextProvider({ children }: EditorContextProviderProps) {
  const [context, setContext] = useState<EditorContext>(DEFAULT_EDITOR_CONTEXT);

  const updateCursor = useCallback(
    (cursor: CursorState, location: CursorLocation) => {
      setContext((prev) => ({
        ...prev,
        cursor,
        cursorLocation: location,
      }));
    },
    []
  );

  const setDocumentInfo = useCallback(
    (info: { noteId: string | null; notePath: string | null; hasUnsavedChanges: boolean }) => {
      setContext((prev) => ({
        ...prev,
        noteId: info.noteId,
        notePath: info.notePath,
        hasUnsavedChanges: info.hasUnsavedChanges,
      }));
    },
    []
  );

  const value = useMemo<EditorContextValue>(
    () => ({
      context,
      updateCursor,
      setDocumentInfo,
    }),
    [context, updateCursor, setDocumentInfo]
  );

  return (
    <EditorContextContext.Provider value={value}>
      {children}
    </EditorContextContext.Provider>
  );
}

/**
 * Hook to access editor context
 * Must be used within EditorContextProvider
 */
export function useEditorContext(): EditorContextValue {
  const ctx = useContext(EditorContextContext);
  if (!ctx) {
    throw new Error('useEditorContext must be used within EditorContextProvider');
  }
  return ctx;
}

/**
 * Hook to access just the context state (read-only)
 */
export function useEditorContextState(): EditorContext {
  const { context } = useEditorContext();
  return context;
}
