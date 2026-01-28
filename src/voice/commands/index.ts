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
import { registerQueryCommands } from './query';
import { registerGraphNavigationCommands } from './graphNavigation';

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
  registerQueryCommands();
  registerGraphNavigationCommands();

  commandRegistry.markInitialized();
}

// Re-export for convenience
export { commandRegistry } from '../commandRegistry';
export { formattingCommands } from './formatting';
export { navigationCommands } from './navigation';
export { linkingCommands } from './linking';
export { metaCommands } from './meta';
export { queryCommands } from './query';
export { graphNavigationCommands } from './graphNavigation';
