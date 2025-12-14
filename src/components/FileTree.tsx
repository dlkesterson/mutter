import React, { useState, useRef, useEffect } from 'react';
import { FileNode } from '../types';
import { ChevronRight, ChevronDown, Folder } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileTreeProps {
	nodes: FileNode[];
	onSelect: (path: string) => void;
	onRename?: (path: string, newName: string) => void;
	className?: string;
	activePath?: string | null;
}

const FileTreeNode: React.FC<{
	node: FileNode;
	onSelect: (path: string) => void;
	onRename?: (path: string, newName: string) => void;
	depth?: number;
	activePath?: string | null;
}> = ({ node, onSelect, onRename, depth = 0, activePath }) => {
	const [isOpen, setIsOpen] = useState(false);
	const [isEditing, setIsEditing] = useState(false);
	const [editName, setEditName] = useState(node.name);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (isEditing && inputRef.current) {
			inputRef.current.focus();
			const dotIndex = node.name.lastIndexOf('.');
			if (dotIndex > 0) {
				inputRef.current.setSelectionRange(0, dotIndex);
			} else {
				inputRef.current.select();
			}
		}
	}, [isEditing, node.name]);

	const handleToggle = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (node.is_dir) {
			setIsOpen(!isOpen);
		} else {
			onSelect(node.path);
		}
	};

	const handleContextMenu = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (onRename) {
			setIsEditing(true);
			setEditName(node.name);
		}
	};

	const handleRenameSubmit = () => {
		if (editName && editName !== node.name && onRename) {
			onRename(node.path, editName);
		}
		setIsEditing(false);
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter') {
			handleRenameSubmit();
		} else if (e.key === 'Escape') {
			setIsEditing(false);
			setEditName(node.name);
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
				onContextMenu={handleContextMenu}
			>
				{node.is_dir && (
					<span className='mr-1 text-muted-foreground'>
						{isOpen ? (
							<ChevronDown size={14} />
						) : (
							<ChevronRight size={14} />
						)}
					</span>
				)}

				{node.is_dir && (
					<Folder size={14} className='mr-2 text-blue-400' />
				)}

				{isEditing ? (
					<input
						ref={inputRef}
						type='text'
						value={editName}
						onChange={(e) => setEditName(e.target.value)}
						onBlur={handleRenameSubmit}
						onKeyDown={handleKeyDown}
						onClick={(e) => e.stopPropagation()}
						className='flex-1 bg-background border border-input rounded px-1 h-6 text-sm focus:outline-none focus:ring-1 focus:ring-ring'
					/>
				) : (
					<span className='truncate'>{node.name}</span>
				)}
			</div>

			{isOpen && node.children && (
				<div>
					{node.children.map((child) => (
						<FileTreeNode
							key={child.path}
							node={child}
							onSelect={onSelect}
							onRename={onRename}
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
	onRename,
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
					onRename={onRename}
					activePath={activePath}
				/>
			))}
		</div>
	);
};
