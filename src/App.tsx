import { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import { PanelRightOpen, PanelRightClose, FileText } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useAudioRecorder } from './hooks/useAudioRecorder';
import { useNavigationHistory } from './hooks/useNavigationHistory';
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
import { useToast } from './hooks/use-toast';
import { getStorageItem, setStorageItem } from './utils/storage';
import { VoiceLogEntry } from './types';
import { QuickCapture } from './components/QuickCapture';
import { Sidebar } from './components/Sidebar';
import { CrdtSpike } from './components/CrdtSpike';
import { useVaultMetadataCrdt } from '@/hooks/useVaultMetadataCrdt';
import { TabBar, Tab } from './components/TabBar';
import { EditorContextProvider } from '@/context/EditorContextProvider';
import { VaultMetadataProvider } from '@/context/VaultMetadataContext';
import { BacklinksPanel } from './components/BacklinksPanel';
import { AIQueryPanel } from './components/AIQueryPanel';
import { QueryPanel } from './components/QueryPanel';
import { OutlinePanel } from './components/OutlinePanel';
import { GraphPanel, GraphDialog } from './components/graph';
import { StatusBar } from './components/StatusBar';
import { SyncStatusIndicator } from './components/sync/SyncStatusIndicator';
import type { LLMSettings } from './services/llm-service';
import { useSettings, useCredentials } from '@/lib/settings';
import { SupertagCreatorDialog } from './components/dialogs/supertag-creator-dialog';
import { SupertagApplyDialog } from './components/dialogs/supertag-apply-dialog';
import { SupertagEditorDialog } from './components/dialogs/supertag-editor-dialog';
import { NoteSuperTags } from './components/supertags/NoteSuperTags';
import { SupertagsPanel } from './components/supertags/SupertagsPanel';

type DialogType = 'files' | 'voice-log' | 'settings' | 'supertag-creator' | 'supertag-apply' | 'supertag-editor' | null;

const CRDT_WS_URL_KEY = 'mutter:crdt_ws_url';

function App() {
	const [tabs, setTabs] = useState<Tab[]>([]);
	const [activeTabId, setActiveTabId] = useState<string | null>(null);
	const activeTab = tabs.find((t) => t.id === activeTabId);
	const currentFile = activeTab?.path || null;

	const [vaultPath, setVaultPath] = useState<string | null>(null);
	const [audioState, setAudioState] = useState<
		'idle' | 'listening' | 'processing' | 'executing'
	>('idle');
	const [streamingTranscription, setStreamingTranscription] = useState<string>('');
	const [isInitialized, setIsInitialized] = useState(false);
	const [voiceLogEntries, setVoiceLogEntries] = useState<VoiceLogEntry[]>([]);
	const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
	const [openDialog, setOpenDialog] = useState<DialogType>(null);
	const [fileDialogQuery, setFileDialogQuery] = useState<string>('');
	const [isQuickCapture, setIsQuickCapture] = useState(false);
	const [isCrdtSpike, setIsCrdtSpike] = useState(false);

	// Right panel state
	const [rightPanel, setRightPanel] = useState<'backlinks' | 'ai-query' | 'query' | 'outline' | 'graph' | 'tags' | null>(null);
	const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(true);
	const [rightPanelWidth, setRightPanelWidth] = useState(320);
	const [isRightPanelResizing, setIsRightPanelResizing] = useState(false);
	// Track last used panel for toggle button
	const lastRightPanelRef = useRef<'backlinks' | 'ai-query' | 'query' | 'outline' | 'graph' | 'tags'>('outline');
	// Graph dialog state
	const [graphDialogOpen, setGraphDialogOpen] = useState(false);
	// Supertag editor state
	const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);

	// Update last panel ref when panel changes
	useEffect(() => {
		if (rightPanel) {
			lastRightPanelRef.current = rightPanel;
		}
	}, [rightPanel]);

	// Toggle right panel collapsed state
	const toggleRightPanel = useCallback(() => {
		setIsRightPanelCollapsed(prev => !prev);
		// When expanding, set a panel if none selected
		if (isRightPanelCollapsed && !rightPanel) {
			setRightPanel(lastRightPanelRef.current);
		}
	}, [isRightPanelCollapsed, rightPanel]);

	// Right panel resize handlers
	const stopRightPanelResizing = useCallback(() => {
		setIsRightPanelResizing(false);
	}, []);

	const resizeRightPanel = useCallback(
		(mouseMoveEvent: MouseEvent) => {
			if (isRightPanelResizing) {
				// Calculate width from right edge of window
				const newWidth = window.innerWidth - mouseMoveEvent.clientX;
				if (newWidth > 200 && newWidth < 600) {
					setRightPanelWidth(newWidth);
				}
			}
		},
		[isRightPanelResizing]
	);

	useEffect(() => {
		window.addEventListener('mousemove', resizeRightPanel);
		window.addEventListener('mouseup', stopRightPanelResizing);
		return () => {
			window.removeEventListener('mousemove', resizeRightPanel);
			window.removeEventListener('mouseup', stopRightPanelResizing);
		};
	}, [resizeRightPanel, stopRightPanelResizing]);

	// Editor content for status bar and outline
	const [editorContent, setEditorContent] = useState<string>('');

	// Navigation history
	const {
		canGoBack,
		canGoForward,
		recordNavigation,
		goBack,
		goForward,
	} = useNavigationHistory();

	// LLM settings derived from config context
	const { settings } = useSettings();
	const { credentials } = useCredentials();
	const llmSettings: LLMSettings = useMemo(() => {
		// Default fallback when settings not yet loaded
		if (!settings) {
			return {
				provider: 'ollama',
				apiKey: '',
				model: 'qwen2.5:3b',
				ollamaUrl: 'http://localhost:11434',
				timeoutMs: 30000,
			};
		}

		const provider = settings.stream_mode.provider;
		let apiKey = '';
		let model = '';

		if (provider === 'claude') {
			apiKey = credentials?.ai_providers.claude.api_key || '';
			model = settings.ai_providers.claude.model;
		} else if (provider === 'openai') {
			apiKey = credentials?.ai_providers.openai.api_key || '';
			model = settings.ai_providers.openai.model;
		} else {
			// Ollama doesn't need an API key
			model = settings.ai_providers.ollama.model;
		}

		return {
			provider,
			apiKey,
			model,
			ollamaUrl: settings.ai_providers.ollama.url,
			timeoutMs: settings.stream_mode.timeout_ms,
		};
	}, [settings, credentials]);

	// Toast notifications
	const { toast } = useToast();

	// Voice settings
	const [voiceEnabled, setVoiceEnabled] = useState(true);
	const [autoStopEnabled, setAutoStopEnabled] = useState(true);
	const [autoStopTimeoutMs, setAutoStopTimeoutMs] = useState(3000);

	// Load voice settings from storage
	useEffect(() => {
		const loadSettings = async () => {
			const voiceOn = await getStorageItem<boolean>('voice_enabled');
			const enabled = await getStorageItem<boolean>('auto_stop_enabled');
			const timeout = await getStorageItem<number>('auto_stop_timeout_ms');

			if (voiceOn !== null) setVoiceEnabled(voiceOn);
			if (enabled !== null) setAutoStopEnabled(enabled);
			if (timeout !== null) setAutoStopTimeoutMs(timeout);
		};

		loadSettings();

		// Listen for voice settings changes from settings dialog
		const handleVoiceSettingsChange = () => {
			loadSettings();
		};
		window.addEventListener('mutter:voice-settings-changed', handleVoiceSettingsChange);
		return () => window.removeEventListener('mutter:voice-settings-changed', handleVoiceSettingsChange);
	}, []);

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

	// Listen for dialog/panel open events from voice commands and Editor
	useEffect(() => {
		const handleOpenDialog = (event: CustomEvent<{ dialog: string; [key: string]: any }>) => {
			const { dialog } = event.detail;
			console.log('[App] Received mutter:open-dialog:', dialog, event.detail);

			switch (dialog) {
				case 'ai-query':
					setRightPanel('ai-query');
					break;
				case 'backlinks':
					setRightPanel('backlinks');
					break;
				case 'query':
					setRightPanel('query');
					break;
				case 'supertag-creator':
				setOpenDialog('supertag-creator');
				break;
			case 'supertag-apply':
				setOpenDialog('supertag-apply');
				break;
			case 'supertag-query':
			case 'insert-embed':
				// These could open dedicated dialogs in the future
				console.log(`[App] Dialog ${dialog} not yet implemented`);
				break;
				default:
					console.warn('[App] Unknown dialog:', dialog);
			}
		};

		// Listen for settings open events (e.g., from SyncStatusIndicator)
		const handleOpenSettings = () => {
			setOpenDialog('settings');
		};

		window.addEventListener('mutter:open-dialog', handleOpenDialog as EventListener);
		window.addEventListener('mutter:open-settings', handleOpenSettings);
		return () => {
			window.removeEventListener('mutter:open-dialog', handleOpenDialog as EventListener);
			window.removeEventListener('mutter:open-settings', handleOpenSettings);
		};
	}, []);

	const { startRecording, stopRecording, setAutoStopCallback, recentAudioSamples } = useAudioRecorder({
		onSilenceDetected: () => {
			console.log('🔇 Silence detected');
		},
		onStreamingTranscription: (text: string) => {
			console.log('📝 Streaming transcription:', text);
			setStreamingTranscription(text);
		},
		autoStopOnSilence: autoStopEnabled,
		silenceTimeoutMs: autoStopTimeoutMs,
		// Enable live streaming transcription (shows words every 4 seconds while recording)
		enableStreaming: true,
		streamingIntervalMs: 4000,
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

	const handleFileSelect = (path: string, permanent: boolean = false, fromHistory: boolean = false) => {
		// Record navigation unless coming from back/forward
		if (!fromHistory) {
			recordNavigation(path);
		}

		setTabs((prevTabs) => {
			const existingTab = prevTabs.find((t) => t.path === path);
			if (existingTab) {
				setActiveTabId(existingTab.id);
				if (permanent && existingTab.isPreview) {
					return prevTabs.map((t) =>
						t.id === existingTab.id ? { ...t, isPreview: false } : t
					);
				}
				return prevTabs;
			}

			const activeTab = prevTabs.find((t) => t.id === activeTabId);

			// Don't reuse pinned tabs - open in new tab instead
			if (activeTab?.isPinned) {
				const newTab: Tab = {
					id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
					path,
					title: path.split('/').pop() || 'Untitled',
					isPreview: !permanent,
				};
				setActiveTabId(newTab.id);
				return [...prevTabs, newTab];
			}

			// Reuse preview tab if available and not dirty
			if (
				activeTab &&
				activeTab.isPreview &&
				!permanent &&
				!activeTab.isDirty
			) {
				return prevTabs.map((t) => {
					if (t.id === activeTabId) {
						return {
							...t,
							path,
							title: path.split('/').pop() || 'Untitled',
							isPreview: true,
						};
					}
					return t;
				});
			}

			const newTab: Tab = {
				id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
				path,
				title: path.split('/').pop() || 'Untitled',
				isPreview: !permanent,
			};
			setActiveTabId(newTab.id);
			return [...prevTabs, newTab];
		});
	};

	// Open a file in a new tab (always creates new, never reuses)
	const handleOpenInNewTab = useCallback((path: string) => {
		recordNavigation(path);

		// Check if already open - if so, just switch to it
		const existingTab = tabs.find((t) => t.path === path);
		if (existingTab) {
			setActiveTabId(existingTab.id);
			return;
		}

		// Always create a new permanent tab
		const newTab: Tab = {
			id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
			path,
			title: path.split('/').pop() || 'Untitled',
			isPreview: false, // Permanent tab
		};
		setTabs((prev) => [...prev, newTab]);
		setActiveTabId(newTab.id);
	}, [tabs, recordNavigation]);

	// Handle navigation history events (from keyboard shortcuts)
	useEffect(() => {
		const handleNavigateHistory = (e: CustomEvent<{ path: string; direction: string }>) => {
			handleFileSelect(e.detail.path, false, true);
		};

		window.addEventListener('mutter:navigate-history', handleNavigateHistory as EventListener);
		return () => window.removeEventListener('mutter:navigate-history', handleNavigateHistory as EventListener);
	}, []);

	// Handle back/forward button clicks
	const handleGoBack = useCallback(() => {
		const path = goBack();
		if (path) {
			handleFileSelect(path, false, true);
		}
	}, [goBack]);

	const handleGoForward = useCallback(() => {
		const path = goForward();
		if (path) {
			handleFileSelect(path, false, true);
		}
	}, [goForward]);

	// Handle tab pinning
	const handleTogglePin = (id: string) => {
		setTabs(prev => prev.map(tab =>
			tab.id === id ? { ...tab, isPinned: !tab.isPinned } : tab
		));
	};

	// Zoom handling
	useEffect(() => {
		const handleZoom = (e: KeyboardEvent) => {
			if (e.ctrlKey || e.metaKey) {
				if (e.key === '=' || e.key === '+' || e.key === '-') {
					e.preventDefault();
					const delta = e.key === '=' || e.key === '+' ? 0.1 : -0.1;
					const currentZoom = parseFloat(
						(document.body.style as any).zoom || '1'
					);
					const newZoom = Math.max(
						0.5,
						Math.min(3.0, currentZoom + delta)
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

	const handleTabReorder = (fromIndex: number, toIndex: number) => {
		const newTabs = [...tabs];
		const [movedTab] = newTabs.splice(fromIndex, 1);
		newTabs.splice(toIndex, 0, movedTab);
		setTabs(newTabs);
	};

	const handleCloseOthers = (id: string) => {
		const tab = tabs.find((t) => t.id === id);
		if (tab) {
			setTabs([tab]);
			setActiveTabId(id);
		}
	};

	const handleCloseToRight = (id: string) => {
		const index = tabs.findIndex((t) => t.id === id);
		if (index !== -1) {
			const newTabs = tabs.slice(0, index + 1);
			setTabs(newTabs);
			// If the active tab was closed, switch to the rightmost remaining tab
			if (activeTabId && !newTabs.find((t) => t.id === activeTabId)) {
				setActiveTabId(newTabs[newTabs.length - 1].id);
			}
		}
	};

	const handleCloseAll = () => {
		setTabs([]);
		setActiveTabId(null);
	};

	const handleTabDirtyChange = (path: string, isDirty: boolean) => {
		setTabs((prev) =>
			prev.map((tab) => {
				if (tab.path === path) {
					// If becoming dirty, also pin the tab (remove preview status)
					return {
						...tab,
						isDirty,
						isPreview: isDirty ? false : tab.isPreview,
					};
				}
				return tab;
			})
		);
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
			console.time('[App] initialize total');
			try {
				console.time('[App] load_embedding_model');
				await invoke('load_embedding_model');
				console.timeEnd('[App] load_embedding_model');
				console.time('[App] initialize_embeddings');
				await invoke('initialize_embeddings');
				console.timeEnd('[App] initialize_embeddings');

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
				const lastFile = await getStorageItem<string>(
					'last_opened_file'
				);
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
				// Always check if a model is actually loaded, regardless of saved preference
				// The saved preference might exist but the model file could be missing/corrupt
				const hasModel = await invoke<boolean>('has_loaded_model');

				if (hasModel) {
					console.log('[Model Check] Whisper model is loaded and ready');
					return;
				}

				// Check if we have a saved model preference to try auto-loading
				const savedModelId = await getStorageItem<string>(
					'selected_whisper_model'
				);

				if (savedModelId) {
					console.log(`[Model Check] Attempting to load saved model: ${savedModelId}`);
					try {
						await invoke('load_whisper_model', { modelName: savedModelId });
						console.log(`[Model Check] ✓ Successfully loaded saved model: ${savedModelId}`);
						return;
					} catch (loadError) {
						console.error(`[Model Check] Failed to load saved model ${savedModelId}:`, loadError);
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
					handleTabClose(activeTabId, { stopPropagation: () => {} } as React.MouseEvent);
				}
			}
			// Ctrl/Cmd + N to create new note (dispatches event to Sidebar)
			if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
				e.preventDefault();
				window.dispatchEvent(new CustomEvent('mutter:create-note'));
			}
			// Ctrl/Cmd + , for settings (common pattern)
			if ((e.ctrlKey || e.metaKey) && e.key === ',') {
				e.preventDefault();
				setOpenDialog('settings');
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [activeTabId]);

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
			try {
				// Clear auto-stop callback to prevent double insertion
				setAutoStopCallback(null);

				setAudioState('processing');
				const result = await stopRecording();
				if (result) {
					if ((window as any).handleTranscription) {
						setAudioState('executing');
						await (window as any).handleTranscription(result.text);
					}
				}
			} catch (error) {
				console.error('Voice input error:', error);
			} finally {
				// Always reset to idle, even if there's an error
				setAudioState('idle');
				setStreamingTranscription(''); // Clear streaming text
			}
		} else {
			try {
				// Check if Whisper model is loaded before starting recording
				const hasModel = await invoke<boolean>('has_loaded_model');
				if (!hasModel) {
					toast({
						title: 'No Whisper Model',
						description: 'Please select a speech-to-text model in Settings first.',
						variant: 'destructive',
					});
					setModelSelectorOpen(true);
					return;
				}

				setStreamingTranscription(''); // Clear previous streaming text

				// Set the auto-stop callback BEFORE starting recording to avoid race condition
				setAutoStopCallback(async () => {
					console.log('🛑 Auto-stopping recording after 3s silence');
					try {
						setAudioState('processing');
						const result = await stopRecording();
						if (result) {
							if ((window as any).handleTranscription) {
								setAudioState('executing');
								await (window as any).handleTranscription(result.text);
							}
						}
					} catch (error) {
						console.error('Auto-stop error:', error);
					} finally {
						setAudioState('idle');
						setStreamingTranscription('');
						// Clear the callback after it fires to prevent re-use
						setAutoStopCallback(null);
					}
				});

				// Now start recording with callback already set
				await startRecording();
				setAudioState('listening');
			} catch (error) {
				console.error('Failed to start recording:', error);
				setAudioState('idle');
			}
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
		<div className='flex h-screen w-screen overflow-hidden bg-background text-foreground'>
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
						onTabReorder={handleTabReorder}
						onCloseOthers={handleCloseOthers}
						onCloseToRight={handleCloseToRight}
						onCloseAll={handleCloseAll}
						onTogglePin={handleTogglePin}
						onRevealInExplorer={(path) => {
							// Dispatch event for FileTree to scroll to and highlight the file
							window.dispatchEvent(new CustomEvent('mutter:reveal-in-explorer', {
								detail: { path }
							}));
						}}
						canGoBack={canGoBack}
						canGoForward={canGoForward}
						onGoBack={handleGoBack}
						onGoForward={handleGoForward}
					/>
					
					{/* Conditional rendering based on file type */}
					{!currentFile ? (
						/* Empty state when no file is open */
						<div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
							<FileText size={48} className="mb-4 opacity-30" />
							<p className="text-sm">No file open</p>
							<p className="text-xs mt-1 opacity-60">Select a file from the sidebar or press Ctrl+P</p>
						</div>
					) : isImageFile(currentFile) ? (
						<ImageViewer filePath={currentFile} />
					) : (
						<>
						{/* Supertag badges for the current note */}
						<div className="px-4 border-b border-border bg-background/50">
							<NoteSuperTags noteId={vaultMeta.activeNoteId} />
						</div>
						<Editor
							filePath={currentFile}
							audioState={audioState}
							onVoiceLogEntry={addVoiceLogEntry}
							onSystemCommand={handleSystemCommand}
							onContentSaved={(content) => vaultMeta.recordContent(content)}
							onContentChange={(content) => setEditorContent(content)}
							onDirtyChange={(isDirty) => {
								if (currentFile) {
									handleTabDirtyChange(currentFile, isDirty);
								}
							}}
							noteId={vaultMeta.activeNoteId}
							vaultPath={vaultPath}
							onNavigate={(target, _blockId) => {
								// Navigate to the target note from transclusion
								if (!vaultPath) return;
								const normalizedVault = vaultPath.replaceAll('\\', '/').replace(/\/+$/g, '');
								const targetPath = target.endsWith('.md') ? target : target + '.md';
								handleFileSelect(`${normalizedVault}/${targetPath}`);
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
						onConfigureCrdtWebSocket={onConfigureCrdtWebSocket}
						onClearCrdtWebSocket={onClearCrdtWebSocket}
					/>

					{voiceEnabled && (
						<VoiceIndicator
							state={audioState}
							onLogClick={() => setOpenDialog('voice-log')}
							onToggleListening={toggleListening}
							streamingText={streamingTranscription}
							audioSamples={recentAudioSamples}
							rightOffset={isRightPanelCollapsed ? 48 : rightPanelWidth}
						/>
					)}

					{/* Sync Status Indicator - fixed bottom-left */}
					<div className="fixed bottom-8 left-8 z-40">
						<SyncStatusIndicator showLabel />
					</div>

					</main>
			</div>

			{/* Right Panel - collapsible and resizable like left sidebar */}
			<div
				className="h-full flex shrink-0 relative group transition-all duration-200 ease-out border-l border-border bg-background"
				style={{ width: isRightPanelCollapsed ? 48 : rightPanelWidth }}
			>
				{/* Resize handle */}
				{!isRightPanelCollapsed && (
					<div
						className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/30 transition-colors z-10 opacity-0 group-hover:opacity-100"
						onMouseDown={() => setIsRightPanelResizing(true)}
					/>
				)}
				{isRightPanelCollapsed ? (
					/* Collapsed View - matches left sidebar styling */
					<div className="flex flex-col items-center py-4 gap-4 w-full">
						<button
							onClick={toggleRightPanel}
							className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
							title="Expand Panel"
						>
							<PanelRightOpen size={20} />
						</button>
					</div>
				) : (
					/* Expanded View */
					<div className="flex-1 flex flex-col h-full overflow-hidden">
						<div className="flex items-center justify-between px-3 py-2 border-b border-border">
							<div className="flex gap-2 flex-wrap">
								<button
									className={`text-xs px-2 py-1 rounded ${rightPanel === 'outline' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'}`}
									onClick={() => setRightPanel('outline')}
								>
									Outline
								</button>
								<button
									className={`text-xs px-2 py-1 rounded ${rightPanel === 'backlinks' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'}`}
									onClick={() => setRightPanel('backlinks')}
								>
									Backlinks
								</button>
								<button
									className={`text-xs px-2 py-1 rounded ${rightPanel === 'query' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'}`}
									onClick={() => setRightPanel('query')}
								>
									Query
								</button>
								<button
									className={`text-xs px-2 py-1 rounded ${rightPanel === 'ai-query' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'}`}
									onClick={() => setRightPanel('ai-query')}
								>
									AI Query
								</button>
								<button
									className={`text-xs px-2 py-1 rounded ${rightPanel === 'graph' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'}`}
									onClick={() => setRightPanel('graph')}
								>
									Graph
								</button>
								<button
									className={`text-xs px-2 py-1 rounded ${rightPanel === 'tags' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'}`}
									onClick={() => setRightPanel('tags')}
								>
									Tags
								</button>
							</div>
							<button
								onClick={toggleRightPanel}
								className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
								title="Collapse Panel"
							>
								<PanelRightClose size={16} />
							</button>
						</div>
						<div className="flex-1 overflow-auto">
							{rightPanel === 'outline' && (
								<OutlinePanel
									content={editorContent}
									onNavigate={(line, from) => {
										// Dispatch event for Editor to scroll to line
										window.dispatchEvent(new CustomEvent('mutter:scroll-to-line', {
											detail: { line, from }
										}));
									}}
								/>
							)}
							{rightPanel === 'backlinks' && (
								<BacklinksPanel
									noteId={vaultMeta.activeNoteId}
									onNavigate={(relPath) => {
										if (!vaultPath) return;
										const normalizedVault = vaultPath.replaceAll('\\', '/').replace(/\/+$/g, '');
										handleFileSelect(`${normalizedVault}/${relPath}`);
									}}
								/>
							)}
							{rightPanel === 'query' && (
								<QueryPanel
									onNavigate={(relPath) => {
										if (!vaultPath) return;
										const normalizedVault = vaultPath.replaceAll('\\', '/').replace(/\/+$/g, '');
										handleFileSelect(`${normalizedVault}/${relPath}`);
									}}
								/>
							)}
							{rightPanel === 'ai-query' && (
								<AIQueryPanel
									vaultPath={vaultPath}
									llmSettings={llmSettings}
									onNavigate={(relPath) => {
										if (!vaultPath) return;
										const normalizedVault = vaultPath.replaceAll('\\', '/').replace(/\/+$/g, '');
										handleFileSelect(`${normalizedVault}/${relPath}`);
									}}
								/>
							)}
							{rightPanel === 'graph' && (
								<GraphPanel
									onNavigate={(relPath) => {
										if (!vaultPath) return;
										const normalizedVault = vaultPath.replaceAll('\\', '/').replace(/\/+$/g, '');
										handleFileSelect(`${normalizedVault}/${relPath}`);
									}}
									onExpand={() => setGraphDialogOpen(true)}
								/>
							)}
							{rightPanel === 'tags' && (
								<SupertagsPanel
									noteId={vaultMeta.activeNoteId}
									onOpenCreator={() => setOpenDialog('supertag-creator')}
									onOpenApply={() => setOpenDialog('supertag-apply')}
									onEditTemplate={(id) => {
									setEditingTemplateId(id);
									setOpenDialog('supertag-editor');
								}}
								/>
							)}
						</div>
					</div>
				)}
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
			<SupertagCreatorDialog
				open={openDialog === 'supertag-creator'}
				onClose={() => setOpenDialog(null)}
			/>
			<SupertagApplyDialog
				open={openDialog === 'supertag-apply'}
				onClose={() => setOpenDialog(null)}
				noteId={vaultMeta.activeNoteId}
			/>
			<SupertagEditorDialog
				open={openDialog === 'supertag-editor'}
				onClose={() => {
					setOpenDialog(null);
					setEditingTemplateId(null);
				}}
				definitionId={editingTemplateId}
			/>

			<WhisperModelSelector
				open={modelSelectorOpen}
				onOpenChange={setModelSelectorOpen}
			/>
			<GraphDialog
				open={graphDialogOpen}
				onOpenChange={setGraphDialogOpen}
				onNavigate={(relPath) => {
					if (!vaultPath) return;
					const normalizedVault = vaultPath.replaceAll('\\', '/').replace(/\/+$/g, '');
					handleFileSelect(`${normalizedVault}/${relPath}`);
				}}
			/>
			<Toaster />

			{/* Loading overlay removed for debugging */}
		</div>
		</VaultMetadataProvider>
		</EditorContextProvider>
	);
}

export default App;
