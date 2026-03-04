import { useCallback, useState, useEffect } from 'react';
import { FileText } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { emitMutterEvent, useMutterEvent } from './events';
import { hasLoadedModel, loadWhisperModel } from './services/whisper';
import { useNavigationHistory } from './hooks/useNavigationHistory';
import { useTabManager } from './hooks/useTabManager';
import { useDialogManager } from './hooks/useDialogManager';
import { useVoicePipeline } from './hooks/useVoicePipeline';
import Editor from './components/Editor';
import { ImageViewer } from './components/ImageViewer';
import { Omnibox } from './components/Omnibox';
import { isImageFile } from './utils/fileTypes';
import { VoiceIndicator } from './components/VoiceIndicator';
import { FileNavigatorDialog } from './components/dialogs/file-navigator-dialog';
import { VoiceLogDialog } from './components/dialogs/voice-log-dialog';
import { SettingsDialog } from './components/dialogs/settings-dialog';
import { WhisperModelSelector } from './components/WhisperModelSelector';
import { StreamingTranscription } from './components/StreamingTranscription';
import { Toaster } from './components/ui/toaster';
import { getStorageItem, setStorageItem } from './utils/storage';
import { QuickCapture } from './components/QuickCapture';
import { Sidebar } from './components/Sidebar';
import { CrdtSpike } from './components/CrdtSpike';
import { useVaultMetadataCrdt } from '@/hooks/useVaultMetadataCrdt';
import { TabBar } from './components/TabBar';
import { EditorContextProvider } from '@/context/EditorContextProvider';
import { VaultMetadataProvider } from '@/context/VaultMetadataContext';
import { BacklinksPanel } from './components/BacklinksPanel';
import { SearchPanel } from './components/SearchPanel';
import { OutlinePanel } from './components/OutlinePanel';
import { GraphPanel, GraphDialog } from './components/graph';
import { StatusBar } from './components/StatusBar';
import { TextCleanupDialog } from './components/dialogs/TextCleanupDialog';
import { RightPanel } from './components/RightPanel';

const CRDT_WS_URL_KEY = 'mutter:crdt_ws_url';

function App() {
	// Navigation history
	const { canGoBack, canGoForward, recordNavigation, goBack, goForward } =
		useNavigationHistory();

	// Tab management
	const {
		tabs,
		activeTabId,
		activeTab,
		currentFile,
		setActiveTabId,
		handleFileSelect,
		handleOpenInNewTab,
		handleTabClose,
		handleTabReorder,
		handleCloseOthers,
		handleCloseToRight,
		handleCloseAll,
		handleTogglePin,
		handleTabDirtyChange,
		handleNoteRename,
		handleTabDoubleClick,
	} = useTabManager({ onNavigate: recordNavigation });

	// Dialog/panel state
	const {
		openDialog,
		setOpenDialog,
		fileDialogQuery,
		setFileDialogQuery,
		modelSelectorOpen,
		setModelSelectorOpen,
		graphDialogOpen,
		setGraphDialogOpen,
		textCleanupData,
		setTextCleanupData,
		rightPanel,
		setRightPanel,
	} = useDialogManager();

	// Voice pipeline
	const {
		audioState,
		streamingTranscription,
		voiceLogEntries,
		voiceEnabled,
		recentAudioSamples,
		handleVoiceCommand,
		toggleListening,
	} = useVoicePipeline({ onModelSelectorOpen: () => setModelSelectorOpen(true) });

	const [vaultPath, setVaultPath] = useState<string | null>(null);
	const [isInitialized, setIsInitialized] = useState(false);
	const [isQuickCapture, setIsQuickCapture] = useState(false);
	const [isCrdtSpike, setIsCrdtSpike] = useState(false);

	// Editor content for status bar and outline
	const [editorContent, setEditorContent] = useState<string>('');

	useEffect(() => {
		const syncModeFromHash = () => {
			const hash = window.location.hash;
			setIsQuickCapture(hash.startsWith('#/quick-capture'));
			setIsCrdtSpike(hash.startsWith('#/crdt'));
		};

		syncModeFromHash();
		window.addEventListener('hashchange', syncModeFromHash);
		return () => window.removeEventListener('hashchange', syncModeFromHash);
	}, []);

	if (isQuickCapture) {
		return <QuickCapture />;
	}

	if (isCrdtSpike) {
		return <CrdtSpike />;
	}

	// Handle navigation history events (from keyboard shortcuts)
	useMutterEvent('mutter:navigate-history', ({ path }) => {
		handleFileSelect(path, false, true);
	});

	// Handle back/forward button clicks
	const handleGoBack = useCallback(() => {
		const path = goBack();
		if (path) {
			handleFileSelect(path, false, true);
		}
	}, [goBack, handleFileSelect]);

	const handleGoForward = useCallback(() => {
		const path = goForward();
		if (path) {
			handleFileSelect(path, false, true);
		}
	}, [goForward, handleFileSelect]);

	// Zoom handling
	useEffect(() => {
		const handleZoom = (e: KeyboardEvent) => {
			if (e.ctrlKey || e.metaKey) {
				if (e.key === '=' || e.key === '+' || e.key === '-') {
					e.preventDefault();
					const delta = e.key === '=' || e.key === '+' ? 0.1 : -0.1;
					const currentZoom = parseFloat(
						(document.body.style as any).zoom || '1',
					);
					const newZoom = Math.max(
						0.5,
						Math.min(3.0, currentZoom + delta),
					);
					(document.body.style as any).zoom = newZoom;
				}
				if (e.key === '0') {
					e.preventDefault();
					(document.body.style as any).zoom = '1';
				}
			}
		};

		window.addEventListener('keydown', handleZoom);
		return () => window.removeEventListener('keydown', handleZoom);
	}, []);

	useEffect(() => {
		// Initialize app on startup
		const initialize = async () => {
			console.time('[App] initialize total');
			try {
				// Register global hotkey
				try {
					await invoke('register_global_hotkey', {
						shortcut: 'CommandOrControl+Shift+Space',
					});
				} catch (e) {
					console.error('Failed to register hotkey', e);
				}

				setIsInitialized(true);
				console.timeEnd('[App] initialize total');

				// Restore last opened file
				console.time('[App] restore last file');
				const lastFile =
					await getStorageItem<string>('last_opened_file');
				if (lastFile) {
					handleFileSelect(lastFile);
				}
				console.timeEnd('[App] restore last file');

				// TODO: Restore full tab session if we decide to persist it
			} catch (error) {
				console.timeEnd('[App] initialize total');
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

	const vaultMeta = useVaultMetadataCrdt({
		vaultPath,
		activeFilePath: currentFile,
	});

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
			current || 'ws://127.0.0.1:3030',
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
			'Clear CRDT WebSocket URL for this install? (requires reload)',
		);
		if (!ok) return;
		window.localStorage.removeItem(CRDT_WS_URL_KEY);
		window.location.reload();
	}, []);

	// Open model selector on first launch if no model is loaded
	useEffect(() => {
		const checkModel = async () => {
			try {
				// Always check if a model is actually loaded, regardless of saved preference
				// The saved preference might exist but the model file could be missing/corrupt
				const hasModel = await hasLoadedModel();

				if (hasModel) {
					console.log(
						'[Model Check] Whisper model is loaded and ready',
					);
					return;
				}

				// Check if we have a saved model preference to try auto-loading
				const savedModelId = await getStorageItem<string>(
					'selected_whisper_model',
				);

				if (savedModelId) {
					console.log(
						`[Model Check] Attempting to load saved model: ${savedModelId}`,
					);
					try {
						await loadWhisperModel(savedModelId);
						console.log(
							`[Model Check] ✓ Successfully loaded saved model: ${savedModelId}`,
						);
						return;
					} catch (loadError) {
						console.error(
							`[Model Check] Failed to load saved model ${savedModelId}:`,
							loadError,
						);
						// Fall through to open selector
					}
				}

				// No model loaded and either no saved preference or load failed
				console.log('[Model Check] No model loaded, opening selector');
				setModelSelectorOpen(true);
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

	// Handle keyboard shortcuts for dialogs and tabs
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Ctrl/Cmd + O for file navigation (Quick Switcher)
			if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
				e.preventDefault();
				setOpenDialog('files');
			}
			// Ctrl/Cmd + W to close current tab
			if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
				e.preventDefault();
				if (activeTabId) {
					// Create a synthetic mouse event for the handler
					handleTabClose(activeTabId, {
						stopPropagation: () => {},
					} as React.MouseEvent);
				}
			}
			// Ctrl/Cmd + N to create new note (dispatches event to Sidebar)
			if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
				e.preventDefault();
				emitMutterEvent('mutter:create-note');
			}
			// Ctrl/Cmd + , for settings (common pattern)
			if ((e.ctrlKey || e.metaKey) && e.key === ',') {
				e.preventDefault();
				setOpenDialog('settings');
			}
			// Ctrl/Cmd + Shift + L for text cleanup
			if (
				(e.ctrlKey || e.metaKey) &&
				e.shiftKey &&
				e.key.toLowerCase() === 'l'
			) {
				e.preventDefault();
				// Dispatch event to get text from editor
				emitMutterEvent('mutter:execute-command', { command: 'cleanup-text' });
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [activeTabId]);


	return (
		<EditorContextProvider>
			<VaultMetadataProvider
				ready={vaultMeta.ready}
				vaultId={vaultMeta.vaultId}
				activeNoteId={vaultMeta.activeNoteId}
				vaultPath={vaultPath}
				normalizedVaultPath={vaultMeta.normalizedVaultPath}
				loadingPhase={vaultMeta.loadingPhase}
				manifest={vaultMeta.manifest}
				manifestHandle={vaultMeta.manifestHandle}
				noteManager={vaultMeta.noteManager}
				activeNoteDoc={vaultMeta.activeNoteDoc}
				activeNoteHandle={vaultMeta.activeNoteHandle}
				noteCount={vaultMeta.noteCount}
				migrationProgress={vaultMeta.migrationProgress}
				graphCache={vaultMeta.graphCache}
				graphCacheHandle={vaultMeta.graphCacheHandle}
			>
				<div className='flex flex-col h-screen w-screen overflow-hidden bg-background text-foreground'>
					{/* Full-width titlebar with tabs and window controls */}
					<TabBar
						tabs={tabs}
						activeTabId={activeTabId}
						onTabClick={setActiveTabId}
						onTabDoubleClick={handleTabDoubleClick}
						onTabClose={handleTabClose}
						onTabReorder={handleTabReorder}
						onCloseOthers={handleCloseOthers}
						onCloseToRight={handleCloseToRight}
						onCloseAll={handleCloseAll}
						onTogglePin={handleTogglePin}
						onRevealInExplorer={(path) => {
							emitMutterEvent('mutter:reveal-in-explorer', { path });
						}}
						canGoBack={canGoBack}
						canGoForward={canGoForward}
						onGoBack={handleGoBack}
						onGoForward={handleGoForward}
					/>

					{/* Main content area with sidebars */}
					<div className='flex flex-1 overflow-hidden'>
						<Sidebar
							activePath={currentFile}
							onFileSelect={handleFileSelect}
							onOpenInNewTab={handleOpenInNewTab}
							onSettingsClick={() => setOpenDialog('settings')}
							onVaultPathChange={setVaultPath}
							onNoteRenamed={(oldPath, newPath) => {
								vaultMeta.recordRename(oldPath, newPath);
								handleNoteRename(oldPath, newPath);
							}}
							onQuickSwitcherOpen={() => setOpenDialog('files')}
							vaultId={vaultMeta.vaultId}
							activeNoteId={vaultMeta.activeNoteId}
							audioSamples={recentAudioSamples}
							isRecording={audioState === 'listening'}
						/>

						<div className='flex-1 flex flex-col overflow-hidden relative min-w-0'>
							<StreamingTranscription
								isRecording={audioState === 'listening'}
							/>

							{/* Conditional rendering based on file type */}
							{!currentFile ? (
								/* Empty state when no file is open */
								<div className='flex-1 flex flex-col items-center justify-center text-muted-foreground'>
									<FileText
										size={48}
										className='mb-4 opacity-30'
									/>
									<p className='text-sm'>No file open</p>
									<p className='text-xs mt-1 opacity-60'>
										Select a file from the sidebar or press
										Ctrl+P
									</p>
								</div>
							) : isImageFile(currentFile) ? (
								<ImageViewer filePath={currentFile} />
							) : (
								<>
									<Editor
										filePath={currentFile}
										audioState={audioState}
										onContentSaved={(content) =>
											vaultMeta.recordContent(content)
										}
										onContentChange={(content) =>
											setEditorContent(content)
										}
										onDirtyChange={(isDirty) => {
											if (currentFile) {
												handleTabDirtyChange(
													currentFile,
													isDirty,
												);
											}
										}}
										noteId={vaultMeta.activeNoteId}
										vaultPath={vaultPath}
										onNavigate={(target, _blockId, newTab) => {
											// Navigate to the target note from wiki link or transclusion
											if (!vaultPath) return;
											const normalizedVault = vaultPath
												.replaceAll('\\', '/')
												.replace(/\/+$/g, '');
											const targetPath = target.endsWith(
												'.md',
											)
												? target
												: target + '.md';
											const fullPath = `${normalizedVault}/${targetPath}`;

											// Ctrl/Cmd+click opens in new tab
											if (newTab) {
												handleOpenInNewTab(fullPath);
											} else {
												handleFileSelect(fullPath);
											}
										}}
									/>
								</>
							)}

							{/* Status Bar */}
							<StatusBar
								content={editorContent}
								filePath={currentFile}
								isRecording={audioState === 'listening'}
								isDirty={activeTab?.isDirty}
							/>

							<Omnibox
								onCommand={handleVoiceCommand}
								onDialogOpen={setOpenDialog}
								isListening={audioState === 'listening'}
								onToggleListening={toggleListening}
								onOpenNoteById={onOpenNoteById}
								onSetActiveNoteTags={onSetActiveNoteTags}
								onConfigureCrdtWebSocket={
									onConfigureCrdtWebSocket
								}
								onClearCrdtWebSocket={onClearCrdtWebSocket}
							/>

							{voiceEnabled && (
								<VoiceIndicator
									state={audioState}
									onLogClick={() =>
										setOpenDialog('voice-log')
									}
									onToggleListening={toggleListening}
									streamingText={streamingTranscription}
									audioSamples={recentAudioSamples}
									rightOffset={44}
								/>
							)}
						</div>

						{/* Right Panel */}
						<RightPanel
							activeTab={rightPanel}
							onTabChange={setRightPanel}
						>
							{rightPanel === 'outline' && (
								<OutlinePanel
									content={editorContent}
									onNavigate={(line, from) => {
										emitMutterEvent('mutter:scroll-to-line', { line, from });
									}}
								/>
							)}
							{rightPanel === 'backlinks' && (
								<BacklinksPanel
									noteId={vaultMeta.activeNoteId}
									onNavigate={(relPath) => {
										if (!vaultPath) return;
										const normalizedVault = vaultPath
											.replaceAll('\\', '/')
											.replace(/\/+$/g, '');
										handleFileSelect(
											`${normalizedVault}/${relPath}`,
										);
									}}
								/>
							)}
							{rightPanel === 'search' && (
								<SearchPanel
									onNavigate={(relPath) => {
										if (!vaultPath) return;
										const normalizedVault = vaultPath
											.replaceAll('\\', '/')
											.replace(/\/+$/g, '');
										handleFileSelect(
											`${normalizedVault}/${relPath}`,
										);
									}}
								/>
							)}
							{rightPanel === 'graph' && (
								<GraphPanel
									onNavigate={(relPath) => {
										if (!vaultPath) return;
										const normalizedVault = vaultPath
											.replaceAll('\\', '/')
											.replace(/\/+$/g, '');
										handleFileSelect(
											`${normalizedVault}/${relPath}`,
										);
									}}
									onExpand={() => setGraphDialogOpen(true)}
								/>
							)}
						</RightPanel>
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
						}))}
					/>
					<SettingsDialog
						open={openDialog === 'settings'}
						onOpenChange={(open) => !open && setOpenDialog(null)}
					/>
					{textCleanupData && (
						<TextCleanupDialog
							open={openDialog === 'text-cleanup'}
							onOpenChange={(open) => {
								if (!open) {
									setOpenDialog(null);
									setTextCleanupData(null);
								}
							}}
							text={textCleanupData.text}
							selectionRange={textCleanupData.selectionRange}
							onApply={(cleanedText, range) => {
								emitMutterEvent('mutter:apply-text-cleanup', { cleanedText, range });
							}}
						/>
					)}

					<WhisperModelSelector
						open={modelSelectorOpen}
						onOpenChange={setModelSelectorOpen}
					/>
					<GraphDialog
						open={graphDialogOpen}
						onOpenChange={setGraphDialogOpen}
						onNavigate={(relPath) => {
							if (!vaultPath) return;
							const normalizedVault = vaultPath
								.replaceAll('\\', '/')
								.replace(/\/+$/g, '');
							handleFileSelect(`${normalizedVault}/${relPath}`);
						}}
					/>
					<Toaster />
				</div>
			</VaultMetadataProvider>
		</EditorContextProvider>
	);
}

export default App;
