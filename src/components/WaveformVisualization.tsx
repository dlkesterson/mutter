import { useEffect, useRef } from 'react';

interface WaveformVisualizationProps {
    audioData: number[]; // Recent audio samples
    isRecording: boolean;
    width?: number;
    height?: number;
}

export function WaveformVisualization({
    audioData,
    isRecording,
    width = 200,
    height = 40,
}: WaveformVisualizationProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationFrameRef = useRef<number | null>(null);

    // Store audio data in a ref to avoid restarting animation loop on every update
    const audioDataRef = useRef<number[]>(audioData);
    const isRecordingRef = useRef(isRecording);

    // Update refs when props change (doesn't restart animation loop)
    useEffect(() => {
        audioDataRef.current = audioData;
        isRecordingRef.current = isRecording;
    }, [audioData, isRecording]);

    // Animation loop - runs continuously at 60 FPS without restarting
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set canvas resolution for crisp rendering
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);

        let animating = true;

        const draw = () => {
            if (!animating) return;

            // Clear canvas
            ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
            ctx.fillRect(0, 0, width, height);

            const currentAudioData = audioDataRef.current;
            const currentIsRecording = isRecordingRef.current;

            if (!currentIsRecording || currentAudioData.length === 0) {
                // Show idle state - subtle baseline
                ctx.strokeStyle = 'rgba(100, 116, 139, 0.3)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(0, height / 2);
                ctx.lineTo(width, height / 2);
                ctx.stroke();

                animationFrameRef.current = requestAnimationFrame(draw);
                return;
            }

            // Draw waveform
            const barWidth = 2;
            const gap = 1;
            const barCount = Math.floor(width / (barWidth + gap));
            const samplesPerBar = Math.floor(currentAudioData.length / barCount);

            ctx.fillStyle = '#10b981'; // Emerald green like SuperWhisper

            for (let i = 0; i < barCount; i++) {
                // Get RMS for this segment
                const startIdx = i * samplesPerBar;
                const endIdx = Math.min(startIdx + samplesPerBar, currentAudioData.length);
                const segment = currentAudioData.slice(startIdx, endIdx);

                const rms = Math.sqrt(
                    segment.reduce((sum, val) => sum + val * val, 0) / segment.length
                );

                // Map RMS to bar height (with some scaling for visibility)
                const barHeight = Math.min(height, rms * height * 20);

                // Center the bars vertically
                const x = i * (barWidth + gap);
                const y = (height - barHeight) / 2;

                // Draw rounded bar
                ctx.beginPath();
                ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2);
                ctx.fill();
            }

            animationFrameRef.current = requestAnimationFrame(draw);
        };

        draw();

        return () => {
            animating = false;
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [width, height]); // Only restart if canvas dimensions change

    return (
        <canvas
            ref={canvasRef}
            style={{
                width: `${width}px`,
                height: `${height}px`,
                borderRadius: '8px',
                backgroundColor: 'rgba(0, 0, 0, 0.02)',
            }}
        />
    );
}
