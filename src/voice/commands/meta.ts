/**
 * Meta Voice Commands
 *
 * Commands for app control and voice session management:
 * - Undo/Redo
 * - Cancel/Stop
 * - Help
 * - Save
 * - Delete
 */

import type { VoiceCommand } from '@/types/voiceCommand';
import type { ViewMode, VoicePhase } from '@/types/editorContext';
import { commandRegistry } from '../commandRegistry';

// View modes for editing operations
const EDIT_VIEW_MODES: ViewMode[] = ['editor', 'split'];

// Meta commands available in most voice phases
const META_PHASES: VoicePhase[] = [
  'listening',
  'command-recognized',
  'command-ambiguous',
  'awaiting-confirmation',
  'executed',
  'undo-window',
];

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

const metaCommands: VoiceCommand[] = [
  // Undo/Redo - always at the top of escape tier
  {
    id: 'meta-undo',
    name: 'Undo',
    examples: ['undo', 'undo that', 'go back', 'revert', 'take that back'],
    bucket: 'meta',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: [],
    allowedViewModes: EDIT_VIEW_MODES,
    allowedVoicePhases: META_PHASES,
    destructiveness: 'none',
    scope: 'document',
    reversible: true,
    action: () => dispatchEditorCommand('undo'),
  },
  {
    id: 'meta-redo',
    name: 'Redo',
    examples: ['redo', 'redo that', 'go forward', 'undo undo'],
    bucket: 'meta',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: [],
    allowedViewModes: EDIT_VIEW_MODES,
    allowedVoicePhases: META_PHASES,
    destructiveness: 'none',
    scope: 'document',
    reversible: true,
    action: () => dispatchEditorCommand('redo'),
  },

  // Cancel/Stop - critical escape hatch
  {
    id: 'meta-cancel',
    name: 'Cancel',
    examples: ['cancel', 'stop', 'never mind', 'abort', 'dismiss'],
    bucket: 'meta',
    requiresSelection: false,
    requiresNote: false,
    allowedLocations: [],
    allowedViewModes: [],
    allowedVoicePhases: META_PHASES,
    destructiveness: 'none',
    scope: 'inline',
    reversible: true,
    action: () => dispatchEditorCommand('cancel'),
  },
  {
    id: 'meta-stop-listening',
    name: 'Stop listening',
    examples: ['stop listening', 'mute', 'pause voice', 'voice off'],
    bucket: 'meta',
    requiresSelection: false,
    requiresNote: false,
    allowedLocations: [],
    allowedViewModes: [],
    allowedVoicePhases: ['listening'],
    destructiveness: 'none',
    scope: 'inline',
    reversible: true,
    action: () => dispatchEditorCommand('stopListening'),
  },

  // Help
  {
    id: 'meta-help',
    name: 'Show help',
    examples: ['help', 'what can I say', 'show commands', 'voice help'],
    bucket: 'meta',
    requiresSelection: false,
    requiresNote: false,
    allowedLocations: [],
    allowedViewModes: [],
    allowedVoicePhases: META_PHASES,
    destructiveness: 'none',
    scope: 'vault',
    reversible: true,
    action: () => dispatchEditorCommand('showHelp'),
  },

  // Save
  {
    id: 'meta-save',
    name: 'Save',
    examples: ['save', 'save file', 'save note', 'save document'],
    bucket: 'meta',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: [],
    allowedViewModes: EDIT_VIEW_MODES,
    allowedVoicePhases: META_PHASES,
    destructiveness: 'none',
    scope: 'document',
    reversible: false,
    action: () => dispatchEditorCommand('save'),
  },

  // Delete selection/line
  {
    id: 'meta-delete-selection',
    name: 'Delete selection',
    examples: ['delete', 'delete this', 'remove', 'delete selection'],
    bucket: 'edit-selection',
    requiresSelection: true,
    requiresNote: true,
    allowedLocations: [],
    allowedViewModes: EDIT_VIEW_MODES,
    allowedVoicePhases: ['listening', 'command-recognized'],
    destructiveness: 'medium',
    scope: 'inline',
    reversible: true,
    action: () => dispatchEditorCommand('deleteSelection'),
  },
  {
    id: 'meta-delete-line',
    name: 'Delete line',
    examples: ['delete line', 'delete this line', 'remove line', 'kill line'],
    bucket: 'edit-selection',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: [],
    allowedViewModes: EDIT_VIEW_MODES,
    allowedVoicePhases: ['listening', 'command-recognized'],
    destructiveness: 'medium',
    scope: 'block',
    reversible: true,
    action: () => dispatchEditorCommand('deleteLine'),
  },

  // Clipboard operations
  {
    id: 'meta-copy',
    name: 'Copy',
    examples: ['copy', 'copy this', 'copy selection'],
    bucket: 'edit-selection',
    requiresSelection: true,
    requiresNote: true,
    allowedLocations: [],
    allowedViewModes: EDIT_VIEW_MODES,
    allowedVoicePhases: ['listening', 'command-recognized'],
    destructiveness: 'none',
    scope: 'inline',
    reversible: true,
    action: () => dispatchEditorCommand('copy'),
  },
  {
    id: 'meta-cut',
    name: 'Cut',
    examples: ['cut', 'cut this', 'cut selection'],
    bucket: 'edit-selection',
    requiresSelection: true,
    requiresNote: true,
    allowedLocations: [],
    allowedViewModes: EDIT_VIEW_MODES,
    allowedVoicePhases: ['listening', 'command-recognized'],
    destructiveness: 'low',
    scope: 'inline',
    reversible: true,
    action: () => dispatchEditorCommand('cut'),
  },
  {
    id: 'meta-paste',
    name: 'Paste',
    examples: ['paste', 'paste here', 'paste clipboard'],
    bucket: 'edit-selection',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: [],
    allowedViewModes: EDIT_VIEW_MODES,
    allowedVoicePhases: ['listening', 'command-recognized'],
    destructiveness: 'low',
    scope: 'inline',
    reversible: true,
    action: () => dispatchEditorCommand('paste'),
  },

  // Select all
  {
    id: 'meta-select-all',
    name: 'Select all',
    examples: ['select all', 'select everything', 'highlight all'],
    bucket: 'edit-selection',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: [],
    allowedViewModes: EDIT_VIEW_MODES,
    allowedVoicePhases: ['listening', 'command-recognized'],
    destructiveness: 'none',
    scope: 'document',
    reversible: true,
    action: () => dispatchEditorCommand('selectAll'),
  },
];

/**
 * Register all meta commands
 */
export function registerMetaCommands(): void {
  commandRegistry.registerAll(metaCommands);
}

export { metaCommands };
