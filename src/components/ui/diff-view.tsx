/**
 * DiffView Component
 *
 * A git-style unified diff view with line numbers and word-level inline highlighting.
 * Shows additions in green and deletions in red.
 */

import { useMemo } from 'react';
import { diffWords } from 'diff';
import { cn } from '@/lib/utils';

interface DiffViewProps {
	original: string;
	modified: string;
	className?: string;
}

/** Simplified change segment for rendering */
interface ChangeSegment {
	value: string;
	added: boolean;
	removed: boolean;
}

interface DiffLine {
	type: 'unchanged' | 'removed' | 'added' | 'modified';
	lineNumber: number | null; // null for added lines in removed context
	originalLineNumber: number | null;
	modifiedLineNumber: number | null;
	content: ChangeSegment[];
}

/**
 * Compute a unified diff view with line numbers and word-level changes
 */
function computeDiffLines(original: string, modified: string): DiffLine[] {
	// Handle edge cases
	if (!original && !modified) return [];
	if (original === modified) {
		return original.split('\n').map((line, i) => ({
			type: 'unchanged',
			lineNumber: i + 1,
			originalLineNumber: i + 1,
			modifiedLineNumber: i + 1,
			content: [{ value: line, added: false, removed: false }],
		}));
	}

	// Get word-level diff
	const changes = diffWords(original, modified);

	// Build line-based structure from word diff
	const lines: DiffLine[] = [];
	let originalLine = 1;
	let modifiedLine = 1;
	let currentLineContent: ChangeSegment[] = [];
	let currentLineType: 'unchanged' | 'removed' | 'added' | 'modified' =
		'unchanged';
	let hasRemoved = false;
	let hasAdded = false;

	const flushLine = () => {
		if (currentLineContent.length === 0) return;

		// Determine line type based on what changes it contains
		if (hasRemoved && hasAdded) {
			currentLineType = 'modified';
		} else if (hasRemoved) {
			currentLineType = 'removed';
		} else if (hasAdded) {
			currentLineType = 'added';
		} else {
			currentLineType = 'unchanged';
		}

		lines.push({
			type: currentLineType,
			lineNumber:
				currentLineType === 'added'
					? modifiedLine
					: currentLineType === 'removed'
						? originalLine
						: originalLine,
			originalLineNumber:
				currentLineType === 'added' ? null : originalLine,
			modifiedLineNumber:
				currentLineType === 'removed' ? null : modifiedLine,
			content: [...currentLineContent],
		});

		// Update line numbers
		if (currentLineType !== 'added') originalLine++;
		if (currentLineType !== 'removed') modifiedLine++;

		// Reset
		currentLineContent = [];
		hasRemoved = false;
		hasAdded = false;
	};

	for (const change of changes) {
		const parts = change.value.split('\n');

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			const isLastPart = i === parts.length - 1;

			if (part.length > 0 || (!isLastPart && parts.length > 1)) {
				currentLineContent.push({
					value: part,
					added: change.added || false,
					removed: change.removed || false,
				});

				if (change.removed) hasRemoved = true;
				if (change.added) hasAdded = true;
			}

			// If this isn't the last part, we hit a newline - flush the line
			if (!isLastPart) {
				flushLine();
			}
		}
	}

	// Flush any remaining content
	if (currentLineContent.length > 0) {
		flushLine();
	}

	return lines;
}

/**
 * Render a single change segment with appropriate styling
 */
function ChangeSegmentView({ change }: { change: ChangeSegment }) {
	if (change.removed) {
		return (
			<span className='bg-red-500/30 text-red-300 line-through'>
				{change.value}
			</span>
		);
	}
	if (change.added) {
		return (
			<span className='bg-green-500/30 text-green-300'>{change.value}</span>
		);
	}
	return <span>{change.value}</span>;
}

/**
 * Render a diff line with line number and content
 */
function DiffLine({ line }: { line: DiffLine }) {
	const lineNumberWidth = 4; // Characters for line number

	// Determine line styling based on type
	let lineClass = '';
	let linePrefix = ' ';
	let lineNumberDisplay = '';

	switch (line.type) {
		case 'removed':
			lineClass = 'bg-red-950/40 text-red-400';
			linePrefix = '-';
			lineNumberDisplay = line.originalLineNumber?.toString() ?? '';
			break;
		case 'added':
			lineClass = 'bg-green-950/40 text-green-400';
			linePrefix = '+';
			lineNumberDisplay = line.modifiedLineNumber?.toString() ?? '';
			break;
		case 'modified':
			// Modified lines show inline changes
			lineClass = 'bg-yellow-950/20';
			linePrefix = '~';
			lineNumberDisplay = line.originalLineNumber?.toString() ?? '';
			break;
		default:
			lineClass = '';
			linePrefix = ' ';
			lineNumberDisplay = line.originalLineNumber?.toString() ?? '';
	}

	return (
		<div className={cn('flex font-mono text-sm', lineClass)}>
			{/* Line number gutter */}
			<div className='shrink-0 w-12 pr-2 text-right text-muted-foreground/60 select-none border-r border-border/50'>
				<span className='text-muted-foreground/80'>{linePrefix}</span>
				{lineNumberDisplay.padStart(lineNumberWidth, ' ')}
			</div>
			{/* Line content */}
			<div className='flex-1 pl-3 whitespace-pre-wrap break-words'>
				{line.content.map((change, i) => (
					<ChangeSegmentView key={i} change={change} />
				))}
				{/* Show empty line indicator */}
				{line.content.length === 0 ||
				(line.content.length === 1 && line.content[0].value === '') ? (
					<span className='text-muted-foreground/30'>↵</span>
				) : null}
			</div>
		</div>
	);
}

export function DiffView({ original, modified, className }: DiffViewProps) {
	const diffLines = useMemo(
		() => computeDiffLines(original, modified),
		[original, modified],
	);

	// Calculate stats
	const stats = useMemo(() => {
		let added = 0;
		let removed = 0;
		for (const line of diffLines) {
			if (line.type === 'added') added++;
			if (line.type === 'removed') removed++;
			if (line.type === 'modified') {
				// Count word-level changes in modified lines
				for (const change of line.content) {
					if (change.added) added++;
					if (change.removed) removed++;
				}
			}
		}
		return { added, removed };
	}, [diffLines]);

	if (diffLines.length === 0) {
		return (
			<div
				className={cn(
					'flex items-center justify-center h-full text-muted-foreground',
					className,
				)}
			>
				No content to compare
			</div>
		);
	}

	// Check if there are any actual changes
	const hasChanges = diffLines.some((line) => line.type !== 'unchanged');

	return (
		<div className={cn('flex flex-col h-full', className)}>
			{/* Stats header */}
			{hasChanges && (
				<div className='flex items-center gap-4 px-3 py-2 text-xs text-muted-foreground border-b border-border/50 shrink-0'>
					{stats.added > 0 && (
						<span className='text-green-400'>
							+{stats.added} addition{stats.added !== 1 ? 's' : ''}
						</span>
					)}
					{stats.removed > 0 && (
						<span className='text-red-400'>
							-{stats.removed} removal
							{stats.removed !== 1 ? 's' : ''}
						</span>
					)}
					{!hasChanges && <span>No changes</span>}
				</div>
			)}

			{/* Diff content */}
			<div className='flex-1 overflow-y-auto bg-muted/30 rounded-lg'>
				{diffLines.map((line, i) => (
					<DiffLine key={i} line={line} />
				))}
			</div>
		</div>
	);
}

export default DiffView;
