import React, { useState, useRef, useEffect } from 'react';
import { FileNode } from '../types';
import { ChevronRight, ChevronDown, Folder, File } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ContextMenu, useContextMenu, contextMenuIcons } from './ContextMenu';
import { invoke } from '@tauri-apps/api/core';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';

interface FileTreeProps {
	nodes: FileNode[];
	onSelect: (path: string, permanent?: boolean) => void;
	onRename?: (path: string, newName: string) => void;
	onFileTreeUpdate?: () => void;
	className?: string;
	activePath?: string | null;
}

interface FileTreeNodeProps {
	node: FileNode;
	onSelect: (path: string, permanent?: boolean) => void;
	onRename?: (path: string, newName: string) => void;
	onFileTreeUpdate?: () => void;
	depth?: number;
	activePath?: string | null;
	expandedFolders: Set<string>;
	onToggleFolder: (path: string) => void;
	onShowContextMenu: (event: React.MouseEvent, node: FileNode) => void;
	editingPath: string | null;
	onEditComplete: () => void;
}

const FileTreeNode: React.FC<FileTreeNodeProps> = ({
	node,
	onSelect,
	onRename,
	onFileTreeUpdate,
	depth = 0,
	activePath,
	expandedFolders,
	onToggleFolder,
	onShowContextMenu,
	editingPath,
	onEditComplete,
}) => {
	const [editName, setEditName] = useState(node.name);
	const [isDragOver, setIsDragOver] = useState(false);
	const [isDragging, setIsDragging] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const nodeRef = useRef<HTMLDivElement>(null);

	const isOpen = expandedFolders.has(node.path);
	const isEditing = editingPath === node.path;

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
			onToggleFolder(node.path);
		} else {
			onSelect(node.path, false);
		}
	};

	const handleDoubleClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (!node.is_dir) {
			onSelect(node.path, true);
		}
	};

	const handleContextMenu = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		onShowContextMenu(e, node);
	};

	const handleRenameSubmit = () => {
		if (editName && editName !== node.name && onRename) {
			onRename(node.path, editName);
		}
		onEditComplete();
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter') {
			handleRenameSubmit();
		} else if (e.key === 'Escape') {
			onEditComplete();
			setEditName(node.name);
		}
	};

	// Drag and Drop handlers
	const handleDragStart = (e: React.DragEvent) => {
		e.stopPropagation();
		setIsDragging(true);
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('application/json', JSON.stringify({ path: node.path }));
	};

	const handleDragEnd = (e: React.DragEvent) => {
		e.stopPropagation();
		setIsDragging(false);
	};

	const handleDragOver = (e: React.DragEvent) => {
		if (!node.is_dir) return;
		e.preventDefault();
		e.stopPropagation();
		e.dataTransfer.dropEffect = 'move';
		setIsDragOver(true);
	};

	const handleDragLeave = (e: React.DragEvent) => {
		e.stopPropagation();
		setIsDragOver(false);
	};

	const handleDrop = async (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragOver(false);

		if (!node.is_dir) return;

		try {
			const data = JSON.parse(e.dataTransfer.getData('application/json'));
			const sourcePath = data.path;

			// Prevent dropping a folder into itself
			if (sourcePath === node.path || node.path.startsWith(sourcePath + '/')) {
				return;
			}

			await invoke('move_file', {
				oldPath: sourcePath,
				newParentPath: node.path,
			});

			onFileTreeUpdate?.();
		} catch (error) {
			console.error('Failed to move file:', error);
		}
	};

	const isActive = activePath === node.path;

	return (
		<div>
			<div
				ref={nodeRef}
				draggable={!isEditing}
				onDragStart={handleDragStart}
				onDragEnd={handleDragEnd}
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
				className={cn(
					'flex items-center py-1 px-2 hover:bg-accent hover:text-accent-foreground cursor-pointer text-sm select-none transition-colors rounded-sm',
					isActive && 'bg-accent text-accent-foreground font-medium',
					isDragOver && 'bg-primary/20 border-2 border-primary border-dashed',
					isDragging && 'opacity-50'
				)}
				style={{ paddingLeft: `${depth * 12 + 8}px` }}
				onClick={handleToggle}
				onDoubleClick={handleDoubleClick}
				onContextMenu={handleContextMenu}
			>
				{node.is_dir && (
					<span className='mr-1 text-muted-foreground shrink-0'>
						<ChevronRight
							size={14}
							className={cn(
								'transition-transform duration-150',
								isOpen && 'rotate-90'
							)}
						/>
					</span>
				)}

				{node.is_dir ? (
					<Folder size={14} className='mr-2 text-blue-400 shrink-0' />
				) : (
					<File size={14} className='mr-2 text-muted-foreground shrink-0' />
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
				<div className='animate-in fade-in slide-in-from-top-1 duration-200'>
					{node.children.map((child) => (
						<FileTreeNode
							key={child.path}
							node={child}
							onSelect={onSelect}
							onRename={onRename}
							onFileTreeUpdate={onFileTreeUpdate}
							depth={depth + 1}
							activePath={activePath}
							expandedFolders={expandedFolders}
							onToggleFolder={onToggleFolder}
							onShowContextMenu={onShowContextMenu}
							editingPath={editingPath}
							onEditComplete={onEditComplete}
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
	onFileTreeUpdate,
	className,
	activePath,
}) => {
	const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
	const [editingPath, setEditingPath] = useState<string | null>(null);
	const { contextMenu, showContextMenu, hideContextMenu } = useContextMenu();

	const handleToggleFolder = (path: string) => {
		setExpandedFolders((prev) => {
			const next = new Set(prev);
			if (next.has(path)) {
				next.delete(path);
			} else {
				next.add(path);
			}
			return next;
		});
	};

	const handleShowContextMenu = (event: React.MouseEvent, node: FileNode) => {
		const items = [
			{
				label: 'Rename',
				icon: contextMenuIcons.rename,
				onClick: () => {
					setEditingPath(node.path);
				},
			},
			{
				label: 'Duplicate',
				icon: contextMenuIcons.duplicate,
				onClick: async () => {
					try {
						await invoke('duplicate_file', { path: node.path });
						onFileTreeUpdate?.();
					} catch (error) {
						console.error('Failed to duplicate:', error);
					}
				},
			},
			{
				label: 'Copy Path',
				icon: contextMenuIcons.copyPath,
				onClick: async () => {
					try {
						await writeText(node.path);
					} catch (error) {
						console.error('Failed to copy path:', error);
					}
				},
			},
			{
				separator: true,
				label: '',
				onClick: () => {},
			},
			{
				label: 'Open in File Explorer',
				icon: contextMenuIcons.openInSystem,
				onClick: async () => {
					try {
						await invoke('open_in_system', { path: node.path });
					} catch (error) {
						console.error('Failed to open in system:', error);
					}
				},
			},
			{
				separator: true,
				label: '',
				onClick: () => {},
			},
			{
				label: 'Delete',
				icon: contextMenuIcons.delete,
				onClick: async () => {
					if (confirm(`Are you sure you want to delete "${node.name}"?`)) {
						try {
							await invoke('delete_file', { path: node.path });
							onFileTreeUpdate?.();
						} catch (error) {
							console.error('Failed to delete:', error);
						}
					}
				},
			},
		];

		showContextMenu(items, event);
	};

	const handleEditComplete = () => {
		setEditingPath(null);
	};

	return (
		<>
			<div className={cn('overflow-y-auto', className)}>
				{nodes.map((node) => (
					<FileTreeNode
						key={node.path}
						node={node}
						onSelect={onSelect}
						onRename={onRename}
						onFileTreeUpdate={onFileTreeUpdate}
						activePath={activePath}
						expandedFolders={expandedFolders}
						onToggleFolder={handleToggleFolder}
						onShowContextMenu={handleShowContextMenu}
						editingPath={editingPath}
						onEditComplete={handleEditComplete}
					/>
				))}
			</div>
			{contextMenu && (
				<ContextMenu
					items={contextMenu.items}
					position={contextMenu.position}
					onClose={hideContextMenu}
				/>
			)}
		</>
	);
};
