import Logger from '@joplin/utils/Logger';

type Provider = 'anthropic' | 'openai' | 'huggingface';

const logger = Logger.create('AgentSearchEngine');

interface AnthropicTextContent {
	type: 'text';
	text: string;
}

interface AnthropicResponse {
	content?: (AnthropicTextContent | { type: string })[];
}

interface OpenAiMessage {
	content?: string | { type?: string; text?: string }[];
}

interface OpenAiChoice {
	message?: OpenAiMessage;
}

interface OpenAiResponse {
	choices?: OpenAiChoice[];
}

const systemPrompt = `You are a search query translator for Joplin notes app.
Convert the user's natural language description into a 
valid Joplin search query string.

Joplin search syntax rules:
- Plain keywords: just type the words
- Title only: title:word
- Tag filter: tag:tagname
- Notebook: notebook:name  
- Date created: created:day-7 (last N days)
- Date updated: updated:day-30
- Todos only: type:todo
- Combine terms with spaces (implicit AND)
- Use OR between alternatives

Respond with ONLY the Joplin query string. 
No explanation. No quotes. Just the query.

Examples:
Input: note about a meeting with a German company in 2020
Output: meeting germany created:day-2000

Input: todo list for the website redesign project
Output: type:todo website redesign

Input: poetry about the moon
Output: moon poetry`;

export default class AgentSearchEngine {

	private readonly apiKey_: string;
	private readonly provider_: Provider;

	public constructor(apiKey: string, provider: Provider = 'anthropic') {
		this.apiKey_ = apiKey;
		this.provider_ = provider;
	}

	public async search(naturalQuery: string): Promise<string> {
		logger.info(`[AgentSearch] Natural query: ${naturalQuery}`);

		try {
			let translated = '';

			if (this.provider_ === 'openai') {
				translated = await this.searchWithOpenAi_(naturalQuery);
			} else if (this.provider_ === 'huggingface') {
				translated = await this.searchWithHuggingFace_(naturalQuery);
			} else {
				translated = await this.searchWithAnthropic_(naturalQuery);
			}

			const finalQuery = translated.trim() ? translated.trim() : naturalQuery;
			logger.info(`[AgentSearch] Translated query: ${finalQuery}`);
			return finalQuery;
		} catch (error) {
			const message = this.errorToMessage_(error);
			logger.warn(`[AgentSearch] Translation failed, using original query: ${message}`);
			logger.info(`[AgentSearch] Translated query: ${naturalQuery}`);
			return naturalQuery;
		}
	}

	private async searchWithAnthropic_(naturalQuery: string): Promise<string> {
		const response = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'anthropic-version': '2023-06-01',
				'x-api-key': this.apiKey_,
			},
			body: JSON.stringify({
				model: 'claude-haiku-4-5-20251001',
				max_tokens: 100,
				system: systemPrompt,
				messages: [
					{
						role: 'user',
						content: naturalQuery,
					},
				],
			}),
		});

		if (!response.ok) {
			throw new Error(`Anthropic request failed with status ${response.status}`);
		}

		const json = await response.json() as AnthropicResponse;
		const content = json.content || [];

		for (const item of content) {
			if (item.type === 'text' && 'text' in item && typeof item.text === 'string') {
				return item.text.trim();
			}
		}

		return '';
	}

	private async searchWithOpenAi_(naturalQuery: string): Promise<string> {
		const response = await fetch('https://api.openai.com/v1/chat/completions', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				Authorization: `Bearer ${this.apiKey_}`,
			},
			body: JSON.stringify({
				model: 'gpt-4o-mini',
				max_tokens: 100,
				messages: [
					{
						role: 'system',
						content: systemPrompt,
					},
					{
						role: 'user',
						content: naturalQuery,
					},
				],
			}),
		});

		if (!response.ok) {
			throw new Error(`OpenAI request failed with status ${response.status}`);
		}

		const json = await response.json() as OpenAiResponse;
		const content = json.choices?.[0]?.message?.content;
		if (typeof content === 'string') return content.trim();

		if (Array.isArray(content)) {
			const textPart = content.find(part => typeof part.text === 'string' && !!part.text.trim());
			return textPart?.text?.trim() || '';
		}

		return '';
	}

	private async searchWithHuggingFace_(naturalQuery: string): Promise<string> {
		const response = await fetch('https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.apiKey_}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				model: 'mistralai/Mistral-7B-Instruct-v0.3',
				max_tokens: 100,
				messages: [
					{
						role: 'system',
						content: systemPrompt,
					},
					{
						role: 'user',
						content: naturalQuery,
					},
				],
			}),
		});

		if (!response.ok) {
			throw new Error(`Hugging Face request failed with status ${response.status}`);
		}

		const data = await response.json() as OpenAiResponse;
		const content = data.choices?.[0]?.message?.content;
		if (typeof content === 'string') return content.trim();

		if (Array.isArray(content)) {
			const textPart = content.find(part => typeof part.text === 'string' && !!part.text.trim());
			return textPart?.text?.trim() || '';
		}

		return '';
	}

	private errorToMessage_(error: unknown): string {
		if (error instanceof Error) return error.message;
		if (typeof error === 'string') return error;
		return 'Unknown error';
	}
}
