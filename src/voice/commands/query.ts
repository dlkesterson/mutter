/**
 * Text Processing Voice Commands
 *
 * Voice commands for processing text with AI assistance.
 */

import type { VoiceCommand } from '@/types/voiceCommand';
import { commandRegistry } from '../commandRegistry';

/**
 * Dispatch an editor command via custom event
 */
function dispatchEditorCommand(command: string): void {
  window.dispatchEvent(
    new CustomEvent('mutter:execute-command', {
      detail: { command },
    })
  );
}

/**
 * Text processing voice commands
 */
const queryCommands: VoiceCommand[] = [
  {
    id: 'cleanup-text',
    name: 'Clean up text',
    examples: [
      'clean up text',
      'clean this up',
      'format this',
      'remove fillers',
      'tidy up',
      'fix transcription',
      'clean up transcription',
    ],
    bucket: 'query-ai',
    requiresSelection: false, // Works on selection OR entire document
    requiresNote: true,
    allowedLocations: ['paragraph', 'heading', 'list', 'blockquote'],
    allowedViewModes: ['editor', 'split'],
    allowedVoicePhases: ['listening', 'command-recognized'],
    destructiveness: 'medium', // Modifies content
    scope: 'document',
    reversible: true, // Can undo
    action: () => {
      dispatchEditorCommand('cleanup-text');
    },
  },
];

/**
 * Register text processing commands with the command registry
 */
export function registerQueryCommands(): void {
  queryCommands.forEach((cmd) => commandRegistry.register(cmd));
}

export { queryCommands };
