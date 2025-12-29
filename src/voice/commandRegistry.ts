/**
 * Voice Command Registry
 *
 * Central registry for all voice commands.
 * Provides methods to:
 * - Register/unregister commands
 * - Query executable commands for a given context
 * - Look up commands by ID
 */

import type { VoiceCommand, CommandId } from '@/types/voiceCommand';
import type { EditorContext } from '@/types/editorContext';

/**
 * Singleton command registry
 * Commands register themselves on module load
 */
class CommandRegistry {
  private commands: Map<CommandId, VoiceCommand> = new Map();
  private initialized = false;

  /**
   * Register a voice command
   * Throws if command with same ID already exists
   */
  register(command: VoiceCommand): void {
    if (this.commands.has(command.id)) {
      console.warn(`[CommandRegistry] Command '${command.id}' already registered, skipping`);
      return;
    }
    this.commands.set(command.id, command);
  }

  /**
   * Register multiple commands at once
   */
  registerAll(commands: VoiceCommand[]): void {
    for (const command of commands) {
      this.register(command);
    }
  }

  /**
   * Unregister a command by ID
   */
  unregister(id: CommandId): boolean {
    return this.commands.delete(id);
  }

  /**
   * Get all registered commands
   */
  getAll(): VoiceCommand[] {
    return Array.from(this.commands.values());
  }

  /**
   * Get a command by ID
   */
  getById(id: CommandId): VoiceCommand | null {
    return this.commands.get(id) ?? null;
  }

  /**
   * Get command count
   */
  get size(): number {
    return this.commands.size;
  }

  /**
   * Filter commands that CAN execute in current context
   * Returns only commands whose requirements are met
   */
  getExecutableCommands(context: EditorContext): VoiceCommand[] {
    return this.getAll().filter((cmd) => this.canExecute(cmd, context));
  }

  /**
   * Check if a command can execute in the given context
   */
  canExecute(command: VoiceCommand, context: EditorContext): boolean {
    // Check if note is required
    if (command.requiresNote && !context.noteId) {
      return false;
    }

    // Check if selection is required
    if (command.requiresSelection) {
      if (
        context.cursor.type !== 'inline-selection' &&
        context.cursor.type !== 'block-selection'
      ) {
        return false;
      }
    }

    // Check allowed cursor locations
    if (
      command.allowedLocations.length > 0 &&
      !command.allowedLocations.includes(context.cursorLocation)
    ) {
      return false;
    }

    // Check allowed view modes
    if (
      command.allowedViewModes.length > 0 &&
      !command.allowedViewModes.includes(context.viewMode)
    ) {
      return false;
    }

    // Check allowed voice phases
    if (
      command.allowedVoicePhases.length > 0 &&
      !command.allowedVoicePhases.includes(context.voicePhase)
    ) {
      return false;
    }

    return true;
  }

  /**
   * Check if the registry has been initialized with commands
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Mark the registry as initialized
   * Called after all command modules have loaded
   */
  markInitialized(): void {
    this.initialized = true;
    console.log(`[CommandRegistry] Initialized with ${this.size} commands`);
  }

  /**
   * Clear all commands (useful for testing)
   */
  clear(): void {
    this.commands.clear();
    this.initialized = false;
  }
}

// Singleton instance
export const commandRegistry = new CommandRegistry();

// Debug helper for development
if (typeof window !== 'undefined') {
  (window as any).__MUTTER_DEBUG__ = (window as any).__MUTTER_DEBUG__ || {};
  (window as any).__MUTTER_DEBUG__.commandRegistry = commandRegistry;
}
