import { useCallback, useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAudioRecorder } from './hooks/useAudioRecorder';
import Editor from './components/Editor';
import { Omnibox } from './components/Omnibox';
import { VoiceIndicator } from './components/VoiceIndicator';
import { FileNavigatorDialog } from './components/dialogs/file-navigator-dialog';
import { VoiceLogDialog } from './components/dialogs/voice-log-dialog';
import { SettingsDialog } from './components/dialogs/settings-dialog';
import { WhisperModelSelector } from './components/WhisperModelSelector';
import { StreamingTranscription } from './components/StreamingTranscription';
import { Toaster } from './components/ui/toaster';
import { getStorageItem, setStorageItem } from './utils/storage';
import { VoiceLogEntry } from './types';
import { QuickCapture } from './components/QuickCapture';
import { Sidebar } from './components/Sidebar';
import { CrdtSpike } from './components/CrdtSpike';
import { useVaultMetadataCrdt } from '@/hooks/useVaultMetadataCrdt';
import { TabBar, Tab } from './components/TabBar';

type DialogType = 'files' | 'voice-log' | 'settings' | null;

const CRDT_WS_URL_KEY = 'mutter:crdt_ws_url';

function App() {
	console.log('App rendering');
	const [tabs, setTabs] = useState<Tab[]>([]);
	const [activeTabId, setActiveTabId] = useState<string | null>(null);
	const activeTab = tabs.find((t) => t.id === activeTabId);
	const currentFile = activeTab?.path || null;

	const [vaultPath, setVaultPath] = useState<string | null>(null);
	const [audioState, setAudioState] = useState<
		'idle' | 'listening' | 'processing' | 'executing'
	>('idle');
	const [isInitialized, setIsInitialized] = useState(false);
	const [voiceLogEntries, setVoiceLogEntries] = useState<VoiceLogEntry[]>([]);
	const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
	const [openDialog, setOpenDialog] = useState<DialogType>(null);
	const [fileDialogQuery, setFileDialogQuery] = useState<string>('');
	const [isQuickCapture, setIsQuickCapture] = useState(false);
	const [isCrdtSpike, setIsCrdtSpike] = useState(false);

	useEffect(() => {
		const syncModeFromHash = () => {
			const hash = window.location.hash;
			setIsQuickCapture(hash.startsWith('#/quick-capture'));
			setIsCrdtSpike(hash.startsWith('#/crdt'));
		};

		syncModeFromHash();
		window.addEventListener('hashchange', syncModeFromHash);
		return () =>
			window.removeEventListener('hashchange', syncModeFromHash);
	}, []);

	const { startRecording, stopRecording } = useAudioRecorder(() => {
		console.log('Silence detected');
	});

	if (isQuickCapture) {
		return <QuickCapture />;
	}

	if (isCrdtSpike) {
		return <CrdtSpike />;
	}

	const addVoiceLogEntry = (
		entry: Omit<VoiceLogEntry, 'id' | 'timestamp'>
	) => {
		setVoiceLogEntries((prev) => [
			...prev,
			{
				...entry,
				id: `${Date.now()}-${Math.random()}`,
				timestamp: new Date(),
			},
		]);
	};

	const handleFileSelect = (path: string) => {
		setTabs((prevTabs) => {
			const existingTab = prevTabs.find((t) => t.path === path);
			if (existingTab) {
				setActiveTabId(existingTab.id);
				return prevTabs;
			}
			
			const newTab: Tab = {
				id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
				path,
				title: path.split('/').pop() || 'Untitled',
			};
			setActiveTabId(newTab.id);
			return [...prevTabs, newTab];
		});
	};

	const handleTabClose = (id: string, e: React.MouseEvent) => {
		e.stopPropagation();
		const newTabs = tabs.filter((t) => t.id !== id);
		setTabs(newTabs);

		if (activeTabId === id) {
			if (newTabs.length > 0) {
				setActiveTabId(newTabs[newTabs.length - 1].id);
			} else {
				setActiveTabId(null);
			}
		}
	};

	const handleNoteRename = (oldPath: string, newPath: string) => {
		setTabs((prev) =>
			prev.map((tab) => {
				if (tab.path === oldPath) {
					return {
						...tab,
						path: newPath,
						title: newPath.split('/').pop() || 'Untitled',
					};
				}
				return tab;
			})
		);
	};

	useEffect(() => {
		// Initialize embeddings on startup
		const initialize = async () => {
			try {
				await invoke('load_embedding_model');
				await invoke('initialize_embeddings');

				// Register global hotkey
				try {
					await invoke('register_global_hotkey', {
						shortcut: 'CommandOrControl+Shift+Space',
					});
				} catch (e) {
					console.error('Failed to register hotkey', e);
				}

				setIsInitialized(true);

				// Restore last opened file
				const lastFile = await getStorageItem<string>(
					'last_opened_file'
				);
				if (lastFile) {
					handleFileSelect(lastFile);
				}
				
				// TODO: Restore full tab session if we decide to persist it
			} catch (error) {
				console.error('Failed to initialize embeddings:', error);
				// Still allow the app to run
				setIsInitialized(true);
			}
		};

		initialize();
	}, []);

	// Save current file to storage when it changes
	useEffect(() => {
		if (currentFile) {
			setStorageItem('last_opened_file', currentFile);
		}
	}, [currentFile]);

	const vaultMeta = useVaultMetadataCrdt({ vaultPath, activeFilePath: currentFile });

	const onOpenNoteById = useCallback(() => {
		const id = window.prompt('Note ID (uuid)', '')?.trim() ?? '';
		if (!id) return;
		const path = vaultMeta.openNoteById(id);
		if (!path) {
			window.alert('Note not found in vault metadata.');
			return;
		}
		handleFileSelect(path);
	}, [vaultMeta]);

	const onSetActiveNoteTags = useCallback(() => {
		if (!vaultMeta.activeNoteId) {
			window.alert('No active note.');
			return;
		}
		const raw = window.prompt('Tags (comma-separated)', '') ?? '';
		const tags = raw
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean);
		vaultMeta.setActiveNoteTags(tags);
	}, [vaultMeta]);

	const onConfigureCrdtWebSocket = useCallback(() => {
		const current = window.localStorage.getItem(CRDT_WS_URL_KEY) ?? '';
		const raw = window.prompt(
			'CRDT WebSocket URL (e.g. ws://127.0.0.1:3030)',
			current || 'ws://127.0.0.1:3030'
		);
		if (raw === null) return;

		const trimmed = raw.trim();
		if (!trimmed) {
			window.localStorage.removeItem(CRDT_WS_URL_KEY);
		} else {
			window.localStorage.setItem(CRDT_WS_URL_KEY, trimmed);
		}
		window.location.reload();
	}, []);

	const onClearCrdtWebSocket = useCallback(() => {
		const ok = window.confirm(
			'Clear CRDT WebSocket URL for this install? (requires reload)'
		);
		if (!ok) return;
		window.localStorage.removeItem(CRDT_WS_URL_KEY);
		window.location.reload();
	}, []);

	// Open model selector on first launch if no model is loaded
	useEffect(() => {
		const checkModel = async () => {
			try {
				// Check if we have a saved model preference first
				const savedModelId = await getStorageItem<string>(
					'selected_whisper_model'
				);

				// If we have a saved model, we don't need to open the selector
				// The selector component itself handles auto-loading the saved model
				if (savedModelId) {
					return;
				}

				const hasModel = await invoke<boolean>('has_loaded_model');
				if (!hasModel) {
					setModelSelectorOpen(true);
				}
			} catch (err) {
				console.error('Failed to check model status:', err);
				// Open selector anyway if check fails
				setModelSelectorOpen(true);
			}
		};

		if (isInitialized) {
			checkModel();
		}
	}, [isInitialized]);

	// Handle keyboard shortcuts for dialogs
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Ctrl/Cmd + O for file navigation
			if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
				e.preventDefault();
				setOpenDialog('files');
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, []);

	const handleVoiceCommand = async (
		command: string,
		transcription: string
	) => {
		console.log('Voice command:', command, transcription);
		// Execute the command via Editor's handler
		if ((window as any).handleTranscription) {
			setAudioState('executing');
			await (window as any).handleTranscription(transcription || command);
			setAudioState('idle');
		}
	};

	const toggleListening = async () => {
		if (audioState === 'listening') {
			setAudioState('processing');
			const result = await stopRecording();
			if (result) {
				if ((window as any).handleTranscription) {
					setAudioState('executing');
					await (window as any).handleTranscription(result.text);
				}
			}
			setAudioState('idle');
		} else {
			await startRecording();
			setAudioState('listening');
		}
	};

	const handleSystemCommand = async (action: any) => {
		console.log('System command:', action);

		if (action.OpenNote) {
			const query = action.OpenNote.name;
			if (!query) {
				setOpenDialog('files');
				return;
			}

			// Try to find the note directly
			try {
				const vaultPath = await getStorageItem<string>('vault_path');
				if (vaultPath) {
					const results = await invoke<any[]>('search_notes', {
						query,
						vaultPath,
					});
					if (results.length > 0) {
						// If we have a good match, open it
						// For now, just open the first one if it's a very strong match or unique
						// But to be safe, let's open the dialog with the search query
						setFileDialogQuery(query);
						setOpenDialog('files');
					} else {
						setFileDialogQuery(query);
						setOpenDialog('files');
					}
				} else {
					setOpenDialog('files');
				}
			} catch (e) {
				console.error('Failed to search notes:', e);
				setOpenDialog('files');
			}
		} else if (action.Search) {
			setFileDialogQuery(action.Search.query);
			setOpenDialog('files');
		}
	};

	return (
		<div className='flex h-screen w-screen overflow-hidden bg-background text-foreground'>
			<Sidebar
				activePath={currentFile}
				onFileSelect={handleFileSelect}
				onSettingsClick={() => setOpenDialog('settings')}
				onVaultPathChange={setVaultPath}
				onNoteRenamed={(oldPath, newPath) => {
					vaultMeta.recordRename(oldPath, newPath);
					handleNoteRename(oldPath, newPath);
				}}
				vaultId={vaultMeta.vaultId}
				activeNoteId={vaultMeta.activeNoteId}
			/>

			<div className='flex-1 flex flex-col overflow-hidden relative'>
				<StreamingTranscription
					isRecording={audioState === 'listening'}
				/>

				<main className='flex-1 flex flex-col overflow-hidden relative'>
					<TabBar 
						tabs={tabs}
						activeTabId={activeTabId}
						onTabClick={setActiveTabId}
						onTabClose={handleTabClose}
					/>
					
					<Editor
						filePath={currentFile}
						audioState={audioState}
						onVoiceLogEntry={addVoiceLogEntry}
						onSystemCommand={handleSystemCommand}
						onContentSaved={(content) => vaultMeta.recordContent(content)}
					/>

					<Omnibox
						onCommand={handleVoiceCommand}
						onDialogOpen={setOpenDialog}
						isListening={audioState === 'listening'}
						onToggleListening={toggleListening}
						onOpenNoteById={onOpenNoteById}
						onSetActiveNoteTags={onSetActiveNoteTags}
						onConfigureCrdtWebSocket={onConfigureCrdtWebSocket}
						onClearCrdtWebSocket={onClearCrdtWebSocket}
					/>

					<VoiceIndicator
						state={audioState}
						onLogClick={() => setOpenDialog('voice-log')}
						onToggleListening={toggleListening}
					/>
				</main>
			</div>

			{/* Dialogs */}
			<FileNavigatorDialog
				open={openDialog === 'files'}
				onOpenChange={(open) => {
					if (!open) {
						setOpenDialog(null);
						setFileDialogQuery('');
					}
				}}
				onFileSelect={(path) => {
					handleFileSelect(path);
					setOpenDialog(null);
					setFileDialogQuery('');
				}}
				initialQuery={fileDialogQuery}
			/>
			<VoiceLogDialog
				open={openDialog === 'voice-log'}
				onOpenChange={(open) => !open && setOpenDialog(null)}
				entries={voiceLogEntries.map((e) => ({
					transcription: e.transcript,
					command: e.interpretation,
					confidence: e.confidence,
				}))}
			/>
			<SettingsDialog
				open={openDialog === 'settings'}
				onOpenChange={(open) => !open && setOpenDialog(null)}
			/>

			<WhisperModelSelector
				open={modelSelectorOpen}
				onOpenChange={setModelSelectorOpen}
			/>
			<Toaster />

			{/* Loading overlay removed for debugging */}
		</div>
	);
}

export default App;
