/**
 * Text Cleanup Service
 *
 * Cleans up transcribed speech-to-text using local LLM (Ollama).
 * Removes filler words, adds structure, and improves readability.
 */

import { queryLLM, type LLMSettings } from './llm-service';
import { buildCleanupPrompt } from './text-cleanup-prompts';

export interface CleanupOptions {
	removeFillers: boolean;
	addStructure: boolean;
}

export interface CleanupResult {
	original: string;
	cleaned: string;
	processingTimeMs: number;
	error?: string;
}

/**
 * Clean up transcribed text using the configured LLM.
 *
 * @param text - The raw transcribed text to clean up
 * @param options - What cleanup operations to perform
 * @param llmSettings - LLM provider configuration
 * @returns The original and cleaned text, plus timing info
 */
export async function cleanupText(
	text: string,
	options: CleanupOptions,
	llmSettings: LLMSettings
): Promise<CleanupResult> {
	const startTime = performance.now();

	// If no cleanup options selected, return original text
	if (!options.removeFillers && !options.addStructure) {
		return {
			original: text,
			cleaned: text,
			processingTimeMs: 0,
		};
	}

	// Build the appropriate prompt
	const prompt = buildCleanupPrompt(text, options);

	try {
		const result = await queryLLM(prompt, llmSettings);

		const processingTimeMs = Math.round(performance.now() - startTime);

		if (!result) {
			return {
				original: text,
				cleaned: text,
				processingTimeMs,
				error: 'LLM returned empty response. Is Ollama running?',
			};
		}

		return {
			original: text,
			cleaned: result,
			processingTimeMs,
		};
	} catch (error) {
		const processingTimeMs = Math.round(performance.now() - startTime);
		const errorMessage =
			error instanceof Error ? error.message : 'Unknown error occurred';

		return {
			original: text,
			cleaned: text,
			processingTimeMs,
			error: errorMessage,
		};
	}
}

/**
 * Build LLM settings from the app's settings and credentials.
 * Convenience function to construct the LLMSettings object.
 */
export function buildLLMSettings(
	provider: 'claude' | 'openai' | 'ollama',
	aiProviders: {
		claude: { model: string };
		openai: { model: string };
		ollama: { url: string; model: string };
	},
	credentials: {
		claude: { api_key: string | null };
		openai: { api_key: string | null };
	},
	timeoutMs: number
): LLMSettings {
	switch (provider) {
		case 'claude':
			return {
				provider: 'claude',
				apiKey: credentials.claude.api_key || '',
				model: aiProviders.claude.model,
				timeoutMs,
			};
		case 'openai':
			return {
				provider: 'openai',
				apiKey: credentials.openai.api_key || '',
				model: aiProviders.openai.model,
				timeoutMs,
			};
		case 'ollama':
		default:
			return {
				provider: 'ollama',
				apiKey: '', // Ollama doesn't need API key
				model: aiProviders.ollama.model,
				ollamaUrl: aiProviders.ollama.url,
				timeoutMs,
			};
	}
}
