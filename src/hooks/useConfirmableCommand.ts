/**
 * useConfirmableCommand Hook
 *
 * Integrates the confirmation dialog with command execution.
 * Automatically determines when confirmation is needed based on
 * user expertise and command destructiveness.
 */

import { useState, useCallback } from 'react';
import { useUserProfile } from './useUserProfile';
import type { VoiceCommand } from '@/types/voiceCommand';

/**
 * State for the confirmation dialog
 */
interface ConfirmationState {
  open: boolean;
  command: VoiceCommand | null;
  context?: {
    affectedItems?: string[];
    additionalInfo?: string;
  };
  onResolved: ((confirmed: boolean) => void) | null;
}

/**
 * Hook for executing commands with confirmation when needed
 */
export function useConfirmableCommand() {
  const { shouldConfirm, skipConfirmationForCommand, recordCommandExecution } =
    useUserProfile();

  const [confirmationState, setConfirmationState] = useState<ConfirmationState>(
    {
      open: false,
      command: null,
      onResolved: null,
    }
  );

  /**
   * Execute a command, showing confirmation dialog if needed
   * Returns true if command was executed, false if cancelled
   */
  const executeWithConfirmation = useCallback(
    async (
      command: VoiceCommand,
      context?: { affectedItems?: string[]; additionalInfo?: string }
    ): Promise<boolean> => {
      // Check if confirmation is needed
      const needsConfirmation = shouldConfirm(
        command.id,
        command.destructiveness,
        command.reversible
      );

      if (!needsConfirmation) {
        // Execute directly without confirmation
        await command.action();
        recordCommandExecution(command.id);
        return true;
      }

      // Show confirmation dialog and wait for user response
      return new Promise((resolve) => {
        setConfirmationState({
          open: true,
          command,
          context,
          onResolved: async (confirmed) => {
            // Close dialog
            setConfirmationState({
              open: false,
              command: null,
              onResolved: null,
            });

            if (confirmed) {
              // Execute the command
              await command.action();
              recordCommandExecution(command.id);
            }
            resolve(confirmed);
          },
        });
      });
    },
    [shouldConfirm, recordCommandExecution]
  );

  /**
   * Handle user confirming the action
   */
  const handleConfirm = useCallback(
    (skipInFuture: boolean) => {
      if (skipInFuture && confirmationState.command) {
        skipConfirmationForCommand(confirmationState.command.id);
      }
      confirmationState.onResolved?.(true);
    },
    [confirmationState, skipConfirmationForCommand]
  );

  /**
   * Handle user cancelling the action
   */
  const handleCancel = useCallback(() => {
    confirmationState.onResolved?.(false);
  }, [confirmationState]);

  return {
    confirmationState,
    executeWithConfirmation,
    handleConfirm,
    handleCancel,
  };
}
