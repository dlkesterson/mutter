/**
 * useVoicePhase Hook
 *
 * State machine for voice session phases.
 * Provides transitions and auto-timeouts for the undo window.
 *
 * Flow: idle → listening → processing → command-recognized/ambiguous
 *       → awaiting-confirmation (optional) → executed → undo-window → idle
 */

import { useCallback, useRef, useEffect } from 'react';
import { useEditorContext } from '@/context/EditorContextProvider';
import type { VoicePhase } from '@/types/editorContext';

/**
 * Time in ms before executed transitions to undo-window
 */
const EXECUTED_TO_UNDO_DELAY = 500;

/**
 * Time in ms for undo window before returning to idle
 */
const UNDO_WINDOW_DURATION = 5000;

interface UseVoicePhaseResult {
  /** Current voice phase */
  phase: VoicePhase;

  /** User started speaking / pressed record button */
  startListening: () => void;

  /** Audio captured, now transcribing */
  startProcessing: () => void;

  /** Transcription complete, command clearly recognized */
  commandRecognized: () => void;

  /** Transcription complete but ambiguous (needs disambiguation UI) */
  commandAmbiguous: () => void;

  /** Waiting for user to confirm (e.g., destructive action) */
  awaitConfirmation: () => void;

  /** Command was executed successfully */
  commandExecuted: () => void;

  /** Reset to idle (e.g., user cancelled, error occurred) */
  reset: () => void;

  /** Check if currently in an active voice session */
  isActive: boolean;

  /** Check if in undo window (command can be undone) */
  canUndo: boolean;
}

export function useVoicePhase(): UseVoicePhaseResult {
  const { context, setVoicePhase } = useEditorContext();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending timeouts
  const clearTimeouts = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimeouts();
    };
  }, [clearTimeouts]);

  const startListening = useCallback(() => {
    clearTimeouts();
    setVoicePhase('listening');
  }, [setVoicePhase, clearTimeouts]);

  const startProcessing = useCallback(() => {
    clearTimeouts();
    setVoicePhase('processing');
  }, [setVoicePhase, clearTimeouts]);

  const commandRecognized = useCallback(() => {
    clearTimeouts();
    setVoicePhase('command-recognized');
  }, [setVoicePhase, clearTimeouts]);

  const commandAmbiguous = useCallback(() => {
    clearTimeouts();
    setVoicePhase('command-ambiguous');
  }, [setVoicePhase, clearTimeouts]);

  const awaitConfirmation = useCallback(() => {
    clearTimeouts();
    setVoicePhase('awaiting-confirmation');
  }, [setVoicePhase, clearTimeouts]);

  const commandExecuted = useCallback(() => {
    clearTimeouts();
    setVoicePhase('executed');

    // Auto-transition to undo window after brief delay
    timeoutRef.current = setTimeout(() => {
      setVoicePhase('undo-window');

      // Auto-return to idle after undo window expires
      timeoutRef.current = setTimeout(() => {
        setVoicePhase('idle');
      }, UNDO_WINDOW_DURATION);
    }, EXECUTED_TO_UNDO_DELAY);
  }, [setVoicePhase, clearTimeouts]);

  const reset = useCallback(() => {
    clearTimeouts();
    setVoicePhase('idle');
  }, [setVoicePhase, clearTimeouts]);

  const phase = context.voicePhase;

  const isActive =
    phase === 'listening' ||
    phase === 'processing' ||
    phase === 'command-recognized' ||
    phase === 'command-ambiguous' ||
    phase === 'awaiting-confirmation';

  const canUndo = phase === 'undo-window';

  return {
    phase,
    startListening,
    startProcessing,
    commandRecognized,
    commandAmbiguous,
    awaitConfirmation,
    commandExecuted,
    reset,
    isActive,
    canUndo,
  };
}
