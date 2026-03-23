import { TranslationProvider } from './translation-provider.js';

export class GoogleCloudProvider extends TranslationProvider {
  constructor(apiKey) {
    super('google-cloud', true);
    if (!apiKey) throw new Error('API key required for Google Cloud');
    this._apiKey = apiKey;
    this._baseUrl = 'https://translation.googleapis.com/language/translate/v2';
  }

  async translate(text, from, to) {
    if (!text || text.trim() === '') return '';
    const body = { q: text, target: to, format: 'text' };
    if (from && from !== 'auto') body.source = from;
    const response = await fetch(`${this._baseUrl}?key=${this._apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const error = new Error(`Google Cloud error: ${response.status}`);
      error.status = response.status;
      throw error;
    }
    const data = await response.json();
    return data.data.translations[0].translatedText;
  }

  async detectLanguage(text) {
    const response = await fetch(`${this._baseUrl}/detect?key=${this._apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text }),
    });
    if (!response.ok) throw new Error(`Detection error: ${response.status}`);
    const data = await response.json();
    return data.data.detections[0][0].language;
  }
}
