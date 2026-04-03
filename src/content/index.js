import { VideoDetector } from './video-detector.js';
import { SubtitleExtractor } from './subtitle-extractor.js';
import { SpeechRecognizer } from './speech-recognizer.js';
import { AudioCaptureSTT } from './audio-capture-stt.js';
import { OverlayUI } from './overlay-ui.js';
import { SidePanelUI } from './side-panel-ui.js';
import { ControlButton } from './control-button.js';
import { requestActivateCaptions } from './youtube-captions.js';
import { detectPlatform } from './platform-registry.js';
import { DEFAULT_SETTINGS, CUE_BUFFER_AHEAD } from '../utils/constants.js';
import '../styles/overlay.css';
import '../styles/side-panel.css';
import '../styles/control-button.css';

const LOG_PREFIX = '[DịchVideo]';

class VideoTranslator {
  constructor(video, options = {}) {
    this._video = video;
    this._settings = { ...DEFAULT_SETTINGS };
    this._extractor = new SubtitleExtractor();
    this._overlay = new OverlayUI(video);
    this._sidePanel = null;
    this._controlBtn = null;
    this._speechRecognizer = null;
    this._audioCapture = null;
    this._platform = detectPlatform(window.location.href);
    this._cues = [];
    this._translatedCues = new Map();
    this._currentCueIndex = -1;
    this._cueIdCounter = 0;
    this._currentCueId = -1;
    this._pendingCue = null;
    this._settleTimer = null;
    this._lastTranslation = '';
    this._speculativeText = null;
    this._speculativePromise = null;
    this._timeUpdateHandler = null;
    this._debounceTimer = null;
    this._sttFallbackTimer = null;
    this._liveHideTimer = null;
    this._trackFallbackTimer = null;
    this._isLiveMode = false;
    this._captionSource = null;
    this._domCaptionCount = 0;
    this._platformFallbackStarted = false;
    this._destroyed = false;
    this._apiKeys = {};
    this._isSpaNavigation = options.isSpaNavigation || false;

    console.log(LOG_PREFIX, 'VideoTranslator created for', video.src || video.currentSrc || '(no src yet)');
    this._loadSettings().then(() => this._loadApiKeys()).then(() => {
      if (!this._destroyed) this._init();
    });
  }

  async _loadSettings() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.sync.get('settings', (data) => {
          if (data.settings) Object.assign(this._settings, data.settings);
          console.log(LOG_PREFIX, 'Settings loaded:', this._settings);
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
    if (!this._settings.enabled) {
      console.log(LOG_PREFIX, 'Extension disabled in settings, skipping init');
      return;
    }

    console.log(LOG_PREFIX, 'Initializing UI components...');

    // Init UI components
    this._overlay.init();
    this._overlay.setFontSize(this._settings.fontSize || 18);
    this._overlay.setBackground(this._settings.subtitleBackground || false);
    this._overlay.setWordTranslateCallback((word, targetLang) =>
      this._requestWordTranslation(word, targetLang)
    );
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
        if (on) {
          this._sidePanel.init();
          this._sidePanel.show();
        } else {
          this._sidePanel.hide();
        }
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
          const newSettings = changes.settings.newValue;
          Object.assign(this._settings, newSettings);
          console.log(LOG_PREFIX, 'Settings updated:', this._settings);

          // Apply font size change immediately
          if (newSettings.fontSize) {
            this._overlay.setFontSize(newSettings.fontSize);
          }
          // Apply background toggle
          if (newSettings.subtitleBackground !== undefined) {
            this._overlay.setBackground(newSettings.subtitleBackground);
          }
        }
      });
    }

    console.log(LOG_PREFIX, 'Init complete. Display mode:', this._settings.displayMode);
  }

  _tryExtractSubtitles() {
    console.log(LOG_PREFIX, 'Trying to extract subtitles...');
    console.log(LOG_PREFIX, 'Platform:', this._platform?.name || 'unknown');

    // Use watchForTracks — handles both immediate and late-appearing TextTracks
    this._extractor.watchForTracks(this._video, (tracks) => {
      if (this._destroyed) return; // zombie guard

      // Guard: watchForTracks may call back with empty array on timeout
      if (!tracks || tracks.length === 0) {
        console.log(LOG_PREFIX, 'watchForTracks returned no tracks, trying platform subtitles...');
        this._startPlatformFallback();
        return;
      }

      const track = tracks[0].track;
      track.mode = 'hidden';
      console.log(LOG_PREFIX, 'Using TextTrack:', track.label, track.language);

      let cueCheckCount = 0;
      const checkCues = () => {
        if (this._destroyed) return; // zombie guard
        cueCheckCount++;
        if (track.cues && track.cues.length > 0) {
          this._cues = this._extractor.getAllCues(track);
          console.log(LOG_PREFIX, 'Loaded', this._cues.length, 'cues from TextTrack');
          this._translateBufferedCues(0);
        } else if (cueCheckCount < 20) {
          setTimeout(checkCues, 500);
        } else {
          console.warn(LOG_PREFIX, 'TextTrack cues never loaded, falling back to platform subtitles');
          this._startPlatformFallback();
        }
      };
      checkCues();
    }, 8000);

    // Safety net: if neither watchForTracks nor platform started after 9s
    this._trackFallbackTimer = setTimeout(() => {
      if (this._destroyed) return;
      if (this._cues.length === 0 && !this._isLiveMode && !this._platformFallbackStarted) {
        console.log(LOG_PREFIX, 'No subtitles after 9s, trying platform subtitles...');
        this._startPlatformFallback();
      }
    }, 9000);
  }

  /**
   * Start platform-specific subtitle detection. Guarded against double-calls.
   */
  _startPlatformFallback() {
    if (this._platformFallbackStarted) return;
    this._platformFallbackStarted = true;
    this._tryPlatformSubtitles();
  }

  _tryPlatformSubtitles() {
    const url = window.location.href;
    console.log(LOG_PREFIX, 'Trying platform-specific subtitles for:', url);

    if (this._platform) {
      console.log(LOG_PREFIX, `Platform "${this._platform.name}" detected, using config...`);

      if (this._platform.name === 'youtube') {
        // YouTube needs special handling: activate captions via player API
        this._tryYouTubeApiCaptions();
      } else {
        // Generic platform: observe DOM captions using platform config
        this._isLiveMode = true;
        this._captionSource = null;
        this._domCaptionCount = 0;

        this._extractor.observeDomSubtitles(
          this._platform,
          (text) => {
            if (this._destroyed) return; // zombie guard
            this._domCaptionCount++;
            this._captionSource = 'dom';
            this._onLiveCue(text);
          }
        );

        // Fallback to STT if no DOM captions after 15s
        this._sttFallbackTimer = setTimeout(() => {
          if (this._destroyed) return; // zombie guard
          if (this._domCaptionCount === 0) {
            console.log(LOG_PREFIX, '⚠️ No platform captions after 15s, falling back to STT...');
            this._startSpeechRecognition();
          }
        }, 15000);
      }
    } else {
      // No platform match — try speech recognition / audio capture
      console.log(LOG_PREFIX, 'No platform match, trying speech recognition...');
      this._startSpeechRecognition();
    }
  }

  async _tryYouTubeApiCaptions() {
    // Strategy: ask the page script (world: MAIN) to programmatically
    // activate captions via YouTube's player API. Then we observe the DOM
    // for caption segments. This is the most reliable approach because
    // YouTube's timedtext API returns empty responses from extensions.

    // Detect if CC is already active — this means we're in SPA navigation
    // and YouTube's caption renderer needs a track refresh via setOption.
    const ccBtn = document.querySelector('.ytp-subtitles-button');
    const ccAlreadyOn = ccBtn && ccBtn.getAttribute('aria-pressed') === 'true';
    const needsForceToggle = this._isSpaNavigation || ccAlreadyOn;

    console.log(LOG_PREFIX, 'Requesting caption activation via YouTube player API...',
      needsForceToggle ? `(force toggle: spa=${this._isSpaNavigation}, ccOn=${ccAlreadyOn})` : '(initial load)');

    // Attach DOM observer BEFORE sending activation request.
    // This ensures we catch caption text as soon as YouTube starts rendering,
    // especially during force toggle (CC off → 800ms → CC on).
    this._isLiveMode = true;
    this._captionSource = null;
    this._domCaptionCount = 0;

    this._extractor.observeDomSubtitles(
      this._platform,
      (text) => {
        if (this._destroyed) return; // zombie guard
        this._domCaptionCount++;

        // If STT fallback was started but DOM captions came back, stop STT
        if (this._captionSource === 'stt' && this._speechRecognizer) {
          console.log(LOG_PREFIX, '🔄 DOM captions recovered, stopping speech recognition');
          this._speechRecognizer.destroy();
          this._speechRecognizer = null;
        }

        this._captionSource = 'dom';
        this._onLiveCue(text);
      }
    );

    const result = await requestActivateCaptions(12000, needsForceToggle);
    if (this._destroyed) return; // zombie guard after await

    if (result && result.activated) {
      const track = result.selectedTrack;
      console.log(LOG_PREFIX, `✅ Captions activated: "${track.name}" (${track.languageCode})`);
      console.log(LOG_PREFIX, 'Starting DOM observation for caption segments...');
    } else {
      console.warn(LOG_PREFIX, 'Could not activate captions via player API');
    }

    // Fallback: if no captions detected after 15s, start speech recognition
    // (YouTube SPA navigation can cause slow caption rendering)
    this._sttFallbackTimer = setTimeout(() => {
      if (this._destroyed) return; // zombie guard
      if (this._domCaptionCount === 0) {
        console.log(LOG_PREFIX, '⚠️ No captions detected after 15s, falling back to speech recognition...');
        this._startSpeechRecognition();
      }
    }, 15000);
  }

  _startSpeechRecognition() {
    this._isLiveMode = true;
    this._captionSource = 'stt';

    // Try AudioCaptureSTT (Whisper) first if API key available and user prefers it
    if (this._settings.sttProvider === 'whisper' && this._apiKeys.whisperApiKey) {
      this._audioCapture = new AudioCaptureSTT({
        onResult: ({ text }) => {
          if (this._captionSource === 'stt') {
            this._onLiveCue(text);
          }
        },
        onError: (err) => {
          console.warn(LOG_PREFIX, 'Audio capture error:', err.message, '— falling back to Web Speech');
          this._audioCapture = null;
          this._startWebSpeechFallback();
        },
        apiKey: this._apiKeys.whisperApiKey,
        language: this._settings.targetLang,
      });

      if (this._audioCapture.isSupported()) {
        console.log(LOG_PREFIX, 'Starting Whisper audio capture STT...');
        this._audioCapture.start(this._video);
        return;
      } else {
        console.warn(LOG_PREFIX, 'Audio capture not supported, falling back to Web Speech');
        this._audioCapture = null;
      }
    }

    this._startWebSpeechFallback();
  }

  _startWebSpeechFallback() {
    this._speechRecognizer = new SpeechRecognizer({
      onResult: ({ text }) => {
        // Only process if STT is still the active source
        if (this._captionSource === 'stt') {
          this._onLiveCue(text);
        }
      },
      onError: (err) => console.warn(LOG_PREFIX, 'STT error:', err.message),
    });

    if (this._speechRecognizer.isSupported()) {
      console.log(LOG_PREFIX, 'Starting Web Speech API recognition...');
      this._speechRecognizer.start();
    } else {
      console.warn(LOG_PREFIX, 'Speech recognition not supported in this browser');
    }
  }

  _onLiveCue(text) {
    if (this._destroyed) return; // zombie guard
    // YouTube auto-captions build up word-by-word, firing rapidly.
    // Strategy: SPECULATIVE PRE-TRANSLATION
    //   1. Fire translation immediately on first text (don't wait for settle)
    //   2. If text changes during settle window, fire another translation
    //   3. Whichever finishes first for the final text wins
    // This eliminates the 350ms + API latency gap between original and translated.

    console.log(LOG_PREFIX, `Caption detected [${this._captionSource || 'unknown'}]:`, text.substring(0, 60));

    // Cancel any pending settle timer
    if (this._settleTimer) {
      clearTimeout(this._settleTimer);
    }
    // Cancel any pending auto-hide timer
    if (this._liveHideTimer) {
      clearTimeout(this._liveHideTimer);
    }

    const isNewCue = !this._pendingCue;

    // Clear stale translation when a genuinely new cue starts,
    // so the overlay doesn't show the previous cue's Vietnamese text.
    // Show '...' placeholder so the translated line stays visible while loading.
    if (isNewCue) {
      this._lastTranslation = '...';
    }

    // Update the current pending cue text (don't create new cue each word)
    if (!this._pendingCue) {
      this._pendingCue = {
        id: this._cueIdCounter++,
        startTime: this._video.currentTime,
        text,
      };
    } else {
      this._pendingCue.text = text;
    }

    this._currentCueId = this._pendingCue.id;

    // Show original text IMMEDIATELY (before settle) — user sees something right away
    if (this._settings.displayMode !== 'panel') {
      this._overlay.showSubtitle(text, this._lastTranslation || '...');
    }

    // SPECULATIVE PRE-TRANSLATION: fire translation right away on first text
    // and also on significant text changes (>10 chars different).
    // This starts the API call ~350ms earlier than waiting for settle.
    const pendingId = this._pendingCue.id;
    if (isNewCue || !this._speculativeText ||
        Math.abs(text.length - this._speculativeText.length) > 10) {
      this._speculativeText = text;
      this._speculativePromise = this._requestTranslation(text);
      // When speculative result arrives, update overlay immediately.
      // Show partial translation right away — don't wait for settle.
      // Even if text has since changed slightly (more words added),
      // a partial translation is better than nothing for 1+ second.
      this._speculativePromise.then(translation => {
        if (this._currentCueId === pendingId && this._settings.displayMode !== 'panel') {
          this._overlay.updateTranslation(translation);
          this._lastTranslation = translation;
        }
      }).catch(() => {}); // Ignore speculative failures
    }

    // Wait for text to settle before finalizing
    // 350ms is enough — YouTube captions stabilize within ~200-300ms
    this._settleTimer = setTimeout(() => {
      const cue = {
        startTime: this._pendingCue.startTime,
        endTime: this._video.currentTime + 3,
        text: this._pendingCue.text,
      };
      const id = this._pendingCue.id;
      const speculativeText = this._speculativeText;
      const speculativePromise = this._speculativePromise;
      this._cues.push(cue);
      this._pendingCue = null;
      this._speculativeText = null;
      this._speculativePromise = null;
      console.log(LOG_PREFIX, `Settled cue #${id}:`, cue.text.substring(0, 60));

      // Show original text immediately when settled.
      if (this._settings.displayMode !== 'panel') {
        this._overlay.showSubtitle(cue.text, this._lastTranslation || '...');
      }

      // If the settled text is the same as what we speculatively translated,
      // reuse that result instead of making another API call.
      if (speculativeText === cue.text && speculativePromise) {
        console.log(LOG_PREFIX, `Reusing speculative translation for cue #${id}`);
        speculativePromise.then(translation => {
          this._translatedCues.set(id, translation);
          this._lastTranslation = translation;
          if (id >= this._currentCueId && this._settings.displayMode !== 'panel') {
            this._overlay.updateTranslation(translation);
          }
          if (this._sidePanel) {
            try {
              this._sidePanel.addCue(id, {
                startTime: cue.startTime,
                originalText: cue.text,
                translatedText: translation,
              });
              this._sidePanel.setActiveCue(id);
            } catch (e) {}
          }
        }).catch(() => {
          // Speculative failed, do a fresh translation
          this._translateSettledCue(id, cue);
        });
      } else {
        // Text changed significantly after speculative — translate final text
        this._translateSettledCue(id, cue);
      }

      // Auto-hide overlay after 8s if no new caption arrives
      this._liveHideTimer = setTimeout(() => {
        console.log(LOG_PREFIX, 'Auto-hiding overlay (no new caption for 8s)');
        this._overlay.hide();
      }, 8000);
    }, 350);
  }

  async _translateSettledCue(id, cue) {
    // Request translation from background
    const translation = await this._requestTranslation(cue.text);

    this._translatedCues.set(id, translation);
    this._lastTranslation = translation;

    // Only update overlay if this is still the latest cue.
    // Only update the TRANSLATION line — don't re-set the original
    // (it was already set when the cue settled).
    if (id >= this._currentCueId && this._settings.displayMode !== 'panel') {
      this._overlay.updateTranslation(translation);
    }

    // Update side panel
    if (this._sidePanel) {
      try {
        this._sidePanel.addCue(id, {
          startTime: cue.startTime,
          originalText: cue.text,
          translatedText: translation,
        });
      } catch (e) {
        // Panel not visible, ignore
      }
    }
  }

  async _requestTranslation(text) {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        console.log(LOG_PREFIX, '📤 Sending translate request:', text.substring(0, 40), '→', this._settings.targetLang);
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
            if (chrome.runtime.lastError) {
              console.warn(LOG_PREFIX, '❌ Translation message error:', chrome.runtime.lastError.message);
              resolve(text);
              return;
            }
            if (response?.success) {
              console.log(LOG_PREFIX, '✅ Translation received:', response.translation.substring(0, 40));
              resolve(response.translation);
            } else {
              console.warn(LOG_PREFIX, '❌ Translation failed:', response?.error, 'response:', response);
              resolve(text); // Fallback to original
            }
          }
        );
      } else {
        console.warn(LOG_PREFIX, '❌ chrome.runtime not available');
        resolve(text);
      }
    });
  }

  /**
   * Translate a single word for the hover tooltip.
   * @param {string} word - The word to translate
   * @param {string} targetLang - Target language code (e.g., 'vi' or 'en')
   * @returns {Promise<string>} The translated word
   */
  async _requestWordTranslation(word, targetLang) {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage(
          {
            type: 'translate',
            text: word,
            sourceLang: 'auto',
            targetLang,
            provider: this._settings.translationProvider,
            apiKey: this._apiKeys.translationApiKey || null,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              resolve(word);
              return;
            }
            if (response?.success) {
              resolve(response.translation);
            } else {
              resolve(word);
            }
          }
        );
      } else {
        resolve(word);
      }
    });
  }

  _translateBufferedCues(fromIndex) {
    const end = Math.min(fromIndex + CUE_BUFFER_AHEAD, this._cues.length);
    for (let i = fromIndex; i < end; i++) {
      if (!this._translatedCues.has(i)) {
        this._translateSettledCue(i, this._cues[i]);
      }
    }
  }

  _onTimeUpdate() {
    // Skip time-based cue matching when using live DOM captions.
    // Live cues are driven by _onLiveCue → _translateSettledCue,
    // not by time-based lookup. The _onTimeUpdate hide() was killing
    // the overlay after endTime expired (3s) even though new captions
    // were still being observed.
    if (this._isLiveMode) return;

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

        if (this._sidePanel) {
          try { this._sidePanel.setActiveCue(index); } catch (e) { /* ignore */ }
        }

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
    console.log(LOG_PREFIX, 'Destroying VideoTranslator');
    this._destroyed = true;
    if (this._settleTimer) clearTimeout(this._settleTimer);
    if (this._liveHideTimer) clearTimeout(this._liveHideTimer);
    if (this._sttFallbackTimer) clearTimeout(this._sttFallbackTimer);
    if (this._trackFallbackTimer) clearTimeout(this._trackFallbackTimer);
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    if (this._timeUpdateHandler) {
      this._video.removeEventListener('timeupdate', this._timeUpdateHandler);
    }
    this._extractor.destroy();
    this._overlay.destroy();
    this._sidePanel?.destroy();
    this._controlBtn?.destroy();
    this._speechRecognizer?.destroy();
    this._audioCapture?.destroy();
  }
}

// --- Entry Point ---

const translators = new Map();
let currentVideoId = _extractYouTubeVideoId(window.location.href);
let isSpaNav = false;

const detector = new VideoDetector({
  onVideoFound: (video) => {
    if (!translators.has(video)) {
      console.log(LOG_PREFIX, '🎥 Video found! Creating translator...', isSpaNav ? '(SPA nav)' : '(initial)');
      translators.set(video, new VideoTranslator(video, { isSpaNavigation: isSpaNav }));
      isSpaNav = false; // Reset after use
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
console.log(LOG_PREFIX, '✅ Content script loaded on:', window.location.href);

// --- YouTube SPA Navigation Support ---
// YouTube uses pushState/replaceState for navigation — page doesn't reload.
// We need to detect when the VIDEO changes (not just URL parameters).
// YouTube frequently calls replaceState to update &t=, &list=, etc.
// which would cause false re-initializations and kill active translators.

/**
 * Extract YouTube video ID from URL.
 * Returns null for non-watch pages (home, search, channel, etc.)
 */
function _extractYouTubeVideoId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com') && u.pathname === '/watch') {
      return u.searchParams.get('v') || null;
    }
    // Shorts
    const shortsMatch = u.pathname.match(/\/shorts\/([^/?]+)/);
    if (shortsMatch) return shortsMatch[1];
  } catch (e) {}
  return null;
}

/**
 * Check if navigation represents a real page/video change.
 * For YouTube: only react when video ID changes.
 * For other sites: react to any URL change.
 */
function _isSignificantNavigation(oldUrl, newUrl) {
  if (oldUrl === newUrl) return false;

  const isYouTube = /youtube\.com/.test(window.location.hostname);
  if (!isYouTube) return true;

  const oldId = _extractYouTubeVideoId(oldUrl);
  const newId = _extractYouTubeVideoId(newUrl);

  // If video ID didn't change, it's just a parameter update (t=, list=, etc.)
  if (oldId && newId && oldId === newId) {
    console.log(LOG_PREFIX, '🔄 URL changed but same video ID, ignoring:', newUrl.split('?')[1]?.substring(0, 40));
    return false;
  }

  return true;
}

let navDebounceTimer = null;
let lastCheckedUrl = window.location.href;

function handleUrlChange() {
  const newUrl = window.location.href;
  if (!_isSignificantNavigation(lastCheckedUrl, newUrl)) return;

  console.log(LOG_PREFIX, '🔄 Video changed:',
    _extractYouTubeVideoId(lastCheckedUrl), '→', _extractYouTubeVideoId(newUrl) || '(non-watch page)');
  lastCheckedUrl = newUrl;
  currentVideoId = _extractYouTubeVideoId(newUrl);

  // Debounce: cancel any pending re-scan from a previous rapid navigation
  if (navDebounceTimer) {
    clearTimeout(navDebounceTimer);
    console.log(LOG_PREFIX, 'Debounced previous re-scan timer');
  }

  // Give YouTube time to render the new page
  navDebounceTimer = setTimeout(() => {
    navDebounceTimer = null;
    console.log(LOG_PREFIX, 'Re-scanning for videos after navigation...');
    // Mark next translator as SPA navigation (force CC toggle)
    isSpaNav = true;
    // Destroy old translators (YouTube reuses video element, but subtitles change)
    translators.forEach((translator, video) => {
      translator.destroy();
    });
    translators.clear();
    // Reset tracked videos so scan() treats reused <video> elements as new
    detector.reset();
    // Re-scan
    detector.scan();
  }, 2000);
}

// Listen for popstate (back/forward buttons)
window.addEventListener('popstate', handleUrlChange);

// Override pushState and replaceState to detect YouTube SPA navigation
const originalPushState = history.pushState.bind(history);
const originalReplaceState = history.replaceState.bind(history);

history.pushState = function(...args) {
  originalPushState(...args);
  setTimeout(handleUrlChange, 100);
};

history.replaceState = function(...args) {
  originalReplaceState(...args);
  setTimeout(handleUrlChange, 100);
};

// Also listen for yt-navigate-finish (YouTube-specific event)
// YouTube fires this on INITIAL page load too, not just SPA navigation.
// Ignore it for the first 5 seconds after content script loads.
const scriptLoadTime = Date.now();
window.addEventListener('yt-navigate-finish', () => {
  const elapsed = Date.now() - scriptLoadTime;
  if (elapsed < 5000) {
    console.log(LOG_PREFIX, '🔄 YouTube navigation finished (ignored — initial load, elapsed:', elapsed, 'ms)');
    return;
  }
  console.log(LOG_PREFIX, '🔄 YouTube navigation finished (elapsed:', elapsed, 'ms)');
  handleUrlChange();
});
