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
