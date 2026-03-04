import { useState, useRef, useEffect, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import {
    type TranscriptionResult,
    transcribeAudio,
    transcribeStreaming,
    processAudioChunk,
} from '../services/whisper';

export type { TranscriptionResult };

interface AudioRecorderOptions {
    onSilenceDetected?: () => void;
    onStreamingTranscription?: (text: string) => void;
    autoStopOnSilence?: boolean;
    silenceTimeoutMs?: number;
    /** Enable periodic streaming transcription (shows words while recording) */
    enableStreaming?: boolean;
    /** Interval in ms for streaming transcription (default: 4000) */
    streamingIntervalMs?: number;
}

export function useAudioRecorder(options?: AudioRecorderOptions) {
    const {
        onSilenceDetected,
        autoStopOnSilence = true,
        silenceTimeoutMs = 5000,
        enableStreaming = false,
        streamingIntervalMs = 4000
    } = options || {};

    const [isRecording, setIsRecording] = useState(false);
    const [recentAudioSamples, setRecentAudioSamples] = useState<number[]>([]);
    const audioContextRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const audioBufferRef = useRef<number[]>([]);
    const isRecordingRef = useRef(false);
    const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const autoStopCallbackRef = useRef<(() => void) | null>(null);
    const recentSamplesRef = useRef<number[]>([]); // For waveform visualization
    const isCollectingAudioRef = useRef(true); // Track if we should collect audio (paused during silence window)
    const streamingIntervalRef = useRef<NodeJS.Timeout | null>(null); // For periodic streaming transcription
    const lastStreamingLengthRef = useRef(0); // Track how much audio we've already streamed
    const rafPendingRef = useRef(false); // Track if RAF update is pending (throttle state updates)

    // Use refs for settings to avoid stale closures
    const autoStopOnSilenceRef = useRef(autoStopOnSilence);
    const silenceTimeoutMsRef = useRef(silenceTimeoutMs);
    const onSilenceDetectedRef = useRef(onSilenceDetected);
    const enableStreamingRef = useRef(enableStreaming);
    const streamingIntervalMsRef = useRef(streamingIntervalMs);

    // Update refs when props change
    useEffect(() => {
        autoStopOnSilenceRef.current = autoStopOnSilence;
        silenceTimeoutMsRef.current = silenceTimeoutMs;
        onSilenceDetectedRef.current = onSilenceDetected;
        enableStreamingRef.current = enableStreaming;
        streamingIntervalMsRef.current = streamingIntervalMs;
    }, [autoStopOnSilence, silenceTimeoutMs, onSilenceDetected, enableStreaming, streamingIntervalMs]);

    useEffect(() => {
        isRecordingRef.current = isRecording;
    }, [isRecording]);

    useEffect(() => {
        const unlisten = listen('vad-silence-detected', () => {
            if (isRecordingRef.current) {
                // PAUSE audio collection to prevent recording silence
                // This stops Whisper from hallucinating on silent audio
                isCollectingAudioRef.current = false;

                // Clear any existing timeout
                if (silenceTimeoutRef.current) {
                    clearTimeout(silenceTimeoutRef.current);
                }

                // Start new timeout for auto-stop
                const shouldAutoStop = autoStopOnSilenceRef.current;
                const timeoutMs = silenceTimeoutMsRef.current;

                if (shouldAutoStop && autoStopCallbackRef.current) {
                    silenceTimeoutRef.current = setTimeout(() => {
                        if (autoStopCallbackRef.current) {
                            autoStopCallbackRef.current();
                        }
                    }, timeoutMs);
                }

                // Also call the optional callback
                const onSilence = onSilenceDetectedRef.current;
                if (onSilence) onSilence();
            }
        });

        // Listen for speech start to cancel auto-stop
        const unlistenSpeech = listen('vad-speech-start', () => {
            // RESUME audio collection - user is speaking again
            isCollectingAudioRef.current = true;

            if (silenceTimeoutRef.current) {
                clearTimeout(silenceTimeoutRef.current);
                silenceTimeoutRef.current = null;
            }
        });

        return () => {
            unlisten.then(f => f());
            unlistenSpeech.then(f => f());
            // DON'T clear the timeout here - we want it to persist across re-renders
            // It will be cleared when stopRecording is called or when a new timer starts
        };
    }, []); // Remove dependencies to prevent re-running and clearing the timer

    const startRecording = useCallback(async () => {
        try {
            // Simplified constraints - let browser choose optimal settings
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true
            });
            streamRef.current = stream;

            const audioContext = new AudioContext({ sampleRate: 16000 });
            audioContextRef.current = audioContext;

            const source = audioContext.createMediaStreamSource(stream);
            sourceRef.current = source;

            // Buffer size 4096
            const processor = audioContext.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;

            audioBufferRef.current = [];
            isCollectingAudioRef.current = true; // Reset collection flag for new recording
            lastStreamingLengthRef.current = 0; // Reset streaming position
            setIsRecording(true);

            // Start periodic streaming transcription if enabled
            if (enableStreamingRef.current) {
                streamingIntervalRef.current = setInterval(async () => {
                    const currentLength = audioBufferRef.current.length;
                    // Only transcribe if we have new audio (at least 2 seconds more than last time)
                    const newSamples = currentLength - lastStreamingLengthRef.current;
                    if (newSamples >= 32000 && isRecordingRef.current) {
                        try {
                            // Send ALL accumulated audio for better context
                            await transcribeStreaming([...audioBufferRef.current]);
                            lastStreamingLengthRef.current = currentLength;
                        } catch (e) {
                            console.error('[Streaming] Error:', e);
                        }
                    }
                }, streamingIntervalMsRef.current);
            }

            processor.onaudioprocess = (e) => {
                if (!isRecordingRef.current) return;

                const inputData = e.inputBuffer.getChannelData(0);
                const pcmData = Array.from(inputData);

                // Only add to buffer if we're actively collecting (not in silence window)
                // This prevents Whisper from hallucinating on silence at the end of recordings
                if (isCollectingAudioRef.current) {
                    audioBufferRef.current.push(...pcmData);
                }

                // Always send to VAD for silence detection, even when not collecting
                processAudioChunk(pcmData);

                // Update waveform visualization data (keep last ~1 second)
                const maxSamples = 16000; // 1 second at 16kHz
                recentSamplesRef.current = [...recentSamplesRef.current, ...pcmData].slice(-maxSamples);

                // Throttle React state updates using requestAnimationFrame
                // This batches multiple audio callbacks into a single state update per frame (~60fps)
                // Without this, we'd trigger 4+ re-renders per second which cascades through the app
                if (!rafPendingRef.current) {
                    rafPendingRef.current = true;
                    requestAnimationFrame(() => {
                        if (isRecordingRef.current) {
                            setRecentAudioSamples([...recentSamplesRef.current]);
                        }
                        rafPendingRef.current = false;
                    });
                }

                // Note: Streaming transcription is now handled by a separate interval timer
                // that runs every N seconds (configurable via streamingIntervalMs)
                // This avoids blocking the audio processing loop
            };

            source.connect(processor);
            processor.connect(audioContext.destination);

        } catch (error) {
            console.error('Error starting recording:', error);
            setIsRecording(false);
        }
    }, []);

    const stopRecording = useCallback(async (): Promise<TranscriptionResult | null> => {
        // Clear any pending silence timeout
        if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
            silenceTimeoutRef.current = null;
        }

        // Clear streaming transcription interval
        if (streamingIntervalRef.current) {
            clearInterval(streamingIntervalRef.current);
            streamingIntervalRef.current = null;
        }

        if (processorRef.current && sourceRef.current) {
            sourceRef.current.disconnect();
            processorRef.current.disconnect();
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
        }
        setIsRecording(false);
        setRecentAudioSamples([]); // Clear waveform
        recentSamplesRef.current = [];
        lastStreamingLengthRef.current = 0; // Reset streaming position
        rafPendingRef.current = false; // Reset RAF throttle state

        // Final transcription
        if (audioBufferRef.current.length > 0) {
            try {
                const result = await transcribeAudio(audioBufferRef.current);
                return result;
            } catch (e) {
                console.error("Transcription failed", e);
                return null;
            }
        }
        return null;
    }, []);

    // Allow setting the auto-stop callback from outside
    const setAutoStopCallback = useCallback((callback: (() => void) | null) => {
        autoStopCallbackRef.current = callback;
    }, []);

    return {
        isRecording,
        startRecording,
        stopRecording,
        setAutoStopCallback,
        recentAudioSamples // For waveform visualization
    };
}
