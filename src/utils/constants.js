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
  displayMode: 'both',
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

export const CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
export const RATE_LIMIT_DELAY_MS = 150;
export const RATE_LIMIT_BATCH_SIZE = 5;
export const TRANSLATION_TIMEOUT_MS = 5000;
export const MAX_RETRIES = 2;
export const CUE_BUFFER_AHEAD = 5;
