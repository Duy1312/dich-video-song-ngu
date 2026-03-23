import { DeepLProvider } from '../../src/providers/deepl.js';

global.fetch = jest.fn();

describe('DeepLProvider', () => {
  let provider;

  beforeEach(() => {
    provider = new DeepLProvider('test-api-key');
    fetch.mockClear();
  });

  test('requires API key', () => {
    expect(provider.name).toBe('deepl');
    expect(provider.requiresApiKey).toBe(true);
  });

  test('translate calls DeepL API with correct headers', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        translations: [{ text: 'Xin chào', detected_source_language: 'EN' }],
      }),
    });
    const result = await provider.translate('Hello', 'en', 'vi');
    expect(result).toBe('Xin chào');
    expect(fetch.mock.calls[0][1].headers['Authorization']).toBe('DeepL-Auth-Key test-api-key');
  });

  test('throws without API key', () => {
    expect(() => new DeepLProvider('')).toThrow('API key required');
  });
});
