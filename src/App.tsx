import { useCallback, useState, useEffect, useRef } from 'react';
import { FileText } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { hasLoadedModel, loadWhisperModel } from './services/whisper';
import { useNavigationHistory } from './hooks/useNavigationHistory';
import { useTabManager } from './hooks/useTabManager';
import { useDialogManager } from './hooks/useDialogManager';
import { useVoicePipeline } from './hooks/useVoicePipeline';
import Editor from './components/Editor';
import type { EditorHandle } from './components/Editor';
import { ImageViewer } from './components/ImageViewer';
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
import type { SidebarHandle } from './components/Sidebar';
import { useVaultIndex } from '@/hooks/useVaultIndex';
import { normalizePath } from '@/vault/vaultIndex';
import { TabBar } from './components/TabBar';
import { EditorContextProvider } from '@/context/EditorContextProvider';
import { VaultMetadataProvider } from '@/context/VaultMetadataContext';
import { BacklinksPanel } from './components/BacklinksPanel';

import { OutlinePanel } from './components/OutlinePanel';
import { GraphPanel, GraphDialog } from './components/graph';
import { StatusBar } from './components/StatusBar';
import { TextCleanupDialog } from './components/dialogs/TextCleanupDialog';
import { RightPanel } from './components/RightPanel';

function App() {
	// Refs for imperative child APIs
	const editorRef = useRef<EditorHandle>(null);
	const sidebarRef = useRef<SidebarHandle>(null);

	// Use a ref to break the circular dependency between useNavigationHistory and useTabManager
	const handleFileSelectRef = useRef<(path: string, permanent?: boolean, isHistory?: boolean) => void>(null);

	// Navigation history — keyboard shortcuts call handleFileSelectRef directly
	const { canGoBack, canGoForward, recordNavigation, goBack, goForward } =
		useNavigationHistory({
			onNavigate: (path) => handleFileSelectRef.current?.(path, false, true),
		});

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

	// Keep the ref in sync
	useEffect(() => {
		handleFileSelectRef.current = handleFileSelect;
	}, [handleFileSelect]);

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
		openTextCleanup,
	} = useDialogManager();

	// Helper: open text cleanup dialog using editor state
	const triggerTextCleanup = useCallback(() => {
		const data = editorRef.current?.getCleanupData();
		if (data) {
			openTextCleanup(data);
		}
	}, [openTextCleanup]);

	// Voice pipeline
	const {
		audioState,
		streamingTranscription,
		voiceLogEntries,
		voiceEnabled,
		recentAudioSamples,
		toggleListening,
		reloadVoiceSettings,
	} = useVoicePipeline({
		onModelSelectorOpen: () => setModelSelectorOpen(true),
		onTranscriptionResult: (text) => editorRef.current?.insertText(text),
	});

	const [vaultPath, setVaultPath] = useState<string | null>(null);
	const [isInitialized, setIsInitialized] = useState(false);
	const [isQuickCapture, setIsQuickCapture] = useState(false);

	// Editor content for status bar and outline
	const [editorContent, setEditorContent] = useState<string>('');

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
		const syncModeFromHash = () => {
			const hash = window.location.hash;
			setIsQuickCapture(hash.startsWith('#/quick-capture'));
		};

		syncModeFromHash();
		window.addEventListener('hashchange', syncModeFromHash);
		return () => window.removeEventListener('hashchange', syncModeFromHash);
	}, []);

	useEffect(() => {
		if (isQuickCapture) return; // Skip initialization in quick-capture mode
		// Initialize app on startup
		const initialize = async () => {
			try {
				// Register global hotkey
				try {
					await invoke('register_global_hotkey', {
						shortcut: 'CommandOrControl+Shift+Space',
					});
				} catch {
					// Hotkey registration can fail on some platforms
				}

				setIsInitialized(true);

				// Restore last opened file
				const lastFile =
					await getStorageItem<string>('last_opened_file');
				if (lastFile) {
					handleFileSelect(lastFile);
				}
			} catch (error) {
				console.error('Failed to initialize:', error);
				setIsInitialized(true);
			}
		};

		initialize();
	}, [isQuickCapture]);

	// Save current file to storage when it changes
	useEffect(() => {
		if (currentFile) {
			setStorageItem('last_opened_file', currentFile);
		}
	}, [currentFile]);

	const vaultMeta = useVaultIndex({
		vaultPath,
		activeFilePath: currentFile,
	});

	// Shared helper: resolve relative vault path to absolute and navigate
	const navigateToRelPath = useCallback(
		(relPath: string) => {
			if (!vaultPath) return;
			handleFileSelect(`${normalizePath(vaultPath)}/${relPath}`);
		},
		[vaultPath, handleFileSelect],
	);

	// Open model selector on first launch if no model is loaded
	useEffect(() => {
		const checkModel = async () => {
			try {
				const hasModel = await hasLoadedModel();
				if (hasModel) return;

				const savedModelId = await getStorageItem<string>(
					'selected_whisper_model',
				);

				if (savedModelId) {
					try {
						await loadWhisperModel(savedModelId);
						return;
					} catch {
						// Saved model failed to load — fall through to selector
					}
				}

				setModelSelectorOpen(true);
			} catch {
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
			if ((e.ctrlKey || e.metaKey) && (e.key === 'o' || e.key === 'p')) {
				e.preventDefault();
				setOpenDialog('files');
			}
			if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
				e.preventDefault();
				if (activeTabId) {
					handleTabClose(activeTabId, {
						stopPropagation: () => {},
					} as React.MouseEvent);
				}
			}
			if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
				e.preventDefault();
				sidebarRef.current?.createNote();
			}
			if ((e.ctrlKey || e.metaKey) && e.key === ',') {
				e.preventDefault();
				setOpenDialog('settings');
			}
			if (
				(e.ctrlKey || e.metaKey) &&
				e.shiftKey &&
				e.key.toLowerCase() === 'l'
			) {
				e.preventDefault();
				triggerTextCleanup();
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [activeTabId]);


	if (isQuickCapture) {
		return <QuickCapture />;
	}

	return (
		<EditorContextProvider>
			<VaultMetadataProvider
				ready={vaultMeta.ready}
				activeNoteId={vaultMeta.activeNoteId}
				vaultPath={vaultPath}
				normalizedVaultPath={vaultMeta.normalizedVaultPath}
				loadingPhase={vaultMeta.loadingPhase}
				manifest={vaultMeta.manifest}
				noteCount={vaultMeta.noteCount}
				graphCache={vaultMeta.graphCache}
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
							sidebarRef.current?.revealInExplorer(path);
						}}
						canGoBack={canGoBack}
						canGoForward={canGoForward}
						onGoBack={handleGoBack}
						onGoForward={handleGoForward}
					/>

					{/* Main content area with sidebars */}
					<div className='flex flex-1 overflow-hidden'>
						<Sidebar
							ref={sidebarRef}
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
										ref={editorRef}
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
											if (!vaultPath) return;
											const normalizedVault = normalizePath(vaultPath);
											const m = vaultMeta.manifest;

											// Resolve via vault index (handles subdirectories, case-insensitive)
											let relPath: string | null = null;
											if (m) {
												const withMd = target.endsWith('.md') ? target : `${target}.md`;
												if (m.path_index[withMd]) {
													relPath = withMd;
												} else {
													const lowerTarget = target.toLowerCase().replace(/\.md$/i, '');
													for (const path of Object.keys(m.path_index)) {
														const filename = path.split('/').pop()?.replace(/\.md$/i, '') ?? '';
														if (filename.toLowerCase() === lowerTarget) {
															relPath = path;
															break;
														}
													}
												}
											}

											// Fallback to flat path if vault index lookup fails
											if (!relPath) {
												relPath = target.endsWith('.md') ? target : `${target}.md`;
											}

											const fullPath = `${normalizedVault}/${relPath}`;

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
							onCleanupText={triggerTextCleanup}
						>
							{rightPanel === 'outline' && (
								<OutlinePanel
									content={editorContent}
									onNavigate={(line) => {
										editorRef.current?.scrollToLine(line);
									}}
								/>
							)}
							{rightPanel === 'backlinks' && (
								<BacklinksPanel
									noteId={vaultMeta.activeNoteId}
									onNavigate={navigateToRelPath}
								/>
							)}
							{rightPanel === 'graph' && (
								<GraphPanel
									onNavigate={navigateToRelPath}
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
						onMinimapToggle={(enabled) => editorRef.current?.setMinimapEnabled(enabled)}
						onFontSizeChange={(size) => editorRef.current?.setFontSize(size)}
						onVoiceSettingsChanged={reloadVoiceSettings}
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
								editorRef.current?.applyTextCleanup(cleanedText, range);
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
						onNavigate={navigateToRelPath}
					/>
					<Toaster />
				</div>
			</VaultMetadataProvider>
		</EditorContextProvider>
	);
}

export default App;
