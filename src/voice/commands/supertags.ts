/**
 * Supertag Voice Commands
 *
 * Phase 2: Enhanced supertag commands for voice-first metadata management.
 *
 * Commands for supertag operations:
 * - Apply/remove supertags to notes
 * - Query notes by supertag
 * - Update supertag field values
 * - View note's supertags
 * - Manage supertag templates
 *
 * These commands make Tana/AnyType-style typed metadata accessible via voice,
 * enabling hands-free structured note management that Obsidian can't match.
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

/**
 * Open a dialog via custom event
 */
function openDialog(dialog: string, params?: Record<string, unknown>) {
  window.dispatchEvent(
    new CustomEvent('mutter:open-dialog', {
      detail: { dialog, ...params },
    })
  );
}

const supertagCommands: VoiceCommand[] = [
  // ====================================
  // Core Tag Application
  // ====================================
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
    id: 'remove-supertag',
    name: 'Remove tag',
    examples: [
      'remove tag',
      'untag this',
      'remove supertag',
      'remove project tag',
      'delete tag',
    ],
    bucket: 'link-reference',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: ALL_LOCATIONS,
    allowedViewModes: ['editor', 'split'],
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'low',
    scope: 'document',
    reversible: true,
    action: () => dispatchEditorCommand('remove-supertag'),
  },

  // ====================================
  // Tag Queries
  // ====================================
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
    id: 'query-supertag-field',
    name: 'Find notes by field',
    examples: [
      'find tasks with status done',
      'show projects due this week',
      'find meetings with attendee',
      'search by field',
      'filter by status',
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
    action: () => dispatchEditorCommand('query-supertag-field'),
  },

  // ====================================
  // Field Updates (Voice-First Leverage)
  // ====================================
  {
    id: 'set-field-value',
    name: 'Set field value',
    examples: [
      'set status to done',
      'set priority to high',
      'mark as complete',
      'change status to in progress',
      'set due date',
      'update field',
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
    action: () => dispatchEditorCommand('set-supertag-field'),
  },
  {
    id: 'toggle-checkbox-field',
    name: 'Toggle checkbox field',
    examples: [
      'toggle complete',
      'mark complete',
      'unmark complete',
      'check done',
      'uncheck done',
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
    action: () => dispatchEditorCommand('toggle-supertag-checkbox'),
  },

  // ====================================
  // Tag Information
  // ====================================
  {
    id: 'show-note-tags',
    name: 'Show note tags',
    examples: [
      'what tags does this have',
      'show tags',
      'list tags on this note',
      'what supertags',
      'show applied tags',
    ],
    bucket: 'query-ai',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: ALL_LOCATIONS,
    allowedViewModes: ALL_VIEW_MODES,
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'document',
    reversible: false,
    action: () => dispatchEditorCommand('show-note-supertags'),
  },
  {
    id: 'show-tag-fields',
    name: 'Show tag fields',
    examples: [
      'show field values',
      'what are the fields',
      'show tag properties',
      'list field values',
      'show metadata',
    ],
    bucket: 'query-ai',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: ALL_LOCATIONS,
    allowedViewModes: ALL_VIEW_MODES,
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'document',
    reversible: false,
    action: () => dispatchEditorCommand('show-supertag-fields'),
  },

  // ====================================
  // Template Management
  // ====================================
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
    action: () => openDialog('supertag-creator'),
  },
  {
    id: 'list-supertag-templates',
    name: 'List supertag templates',
    examples: [
      'show all supertags',
      'list supertag templates',
      'what supertags exist',
      'show available tags',
      'list tag types',
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
    action: () => dispatchEditorCommand('list-supertag-templates'),
  },
  {
    id: 'edit-supertag-template',
    name: 'Edit supertag template',
    examples: [
      'edit supertag',
      'modify tag template',
      'update supertag definition',
      'change tag fields',
    ],
    bucket: 'meta',
    requiresSelection: false,
    requiresNote: false,
    allowedLocations: ALL_LOCATIONS,
    allowedViewModes: ALL_VIEW_MODES,
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'low',
    scope: 'vault',
    reversible: false,
    action: () => openDialog('supertag-editor'),
  },

  // ====================================
  // Quick Actions (Common Workflows)
  // ====================================
  {
    id: 'quick-tag-project',
    name: 'Quick tag as project',
    examples: [
      'this is a project',
      'make this a project',
      'project note',
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
    action: () => dispatchEditorCommand('quick-tag', { tagName: 'project' }),
  },
  {
    id: 'quick-tag-task',
    name: 'Quick tag as task',
    examples: [
      'this is a task',
      'make this a task',
      'task note',
      'add to tasks',
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
    action: () => dispatchEditorCommand('quick-tag', { tagName: 'task' }),
  },
  {
    id: 'quick-tag-meeting',
    name: 'Quick tag as meeting',
    examples: [
      'this is a meeting',
      'meeting note',
      'mark as meeting',
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
    action: () => dispatchEditorCommand('quick-tag', { tagName: 'meeting' }),
  },
];

/**
 * Register all supertag commands with the registry
 */
export function registerSupertagCommands(): void {
  supertagCommands.forEach((cmd) => commandRegistry.register(cmd));
}

export { supertagCommands };
