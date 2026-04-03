import { GoogleFreeProvider } from '../../src/providers/google-free.js';

global.fetch = jest.fn();

describe('GoogleFreeProvider', () => {
  let provider;

  beforeEach(() => {
    provider = new GoogleFreeProvider();
    fetch.mockClear();
  });

  test('has correct name and does not require API key', () => {
    expect(provider.name).toBe('google-free');
    expect(provider.requiresApiKey).toBe(false);
  });

  test('translate returns translated text', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([[['Xin chào', 'Hello', null, null, null, null, null, []]]])
    });

    const result = await provider.translate('Hello', 'en', 'vi');
    expect(result).toBe('Xin chào');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toContain('translate.googleapis.com');
  });

  test('translate throws on API error', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 429 });
    await expect(provider.translate('Hello', 'en', 'vi')).rejects.toThrow();
  });

  test('detectLanguage returns detected language code', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([[['Xin chào', 'Hello']], null, 'en'])
    });

    const lang = await provider.detectLanguage('Hello');
    expect(lang).toBe('en');
  });

  test('translate handles empty text', async () => {
    const result = await provider.translate('', 'en', 'vi');
    expect(result).toBe('');
    expect(fetch).not.toHaveBeenCalled();
  });
});
