/**
 * Keyboard Shortcuts Registry
 *
 * Centralized registry of all keyboard shortcuts in the application.
 * Used by the Commands & Shortcuts dialog to display available shortcuts.
 */

export type ShortcutCategory = 'general' | 'formatting' | 'navigation' | 'voice' | 'zoom';

export interface KeyboardShortcut {
	id: string;
	keys: string;
	description: string;
	category: ShortcutCategory;
}

/**
 * All keyboard shortcuts in the application.
 * Keys use "Mod" to represent Ctrl on Windows/Linux and Cmd on macOS.
 */
export const keyboardShortcuts: KeyboardShortcut[] = [
	// General
	{
		id: 'command-palette',
		keys: 'Mod+K',
		description: 'Open command palette',
		category: 'general',
	},
	{
		id: 'command-palette-alt',
		keys: 'Mod+P',
		description: 'Open command palette (Obsidian-style)',
		category: 'general',
	},
	{
		id: 'open-file',
		keys: 'Mod+O',
		description: 'Open file (Quick Switcher)',
		category: 'general',
	},
	{
		id: 'new-note',
		keys: 'Mod+N',
		description: 'Create new note',
		category: 'general',
	},
	{
		id: 'close-tab',
		keys: 'Mod+W',
		description: 'Close current tab',
		category: 'general',
	},
	{
		id: 'settings',
		keys: 'Mod+,',
		description: 'Open settings',
		category: 'general',
	},
	{
		id: 'text-cleanup',
		keys: 'Mod+Shift+L',
		description: 'Clean up text (remove fillers)',
		category: 'general',
	},

	// Formatting
	{
		id: 'bold',
		keys: 'Mod+B',
		description: 'Bold',
		category: 'formatting',
	},
	{
		id: 'italic',
		keys: 'Mod+I',
		description: 'Italic',
		category: 'formatting',
	},
	{
		id: 'inline-code',
		keys: 'Mod+`',
		description: 'Inline code',
		category: 'formatting',
	},

	// Navigation
	{
		id: 'undo',
		keys: 'Mod+Z',
		description: 'Undo',
		category: 'navigation',
	},
	{
		id: 'redo',
		keys: 'Mod+Shift+Z',
		description: 'Redo',
		category: 'navigation',
	},

	// Zoom
	{
		id: 'zoom-in',
		keys: 'Mod+=',
		description: 'Zoom in',
		category: 'zoom',
	},
	{
		id: 'zoom-out',
		keys: 'Mod+-',
		description: 'Zoom out',
		category: 'zoom',
	},
	{
		id: 'zoom-reset',
		keys: 'Mod+0',
		description: 'Reset zoom to 100%',
		category: 'zoom',
	},

	// Voice
	{
		id: 'quick-capture',
		keys: 'Mod+Shift+Space',
		description: 'Toggle Quick Capture (global)',
		category: 'voice',
	},
];

/**
 * Get shortcuts grouped by category.
 */
export function getShortcutsByCategory(): Record<ShortcutCategory, KeyboardShortcut[]> {
	const grouped: Record<ShortcutCategory, KeyboardShortcut[]> = {
		general: [],
		formatting: [],
		navigation: [],
		voice: [],
		zoom: [],
	};

	for (const shortcut of keyboardShortcuts) {
		grouped[shortcut.category].push(shortcut);
	}

	return grouped;
}

/**
 * Category display names for the UI.
 */
export const categoryLabels: Record<ShortcutCategory, string> = {
	general: 'General',
	formatting: 'Formatting',
	navigation: 'Navigation',
	voice: 'Voice',
	zoom: 'Zoom',
};

/**
 * Format shortcut keys for display, replacing "Mod" with platform-specific key.
 */
export function formatShortcutKeys(keys: string, isMac: boolean = false): string {
	return keys.replace(/Mod/g, isMac ? '⌘' : 'Ctrl');
}
