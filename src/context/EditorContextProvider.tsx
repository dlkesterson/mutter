/**
 * Editor Context Provider
 *
 * Provides centralized access to editor state for:
 * - Smart command ranking
 * - Context-aware voice UI
 * - Intent prediction
 */

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import {
  type EditorContext,
  type CursorState,
  type CursorLocation,
  type VoicePhase,
  type ViewMode,
  type IntentBucket,
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
    blockId: string | null
  ) => void;

  // Voice phase transitions
  setVoicePhase: (phase: VoicePhase) => void;

  // Intent recording (called after command execution)
  recordIntent: (intent: IntentBucket) => void;

  // View mode (editor, preview, split, etc.)
  setViewMode: (mode: ViewMode) => void;

  // Document metadata updates
  setDocumentInfo: (info: {
    noteId: string | null;
    notePath: string | null;
    hasUnsavedChanges: boolean;
  }) => void;

  // Reset to defaults (e.g., when closing document)
  resetContext: () => void;
}

const EditorContextContext = createContext<EditorContextValue | null>(null);

/**
 * Maximum number of recent intents to track
 */
const MAX_RECENT_INTENTS = 3;

interface EditorContextProviderProps {
  children: ReactNode;
}

export function EditorContextProvider({ children }: EditorContextProviderProps) {
  const [context, setContext] = useState<EditorContext>(DEFAULT_EDITOR_CONTEXT);

  const updateCursor = useCallback(
    (cursor: CursorState, location: CursorLocation, blockId: string | null) => {
      setContext((prev) => ({
        ...prev,
        cursor,
        cursorLocation: location,
        currentBlockId: blockId,
      }));
    },
    []
  );

  const setVoicePhase = useCallback((phase: VoicePhase) => {
    setContext((prev) => ({
      ...prev,
      voicePhase: phase,
    }));
  }, []);

  const recordIntent = useCallback((intent: IntentBucket) => {
    setContext((prev) => ({
      ...prev,
      recentIntents: [intent, ...prev.recentIntents].slice(0, MAX_RECENT_INTENTS),
    }));
  }, []);

  const setViewMode = useCallback((mode: ViewMode) => {
    setContext((prev) => ({
      ...prev,
      viewMode: mode,
    }));
  }, []);

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

  const resetContext = useCallback(() => {
    setContext(DEFAULT_EDITOR_CONTEXT);
  }, []);

  const value = useMemo<EditorContextValue>(
    () => ({
      context,
      updateCursor,
      setVoicePhase,
      recordIntent,
      setViewMode,
      setDocumentInfo,
      resetContext,
    }),
    [context, updateCursor, setVoicePhase, recordIntent, setViewMode, setDocumentInfo, resetContext]
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
 * Useful for components that only need to read context
 */
export function useEditorContextState(): EditorContext {
  const { context } = useEditorContext();
  return context;
}
