import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { Mic, Square, Save, X } from 'lucide-react';

export function QuickCapture() {
	const { startRecording, stopRecording } = useAudioRecorder();
	const [transcript, setTranscript] = useState('');
	const [status, setStatus] = useState<
		'idle' | 'recording' | 'processing' | 'saved'
	>('idle');

	useEffect(() => {
		// Auto-start recording when window opens
		startRecording();
		setStatus('recording');

		// Listen for partial results if we want live preview
		// For now, we'll just wait for stop
	}, []);

	const handleStop = async () => {
		setStatus('processing');
		const result = await stopRecording();
		if (result?.text) {
			setTranscript(result.text);
			setStatus('idle');
		} else {
			setStatus('idle');
		}
	};

	const handleSave = async () => {
		if (!transcript) return;

		try {
			await invoke('append_to_inbox', {
				text: transcript,
				timestamp: new Date().toLocaleString(),
			});
			setStatus('saved');
			setTimeout(() => {
				invoke('close_quick_capture');
			}, 1000);
		} catch (e) {
			console.error('Failed to save', e);
		}
	};

	const handleCancel = () => {
		invoke('close_quick_capture');
	};

	// Handle Escape key
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				handleCancel();
			}
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, []);

	return (
		<div className='h-screen w-screen bg-background p-4 flex flex-col items-center justify-center space-y-4 border-4 border-primary/20'>
			<div className='text-lg font-semibold'>Quick Capture</div>

			<div className='flex items-center justify-center h-24 w-24 rounded-full bg-muted relative'>
				{status === 'recording' && (
					<div className='absolute inset-0 rounded-full border-4 border-red-500 animate-ping opacity-20' />
				)}
				{status === 'recording' ? (
					<Mic className='h-10 w-10 text-red-500' />
				) : (
					<div className='text-2xl'>📝</div>
				)}
			</div>

			{status === 'recording' ? (
				<button
					onClick={handleStop}
					className='px-6 py-2 bg-red-500 text-white rounded-full hover:bg-red-600 flex items-center gap-2'
				>
					<Square size={16} /> Stop & Review
				</button>
			) : status === 'saved' ? (
				<div className='text-green-500 font-medium'>
					Saved to Inbox!
				</div>
			) : (
				<div className='flex gap-2 w-full'>
					<button
						onClick={handleSave}
						disabled={!transcript}
						className='flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 flex items-center justify-center gap-2'
					>
						<Save size={16} /> Save
					</button>
					<button
						onClick={handleCancel}
						className='px-4 py-2 bg-muted text-muted-foreground rounded-md hover:bg-muted/80'
					>
						<X size={16} />
					</button>
				</div>
			)}

			{transcript && (
				<div className='w-full p-3 bg-muted/50 rounded-md text-sm max-h-32 overflow-y-auto'>
					{transcript}
				</div>
			)}
		</div>
	);
}
