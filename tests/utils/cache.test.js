import { TranslationCache } from '../../src/utils/cache.js';

describe('TranslationCache', () => {
  let cache;

  beforeEach(() => {
    cache = new TranslationCache();
  });

  describe('in-memory cache', () => {
    test('returns null for cache miss', () => {
      const result = cache.get('hello', 'en', 'vi');
      expect(result).toBeNull();
    });

    test('returns cached translation on hit', () => {
      cache.set('hello', 'en', 'vi', 'xin chào');
      const result = cache.get('hello', 'en', 'vi');
      expect(result).toBe('xin chào');
    });

    test('different language pairs are separate cache entries', () => {
      cache.set('hello', 'en', 'vi', 'xin chào');
      cache.set('hello', 'en', 'fr', 'bonjour');
      expect(cache.get('hello', 'en', 'vi')).toBe('xin chào');
      expect(cache.get('hello', 'en', 'fr')).toBe('bonjour');
    });

    test('generates consistent cache keys', () => {
      cache.set('hello', 'en', 'vi', 'xin chào');
      expect(cache.get('hello', 'en', 'vi')).toBe('xin chào');
    });

    test('clear removes all entries', () => {
      cache.set('hello', 'en', 'vi', 'xin chào');
      cache.set('world', 'en', 'vi', 'thế giới');
      cache.clear();
      expect(cache.get('hello', 'en', 'vi')).toBeNull();
      expect(cache.get('world', 'en', 'vi')).toBeNull();
    });
  });
});
