import React, { useState } from 'react';
import { FileNode } from '../types';
import { ChevronRight, ChevronDown, File, Folder } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileTreeProps {
	nodes: FileNode[];
	onSelect: (path: string) => void;
	className?: string;
	activePath?: string | null;
}

const FileTreeNode: React.FC<{
	node: FileNode;
	onSelect: (path: string) => void;
	depth?: number;
	activePath?: string | null;
}> = ({ node, onSelect, depth = 0, activePath }) => {
	const [isOpen, setIsOpen] = useState(false);

	const handleToggle = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (node.is_dir) {
			setIsOpen(!isOpen);
		} else {
			onSelect(node.path);
		}
	};

	const isActive = activePath === node.path;

	return (
		<div>
			<div
				className={cn(
					'flex items-center py-1 px-2 hover:bg-accent hover:text-accent-foreground cursor-pointer text-sm select-none transition-colors',
					!node.is_dir && 'ml-4',
					isActive && 'bg-accent text-accent-foreground font-medium'
				)}
				style={{ paddingLeft: `${depth * 12 + 8}px` }}
				onClick={handleToggle}
			>
				{node.is_dir ? (
					<span className='mr-1 text-muted-foreground'>
						{isOpen ? (
							<ChevronDown size={14} />
						) : (
							<ChevronRight size={14} />
						)}
					</span>
				) : (
					<File
						size={14}
						className={cn(
							'mr-2 text-muted-foreground',
							isActive && 'text-accent-foreground'
						)}
					/>
				)}

				{node.is_dir && (
					<Folder size={14} className='mr-2 text-blue-400' />
				)}

				<span className='truncate'>{node.name}</span>
			</div>

			{isOpen && node.children && (
				<div>
					{node.children.map((child) => (
						<FileTreeNode
							key={child.path}
							node={child}
							onSelect={onSelect}
							depth={depth + 1}
							activePath={activePath}
						/>
					))}
				</div>
			)}
		</div>
	);
};

export const FileTree: React.FC<FileTreeProps> = ({
	nodes,
	onSelect,
	className,
	activePath,
}) => {
	return (
		<div className={cn('overflow-y-auto', className)}>
			{nodes.map((node) => (
				<FileTreeNode
					key={node.path}
					node={node}
					onSelect={onSelect}
					activePath={activePath}
				/>
			))}
		</div>
	);
};
