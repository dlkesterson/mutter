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

IMPORTANT: Only output the cleaned text. No explanations, no commentary, no markdown formatting unless it was in the original.

Text to clean:
"""
${text}
"""`;
}

/**
 * Prompt for adding structure (paragraphs, headings) to wall-of-text transcriptions.
 */
export function buildStructurePrompt(text: string): string {
	return `You are a markdown formatter. Your ONLY job is to add formatting to improve readability. You must NOT change, remove, summarize, or rephrase ANY content.

TASK: Add structure to this text:
- Insert blank lines between paragraphs (where topics or thoughts shift)
- Add markdown headings (## or ###) where major topics change
- Convert obvious lists into bullet points if present

CRITICAL RULES:
1. Output EVERY SINGLE SENTENCE from the input - do not skip or omit anything
2. Do NOT summarize, condense, or shorten the text in any way
3. Do NOT rephrase or reword sentences - keep exact wording
4. Do NOT remove any words, sentences, or paragraphs
5. ONLY add: line breaks, headings, and bullet formatting
6. Output ONLY the formatted text - no explanations

The output must be the same length as the input (plus a few heading characters).

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
6. Add markdown headings (##) where major topics change

NOT ALLOWED:
- Do NOT remove words like "like", "you know", "basically", "actually" unless they are pure filler with no meaning
- Do NOT summarize or condense content
- Do NOT rephrase or reword sentences
- Do NOT skip any sentences or paragraphs
- Do NOT add any commentary

Output EVERY sentence from the input (minus only the filler sounds listed above).
Output ONLY the cleaned text.

Text to clean:
"""
${text}
"""`;
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
