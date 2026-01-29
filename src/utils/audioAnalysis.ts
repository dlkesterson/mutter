/**
 * Audio analysis utilities for LED matrix visualization
 */

/**
 * Compute frequency bands from PCM audio samples using RMS energy
 * This is a simplified approach - for true frequency analysis, use Web Audio AnalyserNode
 */
export function computeFrequencyBands(
	samples: number[],
	numBands: number
): Float32Array {
	const bands = new Float32Array(numBands);

	if (samples.length === 0) {
		return bands;
	}

	const samplesPerBand = Math.floor(samples.length / numBands);

	for (let i = 0; i < numBands; i++) {
		const start = i * samplesPerBand;
		const end = Math.min(start + samplesPerBand, samples.length);

		let sum = 0;
		for (let j = start; j < end; j++) {
			sum += samples[j] * samples[j];
		}

		const rms = Math.sqrt(sum / (end - start));
		// Scale to 0-1 range with amplification for visual impact
		bands[i] = Math.min(1.0, rms * 8);
	}

	return bands;
}

/**
 * Apply temporal smoothing to frequency data for smoother visuals
 */
export function smoothFrequencies(
	current: Float32Array,
	previous: Float32Array,
	smoothing: number = 0.6
): Float32Array {
	const result = new Float32Array(current.length);

	for (let i = 0; i < current.length; i++) {
		const prev = i < previous.length ? previous[i] : 0;
		result[i] = prev * smoothing + current[i] * (1 - smoothing);
	}

	return result;
}
