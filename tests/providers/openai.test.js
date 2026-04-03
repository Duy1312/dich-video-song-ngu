import { OpenAIProvider } from '../../src/providers/openai.js';

global.fetch = jest.fn();

describe('OpenAIProvider', () => {
  let provider;

  beforeEach(() => {
    provider = new OpenAIProvider('test-api-key');
    fetch.mockClear();
  });

  test('requires API key', () => {
    expect(provider.name).toBe('openai');
    expect(provider.requiresApiKey).toBe(true);
  });

  test('translate calls OpenAI API with correct auth', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'Xin chào' } }],
      }),
    });
    const result = await provider.translate('Hello', 'en', 'vi');
    expect(result).toBe('Xin chào');
    expect(fetch.mock.calls[0][1].headers['Authorization']).toBe('Bearer test-api-key');
  });

  test('throws without API key', () => {
    expect(() => new OpenAIProvider('')).toThrow('API key required');
  });

  test('translate handles empty text', async () => {
    const result = await provider.translate('', 'en', 'vi');
    expect(result).toBe('');
    expect(fetch).not.toHaveBeenCalled();
  });
});
