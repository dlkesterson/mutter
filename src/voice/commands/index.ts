/**
 * Voice Commands Index
 *
 * Registers all built-in commands with the command registry.
 * Import this module to initialize the command system.
 */

import { commandRegistry } from '../commandRegistry';
import { registerFormattingCommands } from './formatting';
import { registerNavigationCommands } from './navigation';
import { registerLinkingCommands } from './linking';
import { registerMetaCommands } from './meta';
import { registerSupertagCommands } from './supertags';
import { registerQueryCommands } from './query';

/**
 * Register all built-in commands
 * Call this once on app startup
 */
export function registerAllCommands(): void {
  if (commandRegistry.isInitialized()) {
    console.log('[Commands] Already initialized, skipping');
    return;
  }

  console.log('[Commands] Registering built-in commands...');

  registerFormattingCommands();
  registerNavigationCommands();
  registerLinkingCommands();
  registerMetaCommands();
  registerSupertagCommands();
  registerQueryCommands();

  commandRegistry.markInitialized();
}

// Re-export for convenience
export { commandRegistry } from '../commandRegistry';
export { formattingCommands } from './formatting';
export { navigationCommands } from './navigation';
export { linkingCommands } from './linking';
export { metaCommands } from './meta';
export { supertagCommands } from './supertags';
export { queryCommands } from './query';
