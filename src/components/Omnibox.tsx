'use client';

import { useState, useEffect } from 'react';
import { Search, Mic } from 'lucide-react';

interface OmniboxProps {
	onCommand: (command: string, transcription: string) => void;
	onDialogOpen: (type: 'files' | 'voice-log' | 'settings') => void;
	isListening: boolean;
	onToggleListening: () => void;
	onOpenNoteById?: () => void;
	onSetActiveNoteTags?: () => void;
	onConfigureCrdtWebSocket?: () => void;
	onClearCrdtWebSocket?: () => void;
}

const commands = [
	{
		label: 'Make bold',
		description: 'Format selection as bold',
		command: 'bold',
	},
	{
		label: 'Make italic',
		description: 'Format selection as italic',
		command: 'italic',
	},
	{ label: 'Add heading', description: 'Insert heading', command: 'heading' },
	{
		label: 'Insert code',
		description: 'Insert inline code',
		command: 'code',
	},
	{ label: 'Undo', description: 'Undo last action', command: 'undo' },
	{
		label: 'Open file',
		description: 'Navigate to a file',
		command: 'open file',
	},
	{
		label: 'Settings',
		description: 'Open app settings',
		command: 'settings',
	},
];

// Note: Advanced commands (open note by ID, set note tags, CRDT config)
// have been removed from the command palette to avoid exposing internal concepts.
// These features are accessible via Settings or developer tools.

export function Omnibox({
	onCommand,
	onDialogOpen,
	isListening,
	onToggleListening,
	onOpenNoteById,
	onSetActiveNoteTags,
	onConfigureCrdtWebSocket,
	onClearCrdtWebSocket,
}: OmniboxProps) {
	const [open, setOpen] = useState(false);
	const [searchValue, setSearchValue] = useState('');

	useEffect(() => {
		const down = (e: KeyboardEvent) => {
			// Ctrl/Cmd+K or Ctrl/Cmd+P for command palette (P matches Obsidian)
			if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'p')) {
				e.preventDefault();
				setOpen((open) => !open);
				setSearchValue('');
			}
			if (e.key === 'Escape') {
				setOpen(false);
			}
		};

		document.addEventListener('keydown', down);
		return () => document.removeEventListener('keydown', down);
	}, []);

	const handleSelect = (command: string) => {
		if (command === 'settings') {
			onDialogOpen('settings');
		} else if (command === 'open file') {
			onDialogOpen('files');
		} else if (command === 'open note by id') {
			onOpenNoteById?.();
		} else if (command === 'set note tags') {
			onSetActiveNoteTags?.();
		} else if (command === 'configure crdt websocket') {
			onConfigureCrdtWebSocket?.();
		} else if (command === 'clear crdt websocket') {
			onClearCrdtWebSocket?.();
		} else {
			onCommand(command, `Voice command: ${command}`);
		}
		setOpen(false);
		setSearchValue('');
	};

	const startVoiceInput = () => {
		onToggleListening();
		// The actual listening logic is handled by the parent via StreamingTranscription
	};

	const filteredCommands = searchValue
		? commands.filter(
				(cmd) =>
					cmd.label
						.toLowerCase()
						.includes(searchValue.toLowerCase()) ||
					cmd.description
						.toLowerCase()
						.includes(searchValue.toLowerCase())
		  )
		: commands;

	if (!open) {
		return null;
	}

	if (!open) return null;

	return (
		<div
			className='fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-background/80 backdrop-blur-sm transition-all duration-200'
			onClick={() => setOpen(false)}
		>
			<div
				className='w-full max-w-2xl animate-in fade-in zoom-in-95 duration-200'
				onClick={(e) => e.stopPropagation()}
			>
				<div className='bg-background border border-border rounded-xl shadow-2xl overflow-hidden'>
					<div className='flex items-center gap-3 px-4 py-4 border-b border-border bg-muted/30'>
						<Search className='w-5 h-5 text-muted-foreground' />
						<input
							type='text'
							placeholder='Type a command or search...'
							value={searchValue}
							onChange={(e) => setSearchValue(e.target.value)}
							className='flex-1 bg-transparent text-lg text-foreground outline-none placeholder:text-muted-foreground/50'
							autoFocus
						/>
						<button
							onClick={startVoiceInput}
							disabled={isListening}
							className={`p-2 rounded-full transition-all duration-200 ${
								isListening
									? 'bg-red-500/10 text-red-500 animate-pulse'
									: 'hover:bg-muted text-muted-foreground hover:text-foreground'
							}`}
							title='Voice input'
						>
							<Mic className='w-5 h-5' />
						</button>
					</div>

					<div className='max-h-[60vh] overflow-y-auto p-2'>
						{filteredCommands.length === 0 ? (
							<div className='px-4 py-12 text-center text-muted-foreground'>
								No commands found
							</div>
						) : (
							<div className='space-y-1'>
								{filteredCommands.map((cmd) => (
									<button
										key={cmd.command}
										onClick={() =>
											handleSelect(cmd.command)
										}
										className='w-full text-left px-4 py-3 rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors group'
									>
										<div className='flex items-center justify-between'>
											<div className='font-medium text-foreground group-hover:text-accent-foreground'>
												{cmd.label}
											</div>
											<span className='text-xs text-muted-foreground/50 font-mono opacity-0 group-hover:opacity-100 transition-opacity'>
												{cmd.command}
											</span>
										</div>
										<div className='text-sm text-muted-foreground group-hover:text-accent-foreground/80'>
											{cmd.description}
										</div>
									</button>
								))}
							</div>
						)}
					</div>

					<div className='px-4 py-3 border-t border-border bg-muted/30 text-xs text-muted-foreground flex justify-between items-center'>
						<span>
							Press{' '}
							<kbd className='px-1.5 py-0.5 bg-background border border-border rounded text-foreground font-mono'>
								ESC
							</kbd>{' '}
							to close
						</span>
						<span>Mutter Command Palette</span>
					</div>
				</div>
			</div>
		</div>
	);
}
