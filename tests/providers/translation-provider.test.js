import { TranslationProvider } from '../../src/providers/translation-provider.js';

describe('TranslationProvider', () => {
  test('cannot instantiate base class directly', () => {
    const provider = new TranslationProvider('test', false);
    expect(provider.name).toBe('test');
    expect(provider.requiresApiKey).toBe(false);
  });

  test('translate throws if not implemented', async () => {
    const provider = new TranslationProvider('test', false);
    await expect(provider.translate('hello', 'en', 'vi')).rejects.toThrow('Not implemented');
  });

  test('detectLanguage throws if not implemented', async () => {
    const provider = new TranslationProvider('test', false);
    await expect(provider.detectLanguage('hello')).rejects.toThrow('Not implemented');
  });
});
