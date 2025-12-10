import { useState, useEffect } from 'react';
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

type DialogType = 'files' | 'voice-log' | 'settings' | null;

function App() {
	const [currentFile, setCurrentFile] = useState<string | null>(null);
	const [audioState, setAudioState] = useState<
		'idle' | 'listening' | 'processing' | 'executing'
	>('idle');
	const [isInitialized, setIsInitialized] = useState(false);
	const [voiceLogEntries, setVoiceLogEntries] = useState<VoiceLogEntry[]>([]);
	const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
	const [openDialog, setOpenDialog] = useState<DialogType>(null);

	const { startRecording, stopRecording } = useAudioRecorder(() => {
		console.log('Silence detected');
	});

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

	return (
		<div className='flex flex-col h-screen w-screen overflow-hidden bg-background text-foreground'>
			<StreamingTranscription isRecording={audioState === 'listening'} />

			<main className='flex-1 flex flex-col overflow-hidden relative'>
				<Editor
					filePath={currentFile}
					audioState={audioState}
					onVoiceLogEntry={addVoiceLogEntry}
				/>

				<Omnibox
					onCommand={handleVoiceCommand}
					onDialogOpen={setOpenDialog}
					isListening={audioState === 'listening'}
					onToggleListening={toggleListening}
				/>

				<VoiceIndicator
					state={audioState}
					onLogClick={() => setOpenDialog('voice-log')}
					onToggleListening={toggleListening}
				/>
			</main>

			{/* Dialogs */}
			<FileNavigatorDialog
				open={openDialog === 'files'}
				onOpenChange={(open) => !open && setOpenDialog(null)}
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

			{!isInitialized && (
				<div className='fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm'>
					<div className='text-lg font-medium animate-pulse'>
						Initializing AI Brain...
					</div>
				</div>
			)}
		</div>
	);
}

export default App;
