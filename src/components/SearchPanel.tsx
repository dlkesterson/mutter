/**
 * SearchPanel Component
 *
 * Search panel using Query DSL for structured queries.
 * Features:
 * - Query DSL: structured queries with autocomplete
 * - Preset queries for common searches
 * - Recent query history
 */

import {
	useState,
	useCallback,
	FormEvent,
	KeyboardEvent,
	useRef,
} from 'react';
import { useQueryEngine, PRESET_QUERIES } from '@/hooks/useQueryEngine';
import type { QueryNoteInfo } from '@/query/splitExecutor';

interface SearchPanelProps {
	onNavigate: (relPath: string) => void;
}

/**
 * Note result item component
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
				<span className='text-sm font-medium group-hover:text-accent transition-colors'>
					{note.title}
				</span>
				<span className='text-xs text-muted-foreground truncate block'>
					{note.relPath}
				</span>
			</button>
		</li>
	);
}

/**
 * Search Panel component
 */
export function SearchPanel({
	onNavigate,
}: SearchPanelProps) {
	// Query DSL state
	const {
		query: dslQuery,
		result: dslResult,
		errors: dslErrors,
		description: dslDescription,
		isExecuting: dslExecuting,
		suggestions,
		matchingRecentQueries,
		recentQueries,
		setQuery: setDslQuery,
		search: dslSearch,
		clear: dslClear,
		removeRecentQuery,
		clearRecentQueries,
	} = useQueryEngine();

	const [showSuggestions, setShowSuggestions] = useState(false);
	const [showPresets, setShowPresets] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	// DSL handlers
	const handleDslSubmit = useCallback(
		(e: FormEvent) => {
			e.preventDefault();
			dslSearch();
			setShowSuggestions(false);
		},
		[dslSearch],
	);

	const handleDslKeyDown = useCallback(
		(e: KeyboardEvent<HTMLInputElement>) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				dslSearch();
				setShowSuggestions(false);
			} else if (e.key === 'Escape') {
				setShowSuggestions(false);
			}
		},
		[dslSearch],
	);

	const handleDslInputChange = useCallback(
		(value: string) => {
			setDslQuery(value);
			setShowSuggestions(true);
		},
		[setDslQuery],
	);

	const handleSuggestionClick = useCallback(
		(suggestion: string) => {
			setDslQuery(suggestion);
			setShowSuggestions(false);
			inputRef.current?.focus();
		},
		[setDslQuery],
	);

	const handlePresetClick = useCallback(
		(presetQuery: string) => {
			setDslQuery(presetQuery);
			dslSearch(presetQuery);
			setShowPresets(false);
		},
		[setDslQuery, dslSearch],
	);

	const allSuggestions = [
		...matchingRecentQueries.map((q) => ({
			type: 'recent' as const,
			value: q,
		})),
		...suggestions.map((s) => ({ type: 'suggestion' as const, value: s })),
	].slice(0, 8);

	return (
		<div className='search-panel flex flex-col h-full'>
			<div className='flex-1 flex flex-col overflow-hidden p-4 space-y-4'>
				{/* Header */}
				<div className='flex items-center justify-between'>
					<div className='flex items-center gap-2'>
						{dslResult && (
							<span className='text-xs text-muted-foreground'>
								{dslResult.totalCount} result
								{dslResult.totalCount !== 1 ? 's' : ''}{' '}
								({dslResult.executionTimeMs.toFixed(1)}
								ms)
							</span>
						)}
					</div>
					<button
						className='text-xs text-muted-foreground hover:text-foreground transition-colors'
						onClick={() => setShowPresets(!showPresets)}
					>
						Presets
					</button>
				</div>

				{/* Preset Queries Dropdown */}
				{showPresets && (
					<div className='bg-muted rounded border border-border p-2 space-y-1'>
						{PRESET_QUERIES.map((preset) => (
							<button
								key={preset.label}
								className='w-full text-left px-2 py-1.5 rounded hover:bg-background transition-colors'
								onClick={() =>
									handlePresetClick(preset.query)
								}
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
				<form onSubmit={handleDslSubmit} className='relative'>
					<input
						ref={inputRef}
						type='text'
						value={dslQuery}
						onChange={(e) =>
							handleDslInputChange(e.target.value)
						}
						onKeyDown={handleDslKeyDown}
						onFocus={() => setShowSuggestions(true)}
						onBlur={() =>
							setTimeout(
								() => setShowSuggestions(false),
								150,
							)
						}
						placeholder='tag:work linked:[[Note]] ...'
						className='w-full px-3 py-2 border border-border bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring'
						disabled={dslExecuting}
					/>

					{dslQuery && (
						<button
							type='button'
							className='absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground'
							onClick={() => dslClear()}
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
										handleSuggestionClick(
											item.value,
										)
									}
								>
									{item.type === 'recent' && (
										<svg
											className='text-muted-foreground flex-shrink-0'
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
									<span className='truncate'>
										{item.value}
									</span>
									{item.type === 'recent' && (
										<button
											className='ml-auto text-muted-foreground hover:text-destructive'
											onClick={(e) => {
												e.stopPropagation();
												removeRecentQuery(
													item.value,
												);
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
				<p className='text-xs text-muted-foreground'>
					{dslDescription}
				</p>

				{/* Errors */}
				{dslErrors.length > 0 && (
					<div className='p-3 bg-destructive/10 text-destructive text-sm rounded border border-destructive/20'>
						{dslErrors.map((error, idx) => (
							<p key={idx}>{error}</p>
						))}
					</div>
				)}

				{/* Results */}
				{dslResult && dslResult.notes.length > 0 && (
					<div className='flex-1 overflow-auto'>
						<ul className='space-y-1'>
							{dslResult.notes.map((note) => (
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
				{dslResult &&
					dslResult.notes.length === 0 &&
					dslQuery && (
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
				{!dslResult && !dslQuery && (
					<div className='flex-1 flex flex-col items-center justify-center space-y-4'>
						<p className='text-sm text-muted-foreground text-center'>
							Search with structured queries
						</p>
						<div className='text-xs text-muted-foreground space-y-1'>
							<p>
								<code className='px-1 py-0.5 bg-muted rounded'>
									tag:work
								</code>{' '}
								— Markdown tag
							</p>
							<p>
								<code className='px-1 py-0.5 bg-muted rounded'>
									linked:[[Note]]
								</code>{' '}
								— Links to
							</p>
						</div>
					</div>
				)}

				{/* Recent Queries Footer */}
				{recentQueries.length > 0 && !dslQuery && (
					<div className='pt-3 border-t border-border'>
						<div className='flex items-center justify-between mb-2'>
							<span className='text-xs font-medium text-muted-foreground'>
								Recent
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
									{q.length > 20
										? q.slice(0, 20) + '…'
										: q}
								</button>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
