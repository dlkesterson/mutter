'use client';

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { useTheme } from '@/components/ThemeProvider';
import { getStorageItem, setStorageItem } from '@/utils/storage';

interface SettingsDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
	const { theme, setTheme } = useTheme();
	const [voiceProvider, setVoiceProvider] = useState('system');
	const [fontSize, setFontSize] = useState('16');

	// VAD Settings
	const [silenceThreshold, setSilenceThreshold] = useState(800);
	const [minSpeechDuration, setMinSpeechDuration] = useState(300);
	const [sensitivity, setSensitivity] = useState(1.0);

	// Auto-Stop Settings
	const [autoStopEnabled, setAutoStopEnabled] = useState(true);
	const [autoStopTimeoutMs, setAutoStopTimeoutMs] = useState(3000);

	// Load settings from storage
	useEffect(() => {
		const loadSettings = async () => {
			const enabled = await getStorageItem<boolean>('auto_stop_enabled');
			const timeout = await getStorageItem<number>('auto_stop_timeout_ms');

			if (enabled !== null) setAutoStopEnabled(enabled);
			if (timeout !== null) setAutoStopTimeoutMs(timeout);
		};

		loadSettings();
	}, []);

	const updateVad = async (
		silence: number,
		minSpeech: number,
		sens: number
	) => {
		try {
			await invoke('update_vad_settings', {
				silenceMs: silence,
				minSpeechMs: minSpeech,
				sensitivity: sens,
			});
		} catch (e) {
			console.error('Failed to update VAD settings', e);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='max-w-md max-h-[80vh] overflow-y-auto bg-background text-foreground border-border'>
				<DialogHeader>
					<DialogTitle>Settings</DialogTitle>
				</DialogHeader>
				<div className='space-y-6'>
					<div className='space-y-2'>
						<Label htmlFor='theme'>Theme</Label>
						<Select
							value={theme}
							onValueChange={(val: any) => setTheme(val)}
						>
							<SelectTrigger
								id='theme'
								className='bg-background border-input'
							>
								<SelectValue placeholder='Select theme' />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value='light'>Light</SelectItem>
								<SelectItem value='dark'>Dark</SelectItem>
								<SelectItem value='system'>System</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<div className='space-y-2'>
						<Label htmlFor='voice-provider'>Voice Provider</Label>
						<Select
							value={voiceProvider}
							onValueChange={setVoiceProvider}
						>
							<SelectTrigger
								id='voice-provider'
								className='bg-background border-input'
							>
								<SelectValue placeholder='Select provider' />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value='system'>
									System Default
								</SelectItem>
								<SelectItem value='google'>
									Google Cloud Speech
								</SelectItem>
								<SelectItem value='openai'>
									OpenAI Whisper
								</SelectItem>
								<SelectItem value='azure'>
									Azure Speech
								</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<div className='space-y-2'>
						<Label htmlFor='font-size'>Editor Font Size</Label>
						<Select value={fontSize} onValueChange={setFontSize}>
							<SelectTrigger
								id='font-size'
								className='bg-background border-input'
							>
								<SelectValue placeholder='Select size' />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value='14'>14px</SelectItem>
								<SelectItem value='16'>16px</SelectItem>
								<SelectItem value='18'>18px</SelectItem>
								<SelectItem value='20'>20px</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<div className='space-y-4 border-t border-border pt-4'>
						<h3 className='font-medium'>Voice Detection (VAD)</h3>

						<div className='space-y-2'>
							<div className='flex justify-between'>
								<Label>Silence Threshold</Label>
								<span className='text-sm text-muted-foreground'>
									{silenceThreshold}ms
								</span>
							</div>
							<input
								type='range'
								min='300'
								max='1500'
								step='50'
								value={silenceThreshold}
								onChange={(e) => {
									const val = parseInt(e.target.value);
									setSilenceThreshold(val);
									updateVad(
										val,
										minSpeechDuration,
										sensitivity
									);
								}}
								className='w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary'
							/>
							<p className='text-xs text-muted-foreground'>
								How long to wait after speech stops before
								processing.
							</p>
						</div>

						<div className='space-y-2'>
							<div className='flex justify-between'>
								<Label>Minimum Speech Duration</Label>
								<span className='text-sm text-muted-foreground'>
									{minSpeechDuration}ms
								</span>
							</div>
							<input
								type='range'
								min='100'
								max='1000'
								step='50'
								value={minSpeechDuration}
								onChange={(e) => {
									const val = parseInt(e.target.value);
									setMinSpeechDuration(val);
									updateVad(
										silenceThreshold,
										val,
										sensitivity
									);
								}}
								className='w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary'
							/>
							<p className='text-xs text-muted-foreground'>
								Ignore sounds shorter than this (clicks, pops).
							</p>
						</div>

						<div className='space-y-2'>
							<Label>Microphone Sensitivity</Label>
							<Select
								value={sensitivity.toString()}
								onValueChange={(val) => {
									const s = parseFloat(val);
									setSensitivity(s);
									updateVad(
										silenceThreshold,
										minSpeechDuration,
										s
									);
								}}
							>
								<SelectTrigger className='bg-background border-input'>
									<SelectValue placeholder='Select sensitivity' />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value='0.5'>
										High (Sensitive)
									</SelectItem>
									<SelectItem value='1.0'>
										Medium (Default)
									</SelectItem>
									<SelectItem value='2.0'>
										Low (Noisy Environment)
									</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>

					<div className='space-y-4 border-t border-border pt-4'>
						<h3 className='font-medium'>Auto-Stop Recording</h3>

						<div className='space-y-2'>
							<Label className='flex items-center gap-2 cursor-pointer'>
								<input
									type='checkbox'
									checked={autoStopEnabled}
									onChange={(e) => {
										const enabled = e.target.checked;
										setAutoStopEnabled(enabled);
										setStorageItem('auto_stop_enabled', enabled);
									}}
									className='h-4 w-4 rounded border-primary text-primary focus:ring-primary accent-primary'
								/>
								Enable auto-stop on silence
							</Label>
							<p className='text-xs text-muted-foreground'>
								Automatically stop recording after detecting silence.
							</p>
						</div>

						{autoStopEnabled && (
							<div className='space-y-2'>
								<div className='flex justify-between'>
									<Label>Auto-stop Timeout</Label>
									<span className='text-sm text-muted-foreground'>
										{(autoStopTimeoutMs / 1000).toFixed(1)}s
									</span>
								</div>
								<input
									type='range'
									min='1000'
									max='7000'
									step='500'
									value={autoStopTimeoutMs}
									onChange={(e) => {
										const val = parseInt(e.target.value);
										setAutoStopTimeoutMs(val);
										setStorageItem('auto_stop_timeout_ms', val);
									}}
									className='w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary'
								/>
								<p className='text-xs text-muted-foreground'>
									How long to wait after silence before stopping
									(1-7 seconds).
								</p>
							</div>
						)}
					</div>

					<div className='space-y-4 border-t border-border pt-4'>
						<h3 className='font-medium'>Editor</h3>

						<div className='space-y-2'>
							<Label className='flex items-center gap-2 cursor-pointer'>
								<input
									type='checkbox'
									defaultChecked
									onChange={(e) => {
										// Call the global toggle function - it handles state and storage
										if ((window as any).toggleMinimap) {
											(window as any).toggleMinimap(e.target.checked);
										}
									}}
									className='h-4 w-4 rounded border-primary text-primary focus:ring-primary accent-primary'
								/>
								Show minimap
							</Label>
							<p className='text-xs text-muted-foreground'>
								Display a visual overview of the entire document on the right side.
							</p>
						</div>
					</div>

					<div className='space-y-2'>
						<Label className='flex items-center gap-2 cursor-pointer'>
							<input
								type='checkbox'
								defaultChecked
								className='h-4 w-4 rounded border-primary text-primary focus:ring-primary accent-primary'
							/>
							Auto-save on voice command
						</Label>
						<Label className='flex items-center gap-2 cursor-pointer'>
							<input
								type='checkbox'
								defaultChecked
								className='h-4 w-4 rounded border-primary text-primary focus:ring-primary accent-primary'
							/>
							Show syntax highlighting
						</Label>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
