import { useRef, useEffect } from 'react';
import { computeFrequencyBands, smoothFrequencies } from '@/utils/audioAnalysis';

interface LEDMatrixCanvas2DProps {
	audioSamples: number[];
	isRecording: boolean;
	width: number;
	height?: number;
}

const GRID_COLS = 32;
const GRID_ROWS = 8;
const LED_SIZE = 0.65; // LED diameter as fraction of cell size

// Idle animation types
type IdleAnimation = 'wave' | 'flame' | 'smiley' | 'rain' | 'pulse';
const IDLE_ANIMATIONS: IdleAnimation[] = ['wave', 'flame', 'smiley', 'rain', 'pulse'];
const ANIMATION_DURATION = 8; // seconds per animation

// Smiley face pattern (8 rows x 32 cols, but we'll center it)
// 1 = on, 0 = off
const SMILEY_PATTERN = [
	[0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0],
	[0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0],
	[0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0],
	[0,0,0,0,0,0,0,0,1,1,1,0,0,1,1,1,1,1,1,0,0,1,1,1,0,0,0,0,0,0,0,0],
	[0,0,0,0,0,0,0,0,1,1,1,0,0,1,1,1,1,1,1,0,0,1,1,1,0,0,0,0,0,0,0,0],
	[0,0,0,0,0,0,0,0,1,1,0,1,1,0,1,1,1,1,0,1,1,0,1,1,0,0,0,0,0,0,0,0],
	[0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0],
	[0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0],
];

// Get brightness for idle animations
function getIdleBrightness(
	col: number,
	row: number,
	time: number,
	animation: IdleAnimation,
	transitionProgress: number // 0-1, used for fade in/out
): { brightness: number; hue: number } {
	const fadeMultiplier = transitionProgress < 0.1
		? transitionProgress / 0.1
		: transitionProgress > 0.9
			? (1 - transitionProgress) / 0.1
			: 1;

	switch (animation) {
		case 'wave': {
			// Smooth sine wave traveling across
			const wavePhase = (col / GRID_COLS) * Math.PI * 2 - time * 2;
			const waveHeight = (Math.sin(wavePhase) + 1) / 2 * (GRID_ROWS - 1);
			const dist = Math.abs(row - waveHeight);
			const brightness = Math.max(0, 1 - dist * 0.4) * fadeMultiplier;
			return { brightness, hue: 200 }; // Cyan-ish
		}

		case 'flame': {
			// Fire effect - brighter at bottom, flickering
			const baseHeight = (GRID_ROWS - row) / GRID_ROWS;
			const flicker = Math.sin(time * 8 + col * 0.7) * 0.3 +
				Math.sin(time * 12 + col * 1.3) * 0.2;
			const noise = Math.sin(col * 2.5 + time * 3) * 0.2;
			const brightness = Math.max(0, (baseHeight + flicker + noise) * 0.7) * fadeMultiplier;
			// Color gradient: yellow at bottom to red at top
			const hue = 30 + row * 5; // Orange to red
			return { brightness, hue };
		}

		case 'smiley': {
			// Display smiley pattern with gentle pulse
			const pulse = 0.7 + 0.3 * Math.sin(time * 2);
			const patternRow = GRID_ROWS - 1 - row; // Flip for display
			const isOn = SMILEY_PATTERN[patternRow]?.[col] === 1;
			const brightness = isOn ? pulse * fadeMultiplier : 0.05 * fadeMultiplier;
			return { brightness, hue: 50 }; // Yellow/gold
		}

		case 'rain': {
			// Digital rain / matrix style falling drops
			const dropSpeed = 3;
			const dropLength = 4;
			// Create multiple drops per column at different offsets
			const drop1 = ((time * dropSpeed + col * 2.3) % (GRID_ROWS + dropLength));
			const drop2 = ((time * dropSpeed * 0.7 + col * 3.7 + 5) % (GRID_ROWS + dropLength));

			const dist1 = row - (drop1 - dropLength);
			const dist2 = row - (drop2 - dropLength);

			const bright1 = dist1 >= 0 && dist1 < dropLength ? (1 - dist1 / dropLength) : 0;
			const bright2 = dist2 >= 0 && dist2 < dropLength ? (1 - dist2 / dropLength) * 0.6 : 0;

			const brightness = Math.max(bright1, bright2) * fadeMultiplier;
			return { brightness, hue: 140 }; // Green
		}

		case 'pulse': {
			// Radial pulse from center
			const centerX = GRID_COLS / 2;
			const centerY = GRID_ROWS / 2;
			const dist = Math.sqrt(Math.pow(col - centerX, 2) + Math.pow((row - centerY) * 2, 2));
			const maxDist = Math.sqrt(Math.pow(GRID_COLS / 2, 2) + Math.pow(GRID_ROWS, 2));

			// Multiple expanding rings
			const ringPhase = (dist / maxDist - time * 0.5) % 1;
			const ring = Math.exp(-Math.pow((ringPhase * 10) % 3 - 1.5, 2) * 2);

			const brightness = ring * 0.8 * fadeMultiplier;
			return { brightness, hue: 280 }; // Purple
		}

		default:
			return { brightness: 0.1, hue: 200 };
	}
}

// Convert HSL to RGB string
function hslToRgb(h: number, s: number, l: number): string {
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const x = c * (1 - Math.abs((h / 60) % 2 - 1));
	const m = l - c / 2;
	let r = 0, g = 0, b = 0;

	if (h < 60) { r = c; g = x; b = 0; }
	else if (h < 120) { r = x; g = c; b = 0; }
	else if (h < 180) { r = 0; g = c; b = x; }
	else if (h < 240) { r = 0; g = x; b = c; }
	else if (h < 300) { r = x; g = 0; b = c; }
	else { r = c; g = 0; b = x; }

	return `rgb(${Math.round((r + m) * 255)}, ${Math.round((g + m) * 255)}, ${Math.round((b + m) * 255)})`;
}

export function LEDMatrixCanvas2D({
	audioSamples,
	isRecording,
	width,
	height = 64,
}: LEDMatrixCanvas2DProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const animationRef = useRef<number | undefined>(undefined);
	const audioDataRef = useRef(audioSamples);
	const prevFrequenciesRef = useRef<Float32Array>(new Float32Array(GRID_COLS));
	const timeRef = useRef(0);
	const animationIndexRef = useRef(0);

	// Update audio data ref when props change
	useEffect(() => {
		audioDataRef.current = audioSamples;
	}, [audioSamples]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const dpr = window.devicePixelRatio || 1;
		canvas.width = width * dpr;
		canvas.height = height * dpr;
		ctx.scale(dpr, dpr);

		const cellWidth = width / GRID_COLS;
		const cellHeight = height / GRID_ROWS;
		const ledRadius = Math.min(cellWidth, cellHeight) * LED_SIZE * 0.5;

		const draw = () => {
			// Clear canvas
			ctx.fillStyle = '#121212';
			ctx.fillRect(0, 0, width, height);

			// Compute and smooth frequency data
			const rawFrequencies = computeFrequencyBands(
				audioDataRef.current,
				GRID_COLS
			);
			const frequencies = smoothFrequencies(
				rawFrequencies,
				prevFrequenciesRef.current,
				0.7
			);
			prevFrequenciesRef.current = frequencies;

			// Determine current idle animation
			const animationTime = timeRef.current % ANIMATION_DURATION;
			const animationProgress = animationTime / ANIMATION_DURATION;
			animationIndexRef.current = Math.floor(timeRef.current / ANIMATION_DURATION) % IDLE_ANIMATIONS.length;
			const currentAnimation = IDLE_ANIMATIONS[animationIndexRef.current];

			// Draw LED grid
			for (let col = 0; col < GRID_COLS; col++) {
				const magnitude = frequencies[col];
				const threshold = magnitude * GRID_ROWS;

				for (let row = 0; row < GRID_ROWS; row++) {
					const x = col * cellWidth + cellWidth / 2;
					// Flip Y so row 0 is at bottom
					const y = (GRID_ROWS - 1 - row) * cellHeight + cellHeight / 2;

					ctx.beginPath();
					ctx.arc(x, y, ledRadius, 0, Math.PI * 2);

					if (isRecording) {
						const isOn = row < threshold;
						if (isOn) {
							// Pacific Blue with glow effect
							const glow = 1.0 + 0.2 * Math.sin(timeRef.current * 4);
							ctx.fillStyle = `rgba(0, 160, 180, ${0.85 * glow})`;
							ctx.shadowColor = '#00A0B4';
							ctx.shadowBlur = 6;
						} else {
							// Dim background when recording
							ctx.fillStyle = 'rgba(40, 40, 40, 0.3)';
							ctx.shadowBlur = 0;
						}
					} else {
						// Idle animation
						const { brightness, hue } = getIdleBrightness(
							col,
							row,
							timeRef.current,
							currentAnimation,
							animationProgress
						);

						if (brightness > 0.05) {
							const color = hslToRgb(hue, 0.7, brightness * 0.5);
							ctx.fillStyle = color;
							ctx.shadowColor = color;
							ctx.shadowBlur = brightness > 0.5 ? 4 : 0;
						} else {
							ctx.fillStyle = 'rgba(40, 40, 40, 0.2)';
							ctx.shadowBlur = 0;
						}
					}

					ctx.fill();
				}
			}

			// Reset shadow for next frame
			ctx.shadowBlur = 0;

			timeRef.current += 0.016; // ~60fps
			animationRef.current = requestAnimationFrame(draw);
		};

		draw();

		return () => {
			if (animationRef.current) {
				cancelAnimationFrame(animationRef.current);
			}
		};
	}, [width, height, isRecording]);

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
