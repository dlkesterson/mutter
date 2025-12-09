import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import Editor from './components/Editor';
import Sidebar from './components/Sidebar';
import AudioControl from './components/AudioControl';
import VoiceLogSidebar, { VoiceLogEntry } from './components/VoiceLogSidebar';
import { WhisperModelSelector } from './components/WhisperModelSelector';
import { StreamingTranscription } from './components/StreamingTranscription';
import { Toaster } from './components/ui/toaster';
import { getStorageItem, setStorageItem } from './utils/storage';
import './styles/App.css';

function App() {
	const [currentFile, setCurrentFile] = useState<string | null>(null);
	const [audioState, setAudioState] = useState<
		'idle' | 'listening' | 'processing' | 'executing'
	>('idle');
	const [isInitialized, setIsInitialized] = useState(false);
	const [voiceLogEntries, setVoiceLogEntries] = useState<VoiceLogEntry[]>([]);
	const [isVoiceLogCollapsed, setIsVoiceLogCollapsed] = useState(false);
	const [modelSelectorOpen, setModelSelectorOpen] = useState(false);

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

	useEffect(() => {
		// Initialize embeddings on startup
		const initialize = async () => {
			try {
				await invoke('load_embedding_model');
				await invoke('initialize_embeddings');
				setIsInitialized(true);

				// Restore last opened file
				const lastFile = await getStorageItem<string>(
					'last_opened_file'
				);
				if (lastFile) {
					setCurrentFile(lastFile);
				}
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

	const isReady = isInitialized;

	return (
		<div className='app'>
			<StreamingTranscription isRecording={audioState === 'listening'} />
			<Sidebar onFileSelect={setCurrentFile} />
			<main className='main-content'>
				<Editor
					filePath={currentFile}
					audioState={audioState}
					onVoiceLogEntry={addVoiceLogEntry}
				/>
				{isReady && (
					<AudioControl
						audioState={audioState}
						onStateChange={setAudioState}
						onOpenModelSelector={() => setModelSelectorOpen(true)}
					/>
				)}
			</main>
			<VoiceLogSidebar
				entries={voiceLogEntries}
				isCollapsed={isVoiceLogCollapsed}
				onToggle={() => setIsVoiceLogCollapsed(!isVoiceLogCollapsed)}
			/>
			<WhisperModelSelector
				open={modelSelectorOpen}
				onOpenChange={setModelSelectorOpen}
			/>
			<Toaster />
			{!isInitialized && (
				<div className='loading-overlay'>
					<div className='loading-spinner'>
						Initializing AI Brain...
					</div>
				</div>
			)}
		</div>
	);
}

export default App;
