// LLM Formatter Service for Stream Mode
// Formats voice transcriptions using Claude, OpenAI, or Ollama

export interface FormattingContext {
	rawTranscription: string;
	cursorPosition: number;
	surroundingText: {
		before: string;
		after: string;
	};
	documentStats: {
		hasHeaders: boolean;
		hasBullets: boolean;
	};
	settings: {
		removeFillers: boolean;
		addStructure: boolean;
		matchStyle: boolean;
	};
}

export interface LLMSettings {
	provider: 'claude' | 'openai' | 'ollama';
	apiKey: string;
	model: string;
	ollamaUrl?: string;
	timeoutMs: number;
}

const SYSTEM_PROMPT = `You are a transcription formatter. Your job is to clean up voice-to-text output into well-formatted markdown.

Rules:
1. Remove filler words (um, uh, like, you know, so, basically, actually) ONLY if explicitly enabled
2. Add markdown structure (headers #, bullets -, numbered lists) if the content suggests organization AND enabled
3. Match the document's existing style (formal/casual, technical/conversational) if enabled
4. Preserve meaning exactly - never add or change ideas, only improve clarity and formatting
5. Return ONLY the formatted markdown text, no explanations or meta-commentary
6. If the transcription is a command or query (e.g., "delete this line", "what's the weather"), return it unchanged
7. ONLY add headers (#) for explicit section titles like "title: X" or "section: Y" - NOT for regular sentences
8. When transcription contains both conversational text and a list, keep the conversational part as plain text

List Recognition Patterns (when structure is enabled):
- "number one X number two Y number three Z" → numbered list
- "one X two Y three Z four W" → numbered list
- "first X second Y third Z" → numbered list
- "item one X item two Y" → numbered list
- "X comma Y comma Z" → bullet list (if 3+ items)
- "I need to X and Y and Z" → bullet list (if 3+ items)

Examples:
Input: "one truck two van three semi four sedan"
Output:
1. truck
2. van
3. semi
4. sedan

Input: "I need to buy milk, eggs, bread, and cheese"
Output:
- milk
- eggs
- bread
- cheese

Input: "Okay so here's my list. One apple two banana three orange"
Output:
Okay so here's my list.

1. apple
2. banana
3. orange

Context awareness:
- If cursor is in a bullet list → continue the list format
- If cursor is after a header → format as paragraph under that section
- If surrounding text is technical → maintain technical tone
- If surrounding text is casual → maintain casual tone
- If document has no structure → keep formatting minimal unless structure is explicitly requested`;

function buildPrompt(context: FormattingContext): string {
	const { rawTranscription, surroundingText, documentStats, settings } = context;

	return `Raw transcription to format:
"${rawTranscription}"

Document context (500 chars before cursor):
\`\`\`
${surroundingText.before}
\`\`\`

Document context (500 chars after cursor):
\`\`\`
${surroundingText.after}
\`\`\`

Document structure analysis:
- Has markdown headers: ${documentStats.hasHeaders}
- Has bullet lists: ${documentStats.hasBullets}

Formatting instructions:
- Remove filler words: ${settings.removeFillers ? 'YES' : 'NO'}
- Add intelligent structure (headers, bullets): ${settings.addStructure ? 'YES' : 'NO'}
- Match document style: ${settings.matchStyle ? 'YES' : 'NO'}

Please format the transcription according to these instructions and context. Return ONLY the formatted text.`;
}

/**
 * Format transcription using Claude API (Anthropic)
 */
async function formatWithClaude(
	context: FormattingContext,
	apiKey: string,
	model: string,
	timeoutMs: number
): Promise<string | null> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: {
				'x-api-key': apiKey,
				'anthropic-version': '2023-06-01',
				'content-type': 'application/json',
			},
			body: JSON.stringify({
				model,
				max_tokens: 1024,
				temperature: 0.3,
				messages: [
					{
						role: 'user',
						content: buildPrompt(context),
					},
				],
				system: SYSTEM_PROMPT,
			}),
			signal: controller.signal,
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error(`Claude API error (${response.status}):`, errorText);
			return null;
		}

		const data = await response.json();
		const formattedText = data.content[0]?.text;

		if (!formattedText || typeof formattedText !== 'string') {
			console.error('Invalid response format from Claude API:', data);
			return null;
		}

		return formattedText.trim();
	} catch (error: any) {
		if (error.name === 'AbortError') {
			console.error('Claude API request timed out after', timeoutMs, 'ms');
		} else {
			console.error('Claude formatting failed:', error);
		}
		return null;
	} finally {
		clearTimeout(timeoutId);
	}
}

/**
 * Format transcription using OpenAI API
 */
async function formatWithOpenAI(
	context: FormattingContext,
	apiKey: string,
	model: string,
	timeoutMs: number
): Promise<string | null> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetch('https://api.openai.com/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				model,
				messages: [
					{ role: 'system', content: SYSTEM_PROMPT },
					{ role: 'user', content: buildPrompt(context) },
				],
				max_tokens: 1024,
				temperature: 0.3,
			}),
			signal: controller.signal,
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error(`OpenAI API error (${response.status}):`, errorText);
			return null;
		}

		const data = await response.json();
		const formattedText = data.choices[0]?.message?.content;

		if (!formattedText || typeof formattedText !== 'string') {
			console.error('Invalid response format from OpenAI API:', data);
			return null;
		}

		return formattedText.trim();
	} catch (error: any) {
		if (error.name === 'AbortError') {
			console.error('OpenAI API request timed out after', timeoutMs, 'ms');
		} else {
			console.error('OpenAI formatting failed:', error);
		}
		return null;
	} finally {
		clearTimeout(timeoutId);
	}
}

/**
 * Format transcription using local Ollama instance
 */
async function formatWithOllama(
	context: FormattingContext,
	ollamaUrl: string,
	model: string,
	timeoutMs: number
): Promise<string | null> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetch(`${ollamaUrl}/api/generate`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				model,
				prompt: `${SYSTEM_PROMPT}\n\n${buildPrompt(context)}`,
				stream: false,
				options: {
					temperature: 0.1, // Lower for more consistent formatting
					num_predict: 1024,
					top_p: 0.9, // Nucleus sampling for better quality
					repeat_penalty: 1.1, // Prevent repetitive output
					stop: ['\n\n\n', 'Input:', 'Example:', 'Note:'], // Stop on unwanted patterns
				},
			}),
			signal: controller.signal,
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error(`Ollama API error (${response.status}):`, errorText);
			return null;
		}

		const data = await response.json();
		const formattedText = data.response;

		if (!formattedText || typeof formattedText !== 'string') {
			console.error('Invalid response format from Ollama:', data);
			return null;
		}

		return formattedText.trim();
	} catch (error: any) {
		if (error.name === 'AbortError') {
			console.error('Ollama request timed out after', timeoutMs, 'ms');
		} else {
			console.error('Ollama formatting failed:', error);
		}
		return null;
	} finally {
		clearTimeout(timeoutId);
	}
}

/**
 * Main entry point: Format transcription using configured LLM provider
 * Returns formatted text on success, null on error (triggers fallback to raw text)
 */
export async function formatWithLLM(
	context: FormattingContext,
	settings: LLMSettings
): Promise<string | null> {
	try {
		console.log(`Formatting with ${settings.provider} (model: ${settings.model})`);

		switch (settings.provider) {
			case 'claude':
				return await formatWithClaude(
					context,
					settings.apiKey,
					settings.model,
					settings.timeoutMs
				);

			case 'openai':
				return await formatWithOpenAI(
					context,
					settings.apiKey,
					settings.model,
					settings.timeoutMs
				);

			case 'ollama':
				if (!settings.ollamaUrl) {
					console.error('Ollama URL not configured');
					return null;
				}
				return await formatWithOllama(
					context,
					settings.ollamaUrl,
					settings.model,
					settings.timeoutMs
				);

			default:
				console.error(`Unknown LLM provider: ${settings.provider}`);
				return null;
		}
	} catch (error) {
		console.error('LLM formatting failed:', error);
		return null;
	}
}
