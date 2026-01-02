/**
 * Voice Command Coverage Tests
 *
 * Tests that voice commands correctly trigger all feature areas:
 * - Command registration and structure validation
 * - Context-based command filtering
 * - Command scoring and ranking
 * - Event dispatching
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { commandRegistry } from '@/voice/commandRegistry';
import { registerAllCommands } from '@/voice/commands';
import { scoreCommands, explainScore } from '@/voice/commandScorer';
import type { EditorContext } from '@/types/editorContext';
import type { VoiceCommand } from '@/types/voiceCommand';

// Create test context factory
function createContext(overrides: Partial<EditorContext> = {}): EditorContext {
  return {
    cursor: { type: 'no-selection' },
    cursorLocation: 'paragraph',
    currentBlockId: null,
    voicePhase: 'listening',
    recentIntents: [],
    viewMode: 'editor',
    noteId: 'test-note',
    notePath: 'test-note.md',
    hasUnsavedChanges: false,
    ...overrides,
  };
}

describe('Voice Command Coverage', () => {
  beforeEach(() => {
    commandRegistry.clear();
    registerAllCommands();
  });

  afterEach(() => {
    commandRegistry.clear();
  });

  describe('Command Registration', () => {
    it('registers all command categories', () => {
      const commands = commandRegistry.getAll();

      // Should have commands from all categories
      const categories = new Set(commands.map(c => c.bucket));

      expect(categories.has('edit-selection')).toBe(true);
      expect(categories.has('format-text')).toBe(true);
      expect(categories.has('navigate')).toBe(true);
      expect(categories.has('link-reference')).toBe(true);
      expect(categories.has('meta')).toBe(true);
    });

    it('registers a minimum number of commands', () => {
      const count = commandRegistry.size;

      // Should have at least 20 commands (formatting, navigation, etc.)
      expect(count).toBeGreaterThanOrEqual(20);
    });

    it('all commands have required properties', () => {
      const commands = commandRegistry.getAll();

      for (const cmd of commands) {
        expect(cmd.id).toBeDefined();
        expect(cmd.id.length).toBeGreaterThan(0);
        expect(cmd.name).toBeDefined();
        expect(cmd.examples).toBeDefined();
        expect(cmd.examples.length).toBeGreaterThan(0);
        expect(cmd.bucket).toBeDefined();
        expect(typeof cmd.requiresSelection).toBe('boolean');
        expect(typeof cmd.requiresNote).toBe('boolean');
        expect(Array.isArray(cmd.allowedLocations)).toBe(true);
        expect(Array.isArray(cmd.allowedViewModes)).toBe(true);
        expect(Array.isArray(cmd.allowedVoicePhases)).toBe(true);
        expect(['none', 'low', 'medium', 'high']).toContain(cmd.destructiveness);
        expect(['inline', 'block', 'document', 'vault']).toContain(cmd.scope);
        expect(typeof cmd.reversible).toBe('boolean');
        expect(typeof cmd.action).toBe('function');
      }
    });

    it('has no duplicate command IDs', () => {
      const commands = commandRegistry.getAll();
      const ids = commands.map(c => c.id);
      const uniqueIds = new Set(ids);

      expect(ids.length).toBe(uniqueIds.size);
    });

    it('all commands have at least one example phrase', () => {
      const commands = commandRegistry.getAll();

      for (const cmd of commands) {
        expect(cmd.examples.length).toBeGreaterThan(0);
        expect(cmd.examples[0].length).toBeGreaterThan(0);
      }
    });

    it('prevents re-registration of same command', () => {
      const initialCount = commandRegistry.size;

      // Try to register commands again
      registerAllCommands();

      // Count should be the same (no duplicates)
      expect(commandRegistry.size).toBe(initialCount);
    });
  });

  describe('Formatting Commands', () => {
    it('includes bold command', () => {
      const bold = commandRegistry.getById('format-bold');
      expect(bold).not.toBeNull();
      expect(bold?.requiresSelection).toBe(true);
      expect(bold?.examples).toContain('bold');
    });

    it('includes italic command', () => {
      const italic = commandRegistry.getById('format-italic');
      expect(italic).not.toBeNull();
      expect(italic?.requiresSelection).toBe(true);
    });

    it('includes heading commands (1-6)', () => {
      for (let i = 1; i <= 6; i++) {
        const heading = commandRegistry.getById(`format-heading-${i}`);
        expect(heading).not.toBeNull();
        expect(heading?.requiresSelection).toBe(false);
      }
    });

    it('includes quote command', () => {
      const quote = commandRegistry.getById('format-quote');
      expect(quote).not.toBeNull();
      expect(quote?.scope).toBe('block');
    });

    it('includes code block command', () => {
      const codeBlock = commandRegistry.getById('format-code-block');
      expect(codeBlock).not.toBeNull();
    });
  });

  describe('Context-Based Filtering', () => {
    it('filters out commands requiring selection when none exists', () => {
      const context = createContext({
        cursor: { type: 'no-selection' },
      });

      const executable = commandRegistry.getExecutableCommands(context);

      // No selection-required commands should be in the list
      const selectionCommands = executable.filter(c => c.requiresSelection);
      expect(selectionCommands).toHaveLength(0);
    });

    it('includes selection commands when selection exists', () => {
      const context = createContext({
        cursor: { type: 'inline-selection', text: 'selected text', length: 13 },
      });

      const executable = commandRegistry.getExecutableCommands(context);

      // Should include some selection-required commands
      const selectionCommands = executable.filter(c => c.requiresSelection);
      expect(selectionCommands.length).toBeGreaterThan(0);
    });

    it('filters out commands requiring note when none is open', () => {
      const context = createContext({
        noteId: null,
        notePath: null,
      });

      const executable = commandRegistry.getExecutableCommands(context);

      // Note-required commands should be filtered out
      const noteCommands = executable.filter(c => c.requiresNote);
      expect(noteCommands).toHaveLength(0);
    });

    it('includes note commands when note is open', () => {
      const context = createContext({
        noteId: 'test-note',
        notePath: 'test-note.md',
      });

      const executable = commandRegistry.getExecutableCommands(context);

      // Should include some note-required commands
      const noteCommands = executable.filter(c => c.requiresNote);
      expect(noteCommands.length).toBeGreaterThan(0);
    });

    it('filters by cursor location', () => {
      const context = createContext({
        cursorLocation: 'code-block',
      });

      const executable = commandRegistry.getExecutableCommands(context);

      // Commands with specific location requirements should be filtered
      for (const cmd of executable) {
        if (cmd.allowedLocations.length > 0) {
          expect(cmd.allowedLocations).toContain('code-block');
        }
      }
    });

    it('filters by view mode', () => {
      const context = createContext({
        viewMode: 'preview',
      });

      const executable = commandRegistry.getExecutableCommands(context);

      // Commands with specific view mode requirements should be filtered
      for (const cmd of executable) {
        if (cmd.allowedViewModes.length > 0) {
          expect(cmd.allowedViewModes).toContain('preview');
        }
      }
    });

    it('filters by voice phase', () => {
      const context = createContext({
        voicePhase: 'idle',
      });

      const executable = commandRegistry.getExecutableCommands(context);

      // Commands with specific voice phase requirements should be filtered
      for (const cmd of executable) {
        if (cmd.allowedVoicePhases.length > 0) {
          expect(cmd.allowedVoicePhases).toContain('idle');
        }
      }
    });
  });

  describe('Command Scoring', () => {
    it('scores commands and returns sorted list', () => {
      const context = createContext({
        cursor: { type: 'inline-selection', text: 'test', length: 4 },
      });

      const executable = commandRegistry.getExecutableCommands(context);
      const scored = scoreCommands(executable, context);

      // Should be sorted by score descending
      for (let i = 1; i < scored.length; i++) {
        expect(scored[i - 1].score).toBeGreaterThanOrEqual(scored[i].score);
      }
    });

    it('boosts selection commands when text is selected', () => {
      const withSelection = createContext({
        cursor: { type: 'inline-selection', text: 'test', length: 4 },
      });

      // Get bold command scores in both contexts
      const bold = commandRegistry.getById('format-bold');
      if (bold) {
        const [withSelectionScored] = scoreCommands([bold], withSelection);

        // Bold should score high with selection
        expect(withSelectionScored.score).toBeGreaterThan(0.5);
      }
    });

    it('boosts commands matching recent intents', () => {
      const context = createContext({
        cursor: { type: 'inline-selection', text: 'test', length: 4 },
        recentIntents: ['edit-selection', 'edit-selection'],
      });

      const executable = commandRegistry.getExecutableCommands(context);
      const scored = scoreCommands(executable, context);

      // Selection-editing commands should be boosted
      const editSelectionCommands = scored.filter(s => s.command.bucket === 'edit-selection');
      const otherCommands = scored.filter(s => s.command.bucket !== 'edit-selection');

      if (editSelectionCommands.length > 0 && otherCommands.length > 0) {
        // Average score of edit-selection commands should be higher
        const editAvg = editSelectionCommands.reduce((sum, c) => sum + c.score, 0) / editSelectionCommands.length;
        const otherAvg = otherCommands.reduce((sum, c) => sum + c.score, 0) / otherCommands.length;

        expect(editAvg).toBeGreaterThan(otherAvg);
      }
    });

    it('includes score breakdown for debugging', () => {
      const context = createContext({
        cursor: { type: 'inline-selection', text: 'test', length: 4 },
      });

      const bold = commandRegistry.getById('format-bold');
      if (bold) {
        const [scored] = scoreCommands([bold], context);

        expect(scored.breakdown).toBeDefined();
        expect(scored.breakdown.contextRelevance).toBeGreaterThanOrEqual(0);
        expect(scored.breakdown.contextRelevance).toBeLessThanOrEqual(1);
        expect(scored.breakdown.recentIntentMatch).toBeGreaterThanOrEqual(0);
        expect(scored.breakdown.recentIntentMatch).toBeLessThanOrEqual(1);
        expect(scored.breakdown.voicePhaseMatch).toBeGreaterThanOrEqual(0);
        expect(scored.breakdown.voicePhaseMatch).toBeLessThanOrEqual(1);
        expect(scored.breakdown.commandCostWeight).toBeGreaterThanOrEqual(0);
        expect(scored.breakdown.commandCostWeight).toBeLessThanOrEqual(1);
        expect(scored.breakdown.userAffinity).toBeGreaterThanOrEqual(0);
        expect(scored.breakdown.userAffinity).toBeLessThanOrEqual(1);
      }
    });

    it('generates human-readable score explanation', () => {
      const context = createContext({
        cursor: { type: 'inline-selection', text: 'test', length: 4 },
      });

      const bold = commandRegistry.getById('format-bold');
      if (bold) {
        const [scored] = scoreCommands([bold], context);
        const explanation = explainScore(scored);

        expect(explanation).toContain('Score:');
        expect(explanation).toContain('Context:');
        expect(explanation).toContain('Recent:');
        expect(explanation).toContain('Phase:');
        expect(explanation).toContain('Safety:');
        expect(explanation).toContain('Affinity:');
      }
    });

    it('penalizes destructive commands in scoring', () => {
      const context = createContext({
        cursor: { type: 'inline-selection', text: 'test', length: 4 },
      });

      // Create mock commands with different destructiveness
      const safeCommand: VoiceCommand = {
        id: 'test-safe',
        name: 'Safe',
        examples: ['safe'],
        bucket: 'edit-selection',
        requiresSelection: true,
        requiresNote: true,
        allowedLocations: [],
        allowedViewModes: [],
        allowedVoicePhases: [],
        destructiveness: 'none',
        scope: 'inline',
        reversible: true,
        action: () => {},
      };

      const destructiveCommand: VoiceCommand = {
        id: 'test-destructive',
        name: 'Destructive',
        examples: ['destructive'],
        bucket: 'edit-selection',
        requiresSelection: true,
        requiresNote: true,
        allowedLocations: [],
        allowedViewModes: [],
        allowedVoicePhases: [],
        destructiveness: 'high',
        scope: 'inline',
        reversible: false,
        action: () => {},
      };

      const scored = scoreCommands([safeCommand, destructiveCommand], context);

      const safeScore = scored.find(s => s.command.id === 'test-safe');
      const destructiveScore = scored.find(s => s.command.id === 'test-destructive');

      expect(safeScore!.breakdown.commandCostWeight).toBeGreaterThan(
        destructiveScore!.breakdown.commandCostWeight
      );
    });
  });

  describe('Command Event Dispatching', () => {
    it('dispatches mutter:execute-command events', () => {
      const eventHandler = vi.fn();
      window.addEventListener('mutter:execute-command', eventHandler);

      const bold = commandRegistry.getById('format-bold');
      bold?.action();

      expect(eventHandler).toHaveBeenCalled();

      window.removeEventListener('mutter:execute-command', eventHandler);
    });

    it('includes command details in event', () => {
      let eventDetail: any = null;
      const eventHandler = (e: Event) => {
        eventDetail = (e as CustomEvent).detail;
      };

      window.addEventListener('mutter:execute-command', eventHandler);

      const heading = commandRegistry.getById('format-heading-1');
      heading?.action();

      expect(eventDetail).not.toBeNull();
      expect(eventDetail.command).toBe('heading');
      expect(eventDetail.level).toBe(1);

      window.removeEventListener('mutter:execute-command', eventHandler);
    });
  });

  describe('Command Categories Coverage', () => {
    it('has formatting commands', () => {
      const formatting = commandRegistry.getAll().filter(c =>
        c.bucket === 'edit-selection' || c.bucket === 'format-text'
      );
      expect(formatting.length).toBeGreaterThan(0);
    });

    it('has navigation commands', () => {
      const navigation = commandRegistry.getAll().filter(c =>
        c.bucket === 'navigate'
      );
      expect(navigation.length).toBeGreaterThan(0);
    });

    it('has linking commands', () => {
      const linking = commandRegistry.getAll().filter(c =>
        c.bucket === 'link-reference'
      );
      expect(linking.length).toBeGreaterThan(0);
    });

    it('has meta commands', () => {
      const meta = commandRegistry.getAll().filter(c =>
        c.bucket === 'meta'
      );
      expect(meta.length).toBeGreaterThan(0);
    });
  });

  describe('Command Requirements Consistency', () => {
    it('most inline edit-selection commands require selection', () => {
      const inlineCommands = commandRegistry.getAll().filter(c =>
        c.scope === 'inline' && c.bucket === 'edit-selection'
      );

      // Most should require selection (formatting commands)
      const requiresSelectionCount = inlineCommands.filter(c => c.requiresSelection).length;
      expect(requiresSelectionCount / inlineCommands.length).toBeGreaterThanOrEqual(0.5);
    });

    it('block formatting commands work on line level', () => {
      const blockCommands = commandRegistry.getAll().filter(c =>
        c.scope === 'block' && c.bucket === 'format-text'
      );

      for (const cmd of blockCommands) {
        expect(cmd.requiresSelection).toBe(false);
      }
    });

    it('all reversible commands are marked correctly', () => {
      const reversibleCommands = commandRegistry.getAll().filter(c =>
        c.destructiveness === 'none' || c.destructiveness === 'low'
      );

      // Most low-destructiveness commands should be reversible
      const reversibleCount = reversibleCommands.filter(c => c.reversible).length;
      expect(reversibleCount / reversibleCommands.length).toBeGreaterThan(0.5);
    });
  });

  describe('Lookup Operations', () => {
    it('can get command by ID', () => {
      const bold = commandRegistry.getById('format-bold');
      expect(bold).not.toBeNull();
      expect(bold?.id).toBe('format-bold');
    });

    it('returns null for non-existent command', () => {
      const nonExistent = commandRegistry.getById('non-existent-command');
      expect(nonExistent).toBeNull();
    });

    it('can unregister command', () => {
      const id = 'format-bold';
      expect(commandRegistry.getById(id)).not.toBeNull();

      const removed = commandRegistry.unregister(id);
      expect(removed).toBe(true);
      expect(commandRegistry.getById(id)).toBeNull();
    });

    it('returns false when unregistering non-existent command', () => {
      const removed = commandRegistry.unregister('non-existent');
      expect(removed).toBe(false);
    });
  });
});
