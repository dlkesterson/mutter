import { useRef, useEffect } from 'react';

interface WaveformVisualizerProps {
	isActive: boolean;
	audioData?: Float32Array;
}

export default function WaveformVisualizer({
	isActive,
	audioData,
}: WaveformVisualizerProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const animationFrameRef = useRef<number | null>(null);
	const dataBufferRef = useRef<number[]>([]);

	useEffect(() => {
		if (!isActive) {
			dataBufferRef.current = [];
			return;
		}

		const canvas = canvasRef.current;
		if (!canvas) return;

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const width = canvas.width;
		const height = canvas.height;

		const draw = () => {
			// Clear canvas
			ctx.clearRect(0, 0, width, height);

			// If we have audio data, add it to buffer
			if (audioData && audioData.length > 0) {
				const energy =
					audioData.reduce((sum, val) => sum + val * val, 0) /
					audioData.length;
				dataBufferRef.current.push(Math.sqrt(energy));

				// Keep only last 100 samples
				if (dataBufferRef.current.length > 100) {
					dataBufferRef.current.shift();
				}
			}

			// Draw waveform
			if (dataBufferRef.current.length > 0) {
				// Use CSS variable for primary color if possible, or fallback
				
				// Convert OKLCH to hex/rgb if needed, but for now let's stick to a safe color or try to parse
				// Since canvas doesn't support OKLCH directly in all browsers yet, we might need a fallback
				// For now, let's use a hardcoded color that matches our theme
				ctx.strokeStyle = '#a855f7'; // Purple-500 to match primary
				ctx.lineWidth = 2;
				ctx.beginPath();

				const step = width / dataBufferRef.current.length;
				const scale = height / 2;

				dataBufferRef.current.forEach((value, i) => {
					const x = i * step;
					const y = height / 2 + (value * scale - scale / 2);

					if (i === 0) {
						ctx.moveTo(x, y);
					} else {
						ctx.lineTo(x, y);
					}
				});

				ctx.stroke();

				// Draw baseline
				ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
				ctx.lineWidth = 1;
				ctx.beginPath();
				ctx.moveTo(0, height / 2);
				ctx.lineTo(width, height / 2);
				ctx.stroke();
			}

			animationFrameRef.current = requestAnimationFrame(draw);
		};

		draw();

		return () => {
			if (animationFrameRef.current) {
				cancelAnimationFrame(animationFrameRef.current);
			}
		};
	}, [isActive, audioData]);

	if (!isActive) return null;

	return (
		<div className='absolute bottom-24 right-6 bg-card border border-border rounded-lg p-2 shadow-lg animate-in slide-in-from-bottom-2 fade-in duration-300'>
			<canvas ref={canvasRef} width={200} height={60} className='block' />
		</div>
	);
}
