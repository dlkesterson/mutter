import { useEffect, useState, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';

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
			},
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
			className={`fixed top-8 left-1/2 -translate-x-1/2 z-50 pointer-events-none transition-all duration-300 ${
				isVisible
					? 'opacity-100 translate-y-0'
					: 'opacity-0 -translate-y-4'
			}`}
		>
			<div className='bg-background/90 backdrop-blur-md border border-border rounded-full shadow-xl px-6 py-3 min-w-75 max-w-150 flex items-center gap-4'>
				<div className='flex items-center gap-2 shrink-0'>
					<div className='w-2 h-2 bg-red-500 rounded-full animate-pulse' />
					<span className='text-xs font-medium text-muted-foreground uppercase tracking-wider'>
						{isProcessing ? 'Processing' : 'Live'}
					</span>
				</div>
				<div className='h-4 w-px bg-border' />
				<div className='flex-1 truncate text-sm font-medium text-foreground'>
					{isProcessing && !partialText ? (
						<span className='text-muted-foreground italic'>
							Analyzing audio...
						</span>
					) : (
						<span>{partialText || 'Listening...'}</span>
					)}
				</div>
			</div>
		</div>
	);
}
