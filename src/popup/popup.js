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
  subtitleBackground: document.getElementById('subtitleBackground'),
  saveBtn: document.getElementById('saveBtn'),
  status: document.getElementById('status'),
};

SUPPORTED_LANGUAGES.forEach(lang => {
  const option = document.createElement('option');
  option.value = lang.code;
  option.textContent = `${lang.name} (${lang.code})`;
  elements.targetLang.appendChild(option);
});

elements.translationProvider.addEventListener('change', () => {
  elements.translationKeySection.style.display =
    elements.translationProvider.value === 'google-free' ? 'none' : 'block';
});

elements.sttProvider.addEventListener('change', () => {
  elements.whisperKeySection.style.display =
    elements.sttProvider.value === 'web-speech' ? 'none' : 'block';
});

elements.fontSize.addEventListener('input', () => {
  elements.fontSizeValue.textContent = `${elements.fontSize.value}px`;
});

chrome.storage.sync.get('settings', (data) => {
  const settings = { ...DEFAULT_SETTINGS, ...data.settings };
  elements.enabled.checked = settings.enabled;
  elements.targetLang.value = settings.targetLang;
  elements.displayMode.value = settings.displayMode;
  elements.translationProvider.value = settings.translationProvider;
  elements.sttProvider.value = settings.sttProvider;
  elements.fontSize.value = settings.fontSize;
  elements.fontSizeValue.textContent = `${settings.fontSize}px`;
  elements.subtitleBackground.checked = settings.subtitleBackground || false;

  elements.translationProvider.dispatchEvent(new Event('change'));
  elements.sttProvider.dispatchEvent(new Event('change'));
});

chrome.storage.local.get(['translationApiKey', 'whisperApiKey'], (data) => {
  if (data.translationApiKey) elements.translationApiKey.value = data.translationApiKey;
  if (data.whisperApiKey) elements.whisperApiKey.value = data.whisperApiKey;
});

elements.saveBtn.addEventListener('click', () => {
  const settings = {
    enabled: elements.enabled.checked,
    targetLang: elements.targetLang.value,
    displayMode: elements.displayMode.value,
    translationProvider: elements.translationProvider.value,
    sttProvider: elements.sttProvider.value,
    fontSize: parseInt(elements.fontSize.value),
    subtitleBackground: elements.subtitleBackground.checked,
  };

  chrome.storage.sync.set({ settings }, () => {
    const apiKeys = {};
    if (elements.translationApiKey.value) apiKeys.translationApiKey = elements.translationApiKey.value;
    if (elements.whisperApiKey.value) apiKeys.whisperApiKey = elements.whisperApiKey.value;

    chrome.storage.local.set(apiKeys, () => {
      elements.status.textContent = 'Đã lưu!';
      setTimeout(() => { elements.status.textContent = ''; }, 2000);
    });
  });
});
