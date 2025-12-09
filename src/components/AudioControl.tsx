import { useState, useRef, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getStorageItem, setStorageItem } from '../utils/storage';
import './AudioControl.css';

interface AudioControlProps {
	audioState: 'idle' | 'listening' | 'processing' | 'executing';
	onStateChange: (
		state: 'idle' | 'listening' | 'processing' | 'executing'
	) => void;
	onPerformanceUpdate?: (timings: PerformanceTimings) => void;
	onOpenModelSelector?: () => void;
}

interface PerformanceTimings {
	vad_ms?: number;
	stt_ms?: number;
	embed_ms?: number;
	search_ms?: number;
	total_ms?: number;
}

export default function AudioControl({
	audioState,
	onStateChange,
	onPerformanceUpdate,
	onOpenModelSelector,
}: AudioControlProps) {
	const [isRecording, setIsRecording] = useState(false);
	const [micLevel, setMicLevel] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [permissionStatus, setPermissionStatus] = useState<
		'granted' | 'denied' | 'prompt' | 'unknown'
	>('unknown');
	const audioContextRef = useRef<AudioContext | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const audioBufferRef = useRef<number[]>([]);
	const silenceTimerRef = useRef<number | null>(null);
	const streamingIntervalRef = useRef<number | null>(null);

	// Request microphone permission explicitly
	const requestPermission = useCallback(async () => {
		console.log('Requesting microphone permission...');
		try {
			setError(null);

			// Check if getUserMedia is available
			if (
				!navigator.mediaDevices ||
				!navigator.mediaDevices.getUserMedia
			) {
				throw new Error(
					'getUserMedia is not supported in this browser/environment'
				);
			}

			console.log('Calling getUserMedia...');
			// This will trigger the browser's permission prompt
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true,
				},
			});

			console.log('Permission granted! Stream:', stream);
			// Immediately stop it, we just wanted the permission
			stream.getTracks().forEach((track) => {
				console.log('Stopping track:', track);
				track.stop();
			});

			setPermissionStatus('granted');
			await setStorageItem('microphone_enabled', true);
			setError(null);
			console.log('Permission status set to granted');
		} catch (err: any) {
			console.error('Permission request failed:', err);
			if (err.name === 'NotAllowedError') {
				setPermissionStatus('denied');
				setError(
					'Microphone permission denied. On Linux, please check: 1) System Settings > Privacy > Microphone, 2) Run: pactl list sources, 3) Check browser console for details.'
				);
			} else if (err.name === 'NotFoundError') {
				setError(
					'No microphone found. Please connect a microphone and try again.'
				);
			} else {
				setError(
					`Could not access microphone: ${err.message}. Check the browser console for details.`
				);
			}
		}
	}, []);

	// Check microphone permission status on mount
	useEffect(() => {
		const checkPermission = async () => {
			// Check storage first
			const savedPermission = await getStorageItem<boolean>(
				'microphone_enabled'
			);
			if (savedPermission) {
				console.log('Restoring saved microphone permission...');
				requestPermission();
				return;
			}

			try {
				if (navigator.permissions && navigator.permissions.query) {
					const result = await navigator.permissions.query({
						name: 'microphone' as PermissionName,
					});
					setPermissionStatus(
						result.state as 'granted' | 'denied' | 'prompt'
					);

					// Listen for permission changes
					result.onchange = () => {
						setPermissionStatus(
							result.state as 'granted' | 'denied' | 'prompt'
						);
					};
				}
			} catch (err) {
				console.log(
					'Permissions API not supported, will request on first use'
				);
			}
		};

		checkPermission();
	}, [requestPermission]);

	const finalizeTranscription = useCallback(async () => {
		if (audioBufferRef.current.length === 0) return;

		onStateChange('processing');

		try {
			const audioData = audioBufferRef.current;
			audioBufferRef.current = [];

			const sttStart = performance.now();

			// Invoke the transcription command directly without a timeout
			// This allows the backend to take as long as needed (e.g. for large models or long audio)
			const transcriptionResult = (await invoke('transcribe_audio', {
				audioBuffer: audioData,
			})) as { text: string; duration_ms: number };

			const sttEnd = performance.now();

			console.log('Transcription:', transcriptionResult.text);
			console.log('STT took:', transcriptionResult.duration_ms, 'ms');

			onStateChange('executing');

			// Update performance stats
			if (onPerformanceUpdate) {
				onPerformanceUpdate({
					stt_ms: transcriptionResult.duration_ms,
					total_ms: Math.round(sttEnd - sttStart),
				});
			}

			// Call the global handler exposed by Editor
			if ((window as any).handleTranscription) {
				await (window as any).handleTranscription(
					transcriptionResult.text
				);
			}

			setTimeout(() => {
				// Check if we're still recording by checking if the stream is active
				if (streamRef.current && streamRef.current.active) {
					onStateChange('listening');
				} else {
					onStateChange('idle');
				}
			}, 500);
		} catch (error) {
			console.error('Error finalizing transcription:', error);
			// Only return to listening if we're still recording
			if (streamRef.current && streamRef.current.active) {
				onStateChange('listening');
			} else {
				onStateChange('idle');
			}
		}
	}, [onStateChange, onPerformanceUpdate]);

	const startRecording = async () => {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					// Force constraints here too
					sampleRate: 16000,
					channelCount: 1,
					echoCancellation: true,
					autoGainControl: true,
					noiseSuppression: true,
				},
			});
			streamRef.current = stream;

			const audioContext = new AudioContext({ sampleRate: 16000 });
			audioContextRef.current = audioContext;

			// DEBUG: Check what we actually got
			console.log(
				`Audio Context Sample Rate: ${audioContext.sampleRate}`
			);
			if (audioContext.sampleRate !== 16000) {
				console.warn(
					'Browser did not give 16kHz! Resampling will be required (not implemented yet).'
				);
				// This is a common cause of "garbage audio" in Whisper
			}

			const source = audioContext.createMediaStreamSource(stream);

			// TODO: Switch to AudioWorklet in production as ScriptProcessor is deprecated
			// Increased buffer size to 8192 to reduce main thread blocking
			const processor = audioContext.createScriptProcessor(8192, 1, 1);

			processor.onaudioprocess = async (e) => {
				const inputData = e.inputBuffer.getChannelData(0);
				const pcmData = Array.from(inputData);

				// Calculate RMS to check if we have audio
				const rms = Math.sqrt(
					pcmData.reduce((sum, x) => sum + x * x, 0) / pcmData.length
				);

				// Update UI (clamp value between 0 and 1, boost it a bit to be visible)
				setMicLevel(Math.min(rms * 5, 1));

				if (Math.random() < 0.05) {
					// Log occasionally (approx every 2-3 seconds)
					console.log(`Microphone input RMS: ${rms.toFixed(4)}`);
				}

				// Add to buffer
				audioBufferRef.current.push(...pcmData);

				// VAD is now handled in backend via process_audio_chunk
				try {
					await invoke('process_audio_chunk', { pcmData });
				} catch (error) {
					console.error('Error processing audio:', error);
				}
			};

			source.connect(processor);
			processor.connect(audioContext.destination);

			// Start streaming transcription - call every 2 seconds while recording
			streamingIntervalRef.current = window.setInterval(() => {
				if (audioBufferRef.current.length >= 16000) {
					// At least 1 second of audio
					invoke('transcribe_streaming', {
						audioBuffer: [...audioBufferRef.current],
					}).catch((err) => {
						console.error('Streaming transcription error:', err);
					});
				}
			}, 2000);

			setIsRecording(true);
			onStateChange('listening');
			setError(null); // Clear any previous errors
		} catch (error: any) {
			console.error('Error starting recording:', error);

			// Set user-friendly error message
			if (error.name === 'NotAllowedError') {
				setError(
					'Microphone access denied. Please allow microphone permissions in your browser/system settings. On Linux, you may need to grant permissions at the system level.'
				);
				setPermissionStatus('denied');
			} else if (error.name === 'NotFoundError') {
				setError(
					'No microphone found. Please connect a microphone and try again.'
				);
			} else if (error.name === 'NotReadableError') {
				setError(
					'Microphone is already in use by another application.'
				);
			} else {
				setError(
					`Error accessing microphone: ${
						error.message || 'Unknown error'
					}`
				);
			}

			onStateChange('idle');
		}
	};

	const stopRecording = async () => {
		console.log('Stopping recording...');

		// Clear any pending silence timer
		if (silenceTimerRef.current) {
			clearTimeout(silenceTimerRef.current);
			silenceTimerRef.current = null;
		}

		// Clear streaming interval
		if (streamingIntervalRef.current) {
			clearInterval(streamingIntervalRef.current);
			streamingIntervalRef.current = null;
		}

		// Stop the media stream first
		if (streamRef.current) {
			streamRef.current.getTracks().forEach((track) => {
				console.log('Stopping track:', track.label);
				track.stop();
			});
			streamRef.current = null;
		}

		// Close the audio context
		if (audioContextRef.current) {
			await audioContextRef.current.close();
			audioContextRef.current = null;
		}

		// Update state before finalizing transcription
		setIsRecording(false);

		// Finalize any remaining audio (after state update)
		if (audioBufferRef.current.length > 0) {
			await finalizeTranscription();
		} else {
			// No audio to transcribe, just go to idle
			onStateChange('idle');
		}

		console.log('Recording stopped');
	};

	const toggleRecording = () => {
		if (isRecording) {
			stopRecording();
		} else {
			startRecording();
		}
	};

	// Listen for VAD silence detected event
	useEffect(() => {
		const unlistenPromise = listen('vad-silence-detected', () => {
			console.log('VAD silence detected from backend');
			finalizeTranscription();
		});

		return () => {
			unlistenPromise.then((unlisten) => unlisten());
		};
	}, [finalizeTranscription]);

	return (
		<div className='audio-control'>
			{error && (
				<div className='audio-error'>
					<span className='error-icon'>⚠️</span>
					<span className='error-message'>{error}</span>
					{permissionStatus === 'denied' && (
						<button
							className='error-action'
							onClick={() => {
								console.log(
									'Request Permission button clicked'
								);
								requestPermission();
							}}
							title='Request Permission'
						>
							Request Permission
						</button>
					)}
					<button
						className='error-dismiss'
						onClick={() => setError(null)}
						title='Dismiss'
					>
						×
					</button>
				</div>
			)}
			{permissionStatus === 'prompt' && !error && (
				<div className='permission-prompt'>
					<span className='prompt-icon'>🎤</span>
					<span className='prompt-message'>
						Microphone access required for voice commands
					</span>
					<button
						className='prompt-action'
						onClick={() => {
							console.log('Enable Microphone button clicked');
							requestPermission();
						}}
					>
						Enable Microphone
					</button>
				</div>
			)}
			<div>
				<button
					className={`mic-button ${audioState}`}
					onClick={toggleRecording}
					title={isRecording ? 'Stop Recording' : 'Start Recording'}
					disabled={permissionStatus === 'denied'}
				>
					<div
						className='mic-level-ring'
						style={{ transform: `scaleY(${micLevel})` }}
					/>
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
				{audioState === 'processing' && (
					<button
						className='cancel-button'
						onClick={() => {
							// Force reset state
							onStateChange('idle');
							// Note: The backend process will continue but UI will reset
						}}
						title='Cancel Processing'
						style={{
							marginLeft: '8px',
							background: 'none',
							border: 'none',
							color: '#ef4444',
							cursor: 'pointer',
						}}
					>
						<svg
							width='20'
							height='20'
							viewBox='0 0 24 24'
							fill='none'
							stroke='currentColor'
							strokeWidth='2'
							strokeLinecap='round'
							strokeLinejoin='round'
						>
							<line x1='18' y1='6' x2='6' y2='18' />
							<line x1='6' y1='6' x2='18' y2='18' />
						</svg>
					</button>
				)}
				{onOpenModelSelector && (
					<button
						className='settings-button'
						onClick={onOpenModelSelector}
						title='Model Settings'
						disabled={audioState !== 'idle'}
					>
						<svg
							width='20'
							height='20'
							viewBox='0 0 24 24'
							fill='none'
							stroke='currentColor'
							strokeWidth='2'
							strokeLinecap='round'
							strokeLinejoin='round'
						>
							<circle cx='12' cy='12' r='3' />
							<path d='M12 1v6m0 6v6m5.196-15.196l-4.242 4.242m0 5.908l4.242 4.242m6-10.196h-6m-6 0H1m15.196 5.196l-4.242-4.242m-5.908 0l-4.242-4.242' />
						</svg>
					</button>
				)}
			</div>
		</div>
	);
}
