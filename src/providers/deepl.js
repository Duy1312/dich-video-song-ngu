import { TranslationProvider } from './translation-provider.js';

export class DeepLProvider extends TranslationProvider {
  constructor(apiKey) {
    super('deepl', true);
    if (!apiKey) throw new Error('API key required for DeepL');
    this._apiKey = apiKey;
    this._baseUrl = 'https://api-free.deepl.com/v2';
  }

  async translate(text, from, to) {
    if (!text || text.trim() === '') return '';
    const body = { text: [text], target_lang: to.toUpperCase() };
    if (from && from !== 'auto') body.source_lang = from.toUpperCase();
    const response = await fetch(`${this._baseUrl}/translate`, {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${this._apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const error = new Error(`DeepL error: ${response.status}`);
      error.status = response.status;
      throw error;
    }
    const data = await response.json();
    return data.translations[0].text;
  }

  async detectLanguage(text) {
    if (!text || text.trim() === '') return 'unknown';
    const body = { text: [text], target_lang: 'EN' };
    const response = await fetch(`${this._baseUrl}/translate`, {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${this._apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`DeepL detect error: ${response.status}`);
    const data = await response.json();
    return data.translations[0].detected_source_language.toLowerCase();
  }
}
