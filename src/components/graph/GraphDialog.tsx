/**
 * GraphDialog Component
 *
 * Fullscreen dialog for exploring the entire vault graph.
 * Includes search, filtering, and statistics.
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { X, Search, Eye, EyeOff } from 'lucide-react';
import { BaseDialog } from '@/components/ui/base-dialog';
import { DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { GraphView } from './GraphView';
import { useFullGraphData } from '@/hooks/useGraphData';
import type { GraphNode } from './types';

interface GraphDialogProps {
	/** Whether dialog is open */
	open: boolean;
	/** Called when dialog should close */
	onOpenChange: (open: boolean) => void;
	/** Called when a node is clicked for navigation */
	onNavigate: (relPath: string) => void;
}

export function GraphDialog({
	open,
	onOpenChange,
	onNavigate,
}: GraphDialogProps) {
	const [showOrphans, setShowOrphans] = useState(true);
	const [searchQuery, setSearchQuery] = useState('');
	const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(
		null,
	);
	const containerRef = useRef<HTMLDivElement>(null);
	const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

	// Get full vault graph
	const { graphData, loading, nodeCount, edgeCount } = useFullGraphData({
		showOrphans,
	});

	// Filter nodes based on search
	const filteredData = useMemo(() => {
		if (!searchQuery.trim()) return graphData;

		const query = searchQuery.toLowerCase();
		const matchingNodeIds = new Set(
			graphData.nodes
				.filter(
					(n) =>
						n.name.toLowerCase().includes(query) ||
						n.relPath.toLowerCase().includes(query),
				)
				.map((n) => n.id),
		);

		// Include nodes that match OR are connected to matching nodes
		const connectedIds = new Set<string>();
		for (const link of graphData.links) {
			const sourceId =
				typeof link.source === 'string' ? link.source : link.source.id;
			const targetId =
				typeof link.target === 'string' ? link.target : link.target.id;

			if (matchingNodeIds.has(sourceId)) connectedIds.add(targetId);
			if (matchingNodeIds.has(targetId)) connectedIds.add(sourceId);
		}

		const visibleIds = new Set([...matchingNodeIds, ...connectedIds]);
		const nodes = graphData.nodes.filter((n) => visibleIds.has(n.id));
		const links = graphData.links.filter((l) => {
			const sourceId =
				typeof l.source === 'string' ? l.source : l.source.id;
			const targetId =
				typeof l.target === 'string' ? l.target : l.target.id;
			return visibleIds.has(sourceId) && visibleIds.has(targetId);
		});

		return { nodes, links };
	}, [graphData, searchQuery]);

	// Update dimensions on resize (debounced to prevent lag during continuous resize)
	useEffect(() => {
		if (!open || !containerRef.current) return;

		let resizeTimeout: ReturnType<typeof setTimeout> | null = null;

		const updateDimensions = () => {
			if (containerRef.current) {
				const { width, height } =
					containerRef.current.getBoundingClientRect();
				setDimensions({ width, height });
			}
		};

		// Initial update after a short delay to ensure layout
		const initialTimer = setTimeout(updateDimensions, 50);

		const handleResize = () => {
			if (resizeTimeout) {
				clearTimeout(resizeTimeout);
			}
			resizeTimeout = setTimeout(updateDimensions, 100);
		};

		const resizeObserver = new ResizeObserver(handleResize);
		resizeObserver.observe(containerRef.current);

		return () => {
			clearTimeout(initialTimer);
			if (resizeTimeout) {
				clearTimeout(resizeTimeout);
			}
			resizeObserver.disconnect();
		};
	}, [open]);

	// Handle node click
	const handleNodeClick = useCallback(
		(node: GraphNode) => {
			onNavigate(node.relPath);
			onOpenChange(false);
		},
		[onNavigate, onOpenChange],
	);

	// Handle node hover for highlighting in search results
	const handleNodeHover = useCallback((node: GraphNode | null) => {
		setHighlightedNodeId(node?.id ?? null);
	}, []);

	// Search results list
	const searchResults = useMemo(() => {
		if (!searchQuery.trim()) return [];
		const query = searchQuery.toLowerCase();
		return graphData.nodes
			.filter(
				(n) =>
					n.name.toLowerCase().includes(query) ||
					n.relPath.toLowerCase().includes(query),
			)
			.slice(0, 10);
	}, [graphData.nodes, searchQuery]);

	// Calculate stats
	const orphanCount = graphData.nodes.filter((n) => n.isOrphan).length;

	// Custom header with toolbar
	const customHeader = (
		<DialogHeader className='p-4 border-b border-border shrink-0'>
			<div className='flex items-center justify-between'>
				<DialogTitle className='text-lg font-medium'>
					Vault Graph
				</DialogTitle>
				<div className='flex items-center gap-4'>
					{/* Stats */}
					<div className='text-xs text-muted-foreground'>
						<span className='text-foreground font-medium'>
							{nodeCount}
						</span>{' '}
						notes ·{' '}
						<span className='text-foreground font-medium'>
							{edgeCount}
						</span>{' '}
						links ·{' '}
						<span className='text-foreground font-medium'>
							{orphanCount}
						</span>{' '}
						orphans
					</div>
				</div>
			</div>

			{/* Toolbar */}
			<div className='flex items-center gap-4 mt-3'>
				{/* Search */}
				<div className='relative flex-1 max-w-sm'>
					<Search
						size={14}
						className='absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground'
					/>
					<input
						type='text'
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						placeholder='Search notes...'
						className='w-full pl-8 pr-3 py-1.5 text-sm bg-muted border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-accent'
					/>
					{searchQuery && (
						<button
							onClick={() => setSearchQuery('')}
							className='absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground'
						>
							<X size={14} />
						</button>
					)}
				</div>

				{/* Filters */}
				<button
					onClick={() => setShowOrphans(!showOrphans)}
					className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded-md border ${
						showOrphans
							? 'bg-accent/20 border-accent text-accent-foreground'
							: 'border-border text-muted-foreground hover:text-foreground'
					}`}
				>
					{showOrphans ? <Eye size={12} /> : <EyeOff size={12} />}
					Orphans
				</button>
			</div>
		</DialogHeader>
	);

	return (
		<BaseDialog
			open={open}
			onOpenChange={onOpenChange}
			title='Vault Graph'
			size='fullscreen'
			customHeader={customHeader}
			noPadding
			flexContent
			className='p-0 gap-0'
		>
			{/* Main content */}
			<div className='flex flex-1 min-h-0 overflow-hidden'>
				{/* Search results sidebar */}
				{searchQuery && searchResults.length > 0 && (
					<div className='w-64 border-r border-border bg-background/50 overflow-auto'>
						<div className='p-2 text-xs text-muted-foreground border-b border-border'>
							{searchResults.length} results
						</div>
						<div className='p-2 space-y-1'>
							{searchResults.map((node) => (
								<button
									key={node.id}
									onClick={() => handleNodeClick(node)}
									onMouseEnter={() =>
										setHighlightedNodeId(node.id)
									}
									onMouseLeave={() =>
										setHighlightedNodeId(null)
									}
									className={`w-full text-left px-2 py-1.5 rounded text-sm truncate ${
										highlightedNodeId === node.id
											? 'bg-accent text-accent-foreground'
											: 'hover:bg-muted'
									}`}
								>
									{node.name}
								</button>
							))}
						</div>
					</div>
				)}

				{/* Graph view */}
				<div ref={containerRef} className='flex-1 min-w-0'>
					{loading ? (
						<div className='flex items-center justify-center h-full text-muted-foreground'>
							<span className='text-sm'>Loading graph...</span>
						</div>
					) : (
						<GraphView
							data={filteredData}
							width={dimensions.width}
							height={dimensions.height}
							activeNodeId={
								filteredData.nodes.find((n) => n.isCurrent)
									?.id ?? null
							}
							callbacks={{
								onNodeClick: handleNodeClick,
								onNodeHover: handleNodeHover,
							}}
							showAllLabels={filteredData.nodes.length <= 50}
						/>
					)}
				</div>
			</div>
		</BaseDialog>
	);
}
