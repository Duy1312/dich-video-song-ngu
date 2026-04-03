import { detectPlatform, defaultReadCaptions, PLATFORMS } from '../../src/content/platform-registry.js';

describe('Platform Registry', () => {
  describe('detectPlatform()', () => {
    test('detects YouTube', () => {
      expect(detectPlatform('https://www.youtube.com/watch?v=abc')).toMatchObject({ name: 'youtube' });
      expect(detectPlatform('https://youtube.com/watch?v=abc')).toMatchObject({ name: 'youtube' });
    });

    test('detects Netflix', () => {
      expect(detectPlatform('https://www.netflix.com/watch/123')).toMatchObject({ name: 'netflix' });
    });

    test('detects Vimeo', () => {
      expect(detectPlatform('https://vimeo.com/123456')).toMatchObject({ name: 'vimeo' });
    });

    test('detects Facebook', () => {
      expect(detectPlatform('https://www.facebook.com/watch?v=123')).toMatchObject({ name: 'facebook' });
      expect(detectPlatform('https://fb.watch/abc')).toMatchObject({ name: 'facebook' });
    });

    test('detects Udemy', () => {
      expect(detectPlatform('https://www.udemy.com/course/abc/learn')).toMatchObject({ name: 'udemy' });
    });

    test('detects Coursera', () => {
      expect(detectPlatform('https://www.coursera.org/learn/abc')).toMatchObject({ name: 'coursera' });
    });

    test('detects edX', () => {
      expect(detectPlatform('https://courses.edx.org/course/abc')).toMatchObject({ name: 'edx' });
    });

    test('detects Khan Academy', () => {
      expect(detectPlatform('https://www.khanacademy.org/math/abc')).toMatchObject({ name: 'khan-academy' });
    });

    test('detects TikTok', () => {
      expect(detectPlatform('https://www.tiktok.com/@user/video/123')).toMatchObject({ name: 'tiktok' });
    });

    test('detects Twitter/X', () => {
      expect(detectPlatform('https://twitter.com/user/status/123')).toMatchObject({ name: 'twitter' });
      expect(detectPlatform('https://x.com/user/status/123')).toMatchObject({ name: 'twitter' });
    });

    test('detects Dailymotion', () => {
      expect(detectPlatform('https://www.dailymotion.com/video/abc')).toMatchObject({ name: 'dailymotion' });
    });

    test('detects Bilibili', () => {
      expect(detectPlatform('https://www.bilibili.com/video/BV123')).toMatchObject({ name: 'bilibili' });
    });

    test('returns null for unknown sites', () => {
      expect(detectPlatform('https://example.com')).toBeNull();
      expect(detectPlatform('https://random-site.org/video')).toBeNull();
    });

    test('returns null for invalid URL', () => {
      expect(detectPlatform('not-a-url')).toBeNull();
    });
  });

  describe('PLATFORMS config integrity', () => {
    test('every platform has required fields', () => {
      for (const p of PLATFORMS) {
        expect(p.name).toBeTruthy();
        expect(p.hostPattern).toBeInstanceOf(RegExp);
        expect(p.videoSelector).toBeTruthy();
        expect(p.captionContainer).toBeTruthy();
        expect(p.captionSelector).toBeTruthy();
        expect(typeof p.hideCaptionCSS).toBe('string');
        expect(Array.isArray(p.uiFilterPatterns)).toBe(true);
      }
    });

    test('YouTube has custom readCaptions function', () => {
      const yt = PLATFORMS.find(p => p.name === 'youtube');
      expect(typeof yt.readCaptions).toBe('function');
    });
  });

  describe('defaultReadCaptions()', () => {
    test('reads text from matching selectors', () => {
      document.body.innerHTML = `
        <div id="container">
          <span class="caption">Hello</span>
          <span class="caption">World</span>
        </div>
      `;
      const container = document.getElementById('container');
      expect(defaultReadCaptions(container, '.caption')).toBe('Hello World');
    });

    test('falls back to container textContent when no selectors match', () => {
      document.body.innerHTML = `<div id="container">Fallback text</div>`;
      const container = document.getElementById('container');
      expect(defaultReadCaptions(container, '.nonexistent')).toBe('Fallback text');
    });

    test('filters out UI text using patterns', () => {
      document.body.innerHTML = `
        <div id="container">
          <span class="caption">Hello World</span>
          <span class="caption">auto-generated</span>
        </div>
      `;
      const container = document.getElementById('container');
      const filters = [/auto-generated/i];
      expect(defaultReadCaptions(container, '.caption', filters)).toBe('Hello World');
    });

    test('returns empty string for empty container', () => {
      document.body.innerHTML = `<div id="container"></div>`;
      const container = document.getElementById('container');
      expect(defaultReadCaptions(container, '.caption')).toBe('');
    });
  });
});
