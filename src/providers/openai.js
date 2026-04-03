import { TranslationProvider } from './translation-provider.js';

export class OpenAIProvider extends TranslationProvider {
  constructor(apiKey) {
    super('openai', true);
    if (!apiKey) throw new Error('API key required for OpenAI');
    this._apiKey = apiKey;
    this._baseUrl = 'https://api.openai.com/v1/chat/completions';
  }

  async translate(text, from, to) {
    if (!text || text.trim() === '') return '';
    const response = await fetch(this._baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this._apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a subtitle translator. Translate the following text from ${from || 'the detected language'} to ${to}. Return ONLY the translation, no explanations.`,
          },
          { role: 'user', content: text },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });
    if (!response.ok) {
      const error = new Error(`OpenAI error: ${response.status}`);
      error.status = response.status;
      throw error;
    }
    const data = await response.json();
    return data.choices[0].message.content.trim();
  }

  async detectLanguage(text) {
    const response = await fetch(this._baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this._apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Detect the language of the given text. Return ONLY the ISO 639-1 language code (e.g., "en", "vi", "ja").',
          },
          { role: 'user', content: text },
        ],
        temperature: 0,
        max_tokens: 10,
      }),
    });
    if (!response.ok) throw new Error(`OpenAI error: ${response.status}`);
    const data = await response.json();
    return data.choices[0].message.content.trim().toLowerCase();
  }
}
