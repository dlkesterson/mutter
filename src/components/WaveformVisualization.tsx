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
    const animationFrameRef = useRef<number>();

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

        const draw = () => {
            // Clear canvas
            ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
            ctx.fillRect(0, 0, width, height);

            if (!isRecording || audioData.length === 0) {
                // Show idle state - subtle baseline
                ctx.strokeStyle = 'rgba(100, 116, 139, 0.3)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(0, height / 2);
                ctx.lineTo(width, height / 2);
                ctx.stroke();
                return;
            }

            // Draw waveform
            const barWidth = 2;
            const gap = 1;
            const barCount = Math.floor(width / (barWidth + gap));
            const samplesPerBar = Math.floor(audioData.length / barCount);

            ctx.fillStyle = '#10b981'; // Emerald green like SuperWhisper

            for (let i = 0; i < barCount; i++) {
                // Get RMS for this segment
                const startIdx = i * samplesPerBar;
                const endIdx = Math.min(startIdx + samplesPerBar, audioData.length);
                const segment = audioData.slice(startIdx, endIdx);

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
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [audioData, isRecording, width, height]);

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
