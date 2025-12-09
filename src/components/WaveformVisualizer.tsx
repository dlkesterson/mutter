import { useRef, useEffect } from 'react';
import './WaveformVisualizer.css';

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
			ctx.fillStyle = '#1e1e1e';
			ctx.fillRect(0, 0, width, height);

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
				ctx.strokeStyle = '#3b82f6';
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
				ctx.strokeStyle = '#3a3a3a';
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
		<div className='waveform-visualizer'>
			<canvas
				ref={canvasRef}
				width={300}
				height={60}
				className='waveform-canvas'
			/>
		</div>
	);
}
