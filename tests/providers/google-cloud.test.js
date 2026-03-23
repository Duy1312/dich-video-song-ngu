import { GoogleCloudProvider } from '../../src/providers/google-cloud.js';

global.fetch = jest.fn();

describe('GoogleCloudProvider', () => {
  let provider;

  beforeEach(() => {
    provider = new GoogleCloudProvider('test-api-key');
    fetch.mockClear();
  });

  test('requires API key', () => {
    expect(provider.name).toBe('google-cloud');
    expect(provider.requiresApiKey).toBe(true);
  });

  test('translate calls Google Cloud API with key in URL', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        data: { translations: [{ translatedText: 'Xin chào' }] },
      }),
    });
    const result = await provider.translate('Hello', 'en', 'vi');
    expect(result).toBe('Xin chào');
    expect(fetch.mock.calls[0][0]).toContain('key=test-api-key');
  });

  test('throws without API key', () => {
    expect(() => new GoogleCloudProvider('')).toThrow('API key required');
  });

  test('translate handles empty text', async () => {
    const result = await provider.translate('', 'en', 'vi');
    expect(result).toBe('');
    expect(fetch).not.toHaveBeenCalled();
  });
});
