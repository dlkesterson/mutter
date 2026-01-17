/**
 * Graph Navigation Voice Commands
 *
 * Phase 2: Voice-driven navigation using the knowledge graph.
 *
 * Commands for navigating via note connections:
 * - Go to related note (opens a connected note)
 * - Show connections (displays all links to/from current note)
 * - Open most connected (jumps to the note with most links)
 * - Follow link (navigates to a linked note by name)
 *
 * These commands leverage the CRDT graph data to enable
 * voice-first knowledge exploration that Obsidian can't match.
 */

import type { VoiceCommand } from '@/types/voiceCommand';
import type { VoicePhase } from '@/types/editorContext';
import { commandRegistry } from '../commandRegistry';

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

/**
 * Graph navigation voice commands
 *
 * These commands make Mutter's graph data accessible via voice,
 * enabling hands-free knowledge exploration.
 */
const graphNavigationCommands: VoiceCommand[] = [
  // Navigate to a related note
  {
    id: 'graph-go-to-related',
    name: 'Go to related note',
    examples: [
      'go to related note',
      'open related note',
      'show me a related note',
      'jump to related',
      'open a connected note',
      'go to linked note',
    ],
    bucket: 'navigate',
    requiresSelection: false,
    requiresNote: true, // Need a current note to find related ones
    allowedLocations: [],
    allowedViewModes: ['editor', 'split', 'preview'],
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'vault',
    reversible: true,
    action: () => dispatchEditorCommand('goToRelatedNote'),
  },

  // Show all connections for current note
  {
    id: 'graph-show-connections',
    name: 'Show connections',
    examples: [
      'show connections',
      'show all connections',
      'what connects to this',
      'show linked notes',
      'display connections',
      'show my connections',
      'what links here',
    ],
    bucket: 'navigate',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: [],
    allowedViewModes: ['editor', 'split', 'preview'],
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'document',
    reversible: true,
    action: () => dispatchEditorCommand('showConnections'),
  },

  // Navigate to the most connected note in the vault
  {
    id: 'graph-most-connected',
    name: 'Go to most connected note',
    examples: [
      'open most connected note',
      'go to most connected',
      'show most linked note',
      'open hub note',
      'go to main hub',
      'most connected',
    ],
    bucket: 'navigate',
    requiresSelection: false,
    requiresNote: false, // Can work without a note open
    allowedLocations: [],
    allowedViewModes: [],
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'vault',
    reversible: true,
    action: () => dispatchEditorCommand('goToMostConnected'),
  },

  // Show local graph (connections for current note only)
  {
    id: 'graph-local-view',
    name: 'Show local graph',
    examples: [
      'show local graph',
      'local graph view',
      'graph for this note',
      'connections graph',
      'show neighborhood',
    ],
    bucket: 'navigate',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: [],
    allowedViewModes: ['editor', 'split', 'preview'],
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'document',
    reversible: true,
    action: () => dispatchEditorCommand('showLocalGraph'),
  },

  // Navigate through backlinks one by one
  {
    id: 'graph-next-backlink',
    name: 'Go to next backlink',
    examples: [
      'next backlink',
      'go to next backlink',
      'next linking note',
      'next reference',
      'who else links here',
    ],
    bucket: 'navigate',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: [],
    allowedViewModes: ['editor', 'split', 'preview'],
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'vault',
    reversible: true,
    action: () => dispatchEditorCommand('nextBacklink'),
  },

  // Navigate through outgoing links one by one
  {
    id: 'graph-next-outgoing',
    name: 'Go to next outgoing link',
    examples: [
      'next outgoing link',
      'next link',
      'go to next linked note',
      'follow next link',
      'next mentioned note',
    ],
    bucket: 'navigate',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: [],
    allowedViewModes: ['editor', 'split', 'preview'],
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'vault',
    reversible: true,
    action: () => dispatchEditorCommand('nextOutgoingLink'),
  },

  // Show orphan notes (notes with no connections)
  {
    id: 'graph-show-orphans',
    name: 'Show orphan notes',
    examples: [
      'show orphan notes',
      'find orphans',
      'unlinked notes',
      'show disconnected notes',
      'notes with no links',
    ],
    bucket: 'navigate',
    requiresSelection: false,
    requiresNote: false,
    allowedLocations: [],
    allowedViewModes: [],
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'vault',
    reversible: true,
    action: () => dispatchEditorCommand('showOrphanNotes'),
  },

  // Show connection count for current note
  {
    id: 'graph-connection-count',
    name: 'How many connections',
    examples: [
      'how many connections',
      'connection count',
      'how many links',
      'count connections',
      'how connected is this note',
    ],
    bucket: 'navigate',
    requiresSelection: false,
    requiresNote: true,
    allowedLocations: [],
    allowedViewModes: ['editor', 'split', 'preview'],
    allowedVoicePhases: COMMAND_PHASES,
    destructiveness: 'none',
    scope: 'document',
    reversible: true,
    action: () => dispatchEditorCommand('showConnectionCount'),
  },
];

/**
 * Register all graph navigation commands
 */
export function registerGraphNavigationCommands(): void {
  commandRegistry.registerAll(graphNavigationCommands);
}

export { graphNavigationCommands };
