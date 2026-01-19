/**
 * Outline Panel Component
 *
 * Displays a hierarchical list of headings from the current document
 * for quick navigation. Similar to Obsidian's Outline core plugin.
 */

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { ChevronRight, ChevronDown, List } from 'lucide-react';

export interface HeadingInfo {
	level: number;
	text: string;
	line: number;
	from: number;
}

interface OutlinePanelProps {
	content: string;
	onNavigate: (line: number, from: number) => void;
	className?: string;
}

/**
 * Extract headings from markdown content
 */
function extractHeadings(content: string): HeadingInfo[] {
	const lines = content.split('\n');
	const headings: HeadingInfo[] = [];
	let charPos = 0;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const match = line.match(/^(#{1,6})\s+(.+)$/);

		if (match) {
			headings.push({
				level: match[1].length,
				text: match[2].trim(),
				line: i + 1, // 1-indexed line number
				from: charPos,
			});
		}

		charPos += line.length + 1; // +1 for newline
	}

	return headings;
}

/**
 * Build a tree structure from flat headings list
 */
interface HeadingNode extends HeadingInfo {
	children: HeadingNode[];
	collapsed?: boolean;
}

function buildHeadingTree(headings: HeadingInfo[]): HeadingNode[] {
	const root: HeadingNode[] = [];
	const stack: { level: number; children: HeadingNode[] }[] = [
		{ level: 0, children: root },
	];

	for (const heading of headings) {
		const node: HeadingNode = { ...heading, children: [] };

		// Pop stack until we find a parent with lower level
		while (
			stack.length > 1 &&
			stack[stack.length - 1].level >= heading.level
		) {
			stack.pop();
		}

		// Add to current parent
		stack[stack.length - 1].children.push(node);

		// Push this node as potential parent for future nodes
		stack.push({ level: heading.level, children: node.children });
	}

	return root;
}

interface HeadingItemProps {
	node: HeadingNode;
	depth: number;
	onNavigate: (line: number, from: number) => void;
	collapsedState: Record<number, boolean>;
	onToggleCollapse: (line: number) => void;
}

function HeadingItem({
	node,
	depth,
	onNavigate,
	collapsedState,
	onToggleCollapse,
}: HeadingItemProps) {
	const hasChildren = node.children.length > 0;
	const isCollapsed = collapsedState[node.line] ?? false;

	return (
		<div>
			<div
				className={cn(
					'flex items-center gap-1 py-1 px-2 rounded-sm cursor-pointer',
					'hover:bg-muted/50 transition-colors',
					'text-sm text-muted-foreground hover:text-foreground',
				)}
				style={{ paddingLeft: `${8 + depth * 12}px` }}
				onClick={() => onNavigate(node.line, node.from)}
			>
				{hasChildren ? (
					<button
						onClick={(e) => {
							e.stopPropagation();
							onToggleCollapse(node.line);
						}}
						className='p-0.5 hover:bg-muted rounded-sm shrink-0'
					>
						{isCollapsed ? (
							<ChevronRight size={12} />
						) : (
							<ChevronDown size={12} />
						)}
					</button>
				) : (
					<span className='w-4' /> // Spacer for alignment
				)}
				<span
					className={cn(
						'truncate flex-1',
						node.level === 1 && 'font-semibold',
						node.level === 2 && 'font-medium',
					)}
					title={node.text}
				>
					{node.text}
				</span>
			</div>
			{hasChildren && !isCollapsed && (
				<div>
					{node.children.map((child) => (
						<HeadingItem
							key={`${child.line}-${child.text}`}
							node={child}
							depth={depth + 1}
							onNavigate={onNavigate}
							collapsedState={collapsedState}
							onToggleCollapse={onToggleCollapse}
						/>
					))}
				</div>
			)}
		</div>
	);
}

export function OutlinePanel({
	content,
	onNavigate,
	className,
}: OutlinePanelProps) {
	const [collapsedState, setCollapsedState] = useState<
		Record<number, boolean>
	>({});

	const headings = useMemo(() => extractHeadings(content), [content]);
	const headingTree = useMemo(() => buildHeadingTree(headings), [headings]);

	const toggleCollapse = (line: number) => {
		setCollapsedState((prev) => ({
			...prev,
			[line]: !prev[line],
		}));
	};

	if (headings.length === 0) {
		return (
			<div className={cn('p-4 text-sm text-muted-foreground', className)}>
				<div className='flex items-center gap-2 mb-2'>
					<List size={16} />
					<span className='font-medium'>Outline</span>
				</div>
				<p className='text-xs italic'>No headings in this document</p>
			</div>
		);
	}

	return (
		<div className={cn('flex flex-col', className)}>
			<div className='flex items-center gap-2 px-3 py-2 border-b border-border'>
				<List size={16} className='text-muted-foreground' />
				<span className='text-sm font-medium'>Outline</span>
				<span className='text-xs text-muted-foreground ml-auto'>
					{headings.length} heading{headings.length !== 1 ? 's' : ''}
				</span>
			</div>
			<div className='flex-1 overflow-auto py-1'>
				{headingTree.map((node) => (
					<HeadingItem
						key={`${node.line}-${node.text}`}
						node={node}
						depth={0}
						onNavigate={onNavigate}
						collapsedState={collapsedState}
						onToggleCollapse={toggleCollapse}
					/>
				))}
			</div>
		</div>
	);
}
