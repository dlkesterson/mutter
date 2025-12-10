import { useState, useRef, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export interface TranscriptionResult {
    text: string;
    duration_ms: number;
}

export function useAudioRecorder(onSilenceDetected?: () => void) {
    const [isRecording, setIsRecording] = useState(false);
    const audioContextRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const audioBufferRef = useRef<number[]>([]);
    const lastTranscriptionTimeRef = useRef<number>(0);
    const isRecordingRef = useRef(false);

    useEffect(() => {
        isRecordingRef.current = isRecording;
    }, [isRecording]);

    useEffect(() => {
        const unlisten = listen('vad-silence-detected', () => {
            if (isRecordingRef.current) {
                console.log('VAD detected silence');
                if (onSilenceDetected) onSilenceDetected();
            }
        });
        return () => {
            unlisten.then(f => f());
        };
    }, [onSilenceDetected]);

    const startRecording = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            const audioContext = new AudioContext({ sampleRate: 16000 });
            audioContextRef.current = audioContext;

            const source = audioContext.createMediaStreamSource(stream);
            sourceRef.current = source;

            // Buffer size 4096
            const processor = audioContext.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;

            audioBufferRef.current = [];
            setIsRecording(true);

            processor.onaudioprocess = (e) => {
                if (!isRecordingRef.current) return;

                const inputData = e.inputBuffer.getChannelData(0);
                const pcmData = Array.from(inputData);

                // Add to local buffer
                audioBufferRef.current.push(...pcmData);

                // Send to VAD
                invoke('process_audio_chunk', { pcmData });

                // Streaming transcription every 500ms
                const now = Date.now();
                if (now - lastTranscriptionTimeRef.current > 500) {
                    lastTranscriptionTimeRef.current = now;
                    // Send accumulated buffer for streaming transcription
                    invoke('transcribe_streaming', { audioBuffer: audioBufferRef.current });
                }
            };

            source.connect(processor);
            processor.connect(audioContext.destination);

        } catch (error) {
            console.error('Error starting recording:', error);
            setIsRecording(false);
        }
    }, []);

    const stopRecording = useCallback(async (): Promise<TranscriptionResult | null> => {
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

        // Final transcription
        if (audioBufferRef.current.length > 0) {
            try {
                return await invoke<TranscriptionResult>('transcribe_audio', { audioBuffer: audioBufferRef.current });
            } catch (e) {
                console.error("Transcription failed", e);
                return null;
            }
        }
        return null;
    }, []);

    return { isRecording, startRecording, stopRecording };
}
