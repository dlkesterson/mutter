/**
 * Commands Dialog
 *
 * Shows all available voice commands and keyboard shortcuts in an organized,
 * searchable format. Accessible via the help icon in the right sidebar.
 */

import { useState, useMemo, useEffect } from 'react';
import { BaseDialog } from '@/components/ui/base-dialog';
import { Search, Mic, Keyboard } from 'lucide-react';
import { commandRegistry, registerAllCommands } from '@/voice';
import {
	keyboardShortcuts,
	getShortcutsByCategory,
	categoryLabels as shortcutCategoryLabels,
	formatShortcutKeys,
	type ShortcutCategory,
} from '@/lib/keyboard-shortcuts';
import type { VoiceCommand } from '@/types/voiceCommand';
import type { IntentBucket } from '@/types/editorContext';
import { cn } from '@/lib/utils';

interface CommandsDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

type TabId = 'voice' | 'keyboard';

/**
 * Display labels for voice command categories (IntentBucket).
 */
const voiceCategoryLabels: Record<IntentBucket, string> = {
	'edit-selection': 'Text Editing',
	'format-text': 'Formatting',
	'structure-document': 'Document Structure',
	navigate: 'Navigation',
	'link-reference': 'Links & References',
	'query-ai': 'AI Queries',
	meta: 'App Control',
};

/**
 * Order for displaying voice command categories.
 */
const voiceCategoryOrder: IntentBucket[] = [
	'edit-selection',
	'format-text',
	'structure-document',
	'navigate',
	'link-reference',
	'query-ai',
	'meta',
];

/**
 * Order for displaying keyboard shortcut categories.
 */
const shortcutCategoryOrder: ShortcutCategory[] = [
	'general',
	'formatting',
	'navigation',
	'zoom',
	'voice',
];

export function CommandsDialog({ open, onOpenChange }: CommandsDialogProps) {
	const [activeTab, setActiveTab] = useState<TabId>('voice');
	const [searchQuery, setSearchQuery] = useState('');

	// Ensure commands are registered when dialog opens
	useEffect(() => {
		if (open && !commandRegistry.isInitialized()) {
			registerAllCommands();
		}
	}, [open]);

	// Get all voice commands from registry (re-run when dialog opens)
	const allVoiceCommands = useMemo(() => {
		if (!open) return [];
		return commandRegistry.getAll();
	}, [open]);

	// Group voice commands by bucket
	const voiceCommandsByCategory = useMemo(() => {
		const grouped: Record<IntentBucket, VoiceCommand[]> = {
			'edit-selection': [],
			'format-text': [],
			'structure-document': [],
			navigate: [],
			'link-reference': [],
			'query-ai': [],
			meta: [],
		};

		for (const cmd of allVoiceCommands) {
			grouped[cmd.bucket].push(cmd);
		}

		// Sort commands within each category by name
		for (const bucket of Object.keys(grouped) as IntentBucket[]) {
			grouped[bucket].sort((a, b) => a.name.localeCompare(b.name));
		}

		return grouped;
	}, [allVoiceCommands]);

	// Get keyboard shortcuts by category
	const shortcutsByCategory = useMemo(() => getShortcutsByCategory(), []);

	// Filter voice commands based on search
	const filteredVoiceCommands = useMemo(() => {
		if (!searchQuery.trim()) return voiceCommandsByCategory;

		const query = searchQuery.toLowerCase();
		const filtered: Record<IntentBucket, VoiceCommand[]> = {
			'edit-selection': [],
			'format-text': [],
			'structure-document': [],
			navigate: [],
			'link-reference': [],
			'query-ai': [],
			meta: [],
		};

		for (const cmd of allVoiceCommands) {
			const matchesName = cmd.name.toLowerCase().includes(query);
			const matchesExamples = cmd.examples.some((ex) =>
				ex.toLowerCase().includes(query),
			);

			if (matchesName || matchesExamples) {
				filtered[cmd.bucket].push(cmd);
			}
		}

		return filtered;
	}, [searchQuery, allVoiceCommands, voiceCommandsByCategory]);

	// Filter keyboard shortcuts based on search
	const filteredShortcuts = useMemo(() => {
		if (!searchQuery.trim()) return shortcutsByCategory;

		const query = searchQuery.toLowerCase();
		const filtered: Record<ShortcutCategory, typeof keyboardShortcuts> = {
			general: [],
			formatting: [],
			navigation: [],
			voice: [],
			zoom: [],
		};

		for (const shortcut of keyboardShortcuts) {
			const matchesDescription = shortcut.description
				.toLowerCase()
				.includes(query);
			const matchesKeys = shortcut.keys.toLowerCase().includes(query);

			if (matchesDescription || matchesKeys) {
				filtered[shortcut.category].push(shortcut);
			}
		}

		return filtered;
	}, [searchQuery, shortcutsByCategory]);

	// Detect if running on macOS
	const isMac =
		typeof navigator !== 'undefined' &&
		navigator.platform.toLowerCase().includes('mac');

	// Count total results
	const voiceResultCount = Object.values(filteredVoiceCommands).reduce(
		(sum, cmds) => sum + cmds.length,
		0,
	);
	const shortcutResultCount = Object.values(filteredShortcuts).reduce(
		(sum, shortcuts) => sum + shortcuts.length,
		0,
	);

	return (
		<BaseDialog
			open={open}
			onOpenChange={onOpenChange}
			title='Commands & Shortcuts'
			size='lg'
			height='70vh'
			flexContent
		>
			<div className='flex flex-col h-full'>
				{/* Search input */}
				<div className='relative shrink-0 mb-4'>
					<input
						type='text'
						placeholder='Search commands...'
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className='flex h-10 w-full rounded-md border border-border bg-muted/50 pl-7 pr-4 py-2 text-sm transition-colors placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:bg-background'
						autoFocus
					/>
					<Search className='absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none' />
				</div>

				{/* Tab buttons */}
				<div className='flex gap-2 mb-4 shrink-0'>
					<button
						onClick={() => setActiveTab('voice')}
						className={cn(
							'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
							activeTab === 'voice'
								? 'bg-primary text-primary-foreground'
								: 'bg-muted hover:bg-muted/80 text-muted-foreground',
						)}
					>
						<Mic className='w-4 h-4' />
						Voice Commands
						{searchQuery && (
							<span className='text-xs opacity-75'>
								({voiceResultCount})
							</span>
						)}
					</button>
					<button
						onClick={() => setActiveTab('keyboard')}
						className={cn(
							'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
							activeTab === 'keyboard'
								? 'bg-primary text-primary-foreground'
								: 'bg-muted hover:bg-muted/80 text-muted-foreground',
						)}
					>
						<Keyboard className='w-4 h-4' />
						Keyboard Shortcuts
						{searchQuery && (
							<span className='text-xs opacity-75'>
								({shortcutResultCount})
							</span>
						)}
					</button>
				</div>

				{/* Content area */}
				<div className='flex-1 overflow-y-auto min-h-0'>
					{activeTab === 'voice' ? (
						<VoiceCommandsList
							commandsByCategory={filteredVoiceCommands}
							categoryOrder={voiceCategoryOrder}
							categoryLabels={voiceCategoryLabels}
							searchQuery={searchQuery}
						/>
					) : (
						<KeyboardShortcutsList
							shortcutsByCategory={filteredShortcuts}
							categoryOrder={shortcutCategoryOrder}
							categoryLabels={shortcutCategoryLabels}
							isMac={isMac}
							searchQuery={searchQuery}
						/>
					)}
				</div>
			</div>
		</BaseDialog>
	);
}

interface VoiceCommandsListProps {
	commandsByCategory: Record<IntentBucket, VoiceCommand[]>;
	categoryOrder: IntentBucket[];
	categoryLabels: Record<IntentBucket, string>;
	searchQuery: string;
}

function VoiceCommandsList({
	commandsByCategory,
	categoryOrder,
	categoryLabels,
	searchQuery,
}: VoiceCommandsListProps) {
	const hasResults = Object.values(commandsByCategory).some(
		(cmds) => cmds.length > 0,
	);

	if (!hasResults) {
		return (
			<div className='text-center text-muted-foreground py-8'>
				No voice commands found for "{searchQuery}"
			</div>
		);
	}

	return (
		<div className='space-y-6'>
			{categoryOrder.map((bucket) => {
				const commands = commandsByCategory[bucket];
				if (commands.length === 0) return null;

				return (
					<div key={bucket}>
						<h3 className='text-sm font-semibold text-muted-foreground mb-3 border-b border-border pb-2'>
							{categoryLabels[bucket]}
						</h3>
						<div className='space-y-2'>
							{commands.map((cmd) => (
								<div
									key={cmd.id}
									className='flex items-start justify-between gap-4 py-2 px-3 rounded-md hover:bg-muted/50'
								>
									<div className='flex-1 min-w-0'>
										<div className='font-medium text-sm'>
											{cmd.name}
										</div>
										<div className='text-xs text-muted-foreground mt-0.5 truncate'>
											{cmd.examples
												.slice(0, 3)
												.map((ex, i) => (
													<span key={ex}>
														{i > 0 && ', '}
														<span className='italic'>
															"{ex}"
														</span>
													</span>
												))}
											{cmd.examples.length > 3 && (
												<span className='opacity-75'>
													{' '}
													+{cmd.examples.length -
														3}{' '}
													more
												</span>
											)}
										</div>
									</div>
									{cmd.requiresSelection && (
										<span className='text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground shrink-0'>
											selection
										</span>
									)}
								</div>
							))}
						</div>
					</div>
				);
			})}
		</div>
	);
}

interface KeyboardShortcutsListProps {
	shortcutsByCategory: Record<ShortcutCategory, typeof keyboardShortcuts>;
	categoryOrder: ShortcutCategory[];
	categoryLabels: Record<ShortcutCategory, string>;
	isMac: boolean;
	searchQuery: string;
}

function KeyboardShortcutsList({
	shortcutsByCategory,
	categoryOrder,
	categoryLabels,
	isMac,
	searchQuery,
}: KeyboardShortcutsListProps) {
	const hasResults = Object.values(shortcutsByCategory).some(
		(shortcuts) => shortcuts.length > 0,
	);

	if (!hasResults) {
		return (
			<div className='text-center text-muted-foreground py-8'>
				No keyboard shortcuts found for "{searchQuery}"
			</div>
		);
	}

	return (
		<div className='space-y-6'>
			{categoryOrder.map((category) => {
				const shortcuts = shortcutsByCategory[category];
				if (shortcuts.length === 0) return null;

				return (
					<div key={category}>
						<h3 className='text-sm font-semibold text-muted-foreground mb-3 border-b border-border pb-2'>
							{categoryLabels[category]}
						</h3>
						<div className='space-y-2'>
							{shortcuts.map((shortcut) => (
								<div
									key={shortcut.id}
									className='flex items-center justify-between gap-4 py-2 px-3 rounded-md hover:bg-muted/50'
								>
									<span className='text-sm'>
										{shortcut.description}
									</span>
									<kbd className='px-2 py-1 bg-muted rounded text-xs font-mono shrink-0'>
										{formatShortcutKeys(
											shortcut.keys,
											isMac,
										)}
									</kbd>
								</div>
							))}
						</div>
					</div>
				);
			})}
		</div>
	);
}

export default CommandsDialog;
