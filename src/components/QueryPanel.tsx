/**
 * QueryPanel Component
 *
 * Provides a UI for executing structured queries against the vault.
 * Features:
 * - Query DSL input with autocomplete
 * - Recent query history
 * - Preset queries for common operations
 * - Results list with navigation
 */

import { useState, useCallback, FormEvent, KeyboardEvent, useRef } from 'react';
import { useQueryEngine, PRESET_QUERIES } from '@/hooks/useQueryEngine';
import type { QueryNoteInfo } from '@/query/splitExecutor';

interface QueryPanelProps {
	onNavigate: (relPath: string) => void;
}

/**
 * Format a timestamp as a relative date
 */
function formatRelativeDate(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;
	const seconds = Math.floor(diff / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (days > 0) return `${days}d ago`;
	if (hours > 0) return `${hours}h ago`;
	if (minutes > 0) return `${minutes}m ago`;
	return 'just now';
}

/**
 * Note result item component
 *
 * Uses QueryNoteInfo which is a lightweight type without tags/supertags.
 * This is intentional - the split format avoids loading NoteDocs for query results.
 */
function NoteResultItem({
	note,
	onNavigate,
}: {
	note: QueryNoteInfo;
	onNavigate: (relPath: string) => void;
}) {
	return (
		<li>
			<button
				className='w-full text-left px-3 py-2 rounded hover:bg-muted transition-colors group'
				onClick={() => onNavigate(note.relPath)}
			>
				<div className='flex items-center justify-between'>
					<span className='text-sm font-medium group-hover:text-accent transition-colors'>
						{note.title}
					</span>
					{note.updatedAt && (
						<span className='text-xs text-muted-foreground'>
							{formatRelativeDate(note.updatedAt)}
						</span>
					)}
				</div>
				<span className='text-xs text-muted-foreground truncate block'>
					{note.relPath}
				</span>
			</button>
		</li>
	);
}

/**
 * Query Panel component
 */
export function QueryPanel({ onNavigate }: QueryPanelProps) {
	const {
		query,
		result,
		errors,
		description,
		isExecuting,
		suggestions,
		matchingRecentQueries,
		recentQueries,
		setQuery,
		search,
		clear,
		removeRecentQuery,
		clearRecentQueries,
	} = useQueryEngine();

	const [showSuggestions, setShowSuggestions] = useState(false);
	const [showPresets, setShowPresets] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const handleSubmit = useCallback(
		(e: FormEvent) => {
			e.preventDefault();
			search();
			setShowSuggestions(false);
		},
		[search],
	);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent<HTMLInputElement>) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				search();
				setShowSuggestions(false);
			} else if (e.key === 'Escape') {
				setShowSuggestions(false);
			}
		},
		[search],
	);

	const handleInputChange = useCallback(
		(value: string) => {
			setQuery(value);
			setShowSuggestions(true);
		},
		[setQuery],
	);

	const handleSuggestionClick = useCallback(
		(suggestion: string) => {
			setQuery(suggestion);
			setShowSuggestions(false);
			inputRef.current?.focus();
		},
		[setQuery],
	);

	const handlePresetClick = useCallback(
		(presetQuery: string) => {
			setQuery(presetQuery);
			search(presetQuery);
			setShowPresets(false);
		},
		[setQuery, search],
	);

	const allSuggestions = [
		...matchingRecentQueries.map((q) => ({
			type: 'recent' as const,
			value: q,
		})),
		...suggestions.map((s) => ({ type: 'suggestion' as const, value: s })),
	].slice(0, 8);

	return (
		<div className='query-panel flex flex-col h-full p-4 space-y-4'>
			{/* Header */}
			<div className='flex items-center justify-between'>
				<h3 className='text-sm font-medium'>Query</h3>
				<div className='flex items-center gap-2'>
					{result && (
						<span className='text-xs text-muted-foreground'>
							{result.totalCount} result
							{result.totalCount !== 1 ? 's' : ''} (
							{result.executionTimeMs.toFixed(1)}ms)
						</span>
					)}
					<button
						className='text-xs text-muted-foreground hover:text-foreground transition-colors'
						onClick={() => setShowPresets(!showPresets)}
					>
						Presets
					</button>
				</div>
			</div>

			{/* Preset Queries Dropdown */}
			{showPresets && (
				<div className='bg-muted rounded border border-border p-2 space-y-1'>
					{PRESET_QUERIES.map((preset) => (
						<button
							key={preset.label}
							className='w-full text-left px-2 py-1.5 rounded hover:bg-background transition-colors'
							onClick={() => handlePresetClick(preset.query)}
						>
							<span className='text-sm font-medium'>
								{preset.label}
							</span>
							<span className='text-xs text-muted-foreground block'>
								{preset.description}
							</span>
						</button>
					))}
				</div>
			)}

			{/* Query Input */}
			<form onSubmit={handleSubmit} className='relative'>
				<input
					ref={inputRef}
					type='text'
					value={query}
					onChange={(e) => handleInputChange(e.target.value)}
					onKeyDown={handleKeyDown}
					onFocus={() => setShowSuggestions(true)}
					onBlur={() =>
						setTimeout(() => setShowSuggestions(false), 150)
					}
					placeholder='type:project status:active ...'
					className='w-full px-3 py-2 border border-border bg-background rounded text-sm
                     focus:outline-none focus:ring-2 focus:ring-ring'
					disabled={isExecuting}
				/>

				{/* Clear button */}
				{query && (
					<button
						type='button'
						className='absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground'
						onClick={() => clear()}
					>
						<svg
							width='14'
							height='14'
							viewBox='0 0 14 14'
							fill='none'
							stroke='currentColor'
							strokeWidth='2'
						>
							<path d='M1 1l12 12M13 1L1 13' />
						</svg>
					</button>
				)}

				{/* Suggestions Dropdown */}
				{showSuggestions && allSuggestions.length > 0 && (
					<div className='absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded shadow-lg z-10 overflow-hidden'>
						{allSuggestions.map((item, idx) => (
							<button
								key={`${item.type}-${idx}`}
								className='w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors flex items-center gap-2'
								onMouseDown={() =>
									handleSuggestionClick(item.value)
								}
							>
								{item.type === 'recent' && (
									<svg
										className='text-muted-foreground shrink-0'
										width='12'
										height='12'
										viewBox='0 0 12 12'
										fill='currentColor'
									>
										<circle
											cx='6'
											cy='6'
											r='5'
											fill='none'
											stroke='currentColor'
										/>
										<path
											d='M6 3v3l2 1'
											stroke='currentColor'
											fill='none'
										/>
									</svg>
								)}
								<span className='truncate'>{item.value}</span>
								{item.type === 'recent' && (
									<button
										className='ml-auto text-muted-foreground hover:text-destructive'
										onClick={(e) => {
											e.stopPropagation();
											removeRecentQuery(item.value);
										}}
									>
										×
									</button>
								)}
							</button>
						))}
					</div>
				)}
			</form>

			{/* Query Description */}
			<p className='text-xs text-muted-foreground'>{description}</p>

			{/* Errors */}
			{errors.length > 0 && (
				<div className='p-3 bg-destructive/10 text-destructive text-sm rounded border border-destructive/20'>
					{errors.map((error, idx) => (
						<p key={idx}>{error}</p>
					))}
				</div>
			)}

			{/* Results */}
			{result && result.notes.length > 0 && (
				<div className='flex-1 overflow-auto'>
					<ul className='space-y-1'>
						{result.notes.map((note) => (
							<NoteResultItem
								key={note.id}
								note={note}
								onNavigate={onNavigate}
							/>
						))}
					</ul>
				</div>
			)}

			{/* No Results */}
			{result && result.notes.length === 0 && query && (
				<div className='flex-1 flex items-center justify-center'>
					<p className='text-sm text-muted-foreground text-center'>
						No notes match your query
						<br />
						<span className='text-xs'>
							Try adjusting your search terms
						</span>
					</p>
				</div>
			)}

			{/* Empty State */}
			{!result && !query && (
				<div className='flex-1 flex flex-col items-center justify-center space-y-4'>
					<p className='text-sm text-muted-foreground text-center'>
						Search your vault with structured queries
					</p>
					<div className='text-xs text-muted-foreground space-y-1'>
						<p>
							<code className='px-1 py-0.5 bg-muted rounded'>
								type:project
							</code>{' '}
							— Notes with a supertag
						</p>
						<p>
							<code className='px-1 py-0.5 bg-muted rounded'>
								tag:work
							</code>{' '}
							— Notes with a markdown tag
						</p>
						<p>
							<code className='px-1 py-0.5 bg-muted rounded'>
								linked:[[Note]]
							</code>{' '}
							— Notes linking to Note
						</p>
						<p>
							<code className='px-1 py-0.5 bg-muted rounded'>
								has:supertags
							</code>{' '}
							— Notes with any supertag
						</p>
					</div>
				</div>
			)}

			{/* Recent Queries Footer */}
			{recentQueries.length > 0 && !query && (
				<div className='pt-3 border-t border-border'>
					<div className='flex items-center justify-between mb-2'>
						<span className='text-xs font-medium text-muted-foreground'>
							Recent Queries
						</span>
						<button
							className='text-xs text-muted-foreground hover:text-foreground transition-colors'
							onClick={clearRecentQueries}
						>
							Clear
						</button>
					</div>
					<div className='flex flex-wrap gap-1'>
						{recentQueries.slice(0, 5).map((q) => (
							<button
								key={q}
								className='px-2 py-1 text-xs bg-muted hover:bg-muted/80 rounded transition-colors'
								onClick={() => handlePresetClick(q)}
							>
								{q.length > 25 ? q.slice(0, 25) + '…' : q}
							</button>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
