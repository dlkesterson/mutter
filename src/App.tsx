import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import Editor from './components/Editor';
import Sidebar from './components/Sidebar';
import AudioControl from './components/AudioControl';
import './styles/App.css';

function App() {
	const [currentFile, setCurrentFile] = useState<string | null>(null);
	const [audioState, setAudioState] = useState<
		'idle' | 'listening' | 'processing' | 'executing'
	>('idle');
	const [isInitialized, setIsInitialized] = useState(false);

	useEffect(() => {
		// Initialize embeddings on startup
		const initialize = async () => {
			try {
				console.log('Initializing command embeddings...');
				await invoke('initialize_embeddings');
				console.log('Embeddings initialized successfully');
				setIsInitialized(true);
			} catch (error) {
				console.error('Failed to initialize embeddings:', error);
				// Still allow the app to run
				setIsInitialized(true);
			}
		};

		initialize();
	}, []);

	return (
		<div className='app'>
			<Sidebar onFileSelect={setCurrentFile} />
			<main className='main-content'>
				<Editor filePath={currentFile} audioState={audioState} />
				<AudioControl
					audioState={audioState}
					onStateChange={setAudioState}
				/>
			</main>
			{!isInitialized && (
				<div className='loading-overlay'>
					<div className='loading-spinner'>Initializing...</div>
				</div>
			)}
		</div>
	);
}

export default App;
