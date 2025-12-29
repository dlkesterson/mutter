/**
 * useCommandRanking Hook
 *
 * Provides ranked voice commands based on current editor context.
 * Separates commands into tiers for the suggestion UI:
 * - Primary: Top 1-2 commands with score >= 0.7
 * - Secondary: Next 2-3 commands with score >= 0.4
 * - Escape: Always-available meta commands (undo, cancel, help)
 */

import { useMemo, useEffect } from 'react';
import { useEditorContext } from '@/context/EditorContextProvider';
import { commandRegistry, registerAllCommands } from '@/voice/commands';
import { scoreCommands } from '@/voice/commandScorer';
import { TIER_THRESHOLDS } from '@/types/voiceCommand';
import type { ScoredCommand } from '@/types/voiceCommand';
import type { EditorContext } from '@/types/editorContext';

/**
 * Tiered command ranking result
 */
export interface RankedCommands {
  /** Top 1-2 commands with score >= 0.7 */
  primary: ScoredCommand[];
  /** Next 2-3 commands with score >= 0.4 and < 0.7 */
  secondary: ScoredCommand[];
  /** Always available: undo, cancel, help */
  escape: ScoredCommand[];
  /** Full ranked list of all executable commands */
  all: ScoredCommand[];
  /** Whether the command system is initialized */
  ready: boolean;
}

/** Maximum commands per tier */
const MAX_PRIMARY = 2;
const MAX_SECONDARY = 3;
const MAX_ESCAPE = 3;

/** Escape command IDs that should always be available */
const ESCAPE_COMMAND_IDS = ['meta-undo', 'meta-cancel', 'meta-help'];

/**
 * Hook to get ranked voice commands for the current context
 */
export function useCommandRanking(): RankedCommands {
  const { context } = useEditorContext();

  // Ensure commands are registered on first use
  useEffect(() => {
    if (!commandRegistry.isInitialized()) {
      registerAllCommands();
    }
  }, []);

  const ranked = useMemo(() => {
    // Get commands that can execute in current context
    const executable = commandRegistry.getExecutableCommands(context);

    // Score and rank all executable commands
    const scored = scoreCommands(executable, context);

    // Separate into tiers based on score thresholds
    const primary = scored
      .filter((s) => s.score >= TIER_THRESHOLDS.PRIMARY)
      .slice(0, MAX_PRIMARY);

    const secondary = scored
      .filter(
        (s) =>
          s.score >= TIER_THRESHOLDS.SECONDARY &&
          s.score < TIER_THRESHOLDS.PRIMARY
      )
      .slice(0, MAX_SECONDARY);

    // Escape tier: specific meta commands, always available if they can execute
    const escape = scored
      .filter((s) => ESCAPE_COMMAND_IDS.includes(s.command.id))
      .slice(0, MAX_ESCAPE);

    return {
      primary,
      secondary,
      escape,
      all: scored,
      ready: commandRegistry.isInitialized(),
    };
  }, [context]);

  return ranked;
}

/**
 * Hook to execute a command and record the intent
 */
export function useCommandExecution() {
  const { recordIntent } = useEditorContext();

  return useMemo(
    () => ({
      /**
       * Execute a scored command and record the intent
       */
      execute: async (scored: ScoredCommand) => {
        try {
          await scored.command.action();
          recordIntent(scored.command.bucket);
          return true;
        } catch (error) {
          console.error('[CommandExecution] Failed:', error);
          return false;
        }
      },
    }),
    [recordIntent]
  );
}

// Debug helper - expose command system for testing in devtools
if (typeof window !== 'undefined') {
  (window as any).__MUTTER_DEBUG__ = (window as any).__MUTTER_DEBUG__ || {};

  // Get basic registry info
  (window as any).__MUTTER_DEBUG__.getCommandRanking = () => ({
    registeredCommands: commandRegistry.getAll().length,
    initialized: commandRegistry.isInitialized(),
    commands: commandRegistry.getAll().map(cmd => ({
      id: cmd.id,
      name: cmd.name,
      bucket: cmd.bucket,
      scope: cmd.scope,
    })),
  });

  // Score commands against a mock context (useful for testing)
  (window as any).__MUTTER_DEBUG__.scoreWithContext = (mockContext: Partial<EditorContext>) => {
    // Use default context shape matching EditorContext type
    const defaultContext: EditorContext = {
      cursor: { type: 'no-selection' },
      cursorLocation: 'paragraph',
      currentBlockId: null,
      voicePhase: 'idle',
      recentIntents: [],
      viewMode: 'editor',
      noteId: null,
      notePath: null,
      hasUnsavedChanges: false,
    };

    const context = { ...defaultContext, ...mockContext };
    const executable = commandRegistry.getExecutableCommands(context);
    return scoreCommands(executable, context);
  };

  // Expose registry and scorer directly for advanced debugging
  (window as any).__MUTTER_DEBUG__.commandRegistry = commandRegistry;
  (window as any).__MUTTER_DEBUG__.scoreCommands = scoreCommands;
}
