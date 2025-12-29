/**
 * Navigation Voice Commands
 *
 * Commands for navigating within documents and the vault:
 * - Go to top/bottom
 * - Next/previous heading
 * - Find/search
 * - Open file
 */

import type { VoiceCommand } from '@/types/voiceCommand';
import type { ViewMode, VoicePhase } from '@/types/editorContext';
import { commandRegistry } from '../commandRegistry';

// Navigation works in most view modes
const NAV_VIEW_MODES: ViewMode[] = ['editor', 'split', 'preview'];

// Voice phases where commands can be executed
const COMMAND_PHASES: VoicePhase[] = ['listening', 'command-recognized'];

/**
 * Dispatch a command to the editor/app
 */
function dispatchEditorCommand(command: string, payload?: Record<string, unknown>) {
  window.dispatchEvent(
    new CustomEvent('mutter:execute-command', {
      detail: { command, ...payload },
    })
  );
}

const navigationCommands: VoiceCommand[] = [
  // Document navigation
  {
    id: 'nav-go-to-top',
    name: 'Go to top',
    examples: ['go to top', 'top of document', 'beginning', 'start'],
    bucket: 'navigate',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: [], // Any location
    allowedViewModes: NAV_VIEW_MODES,
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'document',
    reversible: true,
    action: () => dispatchEditorCommand('goToTop'),
  },
  {
    id: 'nav-go-to-bottom',
    name: 'Go to bottom',
    examples: ['go to bottom', 'end of document', 'bottom', 'end'],
    bucket: 'navigate',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: [],
    allowedViewModes: NAV_VIEW_MODES,
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'document',
    reversible: true,
    action: () => dispatchEditorCommand('goToBottom'),
  },
  {
    id: 'nav-next-heading',
    name: 'Next heading',
    examples: ['next heading', 'next section', 'go to next heading'],
    bucket: 'navigate',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: [],
    allowedViewModes: NAV_VIEW_MODES,
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'document',
    reversible: true,
    action: () => dispatchEditorCommand('nextHeading'),
  },
  {
    id: 'nav-previous-heading',
    name: 'Previous heading',
    examples: ['previous heading', 'previous section', 'go to previous heading', 'last heading'],
    bucket: 'navigate',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: [],
    allowedViewModes: NAV_VIEW_MODES,
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'document',
    reversible: true,
    action: () => dispatchEditorCommand('previousHeading'),
  },

  // Search/Find
  {
    id: 'nav-find',
    name: 'Find in document',
    examples: ['find', 'search', 'find text', 'search in document'],
    bucket: 'navigate',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: [],
    allowedViewModes: ['editor', 'split'],
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'document',
    reversible: true,
    action: () => dispatchEditorCommand('find'),
  },
  {
    id: 'nav-find-replace',
    name: 'Find and replace',
    examples: ['find and replace', 'replace', 'search and replace'],
    bucket: 'navigate',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: [],
    allowedViewModes: ['editor', 'split'],
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'low',
    scope: 'document',
    reversible: true,
    action: () => dispatchEditorCommand('findReplace'),
  },

  // Vault navigation
  {
    id: 'nav-open-file',
    name: 'Open file',
    examples: ['open file', 'open note', 'go to file', 'switch to file'],
    bucket: 'navigate',
    requiresSelection: false,
    requiresNote: false, // Can work without a note open
    allowedLocations: [],
    allowedViewModes: [],
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'vault',
    reversible: true,
    action: () => dispatchEditorCommand('openFile'),
  },
  {
    id: 'nav-quick-switcher',
    name: 'Quick switcher',
    examples: ['quick switcher', 'quick switch', 'command palette', 'omnibox'],
    bucket: 'navigate',
    requiresSelection: false,
    requiresNote: false,
    allowedLocations: [],
    allowedViewModes: [],
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'vault',
    reversible: true,
    action: () => dispatchEditorCommand('quickSwitcher'),
  },
  {
    id: 'nav-go-back',
    name: 'Go back',
    examples: ['go back', 'back', 'previous note', 'previous file'],
    bucket: 'navigate',
    requiresSelection: false,
    requiresNote: false,
    allowedLocations: [],
    allowedViewModes: [],
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'vault',
    reversible: true,
    action: () => dispatchEditorCommand('goBack'),
  },
  {
    id: 'nav-go-forward',
    name: 'Go forward',
    examples: ['go forward', 'forward', 'next note', 'next file'],
    bucket: 'navigate',
    requiresSelection: false,
    requiresNote: false,
    allowedLocations: [],
    allowedViewModes: [],
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'vault',
    reversible: true,
    action: () => dispatchEditorCommand('goForward'),
  },
];

/**
 * Register all navigation commands
 */
export function registerNavigationCommands(): void {
  commandRegistry.registerAll(navigationCommands);
}

export { navigationCommands };
