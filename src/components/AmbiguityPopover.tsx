import { useState } from 'react';
import './AmbiguityPopover.css';

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
			className='ambiguity-popover'
			style={{ top: position.top, left: position.left }}
			onKeyDown={handleKeyPress}
			tabIndex={0}
			autoFocus
		>
			<div className='ambiguity-header'>
				<span className='ambiguity-icon'>?</span>
				<span className='ambiguity-title'>Did you mean:</span>
				<span className='ambiguity-confidence'>
					{Math.round(confidence * 100)}%
				</span>
			</div>
			<div className='ambiguity-options'>
				<button
					className={`ambiguity-option ${
						selectedIndex === 0 ? 'selected' : ''
					}`}
					onClick={() => onChoose('command')}
					onMouseEnter={() => setSelectedIndex(0)}
					onMouseLeave={() => setSelectedIndex(null)}
				>
					<span className='option-number'>1</span>
					<span className='option-text'>
						{getCommandDescription(possibleCommand)}
					</span>
				</button>
				<button
					className={`ambiguity-option ${
						selectedIndex === 1 ? 'selected' : ''
					}`}
					onClick={() => onChoose('text')}
					onMouseEnter={() => setSelectedIndex(1)}
					onMouseLeave={() => setSelectedIndex(null)}
				>
					<span className='option-number'>2</span>
					<span className='option-text'>Insert text "{text}"</span>
				</button>
			</div>
			<div className='ambiguity-hint'>
				Press <kbd>1</kbd> or <kbd>2</kbd> to choose, <kbd>Esc</kbd> to
				dismiss
			</div>
		</div>
	);
}
