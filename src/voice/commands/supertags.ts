/**
 * Supertag Voice Commands
 *
 * Commands for supertag operations:
 * - Apply supertag to note
 * - Show notes by supertag
 */

import type { VoiceCommand } from '@/types/voiceCommand';
import type { CursorLocation, ViewMode, VoicePhase } from '@/types/editorContext';
import { commandRegistry } from '../commandRegistry';

// Allowed locations for supertag commands (anywhere in document)
const ALL_LOCATIONS: CursorLocation[] = ['paragraph', 'heading', 'list', 'blockquote', 'empty'];

// All view modes (supertags work in any mode)
const ALL_VIEW_MODES: ViewMode[] = ['editor', 'split', 'preview'];

// Voice phases where commands can be executed
const COMMAND_PHASES: VoicePhase[] = ['listening', 'command-recognized'];

/**
 * Dispatch a command to the editor
 * Uses custom event that Editor.tsx listens for
 */
function dispatchEditorCommand(command: string, payload?: Record<string, unknown>) {
  window.dispatchEvent(
    new CustomEvent('mutter:execute-command', {
      detail: { command, ...payload },
    })
  );
}

const supertagCommands: VoiceCommand[] = [
  {
    id: 'apply-supertag',
    name: 'Tag note',
    examples: [
      'tag this as project',
      'mark as meeting',
      'add project tag',
      'apply task tag',
      'tag as',
      'add supertag',
    ],
    bucket: 'link-reference',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: ALL_LOCATIONS,
    allowedViewModes: ['editor', 'split'],
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'document',
    reversible: true,
    action: () => dispatchEditorCommand('open-supertag-dialog'),
  },
  {
    id: 'show-supertag-notes',
    name: 'Show tagged notes',
    examples: [
      'show all projects',
      'find meetings',
      'list tasks',
      'show notes tagged as',
      'find project notes',
    ],
    bucket: 'query-ai',
    requiresSelection: false,
    requiresNote: false,
    allowedLocations: ALL_LOCATIONS,
    allowedViewModes: ALL_VIEW_MODES,
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'vault',
    reversible: false,
    action: () => dispatchEditorCommand('query-supertag'),
  },
  {
    id: 'create-supertag',
    name: 'Create supertag template',
    examples: [
      'create new supertag',
      'new supertag template',
      'create tag template',
      'define supertag',
    ],
    bucket: 'meta',
    requiresSelection: false,
    requiresNote: false,
    allowedLocations: ALL_LOCATIONS,
    allowedViewModes: ALL_VIEW_MODES,
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'vault',
    reversible: false,
    action: () => {
      window.dispatchEvent(
        new CustomEvent('mutter:open-dialog', {
          detail: { dialog: 'supertag-creator' },
        })
      );
    },
  },
];

/**
 * Register all supertag commands with the registry
 */
export function registerSupertagCommands(): void {
  supertagCommands.forEach((cmd) => commandRegistry.register(cmd));
}

export { supertagCommands };
