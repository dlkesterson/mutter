import { useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './AudioControl.css';

interface AudioControlProps {
	audioState: 'idle' | 'listening' | 'processing' | 'executing';
	onStateChange: (
		state: 'idle' | 'listening' | 'processing' | 'executing'
	) => void;
}

export default function AudioControl({
	audioState,
	onStateChange,
}: AudioControlProps) {
	const [isRecording, setIsRecording] = useState(false);
	const audioContextRef = useRef<AudioContext | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const audioBufferRef = useRef<number[]>([]);
	const silenceTimerRef = useRef<number | null>(null);

	const finalizeTranscription = async () => {
		if (audioBufferRef.current.length === 0) return;

		onStateChange('processing');

		try {
			const audioData = audioBufferRef.current;
			audioBufferRef.current = [];

			const transcription: string = await invoke('transcribe_audio', {
				audioBuffer: audioData,
			});

			console.log('Transcription:', transcription);

			onStateChange('executing');

			// Call the global handler exposed by Editor
			if ((window as any).handleTranscription) {
				await (window as any).handleTranscription(transcription);
			}

			setTimeout(() => {
				if (isRecording) {
					onStateChange('listening');
				} else {
					onStateChange('idle');
				}
			}, 500);
		} catch (error) {
			console.error('Error finalizing transcription:', error);
			onStateChange('listening');
		}
	};

	const startRecording = async () => {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: true,
			});
			streamRef.current = stream;

			const audioContext = new AudioContext({ sampleRate: 16000 });
			audioContextRef.current = audioContext;

			// TODO: Load AudioWorklet for processing
			// await audioContext.audioWorklet.addModule('/audio-processor.js');

			const source = audioContext.createMediaStreamSource(stream);

			// For now, we'll use ScriptProcessor (deprecated but works)
			// In production, use AudioWorklet
			const processor = audioContext.createScriptProcessor(4096, 1, 1);

			processor.onaudioprocess = async (e) => {
				const inputData = e.inputBuffer.getChannelData(0);
				const pcmData = Array.from(inputData);

				// Add to buffer
				audioBufferRef.current.push(...pcmData);

				// Simple energy-based VAD
				const energy =
					pcmData.reduce((sum, sample) => sum + sample * sample, 0) /
					pcmData.length;
				const hasVoice = energy > 0.001;

				if (hasVoice) {
					// Reset silence timer
					if (silenceTimerRef.current) {
						clearTimeout(silenceTimerRef.current);
						silenceTimerRef.current = null;
					}
				} else {
					// Start silence timer if not already running
					if (
						!silenceTimerRef.current &&
						audioBufferRef.current.length > 0
					) {
						silenceTimerRef.current = window.setTimeout(() => {
							finalizeTranscription();
							silenceTimerRef.current = null;
						}, 800); // 800ms of silence triggers transcription
					}
				}

				try {
					await invoke('process_audio_chunk', { pcmData });
				} catch (error) {
					console.error('Error processing audio:', error);
				}
			};

			source.connect(processor);
			processor.connect(audioContext.destination);

			setIsRecording(true);
			onStateChange('listening');
		} catch (error) {
			console.error('Error starting recording:', error);
		}
	};

	const stopRecording = () => {
		// Clear any pending silence timer
		if (silenceTimerRef.current) {
			clearTimeout(silenceTimerRef.current);
			silenceTimerRef.current = null;
		}

		// Finalize any remaining audio
		if (audioBufferRef.current.length > 0) {
			finalizeTranscription();
		}

		if (streamRef.current) {
			streamRef.current.getTracks().forEach((track) => track.stop());
			streamRef.current = null;
		}

		if (audioContextRef.current) {
			audioContextRef.current.close();
			audioContextRef.current = null;
		}

		setIsRecording(false);
		onStateChange('idle');
	};

	const toggleRecording = () => {
		if (isRecording) {
			stopRecording();
		} else {
			startRecording();
		}
	};

	return (
		<div className='audio-control'>
			<button
				className={`mic-button ${audioState}`}
				onClick={toggleRecording}
				title={isRecording ? 'Stop Recording' : 'Start Recording'}
			>
				<svg
					width='24'
					height='24'
					viewBox='0 0 24 24'
					fill='none'
					stroke='currentColor'
					strokeWidth='2'
					strokeLinecap='round'
					strokeLinejoin='round'
				>
					<path d='M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z' />
					<path d='M19 10v2a7 7 0 0 1-14 0v-2' />
					<line x1='12' y1='19' x2='12' y2='23' />
					<line x1='8' y1='23' x2='16' y2='23' />
				</svg>
			</button>
		</div>
	);
}
