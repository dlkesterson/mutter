/**
 * AI Query Voice Commands
 *
 * Voice commands for querying the vault using natural language.
 * Supports:
 * - Summarizing notes about a topic
 * - Finding related notes
 * - General questions about notes
 */

import type { VoiceCommand } from '@/types/voiceCommand';
import { commandRegistry } from '../commandRegistry';

/**
 * Dispatch an editor command via custom event
 */
function dispatchEditorCommand(command: string, mode?: string): void {
  window.dispatchEvent(
    new CustomEvent('mutter:execute-command', {
      detail: { command, args: mode ? { mode } : undefined },
    })
  );
}

/**
 * AI Query voice commands
 */
const queryCommands: VoiceCommand[] = [
  {
    id: 'summarize-notes',
    name: 'Summarize notes',
    examples: [
      'summarize notes about',
      'summarize my notes on',
      'what do my notes say about',
      'summarize notes related to',
      'give me a summary of',
    ],
    bucket: 'query-ai',
    requiresSelection: false,
    requiresNote: false,
    allowedLocations: ['paragraph', 'heading', 'list', 'blockquote', 'empty'],
    allowedViewModes: ['editor', 'split', 'preview'],
    allowedVoicePhases: ['listening', 'command-recognized'],
    destructiveness: 'none',
    scope: 'vault',
    reversible: false,
    action: () => {
      dispatchEditorCommand('ai-query', 'summarize');
    },
  },
  {
    id: 'find-related-notes',
    name: 'Find related notes',
    examples: [
      'find notes about',
      'search notes for',
      'find related notes',
      'what notes mention',
      'look for notes about',
      'search for',
    ],
    bucket: 'query-ai',
    requiresSelection: false,
    requiresNote: false,
    allowedLocations: ['paragraph', 'heading', 'list', 'blockquote', 'empty'],
    allowedViewModes: ['editor', 'split', 'preview'],
    allowedVoicePhases: ['listening', 'command-recognized'],
    destructiveness: 'none',
    scope: 'vault',
    reversible: false,
    action: () => {
      dispatchEditorCommand('ai-query', 'search');
    },
  },
  {
    id: 'ask-vault',
    name: 'Ask about notes',
    examples: [
      'ask my notes',
      'question about notes',
      'what do I know about',
      'help me remember',
      'query my notes',
      'ask about',
    ],
    bucket: 'query-ai',
    requiresSelection: false,
    requiresNote: false,
    allowedLocations: ['paragraph', 'heading', 'list', 'blockquote', 'empty'],
    allowedViewModes: ['editor', 'split', 'preview'],
    allowedVoicePhases: ['listening', 'command-recognized'],
    destructiveness: 'none',
    scope: 'vault',
    reversible: false,
    action: () => {
      dispatchEditorCommand('ai-query', 'ask');
    },
  },
  {
    id: 'build-ai-index',
    name: 'Build AI index',
    examples: [
      'build AI index',
      'index my notes',
      'update AI index',
      'rebuild index',
      'prepare for AI queries',
    ],
    bucket: 'query-ai',
    requiresSelection: false,
    requiresNote: false,
    allowedLocations: ['paragraph', 'heading', 'list', 'blockquote', 'empty'],
    allowedViewModes: ['editor', 'split', 'preview'],
    allowedVoicePhases: ['listening', 'command-recognized'],
    destructiveness: 'none',
    scope: 'vault',
    reversible: false,
    action: () => {
      dispatchEditorCommand('build-ai-index');
    },
  },
];

/**
 * Register AI query commands with the command registry
 */
export function registerQueryCommands(): void {
  queryCommands.forEach((cmd) => commandRegistry.register(cmd));
}

export { queryCommands };
