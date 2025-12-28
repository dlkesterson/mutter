import { useState, useRef, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export interface TranscriptionResult {
    text: string;
    duration_ms: number;
}

interface AudioRecorderOptions {
    onSilenceDetected?: () => void;
    onStreamingTranscription?: (text: string) => void;
    autoStopOnSilence?: boolean;
    silenceTimeoutMs?: number;
}

export function useAudioRecorder(options?: AudioRecorderOptions) {
    const {
        onSilenceDetected,
        autoStopOnSilence = true,
        silenceTimeoutMs = 5000
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

    // Use refs for settings to avoid stale closures
    const autoStopOnSilenceRef = useRef(autoStopOnSilence);
    const silenceTimeoutMsRef = useRef(silenceTimeoutMs);
    const onSilenceDetectedRef = useRef(onSilenceDetected);

    // Update refs when props change
    useEffect(() => {
        autoStopOnSilenceRef.current = autoStopOnSilence;
        silenceTimeoutMsRef.current = silenceTimeoutMs;
        onSilenceDetectedRef.current = onSilenceDetected;
    }, [autoStopOnSilence, silenceTimeoutMs, onSilenceDetected]);

    useEffect(() => {
        isRecordingRef.current = isRecording;
    }, [isRecording]);

    useEffect(() => {
        console.log('[useAudioRecorder] Setting up VAD event listeners');

        const unlisten = listen('vad-silence-detected', () => {
            console.log('[VAD Event] Received vad-silence-detected, isRecording:', isRecordingRef.current);

            if (isRecordingRef.current) {
                console.log('[VAD Event] ✓ Starting auto-stop timer');

                // PAUSE audio collection to prevent recording silence
                // This stops Whisper from hallucinating on silent audio
                console.log('[VAD Event] ⏸️  Pausing audio collection (silence detected)');
                isCollectingAudioRef.current = false;

                // Clear any existing timeout
                if (silenceTimeoutRef.current) {
                    console.log('[VAD Event] Clearing existing timeout');
                    clearTimeout(silenceTimeoutRef.current);
                }

                // Start new timeout for auto-stop
                const shouldAutoStop = autoStopOnSilenceRef.current;
                const timeoutMs = silenceTimeoutMsRef.current;

                if (shouldAutoStop && autoStopCallbackRef.current) {
                    console.log(`[VAD Event] ✓ Scheduling auto-stop in ${timeoutMs}ms`);
                    silenceTimeoutRef.current = setTimeout(() => {
                        console.log(`[Auto-Stop] ⏱️ Triggering auto-stop after ${timeoutMs}ms of silence`);
                        if (autoStopCallbackRef.current) {
                            autoStopCallbackRef.current();
                        }
                    }, timeoutMs);
                } else {
                    console.warn('[VAD Event] ⚠️ Cannot schedule auto-stop:', {
                        shouldAutoStop,
                        hasCallback: !!autoStopCallbackRef.current
                    });
                }

                // Also call the optional callback
                const onSilence = onSilenceDetectedRef.current;
                if (onSilence) onSilence();
            } else {
                console.log('[VAD Event] ⚠️ Ignoring silence event - not recording');
            }
        });

        // Listen for speech start to cancel auto-stop
        const unlistenSpeech = listen('vad-speech-start', () => {
            console.log('[VAD Event] Received vad-speech-start');

            // RESUME audio collection - user is speaking again
            console.log('[VAD Event] ▶️  Resuming audio collection (speech detected)');
            isCollectingAudioRef.current = true;

            if (silenceTimeoutRef.current) {
                console.log('[VAD Event] ✓ Speech detected - canceling auto-stop timer');
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
            console.log('🎤 Requesting microphone access...');

            // Simplified constraints - let browser choose optimal settings
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true
            });
            streamRef.current = stream;

            // Log audio track info
            const audioTrack = stream.getAudioTracks()[0];
            const settings = audioTrack.getSettings();
            const constraints = audioTrack.getConstraints();
            const capabilities = audioTrack.getCapabilities ? audioTrack.getCapabilities() : null;

            console.log('🎤 Audio track info:', {
                label: audioTrack.label,
                readyState: audioTrack.readyState,
                enabled: audioTrack.enabled,
                muted: audioTrack.muted,
                settings: settings,
                constraints: constraints,
                capabilities: capabilities
            });

            // Check if track is actually active
            if (audioTrack.readyState !== 'live') {
                console.error('⚠️ Audio track is not live! readyState:', audioTrack.readyState);
            }
            if (audioTrack.muted) {
                console.error('⚠️ Audio track is muted!');
            }

            const audioContext = new AudioContext({ sampleRate: 16000 });
            audioContextRef.current = audioContext;

            console.log('🎧 AudioContext info:', {
                requested: 16000,
                actual: audioContext.sampleRate,
                mismatch: audioContext.sampleRate !== 16000
            });

            if (audioContext.sampleRate !== 16000) {
                console.warn('⚠️  Sample rate mismatch! Browser using', audioContext.sampleRate, 'Hz instead of 16000 Hz');
            }

            const source = audioContext.createMediaStreamSource(stream);
            sourceRef.current = source;

            // Buffer size 4096
            const processor = audioContext.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;

            audioBufferRef.current = [];
            isCollectingAudioRef.current = true; // Reset collection flag for new recording
            setIsRecording(true);

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
                invoke('process_audio_chunk', { pcmData });

                // Update waveform visualization data (keep last ~1 second)
                const maxSamples = 16000; // 1 second at 16kHz
                recentSamplesRef.current = [...recentSamplesRef.current, ...pcmData].slice(-maxSamples);

                // Update state every chunk (~256ms) for smooth waveform
                // The waveform component now uses refs and runs at 60 FPS, so more frequent
                // data updates make it smoother without performance cost
                setRecentAudioSamples([...recentSamplesRef.current]);

                // Streaming transcription DISABLED - causes infinite loop and blocks auto-stop
                // TODO: Re-enable after fixing the async transcription issue
                // The problem: transcription takes 12+ seconds, blocks the event loop,
                // and causes the component to re-render continuously
            };

            source.connect(processor);
            processor.connect(audioContext.destination);

        } catch (error) {
            console.error('Error starting recording:', error);
            setIsRecording(false);
        }
    }, []);

    const stopRecording = useCallback(async (): Promise<TranscriptionResult | null> => {
        const frontendStartTime = performance.now();

        // Clear any pending silence timeout
        if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
            silenceTimeoutRef.current = null;
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

        // Final transcription
        if (audioBufferRef.current.length > 0) {
            try {
                console.log('🎯 Starting final transcription...');
                const result = await invoke<TranscriptionResult>('transcribe_audio', { audioBuffer: audioBufferRef.current });
                const frontendDuration = performance.now() - frontendStartTime;
                console.log(`⚡ Total frontend time: ${frontendDuration.toFixed(2)}ms (includes Rust time: ${result.duration_ms.toFixed(2)}ms)`);
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
        console.log('[useAudioRecorder] ✓ Auto-stop callback set:', callback ? 'function' : 'null');
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
