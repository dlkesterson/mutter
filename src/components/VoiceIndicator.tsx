'use client';

import { Mic, FileText } from 'lucide-react';

type VoiceState = 'idle' | 'listening' | 'processing' | 'executing';

interface VoiceIndicatorProps {
	state: VoiceState;
	onLogClick: () => void;
	onToggleListening: () => void;
}

export function VoiceIndicator({
	state,
	onLogClick,
	onToggleListening,
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
		<div className='fixed bottom-6 right-6 flex items-center gap-2'>
			<button
				onClick={onLogClick}
				className='p-3 bg-card border border-border rounded-full hover:border-primary transition-colors cursor-pointer shadow-lg text-muted-foreground hover:text-foreground'
				title='View Voice Log'
			>
				<FileText className='w-4 h-4' />
			</button>

			<button
				onClick={onToggleListening}
				className={`flex items-center gap-2 px-4 py-3 bg-card border border-border rounded-full hover:border-primary transition-colors cursor-pointer shadow-lg ${
					state === 'listening' ? 'border-red-500' : ''
				}`}
				title='Toggle microphone'
			>
				<div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
				<span className='text-sm font-medium text-foreground'>
					{getStatusLabel()}
				</span>
				<Mic
					className={`w-4 h-4 ${
						state === 'listening'
							? 'text-red-500'
							: 'text-muted-foreground'
					}`}
				/>
			</button>
		</div>
	);
}
