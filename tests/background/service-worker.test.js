// Mock chrome API
global.chrome = {
  runtime: {
    onMessage: { addListener: jest.fn() },
    onInstalled: { addListener: jest.fn() },
  },
  storage: {
    local: {
      get: jest.fn((keys, cb) => cb({})),
      set: jest.fn((data, cb) => cb && cb()),
    },
    sync: {
      get: jest.fn((keys, cb) => cb({ settings: { targetLang: 'vi', translationProvider: 'google-free' } })),
    },
  },
};

import { handleTranslateMessage, getProvider, clearCache } from '../../src/background/service-worker.js';

global.fetch = jest.fn();

describe('Background Service Worker', () => {
  beforeEach(() => {
    fetch.mockClear();
    clearCache();
  });

  test('getProvider returns GoogleFreeProvider by default', () => {
    const provider = getProvider('google-free');
    expect(provider.name).toBe('google-free');
    expect(provider.requiresApiKey).toBe(false);
  });

  test('getProvider throws for BYOK provider without API key', () => {
    expect(() => getProvider('deepl')).toThrow();
  });

  test('handleTranslateMessage translates text and returns result', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([[['Xin chào', 'Hello']]])
    });

    const result = await handleTranslateMessage({
      type: 'translate',
      text: 'Hello',
      sourceLang: 'en',
      targetLang: 'vi',
    });

    expect(result.success).toBe(true);
    expect(result.translation).toBe('Xin chào');
  });

  test('handleTranslateMessage returns error on failure', async () => {
    jest.useFakeTimers();
    fetch.mockRejectedValue(new Error('Network error'));

    const resultPromise = handleTranslateMessage({
      type: 'translate',
      text: 'Hello',
      sourceLang: 'en',
      targetLang: 'vi',
    });

    // Advance timers to skip all retry delays
    await jest.runAllTimersAsync();
    const result = await resultPromise;

    jest.useRealTimers();

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
