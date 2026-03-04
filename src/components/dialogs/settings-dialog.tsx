'use client';

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { BaseDialog } from '@/components/ui/base-dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { useTheme } from '@/components/ThemeProvider';
import { getStorageItem, setStorageItem } from '@/utils/storage';
import { emitMutterEvent } from '@/events';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useSettings, useCredentials } from '@/lib/settings';
import {
  ExpertiseLevel,
  EXPERTISE_THRESHOLDS,
  getExpertiseLabel,
  getExpertiseDescription,
} from '@/types/userProfile';

interface SettingsDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
	const { theme, setTheme } = useTheme();
	const [fontSize, setFontSize] = useState('16');
	const { profile, setExpertiseLevel } = useUserProfile();

	// AI Settings from config context
	const { settings, updateSettings } = useSettings();
	const { credentials, updateCredentials } = useCredentials();

	// VAD Settings
	const [silenceThreshold, setSilenceThreshold] = useState(800);
	const [minSpeechDuration, setMinSpeechDuration] = useState(300);
	const [sensitivity, setSensitivity] = useState(1.0);

	// Voice UI Settings
	const [voiceEnabled, setVoiceEnabled] = useState(true);

	// Auto-Stop Settings
	const [autoStopEnabled, setAutoStopEnabled] = useState(true);
	const [autoStopTimeoutMs, setAutoStopTimeoutMs] = useState(3000);

	// Load settings from storage
	useEffect(() => {
		const loadSettings = async () => {
			// Font size setting
			const savedFontSize = await getStorageItem<string>('editor_font_size');
			if (savedFontSize !== null) setFontSize(savedFontSize);

			// Voice UI settings
			const voiceOn = await getStorageItem<boolean>('voice_enabled');
			if (voiceOn !== null) setVoiceEnabled(voiceOn);

			// Auto-Stop settings
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
		<BaseDialog
			open={open}
			onOpenChange={onOpenChange}
			title="Settings"
			size="full"
			maxHeight="85vh"
		>
			{/* Two-column grid layout for better space usage */}
			<div className='grid grid-cols-1 lg:grid-cols-2 gap-8'>
				{/* LEFT COLUMN: Appearance & Editor */}
				<div className='space-y-6'>
					<div className='space-y-4'>
						<h3 className='text-base font-semibold border-b border-border pb-2'>Appearance</h3>

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
							<Label htmlFor='font-size'>Editor Font Size</Label>
							<Select
								value={fontSize}
								onValueChange={async (val) => {
									setFontSize(val);
									await setStorageItem('editor_font_size', val);
									emitMutterEvent('mutter:update-editor-font-size', { size: val });
								}}
							>
								<SelectTrigger
									id='font-size'
									className='bg-background border-input'
								>
									<SelectValue placeholder='Select size' />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value='14'>14px (Small)</SelectItem>
									<SelectItem value='16'>16px (Default)</SelectItem>
									<SelectItem value='18'>18px (Large)</SelectItem>
									<SelectItem value='20'>20px (Extra Large)</SelectItem>
									<SelectItem value='22'>22px</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>

					<div className='space-y-4 border-t border-border pt-4'>
						<h3 className='text-base font-semibold border-b border-border pb-2'>Editor</h3>

						<div className='space-y-2'>
							<Label className='flex items-center gap-2 cursor-pointer'>
								<input
									type='checkbox'
									defaultChecked
									onChange={(e) => {
										emitMutterEvent('mutter:toggle-minimap', { enabled: e.target.checked });
									}}
									className='h-4 w-4 rounded border-primary text-primary focus:ring-primary accent-primary'
								/>
								Show minimap
							</Label>
							<p className='text-xs text-muted-foreground ml-6'>
								Display a visual overview of the entire document
							</p>
						</div>

						<div className='space-y-2'>
							<Label className='flex items-center gap-2 cursor-pointer'>
								<input
									type='checkbox'
									defaultChecked
									className='h-4 w-4 rounded border-primary text-primary focus:ring-primary accent-primary'
								/>
								Line numbers
							</Label>
							<p className='text-xs text-muted-foreground ml-6'>
								Show line numbers in the editor gutter
							</p>
						</div>

						<div className='space-y-2'>
							<Label className='flex items-center gap-2 cursor-pointer'>
								<input
									type='checkbox'
									defaultChecked
									className='h-4 w-4 rounded border-primary text-primary focus:ring-primary accent-primary'
								/>
								Word wrap
							</Label>
							<p className='text-xs text-muted-foreground ml-6'>
								Wrap long lines instead of scrolling horizontally
							</p>
						</div>
					</div>
				</div>

				{/* RIGHT COLUMN: Voice & Recording */}
				<div className='space-y-6'>
					<div className='space-y-4'>
						<h3 className='text-base font-semibold border-b border-border pb-2'>Voice Input</h3>

						<div className='space-y-2'>
							<Label className='flex items-center gap-2 cursor-pointer'>
								<input
									type='checkbox'
									checked={voiceEnabled}
									onChange={(e) => {
										const enabled = e.target.checked;
										setVoiceEnabled(enabled);
										setStorageItem('voice_enabled', enabled);
										// Notify App.tsx to update voice UI visibility
										emitMutterEvent('mutter:voice-settings-changed');
									}}
									className='h-4 w-4 rounded border-primary text-primary focus:ring-primary accent-primary'
								/>
								Enable voice input
							</Label>
							<p className='text-xs text-muted-foreground ml-6'>
								Show the microphone button for voice commands and dictation.
							</p>
						</div>

						{voiceEnabled && (
							<>
								<h4 className='text-sm font-medium text-muted-foreground pt-2'>Voice Detection (VAD)</h4>

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
											updateVad(val, minSpeechDuration, sensitivity);
										}}
										className='w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary'
									/>
									<p className='text-xs text-muted-foreground'>
										How long to wait after speech stops before processing.
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
											updateVad(silenceThreshold, val, sensitivity);
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
											updateVad(silenceThreshold, minSpeechDuration, s);
										}}
									>
										<SelectTrigger className='bg-background border-input'>
											<SelectValue placeholder='Select sensitivity' />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value='0.5'>High (Sensitive)</SelectItem>
											<SelectItem value='1.0'>Medium (Default)</SelectItem>
											<SelectItem value='2.0'>Low (Noisy Environment)</SelectItem>
										</SelectContent>
									</Select>
								</div>

								<div className='space-y-4 border-t border-border pt-4'>
									<h4 className='text-sm font-medium'>Auto-Stop Recording</h4>

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
												How long to wait after silence before stopping (1-7 seconds).
											</p>
										</div>
									)}
								</div>
							</>
						)}
					</div>

					{/* Expertise Settings */}
					<div className='space-y-4 border-t border-border pt-4'>
						<h3 className='text-base font-semibold border-b border-border pb-2'>Expertise Level</h3>
						<p className='text-sm text-muted-foreground'>
							Your expertise level affects which voice commands require confirmation before executing.
						</p>

						<div className='space-y-2'>
							{(['novice', 'intermediate', 'expert'] as ExpertiseLevel[]).map((level) => (
								<label
									key={level}
									className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
										profile.expertiseLevel === level
											? 'border-primary bg-primary/5'
											: 'border-border hover:bg-muted/50'
									}`}
								>
									<input
										type='radio'
										name='expertise'
										value={level}
										checked={profile.expertiseLevel === level}
										onChange={() => setExpertiseLevel(level)}
										className='mt-1 h-4 w-4 accent-primary'
									/>
									<div>
										<div className='font-medium'>{getExpertiseLabel(level)}</div>
										<div className='text-sm text-muted-foreground'>
											{getExpertiseDescription(level)}
										</div>
									</div>
								</label>
							))}
						</div>

						<div className='text-xs text-muted-foreground space-y-1 mt-3'>
							<p>
								Commands executed: <span className='font-mono'>{profile.commandsExecuted}</span>
							</p>
							<p>
								Next level at: <span className='font-mono'>
									{profile.expertiseLevel === 'expert'
										? 'Max level reached'
										: profile.expertiseLevel === 'intermediate'
											? `${EXPERTISE_THRESHOLDS.expert} commands`
											: `${EXPERTISE_THRESHOLDS.intermediate} commands`
									}
								</span>
							</p>
						</div>
					</div>
				</div>
			</div>

			{/* FULL-WIDTH SECTION: AI Settings */}
			<div className='border-t border-border pt-6 mt-6'>
				<h3 className='text-base font-semibold border-b border-border pb-2 mb-4'>AI Settings</h3>

				{settings && (
					<div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
						{/* Provider Selection */}
						<div className='space-y-4'>
							<div className='space-y-2'>
								<Label htmlFor='ai-provider'>AI Provider</Label>
								<Select
									value={settings.ai_default_provider}
									onValueChange={(val: 'claude' | 'openai' | 'ollama') => {
										updateSettings((prev) => ({
											...prev,
											ai_default_provider: val,
										}));
									}}
								>
									<SelectTrigger id='ai-provider' className='bg-background border-input'>
										<SelectValue placeholder='Select provider' />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value='ollama'>Ollama (Local)</SelectItem>
										<SelectItem value='claude'>Claude (Anthropic)</SelectItem>
										<SelectItem value='openai'>OpenAI</SelectItem>
									</SelectContent>
								</Select>
								<p className='text-xs text-muted-foreground'>
									Choose the AI provider for text cleanup and AI queries.
								</p>
							</div>

							{/* Ollama Settings */}
							{settings.ai_default_provider === 'ollama' && (
								<div className='space-y-3 p-3 bg-muted/30 rounded-lg'>
									<div className='space-y-2'>
										<Label htmlFor='ollama-url'>Ollama URL</Label>
										<Input
											id='ollama-url'
											value={settings.ai_providers.ollama.url}
											onChange={(e) => {
												updateSettings((prev) => ({
													...prev,
													ai_providers: {
														...prev.ai_providers,
														ollama: { ...prev.ai_providers.ollama, url: e.target.value },
													},
												}));
											}}
											placeholder='http://localhost:11434'
											className='bg-background'
										/>
									</div>
									<div className='space-y-2'>
										<Label htmlFor='ollama-model'>Model</Label>
										<Input
											id='ollama-model'
											value={settings.ai_providers.ollama.model}
											onChange={(e) => {
												updateSettings((prev) => ({
													...prev,
													ai_providers: {
														...prev.ai_providers,
														ollama: { ...prev.ai_providers.ollama, model: e.target.value },
													},
												}));
											}}
											placeholder='qwen2.5:3b'
											className='bg-background'
										/>
										<p className='text-xs text-muted-foreground'>
											E.g., llama3.2, qwen2.5:3b, mistral, codellama
										</p>
									</div>
								</div>
							)}

							{/* Claude Settings */}
							{settings.ai_default_provider === 'claude' && credentials && (
								<div className='space-y-3 p-3 bg-muted/30 rounded-lg'>
									<div className='space-y-2'>
										<Label htmlFor='claude-key'>API Key</Label>
										<Input
											id='claude-key'
											type='password'
											value={credentials.ai_providers.claude.api_key || ''}
											onChange={(e) => {
												updateCredentials((prev) => ({
													...prev,
													ai_providers: {
														...prev.ai_providers,
														claude: { api_key: e.target.value || null },
													},
												}));
											}}
											placeholder='sk-ant-...'
											className='bg-background font-mono text-sm'
										/>
										<p className='text-xs text-muted-foreground'>
											Get your API key from{' '}
											<a href='https://console.anthropic.com' target='_blank' rel='noopener noreferrer' className='text-primary hover:underline'>
												console.anthropic.com
											</a>
										</p>
									</div>
									<div className='space-y-2'>
										<Label htmlFor='claude-model'>Model</Label>
										<Select
											value={settings.ai_providers.claude.model}
											onValueChange={(val) => {
												updateSettings((prev) => ({
													...prev,
													ai_providers: {
														...prev.ai_providers,
														claude: { model: val },
													},
												}));
											}}
										>
											<SelectTrigger id='claude-model' className='bg-background border-input'>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value='claude-sonnet-4-5-20251029'>Claude Sonnet 4.5</SelectItem>
												<SelectItem value='claude-3-5-sonnet-20241022'>Claude 3.5 Sonnet</SelectItem>
												<SelectItem value='claude-3-haiku-20240307'>Claude 3 Haiku</SelectItem>
											</SelectContent>
										</Select>
									</div>
								</div>
							)}

							{/* OpenAI Settings */}
							{settings.ai_default_provider === 'openai' && credentials && (
								<div className='space-y-3 p-3 bg-muted/30 rounded-lg'>
									<div className='space-y-2'>
										<Label htmlFor='openai-key'>API Key</Label>
										<Input
											id='openai-key'
											type='password'
											value={credentials.ai_providers.openai.api_key || ''}
											onChange={(e) => {
												updateCredentials((prev) => ({
													...prev,
													ai_providers: {
														...prev.ai_providers,
														openai: { api_key: e.target.value || null },
													},
												}));
											}}
											placeholder='sk-...'
											className='bg-background font-mono text-sm'
										/>
										<p className='text-xs text-muted-foreground'>
											Get your API key from{' '}
											<a href='https://platform.openai.com/api-keys' target='_blank' rel='noopener noreferrer' className='text-primary hover:underline'>
												platform.openai.com
											</a>
										</p>
									</div>
									<div className='space-y-2'>
										<Label htmlFor='openai-model'>Model</Label>
										<Select
											value={settings.ai_providers.openai.model}
											onValueChange={(val) => {
												updateSettings((prev) => ({
													...prev,
													ai_providers: {
														...prev.ai_providers,
														openai: { model: val },
													},
												}));
											}}
										>
											<SelectTrigger id='openai-model' className='bg-background border-input'>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value='gpt-4-turbo-preview'>GPT-4 Turbo</SelectItem>
												<SelectItem value='gpt-4o'>GPT-4o</SelectItem>
												<SelectItem value='gpt-4o-mini'>GPT-4o Mini</SelectItem>
												<SelectItem value='gpt-3.5-turbo'>GPT-3.5 Turbo</SelectItem>
											</SelectContent>
										</Select>
									</div>
								</div>
							)}
						</div>

						{/* AI Timeout */}
						<div className='space-y-4'>
							<div className='space-y-2'>
								<div className='flex justify-between'>
									<Label>AI Timeout</Label>
									<span className='text-sm text-muted-foreground'>
										{(settings.ai_timeout_ms / 1000).toFixed(0)}s
									</span>
								</div>
								<input
									type='range'
									min='30000'
									max='300000'
									step='15000'
									value={settings.ai_timeout_ms}
									onChange={(e) => {
										updateSettings((prev) => ({
											...prev,
											ai_timeout_ms: parseInt(e.target.value),
										}));
									}}
									className='w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary'
								/>
								<p className='text-xs text-muted-foreground'>
									Time to wait for AI responses. Local models may need longer (2-5 minutes for large documents).
								</p>
							</div>
						</div>
					</div>
				)}
			</div>

		</BaseDialog>
	);
}
