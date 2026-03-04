/**
 * Voice Pipeline Hook
 *
 * Manages the full voice recording → transcription → execution pipeline.
 * Extracted from App.tsx to encapsulate voice-related state and logic.
 */

import { useState, useCallback, useEffect } from 'react';
import { emitMutterEvent, useMutterEvent } from '../events';
import { hasLoadedModel } from '../services/whisper';
import { useAudioRecorder } from './useAudioRecorder';
import { useToast } from './use-toast';
import { getStorageItem } from '../utils/storage';
import type { VoiceLogEntry } from '../types';

export type AudioState = 'idle' | 'listening' | 'processing' | 'executing';

interface UseVoicePipelineOptions {
	onModelSelectorOpen: () => void;
}

export function useVoicePipeline({ onModelSelectorOpen }: UseVoicePipelineOptions) {
	const { toast } = useToast();

	const [audioState, setAudioState] = useState<AudioState>('idle');
	const [streamingTranscription, setStreamingTranscription] = useState('');
	const [voiceLogEntries, setVoiceLogEntries] = useState<VoiceLogEntry[]>([]);

	// Voice settings
	const [voiceEnabled, setVoiceEnabled] = useState(true);
	const [autoStopEnabled, setAutoStopEnabled] = useState(true);
	const [autoStopTimeoutMs, setAutoStopTimeoutMs] = useState(3000);

	const loadVoiceSettings = useCallback(async () => {
		const voiceOn = await getStorageItem<boolean>('voice_enabled');
		const enabled = await getStorageItem<boolean>('auto_stop_enabled');
		const timeout = await getStorageItem<number>('auto_stop_timeout_ms');

		if (voiceOn !== null) setVoiceEnabled(voiceOn);
		if (enabled !== null) setAutoStopEnabled(enabled);
		if (timeout !== null) setAutoStopTimeoutMs(timeout);
	}, []);

	useEffect(() => {
		loadVoiceSettings();
	}, [loadVoiceSettings]);

	useMutterEvent('mutter:voice-settings-changed', () => {
		loadVoiceSettings();
	});

	const {
		startRecording,
		stopRecording,
		setAutoStopCallback,
		recentAudioSamples,
	} = useAudioRecorder({
		onStreamingTranscription: (text: string) => {
			setStreamingTranscription(text);
		},
		autoStopOnSilence: autoStopEnabled,
		silenceTimeoutMs: autoStopTimeoutMs,
		enableStreaming: true,
		streamingIntervalMs: 4000,
	});

	const addVoiceLogEntry = useCallback(
		(transcript: string) => {
			setVoiceLogEntries((prev) => [
				...prev.slice(-99),
				{
					transcript,
					id: `${Date.now()}-${Math.random()}`,
					timestamp: new Date(),
				},
			]);
		},
		[],
	);

	const toggleListening = useCallback(async () => {
		if (audioState === 'listening') {
			try {
				setAutoStopCallback(null);
				setAudioState('processing');
				const result = await stopRecording();
				if (result) {
					setAudioState('executing');
					emitMutterEvent('mutter:transcription-result', {
						text: result.text,
					});
					addVoiceLogEntry(result.text);
				}
			} catch (error) {
				console.error('Voice input error:', error);
			} finally {
				setAudioState('idle');
				setStreamingTranscription('');
			}
		} else {
			try {
				const hasModel = await hasLoadedModel();
				if (!hasModel) {
					toast({
						title: 'No Whisper Model',
						description:
							'Please select a speech-to-text model in Settings first.',
						variant: 'destructive',
					});
					onModelSelectorOpen();
					return;
				}

				setStreamingTranscription('');

				setAutoStopCallback(async () => {
					try {
						setAudioState('processing');
						const result = await stopRecording();
						if (result) {
							setAudioState('executing');
							emitMutterEvent('mutter:transcription-result', {
								text: result.text,
							});
						addVoiceLogEntry(result.text);
						}
					} catch (error) {
						console.error('Auto-stop error:', error);
					} finally {
						setAudioState('idle');
						setStreamingTranscription('');
						setAutoStopCallback(null);
					}
				});

				await startRecording();
				setAudioState('listening');
			} catch (error) {
				console.error('Failed to start recording:', error);
				setAudioState('idle');
			}
		}
	}, [
		audioState,
		stopRecording,
		startRecording,
		setAutoStopCallback,
		addVoiceLogEntry,
		toast,
		onModelSelectorOpen,
	]);

	return {
		audioState,
		streamingTranscription,
		voiceLogEntries,
		voiceEnabled,
		recentAudioSamples,
		toggleListening,
	};
}
