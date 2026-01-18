import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { FileTree } from './FileTree';
import { FileNode, SearchResult } from '@/types';
import { getStorageItem, setStorageItem } from '@/utils/storage';
import { Button } from '@/components/ui/button';
import { ActivityBar, ACTIVITY_BAR_WIDTH, type ActivityBarItem } from '@/components/ui/activity-bar';
import {
	Search,
	FolderOpen,
	Settings,
	Plus,
	Calendar,
	Command,
	Folder,
} from 'lucide-react';

export type LeftPanelTab = 'files' | 'search';

interface SidebarProps {
	activePath: string | null;
	onFileSelect: (path: string, permanent?: boolean) => void;
	onOpenInNewTab?: (path: string) => void;
	onSettingsClick: () => void;
	onVaultPathChange?: (vaultPath: string | null) => void;
	onNoteRenamed?: (oldPath: string, newPath: string) => void;
	onQuickSwitcherOpen?: () => void;
	vaultId?: string | null;
	activeNoteId?: string | null;
}

const ACTIVITY_BAR_ITEMS: ActivityBarItem[] = [
	{ id: 'files', icon: <Folder size={20} />, label: 'Files' },
	{ id: 'search', icon: <Search size={20} />, label: 'Search' },
	{ id: 'open-vault', icon: <FolderOpen size={20} />, label: 'Open Vault' },
];

const FOOTER_ITEMS: ActivityBarItem[] = [
	{ id: 'quick-switcher', icon: <Command size={20} />, label: 'Quick Switcher' },
	{ id: 'settings', icon: <Settings size={20} />, label: 'Settings' },
];

const PANEL_MIN_WIDTH = 150;
const PANEL_MAX_WIDTH = 500;
const PANEL_DEFAULT_WIDTH = 220;

export function Sidebar({
	activePath,
	onFileSelect,
	onOpenInNewTab,
	onSettingsClick,
	onVaultPathChange,
	onNoteRenamed,
	onQuickSwitcherOpen,
	vaultId: _vaultId,
	activeNoteId: _activeNoteId,
}: SidebarProps) {
	// Panel state
	const [activeTab, setActiveTab] = useState<LeftPanelTab | null>('files');
	const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT_WIDTH);
	const [isResizing, setIsResizing] = useState(false);

	// Sidebar-specific state
	const [search, setSearch] = useState('');
	const [vaultPath, setVaultPath] = useState<string | null>(null);
	const [fileTree, setFileTree] = useState<FileNode[]>([]);
	const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
	const [isLoading, setIsLoading] = useState(false);

	// Derived state
	const isCollapsed = activeTab === null;

	useEffect(() => {
		loadVaultPath();
	}, []);

	useEffect(() => {
		if (vaultPath) {
			loadFileTree(vaultPath);

			invoke('start_vault_watcher', { vaultPath })
				.then(() => {
					console.log('File watcher started for:', vaultPath);
				})
				.catch((error) => {
					console.error('Failed to start file watcher:', error);
				});
		}

		return () => {
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

	useEffect(() => {
		const handleCreateNoteShortcut = () => {
			if (vaultPath) {
				handleCreateNote();
			}
		};

		window.addEventListener('mutter:create-note', handleCreateNoteShortcut);
		return () => {
			window.removeEventListener('mutter:create-note', handleCreateNoteShortcut);
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
		console.time('[Sidebar] loadFileTree');
		try {
			const nodes = await invoke<FileNode[]>('get_file_tree', {
				vaultPath: path,
			});
			console.timeEnd('[Sidebar] loadFileTree');
			console.log(`[Sidebar] File tree loaded: ${countNodes(nodes)} nodes`);
			setFileTree(nodes);
		} catch (error) {
			console.timeEnd('[Sidebar] loadFileTree');
			console.error('Failed to load file tree:', error);
		} finally {
			setIsLoading(false);
		}
	};

	const countNodes = (nodes: FileNode[]): number => {
		let count = nodes.length;
		for (const node of nodes) {
			if (node.children) count += countNodes(node.children);
		}
		return count;
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

	// Handle activity bar clicks
	const handleActivityBarClick = (id: string) => {
		// Action items (don't toggle panels)
		if (id === 'settings') {
			onSettingsClick();
			return;
		}
		if (id === 'quick-switcher') {
			onQuickSwitcherOpen?.();
			return;
		}
		if (id === 'open-vault') {
			handleSelectVault();
			return;
		}

		const tabId = id as LeftPanelTab;
		// Toggle: if already active, collapse; otherwise activate
		if (activeTab === tabId) {
			setActiveTab(null);
		} else {
			setActiveTab(tabId);
		}
	};

	// Resize handlers
	const startResizing = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		setIsResizing(true);
	}, []);

	const stopResizing = useCallback(() => {
		setIsResizing(false);
	}, []);

	const resize = useCallback(
		(e: MouseEvent) => {
			if (!isResizing) return;
			// Subtract activity bar width
			const newWidth = e.clientX - ACTIVITY_BAR_WIDTH;
			if (newWidth >= PANEL_MIN_WIDTH && newWidth <= PANEL_MAX_WIDTH) {
				setPanelWidth(newWidth);
			}
		},
		[isResizing]
	);

	useEffect(() => {
		if (isResizing) {
			window.addEventListener('mousemove', resize);
			window.addEventListener('mouseup', stopResizing);
			return () => {
				window.removeEventListener('mousemove', resize);
				window.removeEventListener('mouseup', stopResizing);
			};
		}
	}, [isResizing, resize, stopResizing]);

	// Total width of the sidebar region
	const totalWidth = isCollapsed ? ACTIVITY_BAR_WIDTH : ACTIVITY_BAR_WIDTH + panelWidth;

	return (
		<div
			className="flex h-full shrink-0 bg-background"
			style={{ width: totalWidth }}
		>
			{/* Activity Bar - always visible */}
			<ActivityBar
				side="left"
				items={ACTIVITY_BAR_ITEMS}
				activeId={activeTab}
				onItemClick={handleActivityBarClick}
				footerItems={FOOTER_ITEMS}
			/>

			{/* Panel Content - only visible when not collapsed */}
			{!isCollapsed && (
				<div
					className="flex flex-col h-full overflow-hidden border-r border-border/20 bg-muted/10 relative group"
					style={{ width: panelWidth }}
				>
					{/* Resize handle */}
					<div
						className="absolute top-0 bottom-0 right-0 w-1 cursor-col-resize hover:bg-primary/30 transition-colors z-10 opacity-0 group-hover:opacity-100"
						onMouseDown={startResizing}
					/>

					{/* Panel Header */}
					<div className="border-b border-border/20 shrink-0">
						{/* Title row */}
						<div className="h-10 flex items-center justify-between px-3 gap-2">
							<span className="font-medium text-sm truncate min-w-0 flex-1">
								{activeTab === 'files' ? (
									vaultPath ? (
										vaultPath.split('/').pop()
									) : (
										<span className="text-muted-foreground">No Vault</span>
									)
								) : (
									'Search'
								)}
							</span>
						</div>

						{/* Action buttons row */}
						<div className="h-9 flex items-center px-2 gap-1 border-t border-border/10">
							<Button
								variant="ghost"
								size="icon"
								className="h-7 w-7"
								onClick={handleCreateNote}
								title="New Note (Ctrl+N)"
								disabled={!vaultPath}
							>
								<Plus size={15} />
							</Button>
							<Button
								variant="ghost"
								size="icon"
								className="h-7 w-7"
								onClick={handleOpenDailyNote}
								title="Today's Note"
								disabled={!vaultPath}
							>
								<Calendar size={15} />
							</Button>
						</div>
					</div>

					{/* Search input (for search tab or file filter) */}
					{activeTab === 'search' && (
						<div className="p-2 border-b border-border/20 shrink-0">
							<div className="relative">
								<Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
								<input
									type="text"
									placeholder="Search notes..."
									value={search}
									onChange={(e) => setSearch(e.target.value)}
									className="w-full pl-9 pr-3 py-1.5 text-sm bg-transparent border border-border/20 rounded focus:outline-none focus:border-primary/50 focus:bg-background/50 transition-colors placeholder:text-muted-foreground/60 font-mono"
									autoFocus
								/>
							</div>
						</div>
					)}

					{/* Panel Content */}
					<div className="flex-1 overflow-y-auto min-h-0">
						{!vaultPath ? (
							<div className="flex flex-col items-center justify-center h-full p-4 text-center space-y-4">
								<p className="text-sm text-muted-foreground">
									Select a folder to view files
								</p>
								<Button onClick={handleSelectVault} size="sm">
									Open Vault
								</Button>
							</div>
						) : isLoading ? (
							<div className="flex items-center justify-center h-full text-muted-foreground text-sm">
								Loading...
							</div>
						) : activeTab === 'search' && search.length > 2 ? (
							<div className="space-y-1 p-2">
								{searchResults.length === 0 ? (
									<div className="text-center py-8 text-sm text-muted-foreground">
										No results found
									</div>
								) : (
									searchResults.map((result, index) => (
										<button
											key={result.path}
											className="w-full text-left p-2 rounded hover:bg-accent hover:text-accent-foreground transition-colors group animate-in fade-in slide-in-from-top-1 duration-200"
											style={{ animationDelay: `${index * 30}ms` }}
											onClick={() => onFileSelect(result.path, false)}
										>
											<div className="font-medium text-sm truncate">
												{result.title}
											</div>
											<div className="text-xs text-muted-foreground truncate group-hover:text-accent-foreground/70">
												{result.excerpt}
											</div>
										</button>
									))
								)}
							</div>
						) : activeTab === 'search' ? (
							<div className="flex items-center justify-center h-full text-muted-foreground text-sm p-4 text-center">
								Type at least 3 characters to search
							</div>
						) : (
							<FileTree
								nodes={fileTree}
								onSelect={onFileSelect}
								onOpenInNewTab={onOpenInNewTab}
								onRename={handleRename}
								onFileTreeUpdate={() => loadFileTree(vaultPath)}
								className="h-full p-2"
								activePath={activePath}
							/>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
