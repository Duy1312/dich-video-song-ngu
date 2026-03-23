# Dịch Video Song Ngữ — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a cross-browser extension that translates video subtitles/audio into any target language and displays bilingual subtitles (original + translation) via overlay and side panel.

**Architecture:** Monolith Content Script approach — content script handles video detection, subtitle extraction, and UI rendering per tab; background service worker handles translation API calls, caching, and rate limiting; popup provides settings UI. Communication via `chrome.runtime.sendMessage` and `chrome.storage`.

**Tech Stack:** JavaScript (ES modules), Webpack 5, Jest, webextension-polyfill, Chrome Manifest V3

**Spec:** `docs/superpowers/specs/2026-03-23-dich-video-song-ngu-design.md`

---

## File Map

| File | Responsibility |
|------|----------------|
| `package.json` | Dependencies, build scripts |
| `webpack.config.js` | Multi-browser bundle config (chrome/firefox/edge) |
| `manifest.json` | Chrome/Edge MV3 manifest |
| `src/utils/constants.js` | Supported languages, default settings, provider names |
| `src/utils/cache.js` | Two-level cache: in-memory Map + IndexedDB with 7-day expiry |
| `src/utils/rate-limiter.js` | Request queue, batch grouping, adaptive delay on 429 |
| `src/utils/language-detector.js` | Auto-detect source language via provider, cache per video |
| `src/providers/translation-provider.js` | Base class/interface for all providers |
| `src/providers/google-free.js` | Google Translate free API wrapper |
| `src/providers/deepl.js` | DeepL API wrapper (BYOK) |
| `src/providers/openai.js` | OpenAI GPT translation wrapper (BYOK) |
| `src/providers/google-cloud.js` | Google Cloud Translation wrapper (BYOK) |
| `src/background/service-worker.js` | Message handler, translation orchestration, storage |
| `src/content/video-detector.js` | Find `<video>` elements via MutationObserver |
| `src/content/subtitle-extractor.js` | Extract subs from TextTrack, YouTube, Vimeo, DOM |
| `src/content/speech-recognizer.js` | Web Speech API + Whisper BYOK fallback |
| `src/content/overlay-ui.js` | Overlay bilingual subtitle on video |
| `src/content/side-panel-ui.js` | Side panel transcript with auto-scroll |
| `src/content/control-button.js` | Floating button + hover quick menu |
| `src/content/index.js` | Content script entry: wire all modules together |
| `src/popup/popup.html` | Settings page HTML |
| `src/popup/popup.js` | Settings logic: language, API keys, display mode |
| `src/popup/popup.css` | Popup styles |
| `src/styles/overlay.css` | Overlay subtitle styles |
| `src/styles/side-panel.css` | Side panel styles |
| `src/styles/control-button.css` | Floating button styles |
| `icons/icon-16.png`, `icon-48.png`, `icon-128.png` | Extension icons |
| `_locales/vi/messages.json`, `_locales/en/messages.json` | i18n strings |
| `tests/utils/cache.test.js` | Cache unit tests |
| `tests/utils/rate-limiter.test.js` | Rate limiter unit tests |
| `tests/providers/google-free.test.js` | Google free provider tests |
| `tests/providers/translation-provider.test.js` | Provider interface tests |
| `tests/content/video-detector.test.js` | Video detection tests |
| `tests/content/subtitle-extractor.test.js` | Subtitle extraction tests |
| `tests/content/overlay-ui.test.js` | Overlay rendering tests |
| `tests/background/service-worker.test.js` | Background SW message handling tests |

---

## Task 1: Project Scaffolding & Build System

**Files:**
- Create: `package.json`
- Create: `webpack.config.js`
- Create: `manifest.json`
- Create: `src/utils/constants.js`
- Create: `.gitignore` (update existing)

- [ ] **Step 1: Initialize npm project and install dependencies**

```bash
cd D:/work/personal/dich_moi_nen_tang
npm init -y
npm install --save-dev webpack webpack-cli webpack-merge copy-webpack-plugin mini-css-extract-plugin css-loader jest jest-environment-jsdom @babel/core @babel/preset-env babel-loader babel-jest
npm install --save webextension-polyfill
```

- [ ] **Step 2: Create webpack.config.js with multi-browser targets**

Create `webpack.config.js`:

```javascript
const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

const commonConfig = {
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: { loader: 'babel-loader', options: { presets: ['@babel/preset-env'] } },
      },
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader'],
      },
    ],
  },
  plugins: [
    new MiniCssExtractPlugin({ filename: '[name].css' }),
  ],
};

const chromeConfig = {
  ...commonConfig,
  name: 'chrome',
  entry: {
    'background/service-worker': './src/background/service-worker.js',
    'content/index': './src/content/index.js',
    'popup/popup': './src/popup/popup.js',
  },
  output: {
    path: path.resolve(__dirname, 'dist/chrome'),
    filename: '[name].js',
    clean: true,
  },
  plugins: [
    ...commonConfig.plugins,
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'src/popup/popup.html', to: 'popup/popup.html' },
        { from: 'icons', to: 'icons' },
        { from: '_locales', to: '_locales' },
      ],
    }),
  ],
};

module.exports = [chromeConfig];
```

- [ ] **Step 3: Create manifest.json for Chrome/Edge MV3**

Create `manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "__MSG_extName__",
  "version": "1.0.0",
  "description": "__MSG_extDescription__",
  "default_locale": "vi",
  "permissions": ["storage", "activeTab"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "background/service-worker.js"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content/index.js"],
      "css": ["content/index.css"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
}
```

- [ ] **Step 4: Create constants.js with supported languages and defaults**

Create `src/utils/constants.js`:

```javascript
export const SUPPORTED_LANGUAGES = [
  { code: 'vi', name: 'Tiếng Việt' },
  { code: 'en', name: 'English' },
  { code: 'zh', name: '中文' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'es', name: 'Español' },
  { code: 'pt', name: 'Português' },
  { code: 'ru', name: 'Русский' },
  { code: 'th', name: 'ไทย' },
  { code: 'id', name: 'Bahasa Indonesia' },
];

export const DEFAULT_SETTINGS = {
  enabled: true,
  targetLang: 'vi',
  displayMode: 'both', // 'overlay' | 'panel' | 'both'
  translationProvider: 'google-free',
  sttProvider: 'web-speech',
  fontSize: 16,
};

export const PROVIDER_NAMES = {
  'google-free': 'Google Translate (Free)',
  'deepl': 'DeepL',
  'openai': 'OpenAI GPT',
  'google-cloud': 'Google Cloud Translation',
};

export const STT_PROVIDERS = {
  'web-speech': 'Web Speech API (Free)',
  'whisper': 'OpenAI Whisper',
};

export const CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const RATE_LIMIT_DELAY_MS = 150;
export const RATE_LIMIT_BATCH_SIZE = 5;
export const TRANSLATION_TIMEOUT_MS = 5000;
export const MAX_RETRIES = 2;
export const CUE_BUFFER_AHEAD = 5;
```

- [ ] **Step 5: Create locale files**

Create `_locales/vi/messages.json`:

```json
{
  "extName": { "message": "Dịch Video Song Ngữ" },
  "extDescription": { "message": "Dịch subtitle video sang mọi ngôn ngữ, hiển thị song ngữ" }
}
```

Create `_locales/en/messages.json`:

```json
{
  "extName": { "message": "Bilingual Video Translator" },
  "extDescription": { "message": "Translate video subtitles to any language, display bilingual subtitles" }
}
```

- [ ] **Step 6: Create placeholder icons**

Create simple SVG-based placeholder icons at `icons/icon-16.png`, `icons/icon-48.png`, `icons/icon-128.png`. Use a simple "翻" character on a gradient background. (Can be replaced with proper icons later.)

```bash
mkdir -p icons
# Generate simple placeholder PNGs using node canvas or manually
# For now create minimal valid PNGs
node -e "
const { createCanvas } = require('canvas');
[16, 48, 128].forEach(size => {
  // If canvas not available, create 1x1 placeholder
  const fs = require('fs');
  // Minimal valid PNG (1x1 transparent pixel)
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  fs.writeFileSync('icons/icon-' + size + '.png', png);
});
"
```

- [ ] **Step 7: Update .gitignore and configure Jest**

Update `.gitignore`:

```
.superpowers/
node_modules/
dist/
coverage/
```

Add to `package.json` scripts and jest config:

```json
{
  "scripts": {
    "build:chrome": "webpack --config webpack.config.js",
    "build": "npm run build:chrome",
    "test": "jest --coverage",
    "test:watch": "jest --watch"
  },
  "jest": {
    "testEnvironment": "jsdom",
    "transform": {
      "^.+\\.js$": "babel-jest"
    },
    "moduleFileExtensions": ["js"],
    "testMatch": ["**/tests/**/*.test.js"]
  },
  "babel": {
    "presets": [["@babel/preset-env", { "targets": { "node": "current" } }]]
  }
}
```

- [ ] **Step 8: Verify build works**

```bash
npm run build
```

Expected: Webpack outputs to `dist/chrome/` with no errors (may warn about missing entry files — that's OK at this stage).

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json webpack.config.js manifest.json src/utils/constants.js _locales icons .gitignore
git commit -m "feat: scaffold project with webpack, manifest v3, and constants"
```

---

## Task 2: Cache Utility (TDD)

**Files:**
- Create: `src/utils/cache.js`
- Create: `tests/utils/cache.test.js`

- [ ] **Step 1: Write failing tests for in-memory cache**

Create `tests/utils/cache.test.js`:

```javascript
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
      // Same input should produce same key
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest tests/utils/cache.test.js --verbose
```

Expected: FAIL — `Cannot find module '../../src/utils/cache.js'`

- [ ] **Step 3: Implement TranslationCache**

Create `src/utils/cache.js`:

```javascript
import { CACHE_EXPIRY_MS } from './constants.js';

export class TranslationCache {
  constructor() {
    this._memory = new Map();
    this._dbName = 'dich-video-cache';
    this._storeName = 'translations';
  }

  _makeKey(text, sourceLang, targetLang) {
    return `${sourceLang}:${targetLang}:${text}`;
  }

  get(text, sourceLang, targetLang) {
    const key = this._makeKey(text, sourceLang, targetLang);
    const entry = this._memory.get(key);
    if (!entry) return null;
    return entry.value;
  }

  set(text, sourceLang, targetLang, translation) {
    const key = this._makeKey(text, sourceLang, targetLang);
    this._memory.set(key, {
      value: translation,
      timestamp: Date.now(),
    });
    this._persistToDb(key, translation).catch(() => {});
  }

  clear() {
    this._memory.clear();
  }

  async _openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this._dbName, 1);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this._storeName)) {
          db.createObjectStore(this._storeName, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async _persistToDb(key, translation) {
    try {
      const db = await this._openDb();
      const tx = db.transaction(this._storeName, 'readwrite');
      const store = tx.objectStore(this._storeName);
      store.put({ key, value: translation, timestamp: Date.now() });
      db.close();
    } catch {
      // IndexedDB not available — memory-only mode
    }
  }

  async loadFromDb(text, sourceLang, targetLang) {
    try {
      const db = await this._openDb();
      const key = this._makeKey(text, sourceLang, targetLang);
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this._storeName, 'readonly');
        const store = tx.objectStore(this._storeName);
        const request = store.get(key);
        request.onsuccess = () => {
          db.close();
          const entry = request.result;
          if (!entry) return resolve(null);
          if (Date.now() - entry.timestamp > CACHE_EXPIRY_MS) return resolve(null);
          // Populate memory cache
          this._memory.set(key, { value: entry.value, timestamp: entry.timestamp });
          resolve(entry.value);
        };
        request.onerror = () => { db.close(); reject(request.error); };
      });
    } catch {
      return null;
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/utils/cache.test.js --verbose
```

Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/cache.js tests/utils/cache.test.js
git commit -m "feat: add TranslationCache with in-memory + IndexedDB two-level caching"
```

---

## Task 3: Rate Limiter (TDD)

**Files:**
- Create: `src/utils/rate-limiter.js`
- Create: `tests/utils/rate-limiter.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/utils/rate-limiter.test.js`:

```javascript
import { RateLimiter } from '../../src/utils/rate-limiter.js';

describe('RateLimiter', () => {
  let limiter;

  beforeEach(() => {
    jest.useFakeTimers();
    limiter = new RateLimiter({ delayMs: 100, batchSize: 3 });
  });

  afterEach(() => {
    jest.useRealTimers();
    limiter.destroy();
  });

  test('executes single request immediately', async () => {
    const fn = jest.fn().mockResolvedValue('result');
    const promise = limiter.enqueue(fn);
    jest.advanceTimersByTime(0);
    await Promise.resolve(); // flush microtasks
    const result = await promise;
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result).toBe('result');
  });

  test('batches multiple requests', async () => {
    const fn1 = jest.fn().mockResolvedValue('a');
    const fn2 = jest.fn().mockResolvedValue('b');
    const fn3 = jest.fn().mockResolvedValue('c');

    const p1 = limiter.enqueue(fn1);
    const p2 = limiter.enqueue(fn2);
    const p3 = limiter.enqueue(fn3);

    // First batch processes
    jest.advanceTimersByTime(0);
    await Promise.resolve();

    const results = await Promise.all([p1, p2, p3]);
    expect(results).toEqual(['a', 'b', 'c']);
  });

  test('delays between batches', async () => {
    const calls = [];
    const makeFn = (id) => jest.fn().mockImplementation(() => {
      calls.push(id);
      return Promise.resolve(id);
    });

    // Enqueue 5 items (batch size 3) — should need 2 batches
    const promises = [1, 2, 3, 4, 5].map(id => limiter.enqueue(makeFn(id)));

    // Process first batch
    jest.advanceTimersByTime(0);
    await Promise.resolve();
    expect(calls.length).toBe(3);

    // Advance past delay to process second batch
    jest.advanceTimersByTime(100);
    await Promise.resolve();
    await Promise.resolve();
    expect(calls.length).toBe(5);
  });

  test('slowDown increases delay', () => {
    expect(limiter._delayMs).toBe(100);
    limiter.slowDown();
    expect(limiter._delayMs).toBe(200);
    limiter.slowDown();
    expect(limiter._delayMs).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest tests/utils/rate-limiter.test.js --verbose
```

Expected: FAIL

- [ ] **Step 3: Implement RateLimiter**

Create `src/utils/rate-limiter.js`:

```javascript
export class RateLimiter {
  constructor({ delayMs = 150, batchSize = 5 } = {}) {
    this._delayMs = delayMs;
    this._batchSize = batchSize;
    this._queue = [];
    this._processing = false;
    this._timer = null;
  }

  enqueue(fn) {
    return new Promise((resolve, reject) => {
      this._queue.push({ fn, resolve, reject });
      if (!this._processing) {
        this._processBatch();
      }
    });
  }

  async _processBatch() {
    if (this._queue.length === 0) {
      this._processing = false;
      return;
    }

    this._processing = true;
    const batch = this._queue.splice(0, this._batchSize);

    await Promise.all(
      batch.map(async ({ fn, resolve, reject }) => {
        try {
          const result = await fn();
          resolve(result);
        } catch (err) {
          reject(err);
        }
      })
    );

    if (this._queue.length > 0) {
      this._timer = setTimeout(() => this._processBatch(), this._delayMs);
    } else {
      this._processing = false;
    }
  }

  slowDown() {
    this._delayMs = Math.min(this._delayMs * 2, 5000);
  }

  resetSpeed() {
    this._delayMs = 150;
  }

  destroy() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this._queue = [];
    this._processing = false;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/utils/rate-limiter.test.js --verbose
```

Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/rate-limiter.js tests/utils/rate-limiter.test.js
git commit -m "feat: add RateLimiter with batching and adaptive delay"
```

---

## Task 4: Translation Provider Interface + Google Free Provider (TDD)

**Files:**
- Create: `src/providers/translation-provider.js`
- Create: `src/providers/google-free.js`
- Create: `tests/providers/translation-provider.test.js`
- Create: `tests/providers/google-free.test.js`

- [ ] **Step 1: Write failing tests for base provider**

Create `tests/providers/translation-provider.test.js`:

```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest tests/providers/translation-provider.test.js --verbose
```

Expected: FAIL

- [ ] **Step 3: Implement base TranslationProvider**

Create `src/providers/translation-provider.js`:

```javascript
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest tests/providers/translation-provider.test.js --verbose
```

Expected: All 3 tests PASS

- [ ] **Step 5: Write failing tests for Google Free provider**

Create `tests/providers/google-free.test.js`:

```javascript
import { GoogleFreeProvider } from '../../src/providers/google-free.js';

// Mock global fetch
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
      json: () => Promise.resolve([[['...', 'Hello']]], null, [['en', 0.99]]])
    });

    // detectLanguage uses translate with auto-detect
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
```

- [ ] **Step 6: Run test to verify it fails**

```bash
npx jest tests/providers/google-free.test.js --verbose
```

Expected: FAIL

- [ ] **Step 7: Implement GoogleFreeProvider**

Create `src/providers/google-free.js`:

```javascript
import { TranslationProvider } from './translation-provider.js';

export class GoogleFreeProvider extends TranslationProvider {
  constructor() {
    super('google-free', false);
    this._baseUrl = 'https://translate.googleapis.com/translate_a/single';
  }

  async translate(text, from, to) {
    if (!text || text.trim() === '') return '';

    const params = new URLSearchParams({
      client: 'gtx',
      sl: from || 'auto',
      tl: to,
      dt: 't',
      q: text,
    });

    const response = await fetch(`${this._baseUrl}?${params}`);
    if (!response.ok) {
      const error = new Error(`Google Translate error: ${response.status}`);
      error.status = response.status;
      throw error;
    }

    const data = await response.json();
    // Response format: [[["translated text","source text",...],...],...,"detected_lang"]
    const translated = data[0].map(segment => segment[0]).join('');
    return translated;
  }

  async detectLanguage(text) {
    if (!text || text.trim() === '') return 'unknown';

    const params = new URLSearchParams({
      client: 'gtx',
      sl: 'auto',
      tl: 'en',
      dt: 't',
      q: text,
    });

    const response = await fetch(`${this._baseUrl}?${params}`);
    if (!response.ok) {
      throw new Error(`Language detection error: ${response.status}`);
    }

    const data = await response.json();
    // Detected language is at data[2]
    return data[2] || 'unknown';
  }
}
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
npx jest tests/providers/ --verbose
```

Expected: All tests PASS

- [ ] **Step 9: Commit**

```bash
git add src/providers/ tests/providers/
git commit -m "feat: add TranslationProvider base class and GoogleFreeProvider"
```

---

## Task 5: BYOK Providers (DeepL, OpenAI, Google Cloud)

**Files:**
- Create: `src/providers/deepl.js`
- Create: `src/providers/openai.js`
- Create: `src/providers/google-cloud.js`
- Create: `tests/providers/deepl.test.js`
- Create: `tests/providers/openai.test.js`
- Create: `tests/providers/google-cloud.test.js`

- [ ] **Step 1: Write failing tests for all three BYOK providers**

Create `tests/providers/deepl.test.js`:

```javascript
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
        translations: [{ text: 'Xin chào', detected_source_language: 'EN' }]
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest tests/providers/deepl.test.js --verbose
```

Expected: FAIL

- [ ] **Step 2b: Write failing tests for OpenAI provider**

Create `tests/providers/openai.test.js`:

```javascript
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
        choices: [{ message: { content: 'Xin chào' } }]
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
```

- [ ] **Step 2c: Write failing tests for Google Cloud provider**

Create `tests/providers/google-cloud.test.js`:

```javascript
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
        data: { translations: [{ translatedText: 'Xin chào' }] }
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
```

- [ ] **Step 3: Implement all three BYOK providers**

Create `src/providers/deepl.js`:

```javascript
import { TranslationProvider } from './translation-provider.js';

export class DeepLProvider extends TranslationProvider {
  constructor(apiKey) {
    super('deepl', true);
    if (!apiKey) throw new Error('API key required for DeepL');
    this._apiKey = apiKey;
    this._baseUrl = 'https://api-free.deepl.com/v2';
  }

  async translate(text, from, to) {
    if (!text || text.trim() === '') return '';

    const body = {
      text: [text],
      target_lang: to.toUpperCase(),
    };
    if (from && from !== 'auto') body.source_lang = from.toUpperCase();

    const response = await fetch(`${this._baseUrl}/translate`, {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${this._apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = new Error(`DeepL error: ${response.status}`);
      error.status = response.status;
      throw error;
    }

    const data = await response.json();
    return data.translations[0].text;
  }

  async detectLanguage(text) {
    if (!text || text.trim() === '') return 'unknown';

    const body = { text: [text], target_lang: 'EN' };
    const response = await fetch(`${this._baseUrl}/translate`, {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${this._apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) throw new Error(`DeepL detect error: ${response.status}`);
    const data = await response.json();
    return data.translations[0].detected_source_language.toLowerCase();
  }
}
```

Create `src/providers/openai.js`:

```javascript
import { TranslationProvider } from './translation-provider.js';

export class OpenAIProvider extends TranslationProvider {
  constructor(apiKey) {
    super('openai', true);
    if (!apiKey) throw new Error('API key required for OpenAI');
    this._apiKey = apiKey;
    this._baseUrl = 'https://api.openai.com/v1/chat/completions';
  }

  async translate(text, from, to) {
    if (!text || text.trim() === '') return '';

    const response = await fetch(this._baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this._apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a subtitle translator. Translate the following text from ${from || 'the detected language'} to ${to}. Return ONLY the translation, no explanations.`,
          },
          { role: 'user', content: text },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const error = new Error(`OpenAI error: ${response.status}`);
      error.status = response.status;
      throw error;
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
  }

  async detectLanguage(text) {
    const response = await fetch(this._baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this._apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Detect the language of the given text. Return ONLY the ISO 639-1 language code (e.g., "en", "vi", "ja").',
          },
          { role: 'user', content: text },
        ],
        temperature: 0,
        max_tokens: 10,
      }),
    });

    if (!response.ok) throw new Error(`OpenAI error: ${response.status}`);
    const data = await response.json();
    return data.choices[0].message.content.trim().toLowerCase();
  }
}
```

Create `src/providers/google-cloud.js`:

```javascript
import { TranslationProvider } from './translation-provider.js';

export class GoogleCloudProvider extends TranslationProvider {
  constructor(apiKey) {
    super('google-cloud', true);
    if (!apiKey) throw new Error('API key required for Google Cloud');
    this._apiKey = apiKey;
    this._baseUrl = 'https://translation.googleapis.com/language/translate/v2';
  }

  async translate(text, from, to) {
    if (!text || text.trim() === '') return '';

    const body = { q: text, target: to, format: 'text' };
    if (from && from !== 'auto') body.source = from;

    const response = await fetch(`${this._baseUrl}?key=${this._apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = new Error(`Google Cloud error: ${response.status}`);
      error.status = response.status;
      throw error;
    }

    const data = await response.json();
    return data.data.translations[0].translatedText;
  }

  async detectLanguage(text) {
    const response = await fetch(`${this._baseUrl}/detect?key=${this._apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text }),
    });

    if (!response.ok) throw new Error(`Detection error: ${response.status}`);
    const data = await response.json();
    return data.data.detections[0][0].language;
  }
}
```

- [ ] **Step 4: Run all provider tests**

```bash
npx jest tests/providers/ --verbose
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/providers/deepl.js src/providers/openai.js src/providers/google-cloud.js tests/providers/deepl.test.js tests/providers/openai.test.js tests/providers/google-cloud.test.js
git commit -m "feat: add DeepL, OpenAI, and Google Cloud translation providers"
```

---

## Task 6: Background Service Worker (TDD)

**Files:**
- Create: `src/background/service-worker.js`
- Create: `src/utils/language-detector.js`
- Create: `tests/background/service-worker.test.js`

- [ ] **Step 1: Write failing tests for service worker message handling**

Create `tests/background/service-worker.test.js`:

```javascript
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

import { handleTranslateMessage, getProvider } from '../../src/background/service-worker.js';

global.fetch = jest.fn();

describe('Background Service Worker', () => {
  beforeEach(() => {
    fetch.mockClear();
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
    fetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await handleTranslateMessage({
      type: 'translate',
      text: 'Hello',
      sourceLang: 'en',
      targetLang: 'vi',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest tests/background/service-worker.test.js --verbose
```

Expected: FAIL

- [ ] **Step 3: Implement language-detector utility**

Create `src/utils/language-detector.js`:

```javascript
export class LanguageDetector {
  constructor() {
    this._cache = new Map(); // videoId -> detectedLang
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
```

- [ ] **Step 4: Implement service-worker.js**

Create `src/background/service-worker.js`:

```javascript
import { TranslationCache } from '../utils/cache.js';
import { RateLimiter } from '../utils/rate-limiter.js';
import { LanguageDetector } from '../utils/language-detector.js';
import { GoogleFreeProvider } from '../providers/google-free.js';
import { DeepLProvider } from '../providers/deepl.js';
import { OpenAIProvider } from '../providers/openai.js';
import { GoogleCloudProvider } from '../providers/google-cloud.js';
import { MAX_RETRIES, TRANSLATION_TIMEOUT_MS } from '../utils/constants.js';

const cache = new TranslationCache();
const rateLimiter = new RateLimiter();
const langDetector = new LanguageDetector();

export function getProvider(providerName, apiKey = null) {
  switch (providerName) {
    case 'google-free':
      return new GoogleFreeProvider();
    case 'deepl':
      return new DeepLProvider(apiKey);
    case 'openai':
      return new OpenAIProvider(apiKey);
    case 'google-cloud':
      return new GoogleCloudProvider(apiKey);
    default:
      return new GoogleFreeProvider();
  }
}

async function translateWithRetry(provider, text, from, to, retries = MAX_RETRIES) {
  for (let i = 0; i <= retries; i++) {
    try {
      const result = await provider.translate(text, from, to);
      return result;
    } catch (error) {
      if (error.status === 429) {
        rateLimiter.slowDown();
      }
      if (i === retries) throw error;
      await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
    }
  }
}

export async function handleTranslateMessage(message) {
  const { text, sourceLang, targetLang } = message;

  try {
    // Check cache first
    const cached = cache.get(text, sourceLang, targetLang);
    if (cached) {
      return { success: true, translation: cached, fromCache: true };
    }

    // Get provider settings
    const provider = getProvider(message.provider || 'google-free', message.apiKey);

    // Translate with rate limiting and retry
    const translation = await rateLimiter.enqueue(() =>
      translateWithRetry(provider, text, sourceLang, targetLang)
    );

    // Cache result
    cache.set(text, sourceLang, targetLang, translation);

    return { success: true, translation, fromCache: false };
  } catch (error) {
    return { success: false, error: error.message, originalText: text };
  }
}

export async function handleDetectLanguageMessage(message) {
  try {
    const provider = getProvider(message.provider || 'google-free', message.apiKey);
    const lang = await langDetector.detect(message.text, provider, message.videoId);
    return { success: true, language: lang };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Register message listener
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'translate') {
      handleTranslateMessage(message).then(sendResponse);
      return true; // async response
    }
    if (message.type === 'detect-language') {
      handleDetectLanguageMessage(message).then(sendResponse);
      return true;
    }
  });
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx jest tests/background/ --verbose
```

Expected: All 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/background/service-worker.js src/utils/language-detector.js tests/background/
git commit -m "feat: add background service worker with translation orchestration, retry, and caching"
```

---

## Task 7: Video Detector (TDD)

**Files:**
- Create: `src/content/video-detector.js`
- Create: `tests/content/video-detector.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/content/video-detector.test.js`:

```javascript
import { VideoDetector } from '../../src/content/video-detector.js';

describe('VideoDetector', () => {
  let detector;
  let onVideoFound;
  let onVideoRemoved;

  beforeEach(() => {
    document.body.innerHTML = '';
    onVideoFound = jest.fn();
    onVideoRemoved = jest.fn();
    detector = new VideoDetector({ onVideoFound, onVideoRemoved });
  });

  afterEach(() => {
    detector.destroy();
  });

  test('detects existing video elements on scan', () => {
    const video = document.createElement('video');
    document.body.appendChild(video);

    detector.scan();
    expect(onVideoFound).toHaveBeenCalledWith(video);
  });

  test('detects multiple videos', () => {
    const video1 = document.createElement('video');
    const video2 = document.createElement('video');
    document.body.appendChild(video1);
    document.body.appendChild(video2);

    detector.scan();
    expect(onVideoFound).toHaveBeenCalledTimes(2);
  });

  test('does not report same video twice', () => {
    const video = document.createElement('video');
    document.body.appendChild(video);

    detector.scan();
    detector.scan();
    expect(onVideoFound).toHaveBeenCalledTimes(1);
  });

  test('observes dynamically added videos', async () => {
    detector.observe();

    const video = document.createElement('video');
    document.body.appendChild(video);

    // MutationObserver is async
    await new Promise(r => setTimeout(r, 0));
    expect(onVideoFound).toHaveBeenCalledWith(video);
  });

  test('getActiveVideos returns tracked videos', () => {
    const video = document.createElement('video');
    document.body.appendChild(video);
    detector.scan();

    expect(detector.getActiveVideos()).toContain(video);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest tests/content/video-detector.test.js --verbose
```

Expected: FAIL

- [ ] **Step 3: Implement VideoDetector**

Create `src/content/video-detector.js`:

```javascript
export class VideoDetector {
  constructor({ onVideoFound, onVideoRemoved }) {
    this._onVideoFound = onVideoFound;
    this._onVideoRemoved = onVideoRemoved;
    this._trackedVideos = new Set();
    this._observer = null;
  }

  scan() {
    const videos = document.querySelectorAll('video');
    videos.forEach(video => {
      if (!this._trackedVideos.has(video)) {
        this._trackedVideos.add(video);
        this._onVideoFound(video);
      }
    });
  }

  observe() {
    this.scan(); // Initial scan

    this._observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeName === 'VIDEO') {
            this._addVideo(node);
          }
          // Check children of added nodes
          if (node.querySelectorAll) {
            node.querySelectorAll('video').forEach(v => this._addVideo(v));
          }
        }
        for (const node of mutation.removedNodes) {
          if (node.nodeName === 'VIDEO') {
            this._removeVideo(node);
          }
          if (node.querySelectorAll) {
            node.querySelectorAll('video').forEach(v => this._removeVideo(v));
          }
        }
      }
    });

    this._observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  _addVideo(video) {
    if (!this._trackedVideos.has(video)) {
      this._trackedVideos.add(video);
      this._onVideoFound(video);
    }
  }

  _removeVideo(video) {
    if (this._trackedVideos.has(video)) {
      this._trackedVideos.delete(video);
      this._onVideoRemoved(video);
    }
  }

  getActiveVideos() {
    return Array.from(this._trackedVideos);
  }

  destroy() {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
    this._trackedVideos.clear();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/content/video-detector.test.js --verbose
```

Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/content/video-detector.js tests/content/video-detector.test.js
git commit -m "feat: add VideoDetector with MutationObserver for dynamic video detection"
```

---

## Task 8: Subtitle Extractor (TDD)

**Files:**
- Create: `src/content/subtitle-extractor.js`
- Create: `tests/content/subtitle-extractor.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/content/subtitle-extractor.test.js`:

```javascript
import { SubtitleExtractor } from '../../src/content/subtitle-extractor.js';

describe('SubtitleExtractor', () => {
  let extractor;

  beforeEach(() => {
    extractor = new SubtitleExtractor();
  });

  describe('TextTrack extraction', () => {
    test('extracts cues from video TextTracks', () => {
      const mockCue = { startTime: 0, endTime: 2, text: 'Hello world' };
      const mockTrack = {
        kind: 'subtitles',
        language: 'en',
        mode: 'showing',
        cues: [mockCue],
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      };
      const video = {
        textTracks: [mockTrack],
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      };

      const tracks = extractor.findSubtitleTracks(video);
      expect(tracks.length).toBe(1);
      expect(tracks[0].language).toBe('en');
    });

    test('returns empty array when no tracks', () => {
      const video = {
        textTracks: [],
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      };

      const tracks = extractor.findSubtitleTracks(video);
      expect(tracks.length).toBe(0);
    });
  });

  describe('getCueAtTime', () => {
    test('returns cue matching current time', () => {
      const cues = [
        { startTime: 0, endTime: 2, text: 'First' },
        { startTime: 2, endTime: 5, text: 'Second' },
        { startTime: 5, endTime: 8, text: 'Third' },
      ];

      expect(extractor.getCueAtTime(cues, 1)).toEqual({ startTime: 0, endTime: 2, text: 'First' });
      expect(extractor.getCueAtTime(cues, 3)).toEqual({ startTime: 2, endTime: 5, text: 'Second' });
      expect(extractor.getCueAtTime(cues, 10)).toBeNull();
    });
  });

  describe('getUpcomingCues', () => {
    test('returns buffer of upcoming cues', () => {
      const cues = [
        { startTime: 0, endTime: 2, text: 'A' },
        { startTime: 2, endTime: 4, text: 'B' },
        { startTime: 4, endTime: 6, text: 'C' },
        { startTime: 6, endTime: 8, text: 'D' },
        { startTime: 8, endTime: 10, text: 'E' },
      ];

      const upcoming = extractor.getUpcomingCues(cues, 1, 3);
      expect(upcoming.length).toBe(3);
      expect(upcoming[0].text).toBe('B');
    });
  });

  describe('isYouTube', () => {
    test('detects YouTube URLs', () => {
      expect(extractor.isYouTube('https://www.youtube.com/watch?v=abc')).toBe(true);
      expect(extractor.isYouTube('https://youtube.com/watch?v=abc')).toBe(true);
      expect(extractor.isYouTube('https://vimeo.com/123')).toBe(false);
    });
  });

  describe('parseSubtitleText', () => {
    test('strips HTML tags from subtitle text', () => {
      expect(extractor.parseSubtitleText('<b>Bold</b> text')).toBe('Bold text');
      expect(extractor.parseSubtitleText('<i>Italic</i>')).toBe('Italic');
    });

    test('handles plain text', () => {
      expect(extractor.parseSubtitleText('Plain text')).toBe('Plain text');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest tests/content/subtitle-extractor.test.js --verbose
```

Expected: FAIL

- [ ] **Step 3: Implement SubtitleExtractor**

Create `src/content/subtitle-extractor.js`:

```javascript
export class SubtitleExtractor {
  constructor() {
    this._domObserver = null;
  }

  findSubtitleTracks(video) {
    const tracks = [];
    if (!video.textTracks) return tracks;

    for (let i = 0; i < video.textTracks.length; i++) {
      const track = video.textTracks[i];
      if (track.kind === 'subtitles' || track.kind === 'captions') {
        tracks.push({
          index: i,
          language: track.language || 'unknown',
          label: track.label || track.language || 'Unknown',
          kind: track.kind,
          track,
        });
      }
    }
    return tracks;
  }

  getAllCues(track) {
    if (!track || !track.cues) return [];
    const cues = [];
    for (let i = 0; i < track.cues.length; i++) {
      const cue = track.cues[i];
      cues.push({
        startTime: cue.startTime,
        endTime: cue.endTime,
        text: this.parseSubtitleText(cue.text || cue.getCueAsHTML?.()?.textContent || ''),
      });
    }
    return cues;
  }

  getCueAtTime(cues, currentTime) {
    for (const cue of cues) {
      if (currentTime >= cue.startTime && currentTime < cue.endTime) {
        return cue;
      }
    }
    return null;
  }

  getUpcomingCues(cues, currentTime, count = 5) {
    const upcoming = [];
    for (const cue of cues) {
      if (cue.startTime > currentTime) {
        upcoming.push(cue);
        if (upcoming.length >= count) break;
      }
    }
    return upcoming;
  }

  isYouTube(url) {
    return /^https?:\/\/(www\.)?youtube\.com/.test(url);
  }

  isVimeo(url) {
    return /^https?:\/\/(www\.)?vimeo\.com/.test(url);
  }

  parseSubtitleText(text) {
    // Strip HTML tags
    return text.replace(/<[^>]*>/g, '').trim();
  }

  observeDomSubtitles(containerSelector, onCueChange) {
    const container = document.querySelector(containerSelector);
    if (!container) return null;

    this._domObserver = new MutationObserver(() => {
      const text = container.textContent.trim();
      if (text) onCueChange(text);
    });

    this._domObserver.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return this._domObserver;
  }

  destroy() {
    if (this._domObserver) {
      this._domObserver.disconnect();
      this._domObserver = null;
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/content/subtitle-extractor.test.js --verbose
```

Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/content/subtitle-extractor.js tests/content/subtitle-extractor.test.js
git commit -m "feat: add SubtitleExtractor with TextTrack, platform detection, and DOM observation"
```

---

## Task 9: Speech Recognizer

**Files:**
- Create: `src/content/speech-recognizer.js`

- [ ] **Step 1: Implement SpeechRecognizer**

Create `src/content/speech-recognizer.js`:

```javascript
export class SpeechRecognizer {
  constructor({ onResult, onError, lang = 'en' }) {
    this._onResult = onResult;
    this._onError = onError;
    this._lang = lang;
    this._recognition = null;
    this._isRunning = false;
  }

  isSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  start() {
    if (!this.isSupported()) {
      this._onError(new Error('Web Speech API not supported'));
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this._recognition = new SpeechRecognition();
    this._recognition.continuous = true;
    this._recognition.interimResults = false;
    this._recognition.lang = this._lang;

    this._recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          const text = event.results[i][0].transcript.trim();
          const timestamp = Date.now();
          this._onResult({ text, timestamp, confidence: event.results[i][0].confidence });
        }
      }
    };

    this._recognition.onerror = (event) => {
      if (event.error !== 'no-speech') {
        this._onError(new Error(`Speech recognition error: ${event.error}`));
      }
    };

    this._recognition.onend = () => {
      // Auto-restart if still supposed to be running
      if (this._isRunning) {
        try { this._recognition.start(); } catch {}
      }
    };

    this._isRunning = true;
    this._recognition.start();
  }

  stop() {
    this._isRunning = false;
    if (this._recognition) {
      this._recognition.stop();
      this._recognition = null;
    }
  }

  setLanguage(lang) {
    this._lang = lang;
    if (this._isRunning) {
      this.stop();
      this.start();
    }
  }

  destroy() {
    this.stop();
  }
}
```

- [ ] **Step 2: Commit**

Note: Web Speech API can't be unit-tested in jsdom. This will be tested via E2E.

```bash
git add src/content/speech-recognizer.js
git commit -m "feat: add SpeechRecognizer with Web Speech API and auto-restart"
```

---

## Task 10: Overlay UI (TDD)

**Files:**
- Create: `src/content/overlay-ui.js`
- Create: `src/styles/overlay.css`
- Create: `tests/content/overlay-ui.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/content/overlay-ui.test.js`:

```javascript
import { OverlayUI } from '../../src/content/overlay-ui.js';

describe('OverlayUI', () => {
  let overlay;
  let video;

  beforeEach(() => {
    document.body.innerHTML = '<div><video width="640" height="360"></video></div>';
    video = document.querySelector('video');
    // Mock getBoundingClientRect
    video.getBoundingClientRect = jest.fn(() => ({
      top: 0, left: 0, width: 640, height: 360, bottom: 360, right: 640,
    }));
    overlay = new OverlayUI(video);
  });

  afterEach(() => {
    overlay.destroy();
  });

  test('creates overlay container on init', () => {
    overlay.init();
    const container = video.parentElement.querySelector('.dvsn-overlay');
    expect(container).not.toBeNull();
  });

  test('shows bilingual subtitle', () => {
    overlay.init();
    overlay.showSubtitle('Hello world', 'Xin chào thế giới');
    const original = video.parentElement.querySelector('.dvsn-original');
    const translated = video.parentElement.querySelector('.dvsn-translated');
    expect(original.textContent).toBe('Hello world');
    expect(translated.textContent).toBe('Xin chào thế giới');
  });

  test('hides subtitle', () => {
    overlay.init();
    overlay.showSubtitle('Hello', 'Xin chào');
    overlay.hide();
    const container = video.parentElement.querySelector('.dvsn-overlay');
    expect(container.style.display).toBe('none');
  });

  test('updates subtitle in place', () => {
    overlay.init();
    overlay.showSubtitle('Hello', 'Xin chào');
    overlay.showSubtitle('Goodbye', 'Tạm biệt');
    const translated = video.parentElement.querySelector('.dvsn-translated');
    expect(translated.textContent).toBe('Tạm biệt');
  });

  test('destroy removes overlay from DOM', () => {
    overlay.init();
    overlay.destroy();
    const container = video.parentElement.querySelector('.dvsn-overlay');
    expect(container).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest tests/content/overlay-ui.test.js --verbose
```

Expected: FAIL

- [ ] **Step 3: Create overlay CSS**

Create `src/styles/overlay.css`:

```css
.dvsn-overlay {
  position: absolute;
  bottom: 50px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2147483647;
  text-align: center;
  max-width: 80%;
  pointer-events: none;
  transition: opacity 0.2s ease;
}

.dvsn-original {
  background: rgba(0, 0, 0, 0.6);
  color: #aab;
  padding: 4px 12px;
  border-radius: 4px;
  margin-bottom: 4px;
  font-size: 13px;
  letter-spacing: 0.3px;
  line-height: 1.4;
  display: inline-block;
}

.dvsn-translated {
  background: rgba(0, 0, 0, 0.85);
  color: #fff;
  padding: 6px 16px;
  border-radius: 4px;
  font-size: 16px;
  font-weight: 500;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  line-height: 1.4;
  display: inline-block;
}
```

- [ ] **Step 4: Implement OverlayUI**

Create `src/content/overlay-ui.js`:

```javascript
export class OverlayUI {
  constructor(video) {
    this._video = video;
    this._container = null;
    this._originalEl = null;
    this._translatedEl = null;
  }

  init() {
    if (this._container) return;

    // Ensure video parent is positioned
    const parent = this._video.parentElement;
    const parentPosition = getComputedStyle(parent).position;
    if (parentPosition === 'static') {
      parent.style.position = 'relative';
    }

    this._container = document.createElement('div');
    this._container.className = 'dvsn-overlay';

    this._originalEl = document.createElement('div');
    this._originalEl.className = 'dvsn-original';

    this._translatedEl = document.createElement('div');
    this._translatedEl.className = 'dvsn-translated';

    this._container.appendChild(this._originalEl);
    this._container.appendChild(document.createElement('br'));
    this._container.appendChild(this._translatedEl);

    parent.appendChild(this._container);
  }

  showSubtitle(originalText, translatedText) {
    if (!this._container) this.init();

    this._originalEl.textContent = originalText;
    this._translatedEl.textContent = translatedText;
    this._container.style.display = '';
  }

  hide() {
    if (this._container) {
      this._container.style.display = 'none';
    }
  }

  setFontSize(size) {
    if (this._translatedEl) {
      this._translatedEl.style.fontSize = `${size}px`;
      this._originalEl.style.fontSize = `${Math.round(size * 0.8)}px`;
    }
  }

  destroy() {
    if (this._container && this._container.parentElement) {
      this._container.parentElement.removeChild(this._container);
    }
    this._container = null;
    this._originalEl = null;
    this._translatedEl = null;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx jest tests/content/overlay-ui.test.js --verbose
```

Expected: All 5 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/content/overlay-ui.js src/styles/overlay.css tests/content/overlay-ui.test.js
git commit -m "feat: add OverlayUI for bilingual subtitle display on video"
```

---

## Task 11: Side Panel UI

**Files:**
- Create: `src/content/side-panel-ui.js`
- Create: `src/styles/side-panel.css`

- [ ] **Step 1: Create side panel CSS**

Create `src/styles/side-panel.css`:

```css
.dvsn-panel {
  position: fixed;
  top: 0;
  right: 0;
  width: 320px;
  height: 100vh;
  background: #1a1b2e;
  border-left: 1px solid #2d2e4a;
  z-index: 2147483646;
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #e2e8f0;
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.3);
}

.dvsn-panel-header {
  padding: 12px 16px;
  border-bottom: 1px solid #2d2e4a;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.dvsn-panel-header-title {
  font-size: 13px;
  font-weight: 600;
}

.dvsn-panel-header-lang {
  font-size: 11px;
  color: #667eea;
  cursor: pointer;
}

.dvsn-panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.dvsn-panel-cue {
  padding: 8px 10px;
  margin-bottom: 6px;
  border-radius: 6px;
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.2s ease, background 0.2s ease;
}

.dvsn-panel-cue:hover {
  opacity: 0.8;
  background: rgba(102, 126, 234, 0.08);
}

.dvsn-panel-cue.active {
  opacity: 1;
  background: rgba(102, 126, 234, 0.15);
  border-left: 3px solid #667eea;
}

.dvsn-panel-cue-time {
  font-size: 10px;
  color: #667eea;
  margin-bottom: 3px;
}

.dvsn-panel-cue-original {
  font-size: 11px;
  color: #8b8fa3;
  margin-bottom: 2px;
}

.dvsn-panel-cue-translated {
  font-size: 13px;
  color: #fff;
  font-weight: 500;
}

.dvsn-panel-close {
  background: none;
  border: none;
  color: #667eea;
  cursor: pointer;
  font-size: 18px;
  padding: 4px;
}
```

- [ ] **Step 2: Implement SidePanelUI**

Create `src/content/side-panel-ui.js`:

```javascript
export class SidePanelUI {
  constructor({ onCueClick }) {
    this._onCueClick = onCueClick;
    this._panel = null;
    this._body = null;
    this._cueElements = new Map();
    this._activeCueId = null;
  }

  init() {
    if (this._panel) return;

    this._panel = document.createElement('div');
    this._panel.className = 'dvsn-panel';

    // Header
    const header = document.createElement('div');
    header.className = 'dvsn-panel-header';

    const title = document.createElement('span');
    title.className = 'dvsn-panel-header-title';
    title.textContent = 'Transcript';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'dvsn-panel-close';
    closeBtn.textContent = '\u00d7';
    closeBtn.addEventListener('click', () => this.hide());

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Body
    this._body = document.createElement('div');
    this._body.className = 'dvsn-panel-body';

    this._panel.appendChild(header);
    this._panel.appendChild(this._body);
    document.body.appendChild(this._panel);
  }

  addCue(id, { startTime, originalText, translatedText }) {
    if (!this._panel) this.init();

    const cueEl = document.createElement('div');
    cueEl.className = 'dvsn-panel-cue';
    cueEl.dataset.cueId = id;

    const timeEl = document.createElement('div');
    timeEl.className = 'dvsn-panel-cue-time';
    timeEl.textContent = this._formatTime(startTime);

    const origEl = document.createElement('div');
    origEl.className = 'dvsn-panel-cue-original';
    origEl.textContent = originalText;

    const transEl = document.createElement('div');
    transEl.className = 'dvsn-panel-cue-translated';
    transEl.textContent = translatedText;

    cueEl.appendChild(timeEl);
    cueEl.appendChild(origEl);
    cueEl.appendChild(transEl);

    cueEl.addEventListener('click', () => {
      this._onCueClick(startTime);
    });

    this._body.appendChild(cueEl);
    this._cueElements.set(id, cueEl);
  }

  updateCueTranslation(id, translatedText) {
    const cueEl = this._cueElements.get(id);
    if (!cueEl) return;
    const transEl = cueEl.querySelector('.dvsn-panel-cue-translated');
    if (transEl) transEl.textContent = translatedText;
  }

  setActiveCue(id) {
    if (this._activeCueId !== null) {
      const prev = this._cueElements.get(this._activeCueId);
      if (prev) prev.classList.remove('active');
    }

    const current = this._cueElements.get(id);
    if (current) {
      current.classList.add('active');
      current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    this._activeCueId = id;
  }

  show() {
    if (!this._panel) this.init();
    this._panel.style.display = '';
  }

  hide() {
    if (this._panel) {
      this._panel.style.display = 'none';
    }
  }

  clear() {
    if (this._body) this._body.innerHTML = '';
    this._cueElements.clear();
    this._activeCueId = null;
  }

  _formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  destroy() {
    if (this._panel && this._panel.parentElement) {
      this._panel.parentElement.removeChild(this._panel);
    }
    this._panel = null;
    this._body = null;
    this._cueElements.clear();
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/content/side-panel-ui.js src/styles/side-panel.css
git commit -m "feat: add SidePanelUI with transcript display, auto-scroll, and click-to-seek"
```

---

## Task 12: Control Button UI

**Files:**
- Create: `src/content/control-button.js`
- Create: `src/styles/control-button.css`

- [ ] **Step 1: Create control button CSS**

Create `src/styles/control-button.css`:

```css
.dvsn-control-btn {
  position: absolute;
  bottom: 50px;
  right: 12px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea, #764ba2);
  border: none;
  color: #fff;
  font-size: 16px;
  cursor: pointer;
  z-index: 2147483647;
  box-shadow: 0 2px 10px rgba(102, 126, 234, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.dvsn-control-btn:hover {
  transform: scale(1.1);
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.6);
}

.dvsn-control-menu {
  position: absolute;
  bottom: 44px;
  right: 0;
  background: #252640;
  border-radius: 10px;
  padding: 8px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
  min-width: 180px;
  display: none;
  z-index: 2147483647;
}

.dvsn-control-btn:hover + .dvsn-control-menu,
.dvsn-control-menu:hover {
  display: block;
}

.dvsn-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  border: none;
  background: none;
  width: 100%;
  color: #a0aec0;
  font-size: 12px;
  transition: background 0.15s ease;
}

.dvsn-menu-item:hover {
  background: rgba(102, 126, 234, 0.15);
}

.dvsn-menu-item.active {
  color: #e2e8f0;
}

.dvsn-menu-status {
  margin-left: auto;
  font-size: 10px;
}

.dvsn-menu-status.on { color: #48bb78; }
.dvsn-menu-status.off { color: #666; }

.dvsn-menu-divider {
  height: 1px;
  background: #2d2e4a;
  margin: 4px 0;
}
```

- [ ] **Step 2: Implement ControlButton**

Create `src/content/control-button.js`:

```javascript
export class ControlButton {
  constructor(video, { onToggleOverlay, onTogglePanel, onChangeLanguage }) {
    this._video = video;
    this._onToggleOverlay = onToggleOverlay;
    this._onTogglePanel = onTogglePanel;
    this._onChangeLanguage = onChangeLanguage;
    this._container = null;
    this._overlayOn = true;
    this._panelOn = false;
  }

  init() {
    if (this._container) return;

    const parent = this._video.parentElement;

    this._container = document.createElement('div');
    this._container.style.position = 'absolute';
    this._container.style.bottom = '50px';
    this._container.style.right = '12px';
    this._container.style.zIndex = '2147483647';

    // Floating button
    const btn = document.createElement('button');
    btn.className = 'dvsn-control-btn';
    btn.textContent = '\u7FFB'; // 翻
    btn.title = 'Dịch Video Song Ngữ';

    // Menu
    const menu = document.createElement('div');
    menu.className = 'dvsn-control-menu';

    // Overlay toggle
    this._overlayItem = this._createMenuItem('overlay', '\uD83D\uDC41', 'Overlay', this._overlayOn, () => {
      this._overlayOn = !this._overlayOn;
      this._updateItemStatus(this._overlayItem, this._overlayOn);
      this._onToggleOverlay(this._overlayOn);
    });

    // Panel toggle
    this._panelItem = this._createMenuItem('panel', '\uD83D\uDCDD', 'Side Panel', this._panelOn, () => {
      this._panelOn = !this._panelOn;
      this._updateItemStatus(this._panelItem, this._panelOn);
      this._onTogglePanel(this._panelOn);
    });

    const divider = document.createElement('div');
    divider.className = 'dvsn-menu-divider';

    menu.appendChild(this._overlayItem);
    menu.appendChild(this._panelItem);
    menu.appendChild(divider);

    this._container.appendChild(btn);
    this._container.appendChild(menu);
    parent.appendChild(this._container);
  }

  _createMenuItem(id, icon, label, isOn, onClick) {
    const item = document.createElement('button');
    item.className = `dvsn-menu-item ${isOn ? 'active' : ''}`;
    item.dataset.id = id;

    item.innerHTML = `
      <span>${icon}</span>
      <span>${label}</span>
      <span class="dvsn-menu-status ${isOn ? 'on' : 'off'}">${isOn ? '\u2713 ON' : 'OFF'}</span>
    `;

    item.addEventListener('click', onClick);
    return item;
  }

  _updateItemStatus(item, isOn) {
    const status = item.querySelector('.dvsn-menu-status');
    status.className = `dvsn-menu-status ${isOn ? 'on' : 'off'}`;
    status.textContent = isOn ? '\u2713 ON' : 'OFF';
    item.className = `dvsn-menu-item ${isOn ? 'active' : ''}`;
  }

  setState({ overlayOn, panelOn }) {
    if (overlayOn !== undefined) {
      this._overlayOn = overlayOn;
      if (this._overlayItem) this._updateItemStatus(this._overlayItem, overlayOn);
    }
    if (panelOn !== undefined) {
      this._panelOn = panelOn;
      if (this._panelItem) this._updateItemStatus(this._panelItem, panelOn);
    }
  }

  destroy() {
    if (this._container && this._container.parentElement) {
      this._container.parentElement.removeChild(this._container);
    }
    this._container = null;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/content/control-button.js src/styles/control-button.css
git commit -m "feat: add floating ControlButton with overlay/panel toggle menu"
```

---

## Task 13: Content Script Entry Point (Wire Everything Together)

**Files:**
- Create: `src/content/index.js`

- [ ] **Step 1: Implement content script entry that wires all modules**

Create `src/content/index.js`:

```javascript
import { VideoDetector } from './video-detector.js';
import { SubtitleExtractor } from './subtitle-extractor.js';
import { SpeechRecognizer } from './speech-recognizer.js';
import { OverlayUI } from './overlay-ui.js';
import { SidePanelUI } from './side-panel-ui.js';
import { ControlButton } from './control-button.js';
import { DEFAULT_SETTINGS, CUE_BUFFER_AHEAD } from '../utils/constants.js';
import '../styles/overlay.css';
import '../styles/side-panel.css';
import '../styles/control-button.css';

class VideoTranslator {
  constructor(video) {
    this._video = video;
    this._settings = { ...DEFAULT_SETTINGS };
    this._extractor = new SubtitleExtractor();
    this._overlay = new OverlayUI(video);
    this._sidePanel = null;
    this._controlBtn = null;
    this._speechRecognizer = null;
    this._cues = [];
    this._translatedCues = new Map();
    this._currentCueIndex = -1;
    this._cueIdCounter = 0;
    this._timeUpdateHandler = null;
    this._debounceTimer = null;
    this._apiKeys = {};

    this._loadSettings().then(() => this._loadApiKeys()).then(() => this._init());
  }

  async _loadSettings() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.sync.get('settings', (data) => {
          if (data.settings) Object.assign(this._settings, data.settings);
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  async _loadApiKeys() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.get(['translationApiKey', 'whisperApiKey'], (data) => {
          this._apiKeys = data;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  _init() {
    if (!this._settings.enabled) return;

    // Init UI components
    this._overlay.init();
    this._sidePanel = new SidePanelUI({
      onCueClick: (time) => { this._video.currentTime = time; },
    });

    this._controlBtn = new ControlButton(this._video, {
      onToggleOverlay: (on) => {
        this._settings.displayMode = on
          ? (this._settings.displayMode === 'panel' ? 'both' : 'overlay')
          : (this._settings.displayMode === 'both' ? 'panel' : 'none');
        if (!on) this._overlay.hide();
      },
      onTogglePanel: (on) => {
        if (on) this._sidePanel.show();
        else this._sidePanel.hide();
      },
      onChangeLanguage: () => {},
    });
    this._controlBtn.init();

    // Set initial display mode
    if (this._settings.displayMode === 'overlay' || this._settings.displayMode === 'both') {
      this._controlBtn.setState({ overlayOn: true });
    }
    if (this._settings.displayMode === 'panel' || this._settings.displayMode === 'both') {
      this._controlBtn.setState({ panelOn: true });
      this._sidePanel.init();
    }

    // Try to extract subtitles
    this._tryExtractSubtitles();

    // Listen for time updates (debounced for scrubbing)
    this._timeUpdateHandler = () => {
      if (this._debounceTimer) clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => this._onTimeUpdate(), 200);
    };
    this._video.addEventListener('timeupdate', this._timeUpdateHandler);

    // Listen for settings changes
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.onChanged.addListener((changes) => {
        if (changes.settings) {
          Object.assign(this._settings, changes.settings.newValue);
        }
      });
    }
  }

  _tryExtractSubtitles() {
    const tracks = this._extractor.findSubtitleTracks(this._video);

    if (tracks.length > 0) {
      // Use first available subtitle track
      const track = tracks[0].track;
      track.mode = 'hidden'; // Enable but don't show native subtitles

      // Wait for cues to load
      const checkCues = () => {
        if (track.cues && track.cues.length > 0) {
          this._cues = this._extractor.getAllCues(track);
          this._translateBufferedCues(0);
        } else {
          setTimeout(checkCues, 500);
        }
      };
      checkCues();
    } else {
      // Try platform-specific extraction or fallback to speech recognition
      this._tryPlatformSubtitles();
    }
  }

  _tryPlatformSubtitles() {
    const url = window.location.href;

    if (this._extractor.isYouTube(url)) {
      // Observe YouTube's rendered captions as DOM fallback
      this._extractor.observeDomSubtitles(
        '.ytp-caption-segment',
        (text) => this._onLiveCue(text)
      );
    } else {
      // Fallback: speech recognition
      this._startSpeechRecognition();
    }
  }

  _startSpeechRecognition() {
    this._speechRecognizer = new SpeechRecognizer({
      onResult: ({ text }) => this._onLiveCue(text),
      onError: (err) => console.warn('[DịchVideo] STT error:', err.message),
    });

    if (this._speechRecognizer.isSupported()) {
      this._speechRecognizer.start();
    }
  }

  _onLiveCue(text) {
    const id = this._cueIdCounter++;
    const startTime = this._video.currentTime;
    const cue = { startTime, endTime: startTime + 5, text };
    this._cues.push(cue);
    this._translateAndDisplay(id, cue);
  }

  async _translateAndDisplay(id, cue) {
    // Show original immediately
    if (this._settings.displayMode !== 'panel') {
      this._overlay.showSubtitle(cue.text, '...');
    }

    // Request translation from background
    const translation = await this._requestTranslation(cue.text);

    this._translatedCues.set(id, translation);

    if (this._settings.displayMode !== 'panel') {
      this._overlay.showSubtitle(cue.text, translation);
    }

    // Update side panel
    this._sidePanel.addCue(id, {
      startTime: cue.startTime,
      originalText: cue.text,
      translatedText: translation,
    });
  }

  async _requestTranslation(text) {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage(
          {
            type: 'translate',
            text,
            sourceLang: 'auto',
            targetLang: this._settings.targetLang,
            provider: this._settings.translationProvider,
            apiKey: this._apiKeys.translationApiKey || null,
          },
          (response) => {
            if (response?.success) {
              resolve(response.translation);
            } else {
              resolve(text); // Fallback to original
            }
          }
        );
      } else {
        resolve(text);
      }
    });
  }

  _translateBufferedCues(fromIndex) {
    const end = Math.min(fromIndex + CUE_BUFFER_AHEAD, this._cues.length);
    for (let i = fromIndex; i < end; i++) {
      if (!this._translatedCues.has(i)) {
        this._translateAndDisplay(i, this._cues[i]);
      }
    }
  }

  _onTimeUpdate() {
    const currentTime = this._video.currentTime;
    const cue = this._extractor.getCueAtTime(this._cues, currentTime);

    if (cue) {
      const index = this._cues.indexOf(cue);
      if (index !== this._currentCueIndex) {
        this._currentCueIndex = index;
        const translation = this._translatedCues.get(index) || '...';

        if (this._settings.displayMode !== 'panel') {
          this._overlay.showSubtitle(cue.text, translation);
        }

        this._sidePanel.setActiveCue(index);

        // Pre-translate upcoming cues
        this._translateBufferedCues(index + 1);
      }
    } else {
      if (this._currentCueIndex !== -1) {
        this._currentCueIndex = -1;
        this._overlay.hide();
      }
    }
  }

  destroy() {
    if (this._timeUpdateHandler) {
      this._video.removeEventListener('timeupdate', this._timeUpdateHandler);
    }
    this._extractor.destroy();
    this._overlay.destroy();
    this._sidePanel?.destroy();
    this._controlBtn?.destroy();
    this._speechRecognizer?.destroy();
  }
}

// --- Entry Point ---

const translators = new Map();

const detector = new VideoDetector({
  onVideoFound: (video) => {
    if (!translators.has(video)) {
      translators.set(video, new VideoTranslator(video));
    }
  },
  onVideoRemoved: (video) => {
    const translator = translators.get(video);
    if (translator) {
      translator.destroy();
      translators.delete(video);
    }
  },
});

detector.observe();
```

- [ ] **Step 2: Verify build compiles**

```bash
npm run build
```

Expected: Build succeeds with output in `dist/chrome/`

- [ ] **Step 3: Commit**

```bash
git add src/content/index.js
git commit -m "feat: add content script entry point wiring video detection, extraction, translation, and UI"
```

---

## Task 14: Popup Settings UI

**Files:**
- Create: `src/popup/popup.html`
- Create: `src/popup/popup.js`
- Create: `src/popup/popup.css`

- [ ] **Step 1: Create popup.html**

Create `src/popup/popup.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div class="popup">
    <div class="header">
      <h1>Dịch Video Song Ngữ</h1>
      <label class="toggle">
        <input type="checkbox" id="enabled" checked>
        <span class="slider"></span>
      </label>
    </div>

    <div class="section">
      <label class="label">Ngôn ngữ dịch</label>
      <select id="targetLang"></select>
    </div>

    <div class="section">
      <label class="label">Chế độ hiển thị</label>
      <select id="displayMode">
        <option value="overlay">Overlay trên video</option>
        <option value="panel">Side Panel</option>
        <option value="both">Cả hai</option>
      </select>
    </div>

    <div class="section">
      <label class="label">Dịch vụ dịch</label>
      <select id="translationProvider">
        <option value="google-free">Google Translate (Free)</option>
        <option value="deepl">DeepL (API Key)</option>
        <option value="openai">OpenAI GPT (API Key)</option>
        <option value="google-cloud">Google Cloud (API Key)</option>
      </select>
    </div>

    <div class="section api-key-section" id="translationKeySection" style="display:none">
      <label class="label">Translation API Key</label>
      <input type="password" id="translationApiKey" placeholder="Nhập API key...">
    </div>

    <div class="section">
      <label class="label">Nhận diện giọng nói (fallback)</label>
      <select id="sttProvider">
        <option value="web-speech">Web Speech API (Free)</option>
        <option value="whisper">OpenAI Whisper (API Key)</option>
      </select>
    </div>

    <div class="section api-key-section" id="whisperKeySection" style="display:none">
      <label class="label">Whisper API Key</label>
      <input type="password" id="whisperApiKey" placeholder="Nhập API key...">
    </div>

    <div class="section">
      <label class="label">Cỡ chữ phụ đề</label>
      <input type="range" id="fontSize" min="12" max="24" value="16">
      <span id="fontSizeValue">16px</span>
    </div>

    <div class="footer">
      <button id="saveBtn">Lưu cài đặt</button>
      <span id="status"></span>
    </div>
  </div>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create popup.css**

Create `src/popup/popup.css`:

```css
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  width: 320px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #1a1b2e;
  color: #e2e8f0;
}

.popup { padding: 16px; }

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #2d2e4a;
}

.header h1 { font-size: 14px; font-weight: 600; }

.toggle { position: relative; display: inline-block; width: 40px; height: 22px; }
.toggle input { opacity: 0; width: 0; height: 0; }
.toggle .slider {
  position: absolute; cursor: pointer; inset: 0;
  background: #444; border-radius: 22px; transition: 0.3s;
}
.toggle .slider::before {
  content: ''; position: absolute; height: 16px; width: 16px;
  left: 3px; bottom: 3px; background: #fff; border-radius: 50%; transition: 0.3s;
}
.toggle input:checked + .slider { background: #667eea; }
.toggle input:checked + .slider::before { transform: translateX(18px); }

.section { margin-bottom: 12px; }

.label {
  display: block; font-size: 11px; font-weight: 500;
  color: #8b8fa3; margin-bottom: 4px; text-transform: uppercase;
}

select, input[type="password"] {
  width: 100%; padding: 8px 10px; background: #252640;
  border: 1px solid #2d2e4a; border-radius: 6px; color: #e2e8f0;
  font-size: 12px; outline: none;
}

select:focus, input:focus { border-color: #667eea; }

input[type="range"] { width: calc(100% - 40px); vertical-align: middle; }

#fontSizeValue { font-size: 12px; color: #667eea; }

.footer {
  display: flex; align-items: center; gap: 10px;
  margin-top: 16px; padding-top: 12px; border-top: 1px solid #2d2e4a;
}

#saveBtn {
  background: linear-gradient(135deg, #667eea, #764ba2);
  border: none; color: #fff; padding: 8px 16px;
  border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500;
}

#saveBtn:hover { opacity: 0.9; }

#status { font-size: 11px; color: #48bb78; }
```

- [ ] **Step 3: Create popup.js**

Create `src/popup/popup.js`:

```javascript
import { SUPPORTED_LANGUAGES, DEFAULT_SETTINGS } from '../utils/constants.js';

const elements = {
  enabled: document.getElementById('enabled'),
  targetLang: document.getElementById('targetLang'),
  displayMode: document.getElementById('displayMode'),
  translationProvider: document.getElementById('translationProvider'),
  translationApiKey: document.getElementById('translationApiKey'),
  translationKeySection: document.getElementById('translationKeySection'),
  sttProvider: document.getElementById('sttProvider'),
  whisperApiKey: document.getElementById('whisperApiKey'),
  whisperKeySection: document.getElementById('whisperKeySection'),
  fontSize: document.getElementById('fontSize'),
  fontSizeValue: document.getElementById('fontSizeValue'),
  saveBtn: document.getElementById('saveBtn'),
  status: document.getElementById('status'),
};

// Populate language dropdown
SUPPORTED_LANGUAGES.forEach(lang => {
  const option = document.createElement('option');
  option.value = lang.code;
  option.textContent = `${lang.name} (${lang.code})`;
  elements.targetLang.appendChild(option);
});

// Show/hide API key sections
elements.translationProvider.addEventListener('change', () => {
  elements.translationKeySection.style.display =
    elements.translationProvider.value === 'google-free' ? 'none' : 'block';
});

elements.sttProvider.addEventListener('change', () => {
  elements.whisperKeySection.style.display =
    elements.sttProvider.value === 'web-speech' ? 'none' : 'block';
});

// Font size slider
elements.fontSize.addEventListener('input', () => {
  elements.fontSizeValue.textContent = `${elements.fontSize.value}px`;
});

// Load saved settings
chrome.storage.sync.get('settings', (data) => {
  const settings = { ...DEFAULT_SETTINGS, ...data.settings };
  elements.enabled.checked = settings.enabled;
  elements.targetLang.value = settings.targetLang;
  elements.displayMode.value = settings.displayMode;
  elements.translationProvider.value = settings.translationProvider;
  elements.sttProvider.value = settings.sttProvider;
  elements.fontSize.value = settings.fontSize;
  elements.fontSizeValue.textContent = `${settings.fontSize}px`;

  // Trigger visibility
  elements.translationProvider.dispatchEvent(new Event('change'));
  elements.sttProvider.dispatchEvent(new Event('change'));
});

// Load API keys from local storage (not sync)
chrome.storage.local.get(['translationApiKey', 'whisperApiKey'], (data) => {
  if (data.translationApiKey) elements.translationApiKey.value = data.translationApiKey;
  if (data.whisperApiKey) elements.whisperApiKey.value = data.whisperApiKey;
});

// Save
elements.saveBtn.addEventListener('click', () => {
  const settings = {
    enabled: elements.enabled.checked,
    targetLang: elements.targetLang.value,
    displayMode: elements.displayMode.value,
    translationProvider: elements.translationProvider.value,
    sttProvider: elements.sttProvider.value,
    fontSize: parseInt(elements.fontSize.value),
  };

  // Save settings to sync storage
  chrome.storage.sync.set({ settings }, () => {
    // Save API keys to local storage (secure)
    const apiKeys = {};
    if (elements.translationApiKey.value) apiKeys.translationApiKey = elements.translationApiKey.value;
    if (elements.whisperApiKey.value) apiKeys.whisperApiKey = elements.whisperApiKey.value;

    chrome.storage.local.set(apiKeys, () => {
      elements.status.textContent = 'Đã lưu!';
      setTimeout(() => { elements.status.textContent = ''; }, 2000);
    });
  });
});
```

- [ ] **Step 4: Build and verify**

```bash
npm run build
```

Expected: Build succeeds, `dist/chrome/popup/` contains HTML, JS, CSS

- [ ] **Step 5: Commit**

```bash
git add src/popup/
git commit -m "feat: add popup settings UI with language, provider, and display mode configuration"
```

---

## Task 15: Full Build Verification & Manual Test

- [ ] **Step 1: Run all unit tests**

```bash
npm test
```

Expected: All tests pass with coverage report

- [ ] **Step 2: Build for Chrome**

```bash
npm run build:chrome
```

Expected: `dist/chrome/` contains complete extension files

- [ ] **Step 3: Manual extension load test**

1. Open Chrome → `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" → select `dist/chrome/`
4. Extension should load without errors
5. Open a YouTube video with subtitles
6. Verify floating button appears on video
7. Verify subtitle overlay shows bilingual text

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve build and integration issues from manual testing"
```

---

## Task 16: Firefox & Edge Support

**Files:**
- Modify: `webpack.config.js`
- Create: `manifest.firefox.json`

- [ ] **Step 1: Create Firefox manifest**

Create `manifest.firefox.json`:

```json
{
  "manifest_version": 2,
  "name": "__MSG_extName__",
  "version": "1.0.0",
  "description": "__MSG_extDescription__",
  "default_locale": "vi",
  "permissions": ["storage", "activeTab", "<all_urls>"],
  "background": {
    "scripts": ["background/service-worker.js"]
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content/index.js"],
      "css": ["content/index.css"],
      "run_at": "document_idle"
    }
  ],
  "browser_action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
}
```

- [ ] **Step 2: Add Firefox and Edge webpack configs**

Add to `webpack.config.js` — duplicate `chromeConfig` as `firefoxConfig` with:
- Output to `dist/firefox/`
- Copy `manifest.firefox.json` as `manifest.json`

Add `edgeConfig` identical to Chrome but output to `dist/edge/`.

- [ ] **Step 3: Add build scripts to package.json**

```json
{
  "scripts": {
    "build:chrome": "webpack --config-name chrome",
    "build:firefox": "webpack --config-name firefox",
    "build:edge": "webpack --config-name edge",
    "build": "webpack",
    "test": "jest --coverage",
    "test:watch": "jest --watch"
  }
}
```

- [ ] **Step 4: Build all targets**

```bash
npm run build
```

Expected: `dist/chrome/`, `dist/firefox/`, `dist/edge/` all created successfully

- [ ] **Step 5: Commit**

```bash
git add manifest.firefox.json webpack.config.js package.json
git commit -m "feat: add Firefox (MV2) and Edge build targets"
```
