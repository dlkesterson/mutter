'use client';

import { BaseDialog } from '@/components/ui/base-dialog';

interface VoiceLogEntry {
	transcription: string;
}

interface VoiceLogDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	entries: VoiceLogEntry[];
}

export function VoiceLogDialog({
	open,
	onOpenChange,
	entries,
}: VoiceLogDialogProps) {
	return (
		<BaseDialog
			open={open}
			onOpenChange={onOpenChange}
			title='Voice Dictation History'
			size='lg'
		>
			<div className='space-y-4'>
				{entries.length === 0 ? (
					<div className='text-center py-8 text-muted-foreground'>
						No voice dictations yet. Use the voice indicator to start.
					</div>
				) : (
					<div className='space-y-2 max-h-96 overflow-y-auto'>
						{entries.map((entry, idx) => (
							<div
								key={idx}
								className='p-3 bg-muted rounded-lg border border-border'
							>
								<div className='text-sm text-foreground wrap-break-word'>
									{entry.transcription}
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</BaseDialog>
	);
}
