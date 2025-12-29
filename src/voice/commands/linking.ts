/**
 * Linking Voice Commands
 *
 * Commands for links and references:
 * - Create wiki links
 * - Insert embeds/transclusions
 * - Show backlinks
 * - Insert external links
 */

import type { VoiceCommand } from '@/types/voiceCommand';
import type { CursorLocation, ViewMode, VoicePhase } from '@/types/editorContext';
import { commandRegistry } from '../commandRegistry';

// Locations where links make sense
const LINK_LOCATIONS: CursorLocation[] = ['paragraph', 'heading', 'list', 'blockquote'];

// View modes for editing
const EDIT_VIEW_MODES: ViewMode[] = ['editor', 'split'];

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

const linkingCommands: VoiceCommand[] = [
  // Wiki links
  {
    id: 'link-wiki-link',
    name: 'Insert wiki link',
    examples: ['link', 'wiki link', 'insert link', 'link to note', 'create link'],
    bucket: 'link-reference',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: LINK_LOCATIONS,
    allowedViewModes: EDIT_VIEW_MODES,
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'inline',
    reversible: true,
    action: () => dispatchEditorCommand('insertWikiLink'),
  },
  {
    id: 'link-selection-as-link',
    name: 'Link selection to note',
    examples: ['link this', 'make this a link', 'link selection', 'turn into link'],
    bucket: 'link-reference',
    requiresSelection: true,
    requiresNote: true,
    allowedLocations: LINK_LOCATIONS,
    allowedViewModes: EDIT_VIEW_MODES,
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'inline',
    reversible: true,
    action: () => dispatchEditorCommand('linkSelection'),
  },

  // Embeds/Transclusions
  {
    id: 'link-embed-note',
    name: 'Embed note',
    examples: ['embed', 'embed note', 'transclude', 'insert embed'],
    bucket: 'link-reference',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: ['paragraph', 'empty'],
    allowedViewModes: EDIT_VIEW_MODES,
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'block',
    reversible: true,
    action: () => dispatchEditorCommand('insertEmbed'),
  },
  {
    id: 'link-embed-block',
    name: 'Embed block',
    examples: ['embed block', 'transclude block', 'embed section'],
    bucket: 'link-reference',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: ['paragraph', 'empty'],
    allowedViewModes: EDIT_VIEW_MODES,
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'block',
    reversible: true,
    action: () => dispatchEditorCommand('insertBlockEmbed'),
  },

  // Backlinks
  {
    id: 'link-show-backlinks',
    name: 'Show backlinks',
    examples: ['show backlinks', 'backlinks', 'what links here', 'incoming links'],
    bucket: 'link-reference',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: [],
    allowedViewModes: [], // Works in any view
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'document',
    reversible: true,
    action: () => dispatchEditorCommand('showBacklinks'),
  },
  {
    id: 'link-show-outgoing',
    name: 'Show outgoing links',
    examples: ['show outgoing links', 'outgoing links', 'links from here', 'show links'],
    bucket: 'link-reference',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: [],
    allowedViewModes: [],
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'document',
    reversible: true,
    action: () => dispatchEditorCommand('showOutgoingLinks'),
  },

  // External links
  {
    id: 'link-external',
    name: 'Insert external link',
    examples: ['external link', 'insert URL', 'add URL', 'web link'],
    bucket: 'link-reference',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: LINK_LOCATIONS,
    allowedViewModes: EDIT_VIEW_MODES,
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'inline',
    reversible: true,
    action: () => dispatchEditorCommand('insertExternalLink'),
  },
  {
    id: 'link-selection-external',
    name: 'Link selection to URL',
    examples: ['link to URL', 'add URL to selection', 'make URL'],
    bucket: 'link-reference',
    requiresSelection: true,
    requiresNote: true,
    allowedLocations: LINK_LOCATIONS,
    allowedViewModes: EDIT_VIEW_MODES,
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'inline',
    reversible: true,
    action: () => dispatchEditorCommand('linkSelectionExternal'),
  },

  // Graph view
  {
    id: 'link-show-graph',
    name: 'Show graph view',
    examples: ['show graph', 'graph view', 'link graph', 'visualize links'],
    bucket: 'link-reference',
    requiresSelection: false,
    requiresNote: false,
    allowedLocations: [],
    allowedViewModes: [],
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'vault',
    reversible: true,
    action: () => dispatchEditorCommand('showGraphView'),
  },
];

/**
 * Register all linking commands
 */
export function registerLinkingCommands(): void {
  commandRegistry.registerAll(linkingCommands);
}

export { linkingCommands };
