import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
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
	Plus,
    Calendar,
} from 'lucide-react';

interface SidebarProps {
	activePath: string | null;
	onFileSelect: (path: string, permanent?: boolean) => void;
	onSettingsClick: () => void;
	onVaultPathChange?: (vaultPath: string | null) => void;
	onNoteRenamed?: (oldPath: string, newPath: string) => void;
	vaultId?: string | null;
	activeNoteId?: string | null;
}

export function Sidebar({
	activePath,
	onFileSelect,
	onSettingsClick,
	onVaultPathChange,
	onNoteRenamed,
	vaultId: _vaultId,
	activeNoteId: _activeNoteId,
}: SidebarProps) {
	const [width, setWidth] = useState(256); // Design System: 256px sidebar width
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

			// Start file watcher for the vault
			invoke('start_vault_watcher', { vaultPath })
				.then(() => {
					console.log('File watcher started for:', vaultPath);
				})
				.catch((error) => {
					console.error('Failed to start file watcher:', error);
				});
		}

		return () => {
			// Stop file watcher when vault path changes or component unmounts
			invoke('stop_vault_watcher')
				.catch((error) => {
					console.error('Failed to stop file watcher:', error);
				});
		};
	}, [vaultPath]);

	useEffect(() => {
		if (search.length > 2 && vaultPath) {
			performSearch(search);
		} else {
			setSearchResults([]);
		}
	}, [search, vaultPath]);

	// Listen for file system structure changes and reload file tree
	// Note: File watcher only triggers on create/delete/rename, NOT content modifications
	// This prevents constant reloads when files are being edited or synced
	useEffect(() => {
		if (!vaultPath) return;

		const unlisten = listen('vault-changed', () => {
			console.log('Vault structure changed, reloading file tree');
			loadFileTree(vaultPath);
		});

		return () => {
			unlisten.then((fn) => fn());
		};
	}, [vaultPath]);

	const loadVaultPath = async () => {
		const path = await getStorageItem<string>('vault_path');
		if (path) {
			setVaultPath(path);
			onVaultPathChange?.(path);
		} else {
			onVaultPathChange?.(null);
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
			onVaultPathChange?.(selected as string);
		}
	};

	const handleCreateNote = async () => {
		if (!vaultPath) return;
		try {
			const newPath = await invoke<string>('create_note', {
				vaultPath,
				filename: 'Untitled.md',
			});
			await loadFileTree(vaultPath);
			onFileSelect(newPath, true);
		} catch (error) {
			console.error('Failed to create note:', error);
		}
	};

    const handleOpenDailyNote = async () => {
        if (!vaultPath) return;
        try {
            const path = await invoke<string>('open_daily_note', {
                vaultPath,
            });
            await loadFileTree(vaultPath);
            onFileSelect(path, true);
        } catch (error) {
            console.error('Failed to open daily note:', error);
        }
    };

	const handleRename = async (oldPath: string, newName: string) => {
		if (!vaultPath) return;
		try {
			const newPath = await invoke<string>('rename_note', {
				oldPath,
				newName,
			});
			await loadFileTree(vaultPath);
			if (activePath === oldPath) {
				onFileSelect(newPath, true);
			}
			onNoteRenamed?.(oldPath, newPath);
		} catch (error) {
			console.error('Failed to rename note:', error);
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

	return (
		<div
			ref={sidebarRef}
			className='h-full flex shrink-0 relative group text-foreground transition-all duration-200 ease-out'
			style={{ width: isCollapsed ? 48 : width }}
		>
			<div className='flex-1 flex flex-col h-full border-r border-border/20 bg-muted/10 overflow-hidden'>
				{isCollapsed ? (
					/* Collapsed View */
					<div className='flex flex-col items-center py-4 gap-4 animate-in fade-in duration-200'>
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
				) : (
					/* Expanded View */
					<>
						{/* Header */}
						<div className='h-12 flex items-center justify-between px-4 border-b border-border/20 shrink-0 animate-in fade-in duration-200'>
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
									onClick={handleOpenDailyNote}
									title='Open Today`s Note'
									disabled={!vaultPath}
								>
									<Calendar size={16} />
								</Button>
								<Button
									variant='ghost'
									size='icon'
									className='h-8 w-8'
									onClick={handleCreateNote}
									title='New Note'
									disabled={!vaultPath}
								>
									<Plus size={16} />
								</Button>
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
						<div className='p-3 border-b border-border/20 shrink-0 animate-in fade-in duration-200'>
							<div className='relative'>
								<Search className='absolute left-2.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground' />
								<input
									type='text'
									placeholder='Search files...'
									value={search}
									onChange={(e) => setSearch(e.target.value)}
									className='w-full pl-9 pr-3 py-1.5 text-sm bg-transparent border border-border/20 rounded focus:outline-none focus:border-primary/50 focus:bg-background/50 transition-colors placeholder:text-muted-foreground/60 font-mono'
								/>
							</div>
						</div>

						{/* Content */}
						<div className='flex-1 overflow-y-auto min-h-0 animate-in fade-in duration-200'>
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
								searchResults.map((result, index) => (
									<button
										key={result.path}
										className='w-full text-left p-2 rounded hover:bg-accent hover:text-accent-foreground transition-colors group animate-in fade-in slide-in-from-top-1 duration-200'
										style={{ animationDelay: `${index * 30}ms` }}
										onClick={() =>
											onFileSelect(result.path, false)
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
							onRename={handleRename}
							onFileTreeUpdate={() => loadFileTree(vaultPath)}
							className='h-full p-2'
							activePath={activePath}
						/>
							)}
						</div>

						{/* Footer */}
						<div className='p-2 border-t border-border/20 shrink-0 flex justify-between items-center animate-in fade-in duration-200'>
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
					</>
				)}
			</div>

			{/* Resizer Handle - International Orange on hover */}
			<div
				className='absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/30 transition-colors z-10 opacity-0 group-hover:opacity-100'
				onMouseDown={startResizing}
			/>
		</div>
	);
}
