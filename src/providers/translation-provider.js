export class TranslationProvider {
  constructor(name, requiresApiKey) {
    this.name = name;
    this.requiresApiKey = requiresApiKey;
  }

  async translate(text, from, to) {
    throw new Error('Not implemented');
  }

  async detectLanguage(text) {
    throw new Error('Not implemented');
  }
}
