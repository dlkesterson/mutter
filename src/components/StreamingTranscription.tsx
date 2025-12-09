import { useEffect, useState, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import './StreamingTranscription.css';

interface PartialTranscription {
	text: string;
	is_final: boolean;
	timestamp: number;
}

interface StreamingTranscriptionProps {
	isRecording: boolean;
}

export function StreamingTranscription({
	isRecording,
}: StreamingTranscriptionProps) {
	const [partialText, setPartialText] = useState<string>('');
	const [isProcessing, setIsProcessing] = useState(false);
	const [isVisible, setIsVisible] = useState(false);
	const isRecordingRef = useRef(isRecording);

	useEffect(() => {
		isRecordingRef.current = isRecording;
	}, [isRecording]);

	useEffect(() => {
		// Listen for partial transcription events
		const unlisten = listen<PartialTranscription>(
			'transcription-partial',
			(event) => {
				if (!isRecordingRef.current) return;
				setPartialText(event.payload.text);
				setIsProcessing(false);
				setIsVisible(true);
			}
		);

		// Listen for processing events
		const unlistenProcessing = listen('transcription-processing', () => {
			if (!isRecordingRef.current) return;
			setIsProcessing(true);
			setIsVisible(true);
		});

		return () => {
			unlisten.then((fn) => fn());
			unlistenProcessing.then((fn) => fn());
		};
	}, []);

	// Clear text when not recording
	useEffect(() => {
		if (!isRecording) {
			setPartialText('');
			setIsProcessing(false);
			setIsVisible(false);
		}
	}, [isRecording]);

	if (!isVisible && !partialText) {
		return null;
	}

	return (
		<div
			className={`streaming-transcription ${isVisible ? 'visible' : ''}`}
		>
			<div className='transcription-container'>
				<div className='transcription-header'>
					<div className='live-indicator'>
						<span className='live-dot' />
						<span className='live-text'>
							{isProcessing
								? 'Processing...'
								: 'Live Transcription'}
						</span>
					</div>
				</div>
				<div className='transcription-content'>
					{isProcessing && !partialText ? (
						<span className='processing-text'>
							Analyzing audio...
						</span>
					) : (
						<span className='partial-text'>
							{partialText || 'Listening...'}
						</span>
					)}
				</div>
			</div>
		</div>
	);
}
