/**
 * Whisper Service Layer
 *
 * Wraps all Whisper/ML-related Tauri invoke commands behind typed functions.
 * Centralizes the invoke() calls so callers don't need to know command names.
 */

import { invoke } from '@tauri-apps/api/core';

export interface TranscriptionResult {
	text: string;
	duration_ms: number;
}

/** Check whether a Whisper model is currently loaded in memory. */
export function hasLoadedModel(): Promise<boolean> {
	return invoke<boolean>('has_loaded_model');
}

/** Load a previously downloaded Whisper model by name. */
export function loadWhisperModel(modelName: string): Promise<void> {
	return invoke('load_whisper_model', { modelName });
}

/** Download a Whisper model (GGML format) from HuggingFace. */
export function downloadWhisperModel(modelName: string): Promise<void> {
	return invoke('download_whisper_model', { modelName });
}

/** Check if a specific model file has been downloaded. */
export function isModelDownloaded(modelName: string): Promise<boolean> {
	return invoke<boolean>('is_model_downloaded', { modelName });
}

/** Run final transcription on the full audio buffer. */
export function transcribeAudio(audioBuffer: number[]): Promise<TranscriptionResult> {
	return invoke<TranscriptionResult>('transcribe_audio', { audioBuffer });
}

/** Send accumulated audio for partial/streaming transcription. */
export function transcribeStreaming(audioBuffer: number[]): Promise<void> {
	return invoke('transcribe_streaming', { audioBuffer });
}

/** Send a chunk of PCM audio data to the VAD / ring buffer. */
export function processAudioChunk(pcmData: number[]): Promise<void> {
	return invoke('process_audio_chunk', { pcmData });
}
