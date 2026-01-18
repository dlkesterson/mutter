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
	/** Offset from right edge (to avoid overlapping right panel) */
	rightOffset?: number;
}

export function VoiceIndicator({
	state,
	onLogClick,
	onToggleListening,
	streamingText,
	audioSamples = [],
	rightOffset = 32,
}: VoiceIndicatorProps) {
	const getStatusColor = () => {
		switch (state) {
			case 'listening':
				return 'border-primary text-primary'; // International Orange
			case 'processing':
				return 'border-warning text-warning'; // Signal Yellow
			case 'executing':
				return 'border-success text-success'; // Lab Green
			default:
				return 'border-border text-muted-foreground';
		}
	};

	const getStatusLabel = () => {
		switch (state) {
			case 'listening':
				return 'Listening...';
			case 'processing':
				return 'Processing...';
			case 'executing':
				return 'Executing';
			default:
				return 'Click to Speak';
		}
	};

	return (
		<div
			className='fixed bottom-8 flex flex-col items-end gap-2 z-40'
			style={{ right: rightOffset + 8 }}
		>
			{/* Streaming transcription display */}
			{streamingText && (
				<div className='max-w-md p-3 bg-surface/95 backdrop-blur-md border border-border/20 rounded shadow-xl animate-in fade-in slide-in-from-bottom-2'>
					<p className='text-xs text-muted-foreground mb-1 font-mono'>Partial transcription:</p>
					<p className='text-sm text-foreground'>{streamingText}</p>
				</div>
			)}

			{/* Waveform visualization - show when listening */}
			{state === 'listening' && (
				<div className='p-3 bg-surface/95 backdrop-blur-md border border-primary/30 rounded shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200'>
					<WaveformVisualization
						audioData={audioSamples}
						isRecording={true}
						width={220}
						height={50}
					/>
				</div>
			)}

			{/* Voice controls - Border-only design (Dieter Rams style) */}
			<div className={`flex items-center gap-1 p-1.5 bg-surface/80 backdrop-blur-md border border-border/20 rounded-full shadow-xl transition-all hover:scale-102 ${
				state === 'listening' ? 'animate-breathe' : ''
			}`}>
				<button
					onClick={onLogClick}
					className='p-2.5 rounded-full hover:bg-muted/10 text-muted-foreground hover:text-foreground transition-all border border-transparent hover:border-border/20'
					title='View Voice Log'
				>
					<FileText className='w-4 h-4' />
				</button>

				<div className='w-px h-4 bg-border/20 mx-1' />

				<button
					onClick={onToggleListening}
					className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-200 border-2 ${getStatusColor()} ${
						state === 'listening'
							? 'bg-primary/10 scale-105'
							: 'bg-transparent hover:bg-muted/10 hover:scale-105'
					}`}
				>
					<Mic
						className={`w-4 h-4 transition-transform duration-200 ${
							state === 'listening' ? 'animate-pulse scale-110' : ''
						}`}
					/>
					<span className='text-sm font-medium'>
						{getStatusLabel()}
					</span>
				</button>
			</div>
		</div>
	);
}
