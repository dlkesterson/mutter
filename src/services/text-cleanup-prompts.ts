/**
 * Text Cleanup Prompts
 *
 * LLM prompt templates for cleaning up transcribed speech-to-text.
 */

/**
 * Prompt for removing filler words and false starts from transcribed text.
 */
export function buildFillerRemovalPrompt(text: string): string {
	return `You are a transcription editor. Clean up the following dictated text by:
- Remove filler words: um, uh, ah, er, like, you know, basically, actually, literally, right, so, well, I mean, kind of, sort of
- Remove false starts and repeated phrases
- Remove hesitations and stammering
- Fix run-on sentences by adding appropriate punctuation
- Maintain the original meaning, voice, and all substantive content

IMPORTANT:
- Only output the cleaned text
- No explanations, no commentary
- Do NOT wrap output in \`\`\`markdown code fences - just output the raw text

Text to clean:
"""
${text}
"""`;
}

/**
 * Prompt for adding structure (paragraphs, headings) to wall-of-text transcriptions.
 */
export function buildStructurePrompt(text: string): string {
	return `You are a markdown formatter. Your ONLY job is to add paragraph breaks and occasional headings to improve readability.

TASK: Add structure to this text:
- Insert blank lines between paragraphs (where topics or thoughts shift)
- Add markdown headings (## or ###) ONLY at major section/topic changes

CRITICAL RULES:
1. PRESERVE all existing formatting exactly (bullet points, lists, headings, etc.)
2. Do NOT convert bullet points (-) into headings (##) - keep them as bullets
3. Do NOT rephrase, reword, or change ANY text - keep exact wording
4. Do NOT remove any words, sentences, or paragraphs
5. ONLY add: blank lines for paragraph breaks, and occasional headings for major sections
6. Headings should be rare - only for distinct topic changes, not for every paragraph
7. Output ONLY the formatted text - no explanations
8. Do NOT wrap output in \`\`\`markdown code fences - just output the raw text

Text to format:
"""
${text}
"""`;
}

/**
 * Prompt that combines filler removal AND structure in one pass.
 * More efficient for processing large documents.
 */
export function buildFullCleanupPrompt(text: string): string {
	return `You are a transcription editor. Clean up this dictated text while preserving all meaningful content.

ALLOWED CHANGES:
1. Remove ONLY these filler words: um, uh, ah, er, hmm
2. Remove false starts (e.g., "I was going to-- I went to the store")
3. Remove stammering/repetition (e.g., "the the the")
4. Fix punctuation and capitalization
5. Add paragraph breaks between different topics
6. Add markdown headings (##) ONLY at major section/topic changes (use sparingly)

NOT ALLOWED:
- Do NOT convert bullet points (-) into headings (##) - preserve existing formatting
- Do NOT remove words like "like", "you know", "basically", "actually" unless they are pure filler with no meaning
- Do NOT summarize or condense content
- Do NOT rephrase or reword sentences
- Do NOT skip any sentences or paragraphs
- Do NOT add any commentary
- Do NOT wrap output in \`\`\`markdown code fences - just output the raw text

Output EVERY sentence from the input (minus only the filler sounds listed above).
Output ONLY the cleaned text.

Text to clean:
"""
${text}
"""`;
}

/**
 * Split a single paragraph/line into sentences.
 */
function splitParagraphIntoSentences(text: string): string[] {
	const normalized = text.replace(/\s+/g, ' ').trim();
	if (!normalized) return [];

	// Split on sentence boundaries: .!? followed by space and capital letter
	const parts = normalized.split(/(?<=[.!?])\s+(?=[A-Z])/);
	return parts.map(p => p.trim()).filter(Boolean);
}

/**
 * A document element for hybrid processing.
 * Preserves structure while allowing sentence-level breaks in long paragraphs.
 */
export interface DocElement {
	type: 'heading' | 'horizontal-rule' | 'blank' | 'text' | 'sentence';
	content: string;
	/** Original line number (1-based) for structural elements */
	originalLine?: number;
}

/**
 * Parse document into elements, splitting long paragraphs into sentences.
 * Preserves headings, horizontal rules, and blank lines as structural elements.
 */
export function parseDocumentIntoElements(text: string): DocElement[] {
	const lines = text.split('\n');
	const elements: DocElement[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const trimmed = line.trim();
		const lineNum = i + 1;

		// Blank line
		if (!trimmed) {
			elements.push({ type: 'blank', content: '', originalLine: lineNum });
			continue;
		}

		// Heading
		if (/^#{1,6}\s+.+/.test(trimmed)) {
			elements.push({ type: 'heading', content: line, originalLine: lineNum });
			continue;
		}

		// Horizontal rule
		if (/^(-{3,}|_{3,}|\*{3,})$/.test(trimmed)) {
			elements.push({ type: 'horizontal-rule', content: line, originalLine: lineNum });
			continue;
		}

		// Text line - check if it's long enough to split into sentences
		const words = trimmed.split(/\s+/).length;
		if (words > 40) {
			// Long paragraph - split into sentences
			const sentences = splitParagraphIntoSentences(trimmed);
			for (const sentence of sentences) {
				elements.push({ type: 'sentence', content: sentence });
			}
		} else {
			// Short line - keep as-is
			elements.push({ type: 'text', content: line, originalLine: lineNum });
		}
	}

	return elements;
}

/**
 * Reconstruct document from elements, applying break annotations.
 * @param elements - The parsed document elements
 * @param breakBeforeIndices - Set of element indices that should have a paragraph break before them
 * @param headingAnnotations - Map of element index to heading annotation to insert
 */
export function reconstructDocument(
	elements: DocElement[],
	breakBeforeIndices: Set<number>,
	headingAnnotations: Map<number, { level: number; text: string }>
): string {
	const resultLines: string[] = [];
	let currentParagraphSentences: string[] = [];

	const flushParagraph = () => {
		if (currentParagraphSentences.length > 0) {
			resultLines.push(currentParagraphSentences.join(' '));
			currentParagraphSentences = [];
		}
	};

	for (let i = 0; i < elements.length; i++) {
		const element = elements[i];

		// Check if we need to insert a heading before this element
		const headingAnnotation = headingAnnotations.get(i);
		if (headingAnnotation && i > 0) {
			flushParagraph();
			resultLines.push('');
			const prefix = '#'.repeat(headingAnnotation.level);
			resultLines.push(`${prefix} ${headingAnnotation.text}`);
			resultLines.push('');
		}

		// Check if we need a break before this element
		if (breakBeforeIndices.has(i) && i > 0) {
			flushParagraph();
			// Add blank line for paragraph break (if not already blank)
			if (resultLines.length > 0 && resultLines[resultLines.length - 1] !== '') {
				resultLines.push('');
			}
		}

		switch (element.type) {
			case 'blank':
				flushParagraph();
				resultLines.push('');
				break;

			case 'heading':
			case 'horizontal-rule':
			case 'text':
				flushParagraph();
				resultLines.push(element.content);
				break;

			case 'sentence':
				currentParagraphSentences.push(element.content);
				break;
		}
	}

	flushParagraph();

	// Clean up multiple consecutive blank lines
	const cleaned = resultLines.join('\n').replace(/\n{3,}/g, '\n\n');
	return cleaned;
}

/**
 * Check if hybrid mode should be used (document has structure but also long paragraphs).
 */
export function shouldUseHybridMode(text: string): boolean {
	const hasHeadings = /^#{1,6}\s+.+/m.test(text);
	const hasHorizontalRules = /^(-{3,}|_{3,}|\*{3,})$/m.test(text);
	const hasBlankLines = /\n\s*\n/.test(text);

	// Must have some structure
	if (!hasHeadings && !hasHorizontalRules && !hasBlankLines) {
		return false;
	}

	// Check if any line is long enough to benefit from sentence splitting
	const lines = text.split('\n');
	for (const line of lines) {
		const trimmed = line.trim();
		// Skip structural elements
		if (!trimmed || /^#{1,6}\s/.test(trimmed) || /^(-{3,}|_{3,}|\*{3,})$/.test(trimmed)) {
			continue;
		}
		const words = trimmed.split(/\s+/).length;
		if (words > 40) {
			return true; // Has at least one long paragraph
		}
	}

	return false;
}

/**
 * Prompt for annotation-based structure formatting.
 * Instead of asking the LLM to rewrite the text, we ask it to output
 * ONLY formatting annotations that we apply programmatically.
 * This guarantees 100% content preservation.
 */
export function buildStructureAnnotationPrompt(text: string): string {
	// Check if hybrid mode should be used
	const useHybrid = shouldUseHybridMode(text);

	let numberedContent: string;
	let modeNote: string;

	if (useHybrid) {
		// Hybrid mode: parse into elements, preserving structure
		const elements = parseDocumentIntoElements(text);
		const numberedLines: string[] = [];

		for (let i = 0; i < elements.length; i++) {
			const el = elements[i];
			const num = i + 1;

			switch (el.type) {
				case 'blank':
					numberedLines.push(`[${num}] (blank line)`);
					break;
				case 'heading':
					numberedLines.push(`[${num}] ${el.content} (existing heading)`);
					break;
				case 'horizontal-rule':
					numberedLines.push(`[${num}] ${el.content} (horizontal rule)`);
					break;
				case 'text':
					numberedLines.push(`[${num}] ${el.content}`);
					break;
				case 'sentence':
					numberedLines.push(`[${num}] ${el.content}`);
					break;
			}
		}

		numberedContent = numberedLines.join('\n');
		modeNote = `NOTE: Long paragraphs have been split into sentences. Items marked "(existing heading)", "(horizontal rule)", or "(blank line)" are structural elements that should be preserved. Only add BREAK annotations between sentences to create paragraph breaks.`;
	} else {
		// Line-based mode
		const lines = text.split('\n');
		numberedContent = lines
			.map((line, i) => `[${i + 1}] ${line}`)
			.join('\n');
		modeNote = '';
	}

	return `You are a document structure analyzer. Analyze this text and output ONLY formatting annotations to improve readability.

DO NOT rewrite or output the text itself. Only output formatting instructions.
${modeNote ? `\n${modeNote}\n` : ''}
ANNOTATION FORMAT (one per line):
- HEADING:<number>:<level>:<text> - Insert a heading before item <number>
  - <level> is 1, 2, or 3 (for #, ##, ###)
  - <text> is the heading text (derive from content, 2-6 words)
- BREAK:<number> - Insert a paragraph break (blank line) before item <number>

PARAGRAPH BREAKS (BREAK annotations):
- Add breaks where thoughts or topics shift
- Add breaks before transitional phrases: "Anyway", "Moving on", "Another thing", "Speaking of", "By the way"
- Add breaks between distinct ideas, even within the same general topic
- Add breaks between different time references or contexts
- For dense text, add breaks every 3-5 sentences to create readable paragraphs
- Be generous with breaks - it's better to have shorter paragraphs than walls of text

HEADINGS:
- Add headings at major topic or section changes
- Prefer level 2 (##) for main sections, level 3 (###) for subsections
- Don't add a heading at item 1 unless it's clearly a document title
- Derive heading text from the content (2-6 words)

EXAMPLE OUTPUT:
HEADING:3:2:Morning Routine
BREAK:5
BREAK:8
HEADING:15:2:Project Updates
BREAK:18
BREAK:22
HEADING:30:3:Technical Details
BREAK:33

TEXT TO ANALYZE:
"""
${numberedContent}
"""

Output ONLY the annotations (or NO_CHANGES_NEEDED if already well-formatted), nothing else:`;
}

/**
 * Build the appropriate prompt based on cleanup options.
 */
export function buildCleanupPrompt(
	text: string,
	options: { removeFillers: boolean; addStructure: boolean }
): string {
	const { removeFillers, addStructure } = options;

	if (removeFillers && addStructure) {
		return buildFullCleanupPrompt(text);
	} else if (removeFillers) {
		return buildFillerRemovalPrompt(text);
	} else if (addStructure) {
		return buildStructurePrompt(text);
	}

	// If no options selected, just return the text as-is
	return text;
}
