import { useState } from 'react';

interface AmbiguityPopoverProps {
	text: string;
	possibleCommand: any;
	confidence: number;
	position: { top: number; left: number };
	onChoose: (choice: 'command' | 'text') => void;
	onDismiss: () => void;
}

export default function AmbiguityPopover({
	text,
	possibleCommand,
	confidence,
	position,
	onChoose,
	onDismiss,
}: AmbiguityPopoverProps) {
	const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

	const getCommandDescription = (command: any): string => {
		if (command.Format) {
			const format = command.Format;
			if (format.Heading) return `Format as Heading ${format.Heading}`;
			if (format.Bold) return 'Make text bold';
			if (format.Italic) return 'Make text italic';
			if (format.Quote) return 'Format as quote';
			if (format.BulletList) return 'Create bullet list';
			if (format.NumberedList) return 'Create numbered list';
			return 'Format text';
		}
		if (command.Editor) {
			return `Editor: ${command.Editor}`;
		}
		if (command.System) {
			return `System: ${JSON.stringify(command.System)}`;
		}
		return 'Execute command';
	};

	const handleKeyPress = (e: React.KeyboardEvent) => {
		if (e.key === '1') {
			onChoose('command');
		} else if (e.key === '2') {
			onChoose('text');
		} else if (e.key === 'Escape') {
			onDismiss();
		}
	};

	return (
		<div
			className='fixed z-50 w-80 bg-popover text-popover-foreground border border-border rounded-lg shadow-lg animate-in fade-in zoom-in-95 duration-200 outline-none'
			style={{ top: position.top, left: position.left }}
			onKeyDown={handleKeyPress}
			tabIndex={0}
			autoFocus
		>
			<div className='flex items-center justify-between px-3 py-2 border-b border-border bg-muted/50 rounded-t-lg'>
				<div className='flex items-center gap-2'>
					<div className='flex items-center justify-center w-5 h-5 rounded-full bg-yellow-500/20 text-yellow-600 text-xs font-bold'>
						?
					</div>
					<span className='text-sm font-medium'>Did you mean:</span>
				</div>
				<span className='text-xs text-muted-foreground font-mono'>
					{Math.round(confidence * 100)}%
				</span>
			</div>
			<div className='p-1'>
				<button
					className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left text-sm transition-colors ${
						selectedIndex === 0
							? 'bg-accent text-accent-foreground'
							: 'hover:bg-muted'
					}`}
					onClick={() => onChoose('command')}
					onMouseEnter={() => setSelectedIndex(0)}
					onMouseLeave={() => setSelectedIndex(null)}
				>
					<kbd className='flex items-center justify-center w-5 h-5 text-xs bg-background border border-border rounded text-muted-foreground font-mono'>
						1
					</kbd>
					<span className='flex-1 truncate'>
						{getCommandDescription(possibleCommand)}
					</span>
				</button>
				<button
					className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left text-sm transition-colors ${
						selectedIndex === 1
							? 'bg-accent text-accent-foreground'
							: 'hover:bg-muted'
					}`}
					onClick={() => onChoose('text')}
					onMouseEnter={() => setSelectedIndex(1)}
					onMouseLeave={() => setSelectedIndex(null)}
				>
					<kbd className='flex items-center justify-center w-5 h-5 text-xs bg-background border border-border rounded text-muted-foreground font-mono'>
						2
					</kbd>
					<span className='flex-1 truncate'>
						Insert text "{text}"
					</span>
				</button>
			</div>
			<div className='px-3 py-1.5 border-t border-border bg-muted/30 text-[10px] text-muted-foreground text-center rounded-b-lg'>
				Press <kbd className='font-mono'>1</kbd> or{' '}
				<kbd className='font-mono'>2</kbd> to choose,{' '}
				<kbd className='font-mono'>Esc</kbd> to dismiss
			</div>
		</div>
	);
}
