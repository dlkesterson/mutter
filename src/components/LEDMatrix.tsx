import { useRef, useEffect, useState } from 'react';
import { useTypeGPU } from '@/hooks/useTypeGPU';
import { LEDMatrixCanvas2D } from './LEDMatrixCanvas2D';
import { computeFrequencyBands, smoothFrequencies } from '@/utils/audioAnalysis';

interface LEDMatrixProps {
	audioSamples: number[];
	isRecording: boolean;
	width: number;
	height?: number;
}

const GRID_COLS = 32;
const GRID_ROWS = 8;

export function LEDMatrix({
	audioSamples,
	isRecording,
	width,
	height = 64,
}: LEDMatrixProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const animationRef = useRef<number | undefined>(undefined);
	const timeRef = useRef(0);
	const prevFrequenciesRef = useRef<Float32Array>(new Float32Array(GRID_COLS));
	const audioDataRef = useRef(audioSamples);
	const isRecordingRef = useRef(isRecording);

	const [canvasMounted, setCanvasMounted] = useState(false);

	// Track canvas mount state
	useEffect(() => {
		if (canvasRef.current) {
			setCanvasMounted(true);
		}
	}, []);

	// Update refs when props change
	useEffect(() => {
		audioDataRef.current = audioSamples;
	}, [audioSamples]);

	useEffect(() => {
		isRecordingRef.current = isRecording;
	}, [isRecording]);

	// Set up canvas dimensions
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const dpr = window.devicePixelRatio || 1;
		canvas.width = width * dpr;
		canvas.height = height * dpr;
		canvas.style.width = `${width}px`;
		canvas.style.height = `${height}px`;
	}, [width, height]);

	const {
		isSupported,
		isReady,
		error,
		updateFrequencyData,
		updateParams,
		render,
	} = useTypeGPU({
		canvas: canvasMounted ? canvasRef.current : null,
		width,
		height,
		gridCols: GRID_COLS,
		gridRows: GRID_ROWS,
	});

	// Animation loop
	useEffect(() => {
		if (!isReady) return;

		const animate = () => {
			// Compute frequency bands from audio
			const rawFrequencies = computeFrequencyBands(
				audioDataRef.current,
				GRID_COLS
			);
			const smoothed = smoothFrequencies(
				rawFrequencies,
				prevFrequenciesRef.current,
				0.7
			);
			prevFrequenciesRef.current = smoothed;

			// Update GPU buffers
			updateFrequencyData(smoothed);
			updateParams(timeRef.current, isRecordingRef.current);

			// Render
			render();

			timeRef.current += 0.016;
			animationRef.current = requestAnimationFrame(animate);
		};

		animate();

		return () => {
			if (animationRef.current) {
				cancelAnimationFrame(animationRef.current);
			}
		};
	}, [isReady, updateFrequencyData, updateParams, render]);

	// If WebGPU not supported or error, fall back to Canvas 2D
	if (!isSupported || error) {
		return (
			<LEDMatrixCanvas2D
				audioSamples={audioSamples}
				isRecording={isRecording}
				width={width}
				height={height}
			/>
		);
	}

	return (
		<canvas
			ref={canvasRef}
			style={{
				width,
				height,
				borderRadius: '4px',
				display: 'block',
			}}
		/>
	);
}
