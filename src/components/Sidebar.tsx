import { useEffect, useState } from 'react';
import { readDir, writeTextFile } from '@tauri-apps/plugin-fs';
import { open } from '@tauri-apps/plugin-dialog';
import './Sidebar.css';

interface SidebarProps {
	onFileSelect: (path: string) => void;
}

interface FileNode {
	name: string;
	path: string;
	isDirectory: boolean;
	children?: FileNode[];
}

export default function Sidebar({ onFileSelect }: SidebarProps) {
	const [files, setFiles] = useState<FileNode[]>([]);
	const [vaultPath, setVaultPath] = useState<string>('');

	const handleOpenFolder = async () => {
		try {
			const selected = await open({
				directory: true,
				multiple: false,
				title: 'Select Vault Folder',
			});
			console.log('Selected folder:', selected);
			if (selected && typeof selected === 'string') {
				setVaultPath(selected);
				const fileList = await loadFiles(selected);
				console.log('Loaded files:', fileList);
				setFiles(fileList);
			}
		} catch (error) {
			console.error('Error opening folder:', error);
		}
	};

	const handleNewNote = async () => {
		if (!vaultPath) {
			alert('Please select a vault folder first');
			return;
		}

		try {
			// Generate a unique filename
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
			const fileName = `Note-${timestamp}.md`;
			const separator = vaultPath.includes('\\') ? '\\' : '/';
			const filePath = `${vaultPath}${separator}${fileName}`;

			console.log('Creating new note at:', filePath);

			// Create an empty markdown file
			await writeTextFile(filePath, '# New Note\n\n');

			console.log('Note created successfully');

			// Reload the file list
			const fileList = await loadFiles(vaultPath);
			setFiles(fileList);

			// Open the new file
			onFileSelect(filePath);
		} catch (error) {
			console.error('Error creating new note:', error);
			alert(`Failed to create new note: ${error}`);
		}
	};

	useEffect(() => {
		// TODO: Load vault path from settings
		// For now, use a default or prompt user
	}, []);

	const loadFiles = async (path: string) => {
		try {
			console.log('Loading files from:', path);
			const entries = await readDir(path);
			console.log('Raw entries:', entries);
			const nodes: FileNode[] = await Promise.all(
				entries
					.filter(
						(entry) =>
							entry.name?.endsWith('.md') || entry.isDirectory
					)
					.map(async (entry) => {
						// Use proper path separator for Windows/Unix
						const separator = path.includes('\\') ? '\\' : '/';
						const fullPath = `${path}${separator}${entry.name}`;
						const node: FileNode = {
							name: entry.name || '',
							path: fullPath,
							isDirectory: entry.isDirectory || false,
						};

						if (node.isDirectory) {
							node.children = await loadFiles(fullPath);
						}

						return node;
					})
			);
			return nodes;
		} catch (error) {
			console.error('Error loading files:', error);
			return [];
		}
	};

	const renderFileTree = (nodes: FileNode[], level = 0) => {
		return nodes.map((node) => (
			<div key={node.path} style={{ paddingLeft: `${level * 16}px` }}>
				{node.isDirectory ? (
					<>
						<div className='folder-item'>📁 {node.name}</div>
						{node.children &&
							renderFileTree(node.children, level + 1)}
					</>
				) : (
					<div
						className='file-item'
						onClick={() => onFileSelect(node.path)}
					>
						📄 {node.name}
					</div>
				)}
			</div>
		));
	};

	return (
		<aside className='sidebar'>
			<div className='sidebar-header'>
				<h2>Mutter</h2>
				<button
					className='btn-new'
					title='New Note'
					onClick={handleNewNote}
				>
					+
				</button>
			</div>
			<div className='file-tree'>
				{vaultPath ? (
					files.length > 0 ? (
						renderFileTree(files)
					) : (
						<div className='empty-state'>
							<p>No markdown files found</p>
							<p style={{ fontSize: '0.85rem', opacity: 0.7 }}>
								{vaultPath}
							</p>
						</div>
					)
				) : (
					<div className='empty-state'>
						<p>No vault selected</p>
						<button
							className='btn-primary'
							onClick={handleOpenFolder}
						>
							Open Folder
						</button>
					</div>
				)}
			</div>
		</aside>
	);
}
