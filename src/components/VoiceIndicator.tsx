'use client';

import { Mic, FileText } from 'lucide-react';
import { WaveformVisualization } from './WaveformVisualization';

type VoiceState = 'idle' | 'listening' | 'processing' | 'executing';

interface VoiceIndicatorProps {
	state: VoiceState;
	onLogClick: () => void;
	onToggleListening: () => void;
	streamingText?: string;
	audioSamples?: number[];
}

export function VoiceIndicator({
	state,
	onLogClick,
	onToggleListening,
	streamingText,
	audioSamples = [],
}: VoiceIndicatorProps) {
	const getStatusColor = () => {
		switch (state) {
			case 'listening':
				return 'bg-red-500 animate-pulse';
			case 'processing':
				return 'bg-yellow-500';
			case 'executing':
				return 'bg-blue-500';
			default:
				return 'bg-muted';
		}
	};

	const getStatusLabel = () => {
		switch (state) {
			case 'listening':
				return '� Listening...';
			case 'processing':
				return '⏳ Processing...';
			case 'executing':
				return '✅ Executing';
			default:
				return 'Click to Speak';
		}
	};

	return (
		<div className='fixed bottom-8 right-8 flex flex-col items-end gap-2 z-40'>
			{/* Streaming transcription display */}
			{streamingText && (
				<div className='max-w-md p-3 bg-background/95 backdrop-blur-md border border-border rounded-lg shadow-xl animate-in fade-in slide-in-from-bottom-2'>
					<p className='text-xs text-muted-foreground mb-1'>Partial transcription:</p>
					<p className='text-sm text-foreground'>{streamingText}</p>
				</div>
			)}

			{/* Waveform visualization - show when listening */}
			{state === 'listening' && (
				<div className='p-3 bg-background/95 backdrop-blur-md border border-border rounded-lg shadow-xl'>
					<WaveformVisualization
						audioData={audioSamples}
						isRecording={true}
						width={220}
						height={50}
					/>
				</div>
			)}

			{/* Voice controls */}
			<div className='flex items-center gap-1 p-1.5 bg-background/80 backdrop-blur-md border border-border rounded-full shadow-2xl transition-all hover:scale-105'>
				<button
					onClick={onLogClick}
					className='p-2.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors'
					title='View Voice Log'
				>
					<FileText className='w-4 h-4' />
				</button>

				<div className='w-px h-4 bg-border mx-1' />

				<button
					onClick={onToggleListening}
					className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-300 ${
						state === 'listening'
							? 'bg-red-500 text-white shadow-lg shadow-red-500/20'
							: state === 'processing'
							? 'bg-yellow-500 text-white'
							: state === 'executing'
							? 'bg-blue-500 text-white'
							: 'hover:bg-muted text-foreground'
					}`}
				>
					<Mic
						className={`w-4 h-4 ${
							state === 'listening' ? 'animate-pulse' : ''
						}`}
					/>
					<span className={`text-sm font-medium`}>
						{getStatusLabel()}
					</span>
				</button>
			</div>
		</div>
	);
}
