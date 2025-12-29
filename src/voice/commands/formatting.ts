/**
 * Formatting Voice Commands
 *
 * Commands for text formatting:
 * - Bold, italic, strikethrough, code
 * - Headings (1-6)
 * - Quote, code block
 */

import type { VoiceCommand } from '@/types/voiceCommand';
import type { CursorLocation, ViewMode, VoicePhase } from '@/types/editorContext';
import { commandRegistry } from '../commandRegistry';

// Common allowed locations for text formatting
const TEXT_LOCATIONS: CursorLocation[] = ['paragraph', 'heading', 'list', 'blockquote'];

// Common allowed view modes (not preview-only)
const EDIT_VIEW_MODES: ViewMode[] = ['editor', 'split'];

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

const formattingCommands: VoiceCommand[] = [
  // Inline formatting (requires selection)
  {
    id: 'format-bold',
    name: 'Bold selection',
    examples: ['bold', 'make bold', 'bold this', 'make it bold'],
    bucket: 'edit-selection',
    requiresSelection: true,
    requiresNote: true,
    allowedLocations: TEXT_LOCATIONS,
    allowedViewModes: EDIT_VIEW_MODES,
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'inline',
    reversible: true,
    action: () => dispatchEditorCommand('bold'),
  },
  {
    id: 'format-italic',
    name: 'Italicize selection',
    examples: ['italic', 'italicize', 'make italic', 'emphasize'],
    bucket: 'edit-selection',
    requiresSelection: true,
    requiresNote: true,
    allowedLocations: TEXT_LOCATIONS,
    allowedViewModes: EDIT_VIEW_MODES,
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'inline',
    reversible: true,
    action: () => dispatchEditorCommand('italic'),
  },
  {
    id: 'format-strikethrough',
    name: 'Strikethrough',
    examples: ['strikethrough', 'strike through', 'cross out', 'strike'],
    bucket: 'edit-selection',
    requiresSelection: true,
    requiresNote: true,
    allowedLocations: TEXT_LOCATIONS,
    allowedViewModes: EDIT_VIEW_MODES,
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'inline',
    reversible: true,
    action: () => dispatchEditorCommand('strikethrough'),
  },
  {
    id: 'format-code-inline',
    name: 'Inline code',
    examples: ['code', 'inline code', 'make code', 'monospace'],
    bucket: 'edit-selection',
    requiresSelection: true,
    requiresNote: true,
    allowedLocations: TEXT_LOCATIONS,
    allowedViewModes: EDIT_VIEW_MODES,
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'inline',
    reversible: true,
    action: () => dispatchEditorCommand('code'),
  },

  // Heading commands (work on current line)
  {
    id: 'format-heading-1',
    name: 'Heading 1',
    examples: ['heading 1', 'h1', 'make heading 1', 'title'],
    bucket: 'format-text',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: ['paragraph', 'heading', 'empty'],
    allowedViewModes: EDIT_VIEW_MODES,
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'block',
    reversible: true,
    action: () => dispatchEditorCommand('heading', { level: 1 }),
  },
  {
    id: 'format-heading-2',
    name: 'Heading 2',
    examples: ['heading 2', 'h2', 'make heading 2', 'section'],
    bucket: 'format-text',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: ['paragraph', 'heading', 'empty'],
    allowedViewModes: EDIT_VIEW_MODES,
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'block',
    reversible: true,
    action: () => dispatchEditorCommand('heading', { level: 2 }),
  },
  {
    id: 'format-heading-3',
    name: 'Heading 3',
    examples: ['heading 3', 'h3', 'make heading 3', 'subsection'],
    bucket: 'format-text',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: ['paragraph', 'heading', 'empty'],
    allowedViewModes: EDIT_VIEW_MODES,
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'block',
    reversible: true,
    action: () => dispatchEditorCommand('heading', { level: 3 }),
  },
  {
    id: 'format-heading-4',
    name: 'Heading 4',
    examples: ['heading 4', 'h4', 'make heading 4'],
    bucket: 'format-text',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: ['paragraph', 'heading', 'empty'],
    allowedViewModes: EDIT_VIEW_MODES,
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'block',
    reversible: true,
    action: () => dispatchEditorCommand('heading', { level: 4 }),
  },
  {
    id: 'format-heading-5',
    name: 'Heading 5',
    examples: ['heading 5', 'h5', 'make heading 5'],
    bucket: 'format-text',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: ['paragraph', 'heading', 'empty'],
    allowedViewModes: EDIT_VIEW_MODES,
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'block',
    reversible: true,
    action: () => dispatchEditorCommand('heading', { level: 5 }),
  },
  {
    id: 'format-heading-6',
    name: 'Heading 6',
    examples: ['heading 6', 'h6', 'make heading 6'],
    bucket: 'format-text',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: ['paragraph', 'heading', 'empty'],
    allowedViewModes: EDIT_VIEW_MODES,
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'block',
    reversible: true,
    action: () => dispatchEditorCommand('heading', { level: 6 }),
  },

  // Block formatting
  {
    id: 'format-quote',
    name: 'Block quote',
    examples: ['quote', 'block quote', 'make quote', 'quotation'],
    bucket: 'format-text',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: ['paragraph', 'heading', 'list', 'empty'],
    allowedViewModes: EDIT_VIEW_MODES,
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'block',
    reversible: true,
    action: () => dispatchEditorCommand('quote'),
  },
  {
    id: 'format-code-block',
    name: 'Code block',
    examples: ['code block', 'code fence', 'fenced code', 'make code block'],
    bucket: 'format-text',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: ['paragraph', 'empty'],
    allowedViewModes: EDIT_VIEW_MODES,
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'block',
    reversible: true,
    action: () => dispatchEditorCommand('codeBlock'),
  },
];

/**
 * Register all formatting commands
 */
export function registerFormattingCommands(): void {
  commandRegistry.registerAll(formattingCommands);
}

export { formattingCommands };
