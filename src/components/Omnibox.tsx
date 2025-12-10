'use client';

import { useState, useEffect } from 'react';
import { Search, Mic } from 'lucide-react';

interface OmniboxProps {
	onCommand: (command: string, transcription: string) => void;
	onDialogOpen: (type: 'files' | 'voice-log' | 'settings') => void;
	isListening: boolean;
	onToggleListening: () => void;
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

export function Omnibox({
	onCommand,
	onDialogOpen,
	isListening,
	onToggleListening,
}: OmniboxProps) {
	const [open, setOpen] = useState(false);
	const [searchValue, setSearchValue] = useState('');

	useEffect(() => {
		const down = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
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

	return (
		<div
			className='fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/50'
			onClick={() => setOpen(false)}
		>
			<div
				className='w-full max-w-2xl'
				onClick={(e) => e.stopPropagation()}
			>
				<div className='bg-card border border-border rounded-lg shadow-lg'>
					<div className='flex items-center gap-3 px-4 py-3 border-b border-border'>
						<Search className='w-5 h-5 text-muted-foreground' />
						<input
							type='text'
							placeholder='Search commands...'
							value={searchValue}
							onChange={(e) => setSearchValue(e.target.value)}
							className='flex-1 bg-transparent text-foreground outline-none'
							autoFocus
						/>
						<button
							onClick={startVoiceInput}
							disabled={isListening}
							className='p-2 hover:bg-muted rounded transition-colors'
							title='Voice input'
						>
							<Mic
								className={`w-5 h-5 ${
									isListening
										? 'text-blue-500'
										: 'text-muted-foreground'
								}`}
							/>
						</button>
					</div>

					<div className='max-h-96 overflow-y-auto'>
						{filteredCommands.length === 0 ? (
							<div className='px-4 py-8 text-center text-muted-foreground'>
								No commands found
							</div>
						) : (
							<div className='p-2'>
								{filteredCommands.map((cmd) => (
									<button
										key={cmd.command}
										onClick={() =>
											handleSelect(cmd.command)
										}
										className='w-full text-left px-3 py-2 rounded hover:bg-muted transition-colors mb-1 last:mb-0'
									>
										<div className='font-medium text-foreground'>
											{cmd.label}
										</div>
										<div className='text-sm text-muted-foreground'>
											{cmd.description}
										</div>
									</button>
								))}
							</div>
						)}
					</div>

					<div className='px-4 py-2 border-t border-border text-xs text-muted-foreground'>
						Press{' '}
						<kbd className='px-1.5 py-0.5 bg-muted rounded text-foreground'>
							ESC
						</kbd>{' '}
						to close
					</div>
				</div>
			</div>
		</div>
	);
}
