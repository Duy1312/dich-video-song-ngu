import { TranslationCache } from '../utils/cache.js';
import { RateLimiter } from '../utils/rate-limiter.js';
import { LanguageDetector } from '../utils/language-detector.js';
import { GoogleFreeProvider } from '../providers/google-free.js';
import { DeepLProvider } from '../providers/deepl.js';
import { OpenAIProvider } from '../providers/openai.js';
import { GoogleCloudProvider } from '../providers/google-cloud.js';
import { MAX_RETRIES } from '../utils/constants.js';

const cache = new TranslationCache();
const rateLimiter = new RateLimiter();
const langDetector = new LanguageDetector();

// Exported for testing purposes
export function clearCache() {
  cache.clear();
}

export function getProvider(providerName, apiKey = null) {
  switch (providerName) {
    case 'google-free': return new GoogleFreeProvider();
    case 'deepl': return new DeepLProvider(apiKey);
    case 'openai': return new OpenAIProvider(apiKey);
    case 'google-cloud': return new GoogleCloudProvider(apiKey);
    default: return new GoogleFreeProvider();
  }
}

async function translateWithRetry(provider, text, from, to, retries = MAX_RETRIES) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await provider.translate(text, from, to);
    } catch (error) {
      if (error.status === 429) rateLimiter.slowDown();
      if (i === retries) throw error;
      await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
    }
  }
}

export async function handleTranslateMessage(message) {
  const { text, sourceLang, targetLang } = message;
  try {
    const cached = cache.get(text, sourceLang, targetLang);
    if (cached) return { success: true, translation: cached, fromCache: true };

    const provider = getProvider(message.provider || 'google-free', message.apiKey);
    const translation = await rateLimiter.enqueue(() =>
      translateWithRetry(provider, text, sourceLang, targetLang)
    );
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
      return true;
    }
    if (message.type === 'detect-language') {
      handleDetectLanguageMessage(message).then(sendResponse);
      return true;
    }
  });
}
