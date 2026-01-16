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
import { SyncSettingsPanel } from '@/components/sync/SyncSettingsPanel';
import { useUserProfile } from '@/hooks/useUserProfile';
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

	// VAD Settings
	const [silenceThreshold, setSilenceThreshold] = useState(800);
	const [minSpeechDuration, setMinSpeechDuration] = useState(300);
	const [sensitivity, setSensitivity] = useState(1.0);

	// Voice UI Settings
	const [voiceEnabled, setVoiceEnabled] = useState(true);

	// Auto-Stop Settings
	const [autoStopEnabled, setAutoStopEnabled] = useState(true);
	const [autoStopTimeoutMs, setAutoStopTimeoutMs] = useState(3000);

	// Stream Mode Settings
	const [streamModeEnabled, setStreamModeEnabled] = useState(false);
	const [streamModeProvider, setStreamModeProvider] = useState<
		'claude' | 'openai' | 'ollama'
	>('claude');
	const [claudeApiKey, setClaudeApiKey] = useState('');
	const [claudeModel, setClaudeModel] = useState('claude-sonnet-4-5-20251029');
	const [openaiApiKey, setOpenaiApiKey] = useState('');
	const [openaiModel, setOpenaiModel] = useState('gpt-4-turbo-preview');
	const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
	const [ollamaModel, setOllamaModel] = useState('qwen2.5:3b');
	const [removeFillers, setRemoveFillers] = useState(true);
	const [addStructure, setAddStructure] = useState(true);
	const [matchStyle, setMatchStyle] = useState(true);
	const [streamModeTimeout, setStreamModeTimeout] = useState(15000);

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

			// Stream Mode settings
			const streamEnabled = await getStorageItem<boolean>('stream_mode_enabled');
			const provider = await getStorageItem<'claude' | 'openai' | 'ollama'>(
				'stream_mode_provider'
			);
			const claudeKey = await getStorageItem<string>('claude_api_key');
			const claudeMdl = await getStorageItem<string>('claude_model');
			const openaiKey = await getStorageItem<string>('openai_api_key');
			const openaiMdl = await getStorageItem<string>('openai_model');
			const ollamaUrlVal = await getStorageItem<string>('ollama_url');
			const ollamaMdl = await getStorageItem<string>('ollama_model');
			const removeF = await getStorageItem<boolean>('stream_mode_remove_fillers');
			const addStr = await getStorageItem<boolean>('stream_mode_add_structure');
			const matchSty = await getStorageItem<boolean>('stream_mode_match_style');
			const streamTimeout = await getStorageItem<number>('stream_mode_timeout_ms');

			if (streamEnabled !== null) setStreamModeEnabled(streamEnabled);
			if (provider !== null) setStreamModeProvider(provider);
			if (claudeKey !== null) setClaudeApiKey(claudeKey);
			if (claudeMdl !== null) setClaudeModel(claudeMdl);
			if (openaiKey !== null) setOpenaiApiKey(openaiKey);
			if (openaiMdl !== null) setOpenaiModel(openaiMdl);
			if (ollamaUrlVal !== null) setOllamaUrl(ollamaUrlVal);
			if (ollamaMdl !== null) setOllamaModel(ollamaMdl);
			if (removeF !== null) setRemoveFillers(removeF);
			if (addStr !== null) setAddStructure(addStr);
			if (matchSty !== null) setMatchStyle(matchSty);
			if (streamTimeout !== null) setStreamModeTimeout(streamTimeout);
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
			<DialogContent className='max-w-4xl max-h-[85vh] overflow-y-auto bg-background text-foreground border-border'>
				<DialogHeader>
					<DialogTitle className='text-xl font-semibold'>Settings</DialogTitle>
				</DialogHeader>
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
										// Notify editor to update font size
										if ((window as any).updateEditorFontSize) {
											(window as any).updateEditorFontSize(val);
										}
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
											if ((window as any).toggleMinimap) {
												(window as any).toggleMinimap(e.target.checked);
											}
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
											window.dispatchEvent(new CustomEvent('mutter:voice-settings-changed'));
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

				{/* FULL-WIDTH BOTTOM SECTION: Advanced Settings */}
				<div className='space-y-6 border-t border-border pt-6'>
					<div className='space-y-4'>
						<h3 className='text-base font-semibold border-b border-border pb-2'>Stream Mode (LLM Formatting)</h3>

						<div className='space-y-2'>
							<Label className='flex items-center gap-2 cursor-pointer'>
								<input
									type='checkbox'
									checked={streamModeEnabled}
									onChange={(e) => {
										const enabled = e.target.checked;
										setStreamModeEnabled(enabled);
										setStorageItem('stream_mode_enabled', enabled);
									}}
									className='h-4 w-4 rounded border-primary text-primary focus:ring-primary accent-primary'
								/>
								Enable Stream Mode
							</Label>
							<p className='text-xs text-muted-foreground'>
								Use LLM to format voice transcriptions into clean markdown.
							</p>
						</div>

						{streamModeEnabled && (
							<>
								<div className='space-y-2'>
									<Label htmlFor='llm-provider'>LLM Provider</Label>
									<Select
										value={streamModeProvider}
										onValueChange={(val: any) => {
											setStreamModeProvider(val);
											setStorageItem('stream_mode_provider', val);
										}}
									>
										<SelectTrigger
											id='llm-provider'
											className='bg-background border-input'
										>
											<SelectValue placeholder='Select provider' />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value='claude'>Claude API (Anthropic)</SelectItem>
											<SelectItem value='openai'>OpenAI API</SelectItem>
											<SelectItem value='ollama'>Local Ollama</SelectItem>
										</SelectContent>
									</Select>
								</div>

								{streamModeProvider === 'claude' && (
									<>
										<div className='space-y-2'>
											<Label htmlFor='claude-key'>Claude API Key</Label>
											<input
												id='claude-key'
												type='password'
												value={claudeApiKey}
												onChange={(e) => {
													setClaudeApiKey(e.target.value);
													setStorageItem('claude_api_key', e.target.value);
												}}
												placeholder='sk-ant-...'
												className='w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-ring'
											/>
										</div>
										<div className='space-y-2'>
											<Label htmlFor='claude-model'>Claude Model</Label>
											<Select
												value={claudeModel}
												onValueChange={(val) => {
													setClaudeModel(val);
													setStorageItem('claude_model', val);
												}}
											>
												<SelectTrigger
													id='claude-model'
													className='bg-background border-input'
												>
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value='claude-sonnet-4-5-20251029'>
														Claude Sonnet 4.5
													</SelectItem>
													<SelectItem value='claude-opus-4-5-20251101'>
														Claude Opus 4.5
													</SelectItem>
												</SelectContent>
											</Select>
										</div>
									</>
								)}

								{streamModeProvider === 'openai' && (
									<>
										<div className='space-y-2'>
											<Label htmlFor='openai-key'>OpenAI API Key</Label>
											<input
												id='openai-key'
												type='password'
												value={openaiApiKey}
												onChange={(e) => {
													setOpenaiApiKey(e.target.value);
													setStorageItem('openai_api_key', e.target.value);
												}}
												placeholder='sk-...'
												className='w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-ring'
											/>
										</div>
										<div className='space-y-2'>
											<Label htmlFor='openai-model'>OpenAI Model</Label>
											<Select
												value={openaiModel}
												onValueChange={(val) => {
													setOpenaiModel(val);
													setStorageItem('openai_model', val);
												}}
											>
												<SelectTrigger
													id='openai-model'
													className='bg-background border-input'
												>
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value='gpt-4-turbo-preview'>
														GPT-4 Turbo
													</SelectItem>
													<SelectItem value='gpt-4'>GPT-4</SelectItem>
												</SelectContent>
											</Select>
										</div>
									</>
								)}

								{streamModeProvider === 'ollama' && (
									<>
										<div className='space-y-2'>
											<Label htmlFor='ollama-url'>Ollama Server URL</Label>
											<input
												id='ollama-url'
												type='text'
												value={ollamaUrl}
												onChange={(e) => {
													setOllamaUrl(e.target.value);
													setStorageItem('ollama_url', e.target.value);
												}}
												placeholder='http://localhost:11434'
												className='w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-ring'
											/>
										</div>
										<div className='space-y-2'>
											<Label htmlFor='ollama-model'>Ollama Model</Label>
											<Select
												value={ollamaModel}
												onValueChange={(val) => {
													setOllamaModel(val);
													setStorageItem('ollama_model', val);
												}}
											>
												<SelectTrigger
													id='ollama-model'
													className='bg-background border-input'
												>
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value='qwen2.5:3b'>Qwen 2.5 3B (Recommended - Low VRAM)</SelectItem>
													<SelectItem value='qwen2.5:7b'>Qwen 2.5 7B</SelectItem>
													<SelectItem value='qwen2.5:14b'>Qwen 2.5 14B (Larger)</SelectItem>
													<SelectItem value='deepseek-r1:8b'>DeepSeek R1 8B</SelectItem>
													<SelectItem value='llama3.1:8b'>Llama 3.1 8B</SelectItem>
													<SelectItem value='mistral'>Mistral 7B</SelectItem>
												</SelectContent>
											</Select>
										</div>
									</>
								)}

								<div className='space-y-2'>
									<Label className='font-medium'>Formatting Options</Label>
									<Label className='flex items-center gap-2 cursor-pointer'>
										<input
											type='checkbox'
											checked={removeFillers}
											onChange={(e) => {
												setRemoveFillers(e.target.checked);
												setStorageItem(
													'stream_mode_remove_fillers',
													e.target.checked
												);
											}}
											className='h-4 w-4 rounded border-primary text-primary focus:ring-primary accent-primary'
										/>
										Remove filler words (um, uh, like)
									</Label>
									<Label className='flex items-center gap-2 cursor-pointer'>
										<input
											type='checkbox'
											checked={addStructure}
											onChange={(e) => {
												setAddStructure(e.target.checked);
												setStorageItem(
													'stream_mode_add_structure',
													e.target.checked
												);
											}}
											className='h-4 w-4 rounded border-primary text-primary focus:ring-primary accent-primary'
										/>
										Add intelligent structure (headers, bullets)
									</Label>
									<Label className='flex items-center gap-2 cursor-pointer'>
										<input
											type='checkbox'
											checked={matchStyle}
											onChange={(e) => {
												setMatchStyle(e.target.checked);
												setStorageItem('stream_mode_match_style', e.target.checked);
											}}
											className='h-4 w-4 rounded border-primary text-primary focus:ring-primary accent-primary'
										/>
										Match document style (context-aware)
									</Label>
								</div>

								<div className='space-y-2'>
									<div className='flex justify-between'>
										<Label>Formatting Timeout</Label>
										<span className='text-sm text-muted-foreground'>
											{(streamModeTimeout / 1000).toFixed(1)}s
										</span>
									</div>
									<input
										type='range'
										min='5000'
										max='30000'
										step='1000'
										value={streamModeTimeout}
										onChange={(e) => {
											const val = parseInt(e.target.value);
											setStreamModeTimeout(val);
											setStorageItem('stream_mode_timeout_ms', val);
										}}
										className='w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary'
									/>
									<p className='text-xs text-muted-foreground'>
										Maximum time to wait for LLM response (5-30 seconds).
									</p>
								</div>
							</>
						)}
					</div>
				</div>

				{/* FULL-WIDTH SECTION: Sync Settings */}
				<div className='border-t border-border pt-6'>
					<SyncSettingsPanel />
				</div>
			</DialogContent>
		</Dialog>
	);
}
