/**
 * Text Cleanup Service
 *
 * Cleans up transcribed speech-to-text using local LLM (Ollama).
 * Removes filler words, adds structure, and improves readability.
 */

import { queryLLM, type LLMSettings } from './llm-service';
import {
	buildCleanupPrompt,
	buildStructureAnnotationPrompt,
	buildFillerAnnotationPrompt,
	shouldUseHybridMode,
	parseDocumentIntoElements,
	reconstructDocument,
} from './text-cleanup-prompts';

export interface CleanupOptions {
	removeFillers: boolean;
	addStructure: boolean;
}

export interface CleanupResult {
	original: string;
	cleaned: string;
	processingTimeMs: number;
	error?: string;
	/** Which processing mode was used */
	mode?: 'annotation' | 'full-text';
	/** If content validation detected significant loss (full-text mode only) */
	contentLossWarning?: string;
}

/**
 * Formatting annotation parsed from LLM response.
 */
export interface FormatAnnotation {
	type: 'heading' | 'break';
	/** 1-based line number where to insert */
	line: number;
	/** Heading level (1-3) for heading annotations */
	level?: number;
	/** Heading text for heading annotations */
	text?: string;
}

/**
 * Filler removal annotation parsed from LLM response.
 */
export interface FillerAnnotation {
	/** 1-based line number */
	line: number;
	/** Exact text to remove (including surrounding spaces/punctuation) */
	textToRemove: string;
}

/**
 * Parse annotations from LLM response.
 * Format: HEADING:<line>:<level>:<text> or BREAK:<line>
 */
export function parseAnnotations(response: string): FormatAnnotation[] {
	const annotations: FormatAnnotation[] = [];

	// Check for no changes needed
	if (response.trim() === 'NO_CHANGES_NEEDED') {
		return annotations;
	}

	const lines = response.trim().split('\n');

	for (const line of lines) {
		const trimmed = line.trim();

		// Parse HEADING:<line>:<level>:<text>
		const headingMatch = trimmed.match(/^HEADING:(\d+):(\d+):(.+)$/);
		if (headingMatch) {
			const lineNum = parseInt(headingMatch[1], 10);
			const level = parseInt(headingMatch[2], 10);
			const text = headingMatch[3].trim();

			if (lineNum > 0 && level >= 1 && level <= 3 && text) {
				annotations.push({
					type: 'heading',
					line: lineNum,
					level,
					text,
				});
			}
			continue;
		}

		// Parse BREAK:<line>
		const breakMatch = trimmed.match(/^BREAK:(\d+)$/);
		if (breakMatch) {
			const lineNum = parseInt(breakMatch[1], 10);
			if (lineNum > 0) {
				annotations.push({
					type: 'break',
					line: lineNum,
				});
			}
		}
	}

	// Sort by line number descending so we can insert from bottom to top
	// without affecting earlier line numbers
	return annotations.sort((a, b) => b.line - a.line);
}

/**
 * Parse filler removal annotations from LLM response.
 * Format: REMOVE:<line>:"<text to remove>"
 */
export function parseFillerAnnotations(response: string): FillerAnnotation[] {
	const annotations: FillerAnnotation[] = [];

	// Check for no changes needed
	if (response.trim() === 'NO_CHANGES_NEEDED') {
		return annotations;
	}

	const lines = response.trim().split('\n');

	for (const line of lines) {
		const trimmed = line.trim();

		// Parse REMOVE:<line>:"<text>"
		// The text is in quotes and may contain special characters
		const removeMatch = trimmed.match(/^REMOVE:(\d+):"(.+)"$/);
		if (removeMatch) {
			const lineNum = parseInt(removeMatch[1], 10);
			const textToRemove = removeMatch[2];

			if (lineNum > 0 && textToRemove) {
				annotations.push({
					line: lineNum,
					textToRemove,
				});
			}
		}
	}

	// Group by line number for efficient processing
	// Within each line, sort by position (we'll find positions during application)
	return annotations;
}

/**
 * Apply filler removal annotations to the original text.
 * Removes exact quoted text from specified lines.
 * Returns the cleaned text and stats about what was removed.
 */
export function applyFillerAnnotations(
	text: string,
	annotations: FillerAnnotation[]
): { cleaned: string; removedCount: number; skippedCount: number } {
	if (annotations.length === 0) {
		return { cleaned: text, removedCount: 0, skippedCount: 0 };
	}

	const lines = text.split('\n');
	let removedCount = 0;
	let skippedCount = 0;

	// Group annotations by line
	const annotationsByLine = new Map<number, FillerAnnotation[]>();
	for (const annotation of annotations) {
		const lineAnnotations = annotationsByLine.get(annotation.line) || [];
		lineAnnotations.push(annotation);
		annotationsByLine.set(annotation.line, lineAnnotations);
	}

	// Process each line that has annotations
	for (const [lineNum, lineAnnotations] of annotationsByLine) {
		const lineIndex = lineNum - 1; // Convert to 0-based

		if (lineIndex < 0 || lineIndex >= lines.length) {
			console.warn(
				`[TextCleanup] Skipping filler annotation for invalid line ${lineNum}`
			);
			skippedCount += lineAnnotations.length;
			continue;
		}

		let line = lines[lineIndex];

		// Apply each removal for this line
		// Sort by position in reverse order so removals don't affect subsequent positions
		const sortedAnnotations = lineAnnotations
			.map((a) => ({ ...a, position: line.indexOf(a.textToRemove) }))
			.filter((a) => a.position !== -1)
			.sort((a, b) => b.position - a.position);

		// Count skipped (not found in line)
		skippedCount += lineAnnotations.length - sortedAnnotations.length;

		for (const annotation of sortedAnnotations) {
			const before = line.substring(0, annotation.position);
			const after = line.substring(
				annotation.position + annotation.textToRemove.length
			);
			line = before + after;
			removedCount++;
		}

		// Clean up any resulting double spaces
		line = line.replace(/  +/g, ' ').trim();
		lines[lineIndex] = line;
	}

	return {
		cleaned: lines.join('\n'),
		removedCount,
		skippedCount,
	};
}

/**
 * Check if a line is a markdown heading.
 */
function isHeadingLine(line: string): boolean {
	return /^#{1,6}\s+.+/.test(line.trim());
}

/**
 * Check if there's already a heading near the target line.
 * Looks at the target line and the line immediately before it.
 */
function hasNearbyHeading(lines: string[], targetIndex: number): boolean {
	// Check the target line itself
	if (targetIndex < lines.length && isHeadingLine(lines[targetIndex])) {
		return true;
	}
	// Check the line before (in case we'd be inserting right after an existing heading)
	if (targetIndex > 0 && isHeadingLine(lines[targetIndex - 1])) {
		return true;
	}
	return false;
}

/**
 * Check if there's already a blank line at or near the target position.
 */
function hasNearbyBlankLine(lines: string[], targetIndex: number): boolean {
	// Check if target line is blank
	if (targetIndex < lines.length && lines[targetIndex].trim() === '') {
		return true;
	}
	// Check if line before is blank
	if (targetIndex > 0 && lines[targetIndex - 1].trim() === '') {
		return true;
	}
	return false;
}

/**
 * Apply formatting annotations to the original text.
 * Inserts headings and breaks WITHOUT modifying any original content.
 * Skips annotations that would duplicate existing formatting.
 */
export function applyAnnotations(
	text: string,
	annotations: FormatAnnotation[]
): string {
	if (annotations.length === 0) {
		return text;
	}

	const lines = text.split('\n');

	// Annotations are sorted descending by line number, so we insert from bottom to top
	for (const annotation of annotations) {
		const insertIndex = annotation.line - 1; // Convert to 0-based

		// Skip invalid line references
		if (insertIndex < 0 || insertIndex > lines.length) {
			console.warn(
				`[TextCleanup] Skipping annotation for invalid line ${annotation.line}`
			);
			continue;
		}

		if (annotation.type === 'heading') {
			// Skip if there's already a heading at or near this position
			if (hasNearbyHeading(lines, insertIndex)) {
				continue;
			}

			const prefix = '#'.repeat(annotation.level || 2);
			const headingLine = `${prefix} ${annotation.text}`;

			// Insert heading and blank line before the target line
			lines.splice(insertIndex, 0, '', headingLine);
		} else if (annotation.type === 'break') {
			// Skip if there's already a blank line at this position
			if (hasNearbyBlankLine(lines, insertIndex)) {
				continue;
			}

			// Insert blank line before the target line
			lines.splice(insertIndex, 0, '');
		}
	}

	return lines.join('\n');
}

/**
 * Apply annotations in hybrid mode.
 * Preserves document structure while inserting breaks between sentences.
 */
export function applyAnnotationsHybrid(
	text: string,
	annotations: FormatAnnotation[]
): string {
	const elements = parseDocumentIntoElements(text);

	if (elements.length === 0) {
		return text;
	}

	// Build sets for breaks and headings
	const breakBeforeIndices = new Set<number>();
	const headingAnnotations = new Map<number, { level: number; text: string }>();

	for (const annotation of annotations) {
		const index = annotation.line - 1; // Convert to 0-based

		if (index < 0 || index >= elements.length) {
			console.warn(
				`[TextCleanup] Skipping annotation for invalid element ${annotation.line}`
			);
			continue;
		}

		// Skip annotations targeting structural elements (they should be preserved)
		const element = elements[index];
		if (element.type === 'heading' || element.type === 'horizontal-rule' || element.type === 'blank') {
			continue;
		}

		if (annotation.type === 'break') {
			breakBeforeIndices.add(index);
		} else if (annotation.type === 'heading') {
			headingAnnotations.set(index, {
				level: annotation.level || 2,
				text: annotation.text || 'Section',
			});
		}
	}

	return reconstructDocument(elements, breakBeforeIndices, headingAnnotations);
}

/**
 * Count words in text (for validation).
 */
function countWords(text: string): number {
	return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Strip markdown code fences from LLM output.
 * Some LLMs wrap their output in ```markdown ... ``` despite instructions.
 */
function stripCodeFences(text: string): string {
	const trimmed = text.trim();

	// Match ```markdown or ```md or ``` at start and ``` at end
	const fencePattern = /^```(?:markdown|md)?\s*\n?([\s\S]*?)\n?```$/;
	const match = trimmed.match(fencePattern);

	if (match) {
		return match[1].trim();
	}

	return text;
}

/**
 * Validate that content preservation is acceptable.
 * For filler removal, we allow up to 30% word loss.
 * For structure-only, we expect word count to stay the same or increase.
 */
export function validateContentPreservation(
	original: string,
	cleaned: string,
	mode: 'filler-removal' | 'structure-only'
): { valid: boolean; ratio: number; message?: string } {
	const originalWords = countWords(original);
	const cleanedWords = countWords(cleaned);

	if (originalWords === 0) {
		return { valid: true, ratio: 1 };
	}

	const ratio = cleanedWords / originalWords;

	if (mode === 'structure-only') {
		// Structure-only should only ADD content (headings), not remove any
		if (ratio < 0.95) {
			return {
				valid: false,
				ratio,
				message: `Content loss detected: ${Math.round((1 - ratio) * 100)}% of words removed. Structure mode should preserve all content.`,
			};
		}
	} else {
		// Filler removal allows up to 30% loss
		if (ratio < 0.7) {
			return {
				valid: false,
				ratio,
				message: `Excessive content loss: ${Math.round((1 - ratio) * 100)}% of words removed. This exceeds the 30% threshold for filler removal.`,
			};
		}
	}

	return { valid: true, ratio };
}

/** Word count threshold for using annotation mode (structure) */
const ANNOTATION_MODE_THRESHOLD = 500;

/**
 * Clean up transcribed text using the configured LLM.
 *
 * Uses annotation mode for both filler removal and structure formatting
 * to guarantee content preservation. The LLM outputs instructions
 * (what to remove, where to add breaks) rather than rewriting text.
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

	const wordCount = countWords(text);

	// Determine which annotation modes to use
	const useFillerAnnotationMode = options.removeFillers;
	const useStructureAnnotationMode =
		options.addStructure && wordCount >= ANNOTATION_MODE_THRESHOLD;

	// If both options selected, run them sequentially
	if (useFillerAnnotationMode && options.addStructure) {
		// First: remove fillers
		const fillerResult = await cleanupWithFillerAnnotationMode(
			text,
			llmSettings,
			startTime
		);

		if (fillerResult.error) {
			return fillerResult;
		}

		// Second: add structure (if document is long enough for annotation mode)
		if (useStructureAnnotationMode) {
			const structureResult = await cleanupWithAnnotationMode(
				fillerResult.cleaned,
				llmSettings,
				performance.now()
			);

			return {
				original: text,
				cleaned: structureResult.cleaned,
				processingTimeMs: Math.round(performance.now() - startTime),
				mode: 'annotation',
				error: structureResult.error,
			};
		} else {
			// Short document - use full-text mode for structure only
			const structureResult = await cleanupWithFullTextMode(
				fillerResult.cleaned,
				{ removeFillers: false, addStructure: true },
				llmSettings,
				performance.now()
			);

			return {
				original: text,
				cleaned: structureResult.cleaned,
				processingTimeMs: Math.round(performance.now() - startTime),
				mode: 'annotation',
				error: structureResult.error,
				contentLossWarning: structureResult.contentLossWarning,
			};
		}
	}

	// Filler removal only - use annotation mode
	if (useFillerAnnotationMode) {
		return cleanupWithFillerAnnotationMode(text, llmSettings, startTime);
	}

	// Structure only
	if (useStructureAnnotationMode) {
		return cleanupWithAnnotationMode(text, llmSettings, startTime);
	} else {
		return cleanupWithFullTextMode(text, options, llmSettings, startTime);
	}
}

/**
 * Filler removal using annotation mode.
 * LLM outputs REMOVE annotations, we apply them programmatically.
 * Guarantees only specified fillers are removed - no rewriting.
 */
async function cleanupWithFillerAnnotationMode(
	text: string,
	llmSettings: LLMSettings,
	startTime: number
): Promise<CleanupResult> {
	const prompt = buildFillerAnnotationPrompt(text);

	try {
		const result = await queryLLM(prompt, llmSettings);
		const processingTimeMs = Math.round(performance.now() - startTime);

		if (!result) {
			return {
				original: text,
				cleaned: text,
				processingTimeMs,
				mode: 'annotation',
				error: 'LLM returned empty response. Is Ollama running?',
			};
		}

		// Parse annotations from LLM response
		const annotations = parseFillerAnnotations(result);

		// Apply filler removals
		const { cleaned } = applyFillerAnnotations(
			text,
			annotations
		);

		return {
			original: text,
			cleaned,
			processingTimeMs,
			mode: 'annotation',
		};
	} catch (error) {
		const processingTimeMs = Math.round(performance.now() - startTime);
		const errorMessage =
			error instanceof Error ? error.message : 'Unknown error occurred';

		return {
			original: text,
			cleaned: text,
			processingTimeMs,
			mode: 'annotation',
			error: errorMessage,
		};
	}
}

/**
 * Structure-only cleanup using annotation mode.
 * LLM outputs formatting instructions, we apply them programmatically.
 * Guarantees 100% content preservation.
 */
async function cleanupWithAnnotationMode(
	text: string,
	llmSettings: LLMSettings,
	startTime: number
): Promise<CleanupResult> {
	const prompt = buildStructureAnnotationPrompt(text);
	const usingHybridMode = shouldUseHybridMode(text);

	try {
		const result = await queryLLM(prompt, llmSettings);
		const processingTimeMs = Math.round(performance.now() - startTime);

		if (!result) {
			return {
				original: text,
				cleaned: text,
				processingTimeMs,
				mode: 'annotation',
				error: 'LLM returned empty response. Is Ollama running?',
			};
		}

		// Parse annotations from LLM response
		const annotations = parseAnnotations(result);

		// Apply annotations using appropriate mode
		const cleaned = usingHybridMode
			? applyAnnotationsHybrid(text, annotations)
			: applyAnnotations(text, annotations);

		return {
			original: text,
			cleaned,
			processingTimeMs,
			mode: 'annotation',
		};
	} catch (error) {
		const processingTimeMs = Math.round(performance.now() - startTime);
		const errorMessage =
			error instanceof Error ? error.message : 'Unknown error occurred';

		return {
			original: text,
			cleaned: text,
			processingTimeMs,
			mode: 'annotation',
			error: errorMessage,
		};
	}
}

/**
 * Full-text cleanup mode (for filler removal or short documents).
 * LLM rewrites the entire text. Includes validation to catch content loss.
 */
async function cleanupWithFullTextMode(
	text: string,
	options: CleanupOptions,
	llmSettings: LLMSettings,
	startTime: number
): Promise<CleanupResult> {
	const prompt = buildCleanupPrompt(text, options);

	try {
		const rawResult = await queryLLM(prompt, llmSettings);
		const processingTimeMs = Math.round(performance.now() - startTime);

		if (!rawResult) {
			return {
				original: text,
				cleaned: text,
				processingTimeMs,
				mode: 'full-text',
				error: 'LLM returned empty response. Is Ollama running?',
			};
		}

		// Strip code fences if LLM wrapped output in them
		const result = stripCodeFences(rawResult);

		// Validate content preservation
		const validationMode =
			options.addStructure && !options.removeFillers
				? 'structure-only'
				: 'filler-removal';
		const validation = validateContentPreservation(
			text,
			result,
			validationMode
		);

		if (!validation.valid) {
			console.warn(
				'[TextCleanup] Content validation failed:',
				validation.message
			);

			// For structure-only, this is a hard failure
			if (validationMode === 'structure-only') {
				return {
					original: text,
					cleaned: text,
					processingTimeMs,
					mode: 'full-text',
					error: validation.message,
				};
			}

			// For filler removal, return result but with warning
			return {
				original: text,
				cleaned: result,
				processingTimeMs,
				mode: 'full-text',
				contentLossWarning: validation.message,
			};
		}

		return {
			original: text,
			cleaned: result,
			processingTimeMs,
			mode: 'full-text',
		};
	} catch (error) {
		const processingTimeMs = Math.round(performance.now() - startTime);
		const errorMessage =
			error instanceof Error ? error.message : 'Unknown error occurred';

		return {
			original: text,
			cleaned: text,
			processingTimeMs,
			mode: 'full-text',
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
