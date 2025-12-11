'use client';

import { useState, useEffect } from 'react';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Search, FolderOpen } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { FileTree } from '../FileTree';
import { FileNode, SearchResult } from '@/types';
import { getStorageItem, setStorageItem } from '@/utils/storage';
import { Button } from '@/components/ui/button';

interface FileNavigatorDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onFileSelect: (path: string) => void;
	initialQuery?: string;
}

export function FileNavigatorDialog({
	open,
	onOpenChange,
	onFileSelect,
	initialQuery,
}: FileNavigatorDialogProps) {
	const [search, setSearch] = useState(initialQuery || '');
	const [vaultPath, setVaultPath] = useState<string | null>(null);
	const [fileTree, setFileTree] = useState<FileNode[]>([]);
	const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
	const [isLoading, setIsLoading] = useState(false);

	useEffect(() => {
		if (open && initialQuery) {
			setSearch(initialQuery);
		} else if (!open) {
			setSearch('');
		}
	}, [open, initialQuery]);

	useEffect(() => {
		loadVaultPath();
	}, []);

	useEffect(() => {
		if (open && vaultPath) {
			loadFileTree(vaultPath);
		}
	}, [open, vaultPath]);

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

	const handleFileClick = (path: string) => {
		onFileSelect(path);
		onOpenChange(false);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='max-w-2xl h-[80vh] flex flex-col bg-background text-foreground'>
				<DialogHeader>
					<DialogTitle>Open File</DialogTitle>
				</DialogHeader>

				{!vaultPath ? (
					<div className='flex flex-col items-center justify-center h-full space-y-4'>
						<p className='text-muted-foreground'>
							No vault selected
						</p>
						<Button onClick={handleSelectVault}>
							<FolderOpen className='mr-2 h-4 w-4' />
							Open Vault Folder
						</Button>
					</div>
				) : (
					<div className='flex flex-col h-full space-y-4 overflow-hidden'>
						<div className='relative shrink-0'>
							<Search className='absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground' />
							<input
								type='text'
								placeholder='Search files...'
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								className='w-full pl-10 pr-4 py-2 bg-muted border border-border rounded-lg focus:outline-none focus:border-primary'
								autoFocus
							/>
						</div>

						<div className='flex-1 overflow-y-auto min-h-0'>
							{isLoading ? (
								<div className='flex items-center justify-center h-full text-muted-foreground'>
									Loading...
								</div>
							) : search.length > 2 ? (
								<div className='space-y-2'>
									{searchResults.length === 0 ? (
										<div className='text-center py-8 text-muted-foreground'>
											No results found
										</div>
									) : (
										searchResults.map((result) => (
											<button
												key={result.path}
												className='w-full text-left p-3 rounded hover:bg-muted transition-colors'
												onClick={() =>
													handleFileClick(result.path)
												}
											>
												<div className='font-medium'>
													{result.title}
												</div>
												<div className='text-sm text-muted-foreground truncate'>
													{result.excerpt}
												</div>
												<div className='text-xs text-muted-foreground/50 mt-1 truncate'>
													{result.path}
												</div>
											</button>
										))
									)}
								</div>
							) : (
								<FileTree
									nodes={fileTree}
									onSelect={handleFileClick}
									className='h-full'
								/>
							)}
						</div>

						<div className='pt-2 border-t text-xs text-muted-foreground flex justify-between items-center shrink-0'>
							<span className='truncate max-w-[300px]'>
								{vaultPath}
							</span>
							<Button
								variant='ghost'
								size='sm'
								onClick={handleSelectVault}
								className='h-6 text-xs'
							>
								Change Vault
							</Button>
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
