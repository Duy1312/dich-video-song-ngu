import { TranslationProvider } from './translation-provider.js';

export class GoogleFreeProvider extends TranslationProvider {
  constructor() {
    super('google-free', false);
    this._baseUrl = 'https://translate.googleapis.com/translate_a/single';
  }

  async translate(text, from, to) {
    if (!text || text.trim() === '') return '';
    const params = new URLSearchParams({
      client: 'gtx',
      sl: from || 'auto',
      tl: to,
      dt: 't',
      q: text,
    });
    const response = await fetch(`${this._baseUrl}?${params}`);
    if (!response.ok) {
      const error = new Error(`Google Translate error: ${response.status}`);
      error.status = response.status;
      throw error;
    }
    const data = await response.json();
    const translated = data[0].map(segment => segment[0]).join('');
    return translated;
  }

  async detectLanguage(text) {
    if (!text || text.trim() === '') return 'unknown';
    const params = new URLSearchParams({
      client: 'gtx',
      sl: 'auto',
      tl: 'en',
      dt: 't',
      q: text,
    });
    const response = await fetch(`${this._baseUrl}?${params}`);
    if (!response.ok) throw new Error(`Language detection error: ${response.status}`);
    const data = await response.json();
    return data[2] || 'unknown';
  }
}
