import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { FileTree } from './FileTree';
import { FileNode, SearchResult } from '@/types';
import { getStorageItem, setStorageItem } from '@/utils/storage';
import { Button } from '@/components/ui/button';
import {
	Search,
	FolderOpen,
	PanelLeftClose,
	PanelLeftOpen,
	Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarProps {
	activePath: string | null;
	onFileSelect: (path: string) => void;
	onSettingsClick: () => void;
}

export function Sidebar({
	activePath,
	onFileSelect,
	onSettingsClick,
}: SidebarProps) {
	const [width, setWidth] = useState(250);
	const [isCollapsed, setIsCollapsed] = useState(false);
	const [isResizing, setIsResizing] = useState(false);
	const sidebarRef = useRef<HTMLDivElement>(null);

	const [search, setSearch] = useState('');
	const [vaultPath, setVaultPath] = useState<string | null>(null);
	const [fileTree, setFileTree] = useState<FileNode[]>([]);
	const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
	const [isLoading, setIsLoading] = useState(false);

	useEffect(() => {
		loadVaultPath();
	}, []);

	useEffect(() => {
		if (vaultPath) {
			loadFileTree(vaultPath);
		}
	}, [vaultPath]);

	useEffect(() => {
		if (search.length > 2 && vaultPath) {
			performSearch(search);
		} else {
			setSearchResults([]);
		}
	}, [search, vaultPath]);

	const loadVaultPath = async () => {
		const path = await getStorageItem<string>('vault_path');
		if (path) {
			setVaultPath(path);
		}
	};

	const loadFileTree = async (path: string) => {
		setIsLoading(true);
		try {
			const nodes = await invoke<FileNode[]>('get_file_tree', {
				vaultPath: path,
			});
			setFileTree(nodes);
		} catch (error) {
			console.error('Failed to load file tree:', error);
		} finally {
			setIsLoading(false);
		}
	};

	const performSearch = async (query: string) => {
		if (!vaultPath) return;
		try {
			const results = await invoke<SearchResult[]>('search_notes', {
				query,
				vaultPath,
			});
			setSearchResults(results);
		} catch (error) {
			console.error('Search failed:', error);
		}
	};

	const handleSelectVault = async () => {
		const selected = await openDialog({
			directory: true,
			multiple: false,
		});

		if (selected) {
			await setStorageItem('vault_path', selected);
			setVaultPath(selected as string);
		}
	};

	const startResizing = useCallback((mouseDownEvent: React.MouseEvent) => {
		mouseDownEvent.preventDefault();
		setIsResizing(true);
	}, []);

	const stopResizing = useCallback(() => {
		setIsResizing(false);
	}, []);

	const resize = useCallback(
		(mouseMoveEvent: MouseEvent) => {
			if (isResizing) {
				const newWidth = mouseMoveEvent.clientX;
				if (newWidth > 150 && newWidth < 600) {
					setWidth(newWidth);
				}
			}
		},
		[isResizing]
	);

	useEffect(() => {
		window.addEventListener('mousemove', resize);
		window.addEventListener('mouseup', stopResizing);
		return () => {
			window.removeEventListener('mousemove', resize);
			window.removeEventListener('mouseup', stopResizing);
		};
	}, [resize, stopResizing]);

	if (isCollapsed) {
		return (
			<div className='h-full w-12 border-r border-border bg-muted/30 flex flex-col items-center py-4 gap-4 shrink-0'>
				<Button
					variant='ghost'
					size='icon'
					onClick={() => setIsCollapsed(false)}
					title='Expand Sidebar'
				>
					<PanelLeftOpen size={20} />
				</Button>
				<Button
					variant='ghost'
					size='icon'
					onClick={onSettingsClick}
					title='Settings'
				>
					<Settings size={20} />
				</Button>
			</div>
		);
	}

	return (
		<div
			ref={sidebarRef}
			className='h-full flex shrink-0 relative group text-foreground'
			style={{ width: width }}
		>
			<div className='flex-1 flex flex-col h-full border-r border-border bg-muted/10 overflow-hidden'>
				{/* Header */}
				<div className='h-12 flex items-center justify-between px-4 border-b border-border shrink-0'>
					<span className='font-medium text-sm truncate'>
						{vaultPath ? (
							vaultPath.split('/').pop()
						) : (
							<span className='text-muted-foreground'>
								No Vault
							</span>
						)}
					</span>
					<div className='flex items-center gap-1'>
						<Button
							variant='ghost'
							size='icon'
							className='h-8 w-8'
							onClick={handleSelectVault}
							title='Open Vault'
						>
							<FolderOpen size={16} />
						</Button>
						<Button
							variant='ghost'
							size='icon'
							className='h-8 w-8'
							onClick={() => setIsCollapsed(true)}
							title='Collapse Sidebar'
						>
							<PanelLeftClose size={16} />
						</Button>
					</div>
				</div>

				{/* Search */}
				<div className='p-3 border-b border-border shrink-0'>
					<div className='relative'>
						<Search className='absolute left-2.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground' />
						<input
							type='text'
							placeholder='Search files...'
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							className='w-full pl-9 pr-3 py-1.5 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-1 focus:ring-ring'
						/>
					</div>
				</div>

				{/* Content */}
				<div className='flex-1 overflow-y-auto min-h-0'>
					{!vaultPath ? (
						<div className='flex flex-col items-center justify-center h-full p-4 text-center space-y-4'>
							<p className='text-sm text-muted-foreground'>
								Select a folder to view files
							</p>
							<Button onClick={handleSelectVault} size='sm'>
								Open Vault
							</Button>
						</div>
					) : isLoading ? (
						<div className='flex items-center justify-center h-full text-muted-foreground text-sm'>
							Loading...
						</div>
					) : search.length > 2 ? (
						<div className='space-y-1 p-2'>
							{searchResults.length === 0 ? (
								<div className='text-center py-8 text-sm text-muted-foreground'>
									No results found
								</div>
							) : (
								searchResults.map((result) => (
									<button
										key={result.path}
										className='w-full text-left p-2 rounded hover:bg-accent hover:text-accent-foreground transition-colors group'
										onClick={() =>
											onFileSelect(result.path)
										}
									>
										<div className='font-medium text-sm truncate'>
											{result.title}
										</div>
										<div className='text-xs text-muted-foreground truncate group-hover:text-accent-foreground/70'>
											{result.excerpt}
										</div>
									</button>
								))
							)}
						</div>
					) : (
						<FileTree
							nodes={fileTree}
							onSelect={onFileSelect}
							className='h-full p-2'
							activePath={activePath}
						/>
					)}
				</div>

				{/* Footer */}
				<div className='p-2 border-t border-border shrink-0 flex justify-between items-center'>
					<Button
						variant='ghost'
						size='sm'
						className='w-full justify-start gap-2 text-muted-foreground hover:text-foreground'
						onClick={onSettingsClick}
					>
						<Settings size={16} />
						<span className='text-xs'>Settings</span>
					</Button>
				</div>
			</div>

			{/* Resizer Handle */}
			<div
				className='absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 transition-colors z-10'
				onMouseDown={startResizing}
			/>
		</div>
	);
}
