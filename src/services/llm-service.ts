/**
 * LLM Service
 *
 * Core LLM communication layer for AI-powered features.
 * Supports Claude API, OpenAI API, and local Ollama.
 */

export interface LLMSettings {
	provider: 'claude' | 'openai' | 'ollama';
	apiKey: string;
	model: string;
	ollamaUrl?: string;
	timeoutMs: number;
}

/**
 * Send a prompt to the configured LLM and get a response.
 *
 * @param prompt - The prompt text to send
 * @param settings - LLM provider configuration
 * @returns The LLM response text, or null if failed/timed out
 */
export async function queryLLM(
	prompt: string,
	settings: LLMSettings
): Promise<string | null> {
	const { provider, apiKey, model, ollamaUrl, timeoutMs } = settings;

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);

	try {
		let response: Response;
		let result: string;

		switch (provider) {
			case 'claude': {
				if (!apiKey) throw new Error('Claude API key not configured');

				response = await fetch('https://api.anthropic.com/v1/messages', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'x-api-key': apiKey,
						'anthropic-version': '2023-06-01',
					},
					body: JSON.stringify({
						model,
						max_tokens: 4096,
						messages: [{ role: 'user', content: prompt }],
					}),
					signal: controller.signal,
				});

				if (!response.ok) {
					const errorText = await response.text();
					throw new Error(`Claude API error: ${response.status} - ${errorText}`);
				}

				const claudeData = await response.json();
				result = claudeData.content?.[0]?.text || '';
				break;
			}

			case 'openai': {
				if (!apiKey) throw new Error('OpenAI API key not configured');

				response = await fetch('https://api.openai.com/v1/chat/completions', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${apiKey}`,
					},
					body: JSON.stringify({
						model,
						messages: [{ role: 'user', content: prompt }],
						max_tokens: 4096,
					}),
					signal: controller.signal,
				});

				if (!response.ok) {
					const errorText = await response.text();
					throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
				}

				const openaiData = await response.json();
				result = openaiData.choices?.[0]?.message?.content || '';
				break;
			}

			case 'ollama': {
				const baseUrl = ollamaUrl || 'http://localhost:11434';

				response = await fetch(`${baseUrl}/api/generate`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						model,
						prompt,
						stream: false,
					}),
					signal: controller.signal,
				});

				if (!response.ok) {
					const errorText = await response.text();
					throw new Error(`Ollama error: ${response.status} - ${errorText}`);
				}

				const ollamaData = await response.json();
				result = ollamaData.response || '';
				break;
			}

			default:
				throw new Error(`Unknown LLM provider: ${provider}`);
		}

		return result.trim() || null;
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') {
			console.error(`[LLM] Request timed out after ${timeoutMs}ms`);
		} else {
			console.error('[LLM] Error:', error);
		}
		return null;
	} finally {
		clearTimeout(timeout);
	}
}
