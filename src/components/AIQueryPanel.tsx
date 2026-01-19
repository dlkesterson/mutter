/**
 * AI Query Panel
 *
 * UI for querying the vault using natural language.
 * Features:
 * - Text input for queries
 * - Index building with progress indicator
 * - Answer display with source citations
 * - Navigation to source notes
 */

import { useState, useEffect, useRef, FormEvent } from 'react';
import { useAIQuery } from '@/hooks/useAIQuery';
import type { LLMSettings } from '@/services/llm-service';

interface AIQueryPanelProps {
	vaultPath: string | null;
	llmSettings: LLMSettings;
	onNavigate: (relPath: string) => void;
}

/**
 * AI Query Panel component
 *
 * Provides a chat-like interface for asking questions about the vault.
 */
export function AIQueryPanel({
	vaultPath,
	llmSettings,
	onNavigate,
}: AIQueryPanelProps) {
	const {
		query,
		buildIndex,
		clearIndex,
		loading,
		result,
		error,
		indexProgress,
		indexSize,
	} = useAIQuery(vaultPath, llmSettings);

	const [input, setInput] = useState('');
	const [elapsedTime, setElapsedTime] = useState(0);
	const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

	// Track elapsed time while loading (and not indexing)
	useEffect(() => {
		if (loading && !indexProgress) {
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
	}, [loading, indexProgress]);

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault();
		if (input.trim() && !loading) {
			query(input.trim());
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			if (input.trim() && !loading) {
				query(input.trim());
			}
		}
	};

	return (
		<div className='ai-query-panel flex flex-col h-full p-4 space-y-4'>
			{/* Header */}
			<div className='flex items-center justify-between'>
				<h3 className='text-sm font-medium'>AI Query</h3>
				<div className='flex items-center gap-2'>
					<span className='text-xs text-muted-foreground'>
						{indexSize > 0
							? `${indexSize} notes indexed`
							: 'Not indexed'}
					</span>
					{indexSize > 0 && (
						<button
							className='text-xs text-muted-foreground hover:text-foreground transition-colors'
							onClick={clearIndex}
							disabled={loading}
							title='Clear index'
						>
							Clear
						</button>
					)}
					<button
						className='text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 border border-border rounded'
						onClick={buildIndex}
						disabled={loading}
					>
						{indexProgress
							? `Indexing ${indexProgress.current}/${indexProgress.total}...`
							: indexSize > 0
								? 'Rebuild'
								: 'Build Index'}
					</button>
				</div>
			</div>

			{/* Query Input */}
			<form onSubmit={handleSubmit} className='space-y-2'>
				<textarea
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder='Ask about your notes...'
					className='w-full px-3 py-2 border border-border bg-background rounded text-sm resize-none min-h-15 focus:outline-none focus:ring-2 focus:ring-ring'
					disabled={loading}
					rows={2}
				/>
				<button
					type='submit'
					disabled={loading || !input.trim() || indexSize === 0}
					className='w-full px-3 py-2 bg-primary text-primary-foreground rounded text-sm font-medium
                     disabled:opacity-50 disabled:cursor-not-allowed
                     hover:bg-primary/90 transition-colors'
				>
					{loading && !indexProgress ? (
						<span className='flex items-center justify-center gap-2'>
							<span className='animate-pulse'>Thinking...</span>
							<span className='font-mono text-xs opacity-75'>
								{(elapsedTime / 1000).toFixed(1)}s
							</span>
						</span>
					) : (
						'Ask'
					)}
				</button>
				{indexSize === 0 && !loading && (
					<p className='text-xs text-muted-foreground text-center'>
						Build the index first to enable queries
					</p>
				)}
			</form>

			{/* Error Display */}
			{error && (
				<div className='p-3 bg-destructive/10 text-destructive text-sm rounded border border-destructive/20'>
					{error}
				</div>
			)}

			{/* Result Display */}
			{result && (
				<div className='space-y-3 flex-1 overflow-auto'>
					{/* Answer */}
					<div className='p-3 bg-muted rounded'>
						<p className='text-sm whitespace-pre-wrap leading-relaxed'>
							{result.answer}
						</p>
						<p className='text-xs text-muted-foreground mt-3 pt-2 border-t border-border'>
							Answered in {result.processingTime}ms
						</p>
					</div>

					{/* Sources */}
					{result.sources.length > 0 && (
						<div>
							<h4 className='text-xs font-medium text-muted-foreground mb-2'>
								Sources ({result.sources.length})
							</h4>
							<ul className='space-y-2'>
								{result.sources.map((source) => (
									<li
										key={source.note.id}
										className='p-2 bg-muted/50 rounded border border-border hover:border-ring transition-colors'
									>
										<button
											className='text-left w-full'
											onClick={() =>
												onNavigate(source.note.relPath)
											}
										>
											<div className='flex items-center justify-between mb-1'>
												<span className='text-sm font-medium text-accent hover:underline'>
													{source.note.title}
												</span>
												<span className='text-xs text-muted-foreground'>
													{Math.round(
														source.relevance * 100,
													)}
													% match
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
			{!result && !error && !loading && indexSize > 0 && (
				<div className='flex-1 flex items-center justify-center'>
					<p className='text-sm text-muted-foreground text-center'>
						Ask a question about your notes
						<br />
						<span className='text-xs'>
							e.g., "Summarize my notes about project X"
						</span>
					</p>
				</div>
			)}
		</div>
	);
}
