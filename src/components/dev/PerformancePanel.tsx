/**
 * Performance Panel - Development Only
 *
 * Real-time performance monitoring for:
 * - Query execution times
 * - Memory usage
 * - Frame timing
 *
 * Only renders in development mode.
 */

import { useState, useEffect, useCallback } from 'react';
import type { QueryTiming } from '@/query/executor';

interface PerformanceMetrics {
	queryTimes: number[];
	queryTimings: QueryTiming[];
	memoryUsage: number;
	noteCount: number;
}

function avg(arr: number[]): number {
	if (arr.length === 0) return 0;
	return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function max(arr: number[]): number {
	if (arr.length === 0) return 0;
	return Math.max(...arr);
}

export function PerformancePanel() {
	const [metrics, setMetrics] = useState<PerformanceMetrics>({
		queryTimes: [],
		queryTimings: [],
		memoryUsage: 0,
		noteCount: 0,
	});
	const [isExpanded, setIsExpanded] = useState(false);

	// Listen for query execution events
	useEffect(() => {
		const handleQuery = (
			e: CustomEvent<{
				executionTimeMs: number;
				timing: QueryTiming;
				noteCount: number;
			}>,
		) => {
			setMetrics((prev) => ({
				...prev,
				queryTimes: [
					...prev.queryTimes.slice(-19),
					e.detail.executionTimeMs,
				],
				queryTimings: [
					...prev.queryTimings.slice(-19),
					e.detail.timing,
				],
				noteCount: e.detail.noteCount,
			}));
		};

		window.addEventListener(
			'mutter:query-executed',
			handleQuery as EventListener,
		);
		return () => {
			window.removeEventListener(
				'mutter:query-executed',
				handleQuery as EventListener,
			);
		};
	}, []);

	// Memory monitoring
	useEffect(() => {
		const interval = setInterval(() => {
			if ('memory' in performance) {
				setMetrics((prev) => ({
					...prev,
					memoryUsage:
						(performance as any).memory.usedJSHeapSize /
						1024 /
						1024,
				}));
			}
		}, 5000);
		return () => clearInterval(interval);
	}, []);

	const clearMetrics = useCallback(() => {
		setMetrics({
			queryTimes: [],
			queryTimings: [],
			memoryUsage: 0,
			noteCount: 0,
		});
	}, []);

	// Only render in development
	if (import.meta.env.PROD) return null;

	const lastTiming = metrics.queryTimings.at(-1);
	const avgTime = avg(metrics.queryTimes);
	const maxTime = max(metrics.queryTimes);

	return (
		<div className='fixed bottom-4 right-4 z-50'>
			{/* Collapsed view */}
			{!isExpanded && (
				<button
					onClick={() => setIsExpanded(true)}
					className='bg-zinc-800 text-zinc-300 text-xs px-3 py-1.5 rounded-md font-mono hover:bg-zinc-700 border border-zinc-700'
				>
					Perf: {avgTime.toFixed(0)}ms avg
				</button>
			)}

			{/* Expanded view */}
			{isExpanded && (
				<div className='bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl p-4 min-w-70 text-xs font-mono'>
					<div className='flex justify-between items-center mb-3'>
						<h3 className='font-bold text-zinc-200'>
							Performance Metrics
						</h3>
						<div className='flex gap-2'>
							<button
								onClick={clearMetrics}
								className='text-zinc-500 hover:text-zinc-300'
							>
								Clear
							</button>
							<button
								onClick={() => setIsExpanded(false)}
								className='text-zinc-500 hover:text-zinc-300'
							>
								Collapse
							</button>
						</div>
					</div>

					<div className='space-y-2 text-zinc-400'>
						{/* Query Performance */}
						<div className='border-b border-zinc-800 pb-2'>
							<div className='text-zinc-300 font-medium mb-1'>
								Query Execution
							</div>
							<div className='grid grid-cols-2 gap-x-4 gap-y-1'>
								<span>Avg:</span>
								<span
									className={
										avgTime < 100
											? 'text-green-400'
											: 'text-yellow-400'
									}
								>
									{avgTime.toFixed(1)}ms
								</span>
								<span>Max:</span>
								<span
									className={
										maxTime < 100
											? 'text-green-400'
											: 'text-yellow-400'
									}
								>
									{maxTime.toFixed(1)}ms
								</span>
								<span>Last:</span>
								<span>
									{metrics.queryTimes.at(-1)?.toFixed(1) ||
										'-'}
									ms
								</span>
								<span>Samples:</span>
								<span>{metrics.queryTimes.length}</span>
							</div>
						</div>

						{/* Last Query Breakdown */}
						{lastTiming && (
							<div className='border-b border-zinc-800 pb-2'>
								<div className='text-zinc-300 font-medium mb-1'>
									Last Query Breakdown
								</div>
								<div className='grid grid-cols-2 gap-x-4 gap-y-1'>
									<span>Index lookup:</span>
									<span>
										{lastTiming.indexLookupMs.toFixed(2)}ms
									</span>
									<span>Filtering:</span>
									<span>
										{lastTiming.filterMs.toFixed(2)}ms
									</span>
									<span>Sorting:</span>
									<span>
										{lastTiming.sortMs.toFixed(2)}ms
									</span>
									<span>Total:</span>
									<span>
										{lastTiming.totalMs.toFixed(2)}ms
									</span>
									<span>Notes matched:</span>
									<span>{metrics.noteCount}</span>
								</div>
							</div>
						)}

						{/* Memory */}
						<div>
							<div className='text-zinc-300 font-medium mb-1'>
								Memory
							</div>
							<div className='grid grid-cols-2 gap-x-4'>
								<span>JS Heap:</span>
								<span>{metrics.memoryUsage.toFixed(1)}MB</span>
							</div>
						</div>

						{/* Performance Target Legend */}
						<div className='pt-2 border-t border-zinc-800 text-zinc-500'>
							<span className='text-green-400'>Green</span> =
							&lt;100ms target met
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
