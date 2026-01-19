/**
 * SearchPanel Component
 *
 * Unified search panel combining Query DSL and AI Query modes.
 * Features:
 * - Mode toggle between DSL and AI search
 * - Query DSL: structured queries with autocomplete
 * - AI Query: natural language with RAG + LLM
 * - Shared results display
 */

import {
	useState,
	useCallback,
	FormEvent,
	KeyboardEvent,
	useRef,
	useEffect,
} from 'react';
import { useQueryEngine, PRESET_QUERIES } from '@/hooks/useQueryEngine';
import { useAIQuery } from '@/hooks/useAIQuery';
import type { QueryNoteInfo } from '@/query/splitExecutor';
import type { LLMSettings } from '@/services/llm-service';
import { cn } from '@/lib/utils';

type SearchMode = 'query' | 'ai';

interface SearchPanelProps {
	vaultPath: string | null;
	llmSettings: LLMSettings;
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
 * Search Panel component
 */
export function SearchPanel({
	vaultPath,
	llmSettings,
	onNavigate,
}: SearchPanelProps) {
	const [mode, setMode] = useState<SearchMode>('query');

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

	// AI Query state
	const {
		query: aiQuery,
		buildIndex,
		clearIndex,
		loading: aiLoading,
		result: aiResult,
		error: aiError,
		indexProgress,
		indexSize,
	} = useAIQuery(vaultPath, llmSettings);

	const [aiInput, setAiInput] = useState('');
	const [showSuggestions, setShowSuggestions] = useState(false);
	const [showPresets, setShowPresets] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	// Timer for AI query elapsed time
	const [elapsedTime, setElapsedTime] = useState(0);
	const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

	useEffect(() => {
		if (aiLoading && !indexProgress) {
			setElapsedTime(0);
			timerRef.current = setInterval(() => {
				setElapsedTime((prev) => prev + 100);
			}, 100);
		} else {
			if (timerRef.current) {
				clearInterval(timerRef.current);
				timerRef.current = null;
			}
		}
		return () => {
			if (timerRef.current) {
				clearInterval(timerRef.current);
			}
		};
	}, [aiLoading, indexProgress]);

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

	// AI handlers
	const handleAiSubmit = (e: FormEvent) => {
		e.preventDefault();
		if (aiInput.trim() && !aiLoading) {
			aiQuery(aiInput.trim());
		}
	};

	const handleAiKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			if (aiInput.trim() && !aiLoading) {
				aiQuery(aiInput.trim());
			}
		}
	};

	const allSuggestions = [
		...matchingRecentQueries.map((q) => ({
			type: 'recent' as const,
			value: q,
		})),
		...suggestions.map((s) => ({ type: 'suggestion' as const, value: s })),
	].slice(0, 8);

	return (
		<div className='search-panel flex flex-col h-full'>
			{/* Mode Toggle */}
			<div className='flex items-center gap-1 p-2 border-b border-border'>
				<button
					className={cn(
						'flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors',
						mode === 'query'
							? 'bg-accent text-accent-foreground'
							: 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
					)}
					onClick={() => setMode('query')}
				>
					Query DSL
				</button>
				<button
					className={cn(
						'flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors',
						mode === 'ai'
							? 'bg-accent text-accent-foreground'
							: 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
					)}
					onClick={() => setMode('ai')}
				>
					AI Search
				</button>
			</div>

			<div className='flex-1 flex flex-col overflow-hidden p-4 space-y-4'>
				{/* Query DSL Mode */}
				{mode === 'query' && (
					<>
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
								placeholder='type:project status:active ...'
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
											type:project
										</code>{' '}
										— Supertag
									</p>
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
					</>
				)}

				{/* AI Search Mode */}
				{mode === 'ai' && (
					<>
						{/* Header with index status */}
						<div className='flex items-center justify-between'>
							<span className='text-xs text-muted-foreground'>
								{indexSize > 0
									? `${indexSize} notes indexed`
									: 'Not indexed'}
							</span>
							<div className='flex items-center gap-2'>
								{indexSize > 0 && (
									<button
										className='text-xs text-muted-foreground hover:text-foreground transition-colors'
										onClick={clearIndex}
										disabled={aiLoading}
									>
										Clear
									</button>
								)}
								<button
									className='text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 border border-border rounded'
									onClick={buildIndex}
									disabled={aiLoading}
								>
									{indexProgress
										? `${indexProgress.current}/${indexProgress.total}...`
										: indexSize > 0
											? 'Rebuild'
											: 'Build Index'}
								</button>
							</div>
						</div>

						{/* AI Query Input */}
						<form onSubmit={handleAiSubmit} className='space-y-2'>
							<textarea
								ref={textareaRef}
								value={aiInput}
								onChange={(e) => setAiInput(e.target.value)}
								onKeyDown={handleAiKeyDown}
								placeholder='Ask about your notes...'
								className='w-full px-3 py-2 border border-border bg-background rounded text-sm resize-none min-h-15 focus:outline-none focus:ring-2 focus:ring-ring'
								disabled={aiLoading}
								rows={2}
							/>
							<button
								type='submit'
								disabled={
									aiLoading ||
									!aiInput.trim() ||
									indexSize === 0
								}
								className='w-full px-3 py-2 bg-primary text-primary-foreground rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors'
							>
								{aiLoading && !indexProgress ? (
									<span className='flex items-center justify-center gap-2'>
										<span className='animate-pulse'>
											Thinking...
										</span>
										<span className='font-mono text-xs opacity-75'>
											{(elapsedTime / 1000).toFixed(1)}s
										</span>
									</span>
								) : (
									'Ask'
								)}
							</button>
							{indexSize === 0 && !aiLoading && (
								<p className='text-xs text-muted-foreground text-center'>
									Build the index first to enable AI queries
								</p>
							)}
						</form>

						{/* Error Display */}
						{aiError && (
							<div className='p-3 bg-destructive/10 text-destructive text-sm rounded border border-destructive/20'>
								{aiError}
							</div>
						)}

						{/* AI Result Display */}
						{aiResult && (
							<div className='space-y-3 flex-1 overflow-auto'>
								{/* Answer */}
								<div className='p-3 bg-muted rounded'>
									<p className='text-sm whitespace-pre-wrap leading-relaxed'>
										{aiResult.answer}
									</p>
									<p className='text-xs text-muted-foreground mt-3 pt-2 border-t border-border'>
										{aiResult.processingTime}ms
									</p>
								</div>

								{/* Sources */}
								{aiResult.sources.length > 0 && (
									<div>
										<h4 className='text-xs font-medium text-muted-foreground mb-2'>
											Sources ({aiResult.sources.length})
										</h4>
										<ul className='space-y-2'>
											{aiResult.sources.map((source) => (
												<li
													key={source.note.id}
													className='p-2 bg-muted/50 rounded border border-border hover:border-ring transition-colors'
												>
													<button
														className='text-left w-full'
														onClick={() =>
															onNavigate(
																source.note
																	.relPath,
															)
														}
													>
														<div className='flex items-center justify-between mb-1'>
															<span className='text-sm font-medium text-accent hover:underline'>
																{
																	source.note
																		.title
																}
															</span>
															<span className='text-xs text-muted-foreground'>
																{Math.round(
																	source.relevance *
																		100,
																)}
																%
															</span>
														</div>
														<p className='text-xs text-muted-foreground line-clamp-2'>
															{source.excerpt}
														</p>
													</button>
												</li>
											))}
										</ul>
									</div>
								)}
							</div>
						)}

						{/* Empty State */}
						{!aiResult &&
							!aiError &&
							!aiLoading &&
							indexSize > 0 && (
								<div className='flex-1 flex items-center justify-center'>
									<p className='text-sm text-muted-foreground text-center'>
										Ask a question about your notes
										<br />
										<span className='text-xs'>
											e.g., "Summarize my project notes"
										</span>
									</p>
								</div>
							)}
					</>
				)}
			</div>
		</div>
	);
}
