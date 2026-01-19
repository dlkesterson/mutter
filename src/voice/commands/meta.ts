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

  // ====================================
  // Quick Insertions (Phase 2)
  // ====================================
  {
    id: 'meta-insert-date',
    name: 'Insert date',
    examples: [
      'insert date',
      'add date',
      'today',
      "today's date",
      'current date',
      'date stamp',
    ],
    bucket: 'meta',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: [],
    allowedViewModes: EDIT_VIEW_MODES,
    allowedVoicePhases: ['listening', 'command-recognized'],
    destructiveness: 'none',
    scope: 'inline',
    reversible: true,
    action: () => dispatchEditorCommand('insertDate'),
  },
  {
    id: 'meta-insert-time',
    name: 'Insert time',
    examples: [
      'insert time',
      'add time',
      'current time',
      'time stamp',
      'now',
    ],
    bucket: 'meta',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: [],
    allowedViewModes: EDIT_VIEW_MODES,
    allowedVoicePhases: ['listening', 'command-recognized'],
    destructiveness: 'none',
    scope: 'inline',
    reversible: true,
    action: () => dispatchEditorCommand('insertTime'),
  },
  {
    id: 'meta-insert-datetime',
    name: 'Insert date and time',
    examples: [
      'insert date and time',
      'full timestamp',
      'date time stamp',
      'datetime',
      'timestamp',
    ],
    bucket: 'meta',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: [],
    allowedViewModes: EDIT_VIEW_MODES,
    allowedVoicePhases: ['listening', 'command-recognized'],
    destructiveness: 'none',
    scope: 'inline',
    reversible: true,
    action: () => dispatchEditorCommand('insertDateTime'),
  },
  {
    id: 'meta-insert-daily-note-link',
    name: 'Insert daily note link',
    examples: [
      'daily note link',
      'link to today',
      "today's note",
      'daily note',
      'link today',
    ],
    bucket: 'meta',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: [],
    allowedViewModes: EDIT_VIEW_MODES,
    allowedVoicePhases: ['listening', 'command-recognized'],
    destructiveness: 'none',
    scope: 'inline',
    reversible: true,
    action: () => dispatchEditorCommand('insertDailyNoteLink'),
  },

  // ====================================
  // Note Operations (Phase 2)
  // ====================================
  {
    id: 'meta-new-note',
    name: 'New note',
    examples: [
      'new note',
      'create note',
      'create new note',
      'make new note',
      'add note',
    ],
    bucket: 'meta',
    requiresSelection: false,
    requiresNote: false,
    allowedLocations: [],
    allowedViewModes: [],
    allowedVoicePhases: META_PHASES,
    destructiveness: 'none',
    scope: 'vault',
    reversible: false,
    action: () => dispatchEditorCommand('newNote'),
  },
  {
    id: 'meta-delete-note',
    name: 'Delete note',
    examples: [
      'delete note',
      'delete this note',
      'remove note',
      'trash note',
    ],
    bucket: 'meta',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: [],
    allowedViewModes: [],
    allowedVoicePhases: ['listening', 'command-recognized'],
    destructiveness: 'high',
    scope: 'document',
    reversible: false,
    action: () => dispatchEditorCommand('deleteNote'),
  },
  {
    id: 'meta-rename-note',
    name: 'Rename note',
    examples: [
      'rename note',
      'rename this note',
      'change note name',
      'rename file',
    ],
    bucket: 'meta',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: [],
    allowedViewModes: [],
    allowedVoicePhases: ['listening', 'command-recognized'],
    destructiveness: 'low',
    scope: 'document',
    reversible: false,
    action: () => dispatchEditorCommand('renameNote'),
  },
  {
    id: 'meta-move-note',
    name: 'Move note',
    examples: [
      'move note',
      'move this note',
      'move to folder',
      'relocate note',
    ],
    bucket: 'meta',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: [],
    allowedViewModes: [],
    allowedVoicePhases: ['listening', 'command-recognized'],
    destructiveness: 'low',
    scope: 'vault',
    reversible: false,
    action: () => dispatchEditorCommand('moveNote'),
  },
  {
    id: 'meta-duplicate-note',
    name: 'Duplicate note',
    examples: [
      'duplicate note',
      'copy note',
      'clone note',
      'make a copy',
    ],
    bucket: 'meta',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: [],
    allowedViewModes: [],
    allowedVoicePhases: ['listening', 'command-recognized'],
    destructiveness: 'none',
    scope: 'vault',
    reversible: false,
    action: () => dispatchEditorCommand('duplicateNote'),
  },

  // ====================================
  // View Controls (Phase 2)
  // ====================================
  {
    id: 'meta-toggle-sidebar',
    name: 'Toggle sidebar',
    examples: [
      'toggle sidebar',
      'show sidebar',
      'hide sidebar',
      'sidebar',
    ],
    bucket: 'meta',
    requiresSelection: false,
    requiresNote: false,
    allowedLocations: [],
    allowedViewModes: [],
    allowedVoicePhases: META_PHASES,
    destructiveness: 'none',
    scope: 'vault',
    reversible: true,
    action: () => dispatchEditorCommand('toggleSidebar'),
  },
  {
    id: 'meta-toggle-preview',
    name: 'Toggle preview',
    examples: [
      'toggle preview',
      'preview mode',
      'reading mode',
      'view mode',
    ],
    bucket: 'meta',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: [],
    allowedViewModes: [],
    allowedVoicePhases: META_PHASES,
    destructiveness: 'none',
    scope: 'document',
    reversible: true,
    action: () => dispatchEditorCommand('togglePreview'),
  },
  {
    id: 'meta-split-view',
    name: 'Split view',
    examples: [
      'split view',
      'split pane',
      'side by side',
      'dual view',
    ],
    bucket: 'meta',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: [],
    allowedViewModes: [],
    allowedVoicePhases: META_PHASES,
    destructiveness: 'none',
    scope: 'document',
    reversible: true,
    action: () => dispatchEditorCommand('splitView'),
  },
  {
    id: 'meta-focus-mode',
    name: 'Focus mode',
    examples: [
      'focus mode',
      'distraction free',
      'zen mode',
      'full screen',
    ],
    bucket: 'meta',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: [],
    allowedViewModes: [],
    allowedVoicePhases: META_PHASES,
    destructiveness: 'none',
    scope: 'document',
    reversible: true,
    action: () => dispatchEditorCommand('focusMode'),
  },

  // ====================================
  // Help (Phase 2)
  // ====================================
  {
    id: 'meta-show-commands',
    name: 'Show commands',
    examples: [
      'show commands',
      'help',
      'what can I say',
      'voice commands',
      'keyboard shortcuts',
      'show help',
      'list commands',
    ],
    bucket: 'meta',
    requiresSelection: false,
    requiresNote: false,
    allowedLocations: [],
    allowedViewModes: [],
    allowedVoicePhases: META_PHASES,
    destructiveness: 'none',
    scope: 'vault',
    reversible: true,
    action: () => {
      window.dispatchEvent(
        new CustomEvent('mutter:open-dialog', { detail: { dialog: 'commands' } })
      );
    },
  },
];

/**
 * Register all meta commands
 */
export function registerMetaCommands(): void {
  commandRegistry.registerAll(metaCommands);
}

export { metaCommands };
