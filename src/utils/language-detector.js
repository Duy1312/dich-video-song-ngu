export class LanguageDetector {
  constructor() {
    this._cache = new Map();
  }

  async detect(text, provider, videoId = null) {
    if (videoId && this._cache.has(videoId)) {
      return this._cache.get(videoId);
    }
    const lang = await provider.detectLanguage(text);
    if (videoId) {
      this._cache.set(videoId, lang);
    }
    return lang;
  }

  getCached(videoId) {
    return this._cache.get(videoId) || null;
  }

  clear() {
    this._cache.clear();
  }
}
