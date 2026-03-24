import { VideoDetector } from './video-detector.js';
import { SubtitleExtractor } from './subtitle-extractor.js';
import { SpeechRecognizer } from './speech-recognizer.js';
import { OverlayUI } from './overlay-ui.js';
import { SidePanelUI } from './side-panel-ui.js';
import { ControlButton } from './control-button.js';
import { extractCaptionTracks, fetchCaptionCues, selectBestTrack } from './youtube-captions.js';
import { DEFAULT_SETTINGS, CUE_BUFFER_AHEAD } from '../utils/constants.js';
import '../styles/overlay.css';
import '../styles/side-panel.css';
import '../styles/control-button.css';

const LOG_PREFIX = '[DịchVideo]';

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

    console.log(LOG_PREFIX, 'VideoTranslator created for', video.src || video.currentSrc || '(no src yet)');
    this._loadSettings().then(() => this._loadApiKeys()).then(() => this._init());
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
          Object.assign(this._settings, changes.settings.newValue);
          console.log(LOG_PREFIX, 'Settings updated:', this._settings);
        }
      });
    }

    console.log(LOG_PREFIX, 'Init complete. Display mode:', this._settings.displayMode);
  }

  _tryExtractSubtitles() {
    console.log(LOG_PREFIX, 'Trying to extract subtitles...');
    const tracks = this._extractor.findSubtitleTracks(this._video);
    console.log(LOG_PREFIX, 'Found', tracks.length, 'TextTrack(s)');

    if (tracks.length > 0) {
      // Use first available subtitle track
      const track = tracks[0].track;
      track.mode = 'hidden'; // Enable but don't show native subtitles
      console.log(LOG_PREFIX, 'Using TextTrack:', track.label, track.language);

      // Wait for cues to load
      let cueCheckCount = 0;
      const checkCues = () => {
        cueCheckCount++;
        if (track.cues && track.cues.length > 0) {
          this._cues = this._extractor.getAllCues(track);
          console.log(LOG_PREFIX, 'Loaded', this._cues.length, 'cues from TextTrack');
          this._translateBufferedCues(0);
        } else if (cueCheckCount < 20) {
          setTimeout(checkCues, 500);
        } else {
          console.warn(LOG_PREFIX, 'TextTrack cues never loaded, falling back to platform subtitles');
          this._tryPlatformSubtitles();
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
    console.log(LOG_PREFIX, 'Trying platform-specific subtitles for:', url);

    if (this._extractor.isYouTube(url)) {
      console.log(LOG_PREFIX, 'YouTube detected, trying API captions first...');
      this._tryYouTubeApiCaptions();
    } else {
      // Fallback: speech recognition
      console.log(LOG_PREFIX, 'No platform match, trying speech recognition...');
      this._startSpeechRecognition();
    }
  }

  async _tryYouTubeApiCaptions(retryCount = 0) {
    // YouTube API approach: request caption tracks from the page-context script
    // (youtube-page-script.js running in world: "MAIN" can access YouTube globals)
    const tracks = await extractCaptionTracks();

    if (tracks.length === 0) {
      if (retryCount < 3) {
        console.log(LOG_PREFIX, `No caption tracks yet, retrying in 3s... (attempt ${retryCount + 1}/3)`);
        setTimeout(() => this._tryYouTubeApiCaptions(retryCount + 1), 3000);
        return;
      }

      console.warn(LOG_PREFIX, 'No YouTube caption tracks found after retries.');
      console.log(LOG_PREFIX, 'Falling back to DOM observation (requires CC to be ON)...');
      this._extractor.observeDomSubtitles(
        '.ytp-caption-segment',
        (text) => this._onLiveCue(text)
      );
      return;
    }

    // Select best track and fetch cues
    const bestTrack = selectBestTrack(tracks);
    if (!bestTrack) {
      console.warn(LOG_PREFIX, 'Could not select a caption track');
      return;
    }

    console.log(LOG_PREFIX, `Fetching captions: "${bestTrack.name}" (${bestTrack.languageCode})`);
    const cues = await fetchCaptionCues(bestTrack.baseUrl);

    if (cues.length === 0) {
      console.warn(LOG_PREFIX, 'No cues parsed from caption track');
      return;
    }

    // Load cues and start translating
    this._cues = cues;
    console.log(LOG_PREFIX, `✅ Loaded ${cues.length} cues from YouTube API! Starting translation...`);
    this._translateBufferedCues(0);
  }

  _startSpeechRecognition() {
    this._speechRecognizer = new SpeechRecognizer({
      onResult: ({ text }) => this._onLiveCue(text),
      onError: (err) => console.warn(LOG_PREFIX, 'STT error:', err.message),
    });

    if (this._speechRecognizer.isSupported()) {
      console.log(LOG_PREFIX, 'Starting speech recognition...');
      this._speechRecognizer.start();
    } else {
      console.warn(LOG_PREFIX, 'Speech recognition not supported in this browser');
    }
  }

  _onLiveCue(text) {
    const id = this._cueIdCounter++;
    const startTime = this._video.currentTime;
    const cue = { startTime, endTime: startTime + 5, text };
    this._cues.push(cue);
    console.log(LOG_PREFIX, `Live cue #${id}:`, text.substring(0, 60));
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

    // Update side panel (safe — addCue checks if panel body exists)
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
              console.warn(LOG_PREFIX, 'Translation message error:', chrome.runtime.lastError.message);
              resolve(text);
              return;
            }
            if (response?.success) {
              resolve(response.translation);
            } else {
              console.warn(LOG_PREFIX, 'Translation failed:', response?.error);
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
let currentUrl = window.location.href;

const detector = new VideoDetector({
  onVideoFound: (video) => {
    if (!translators.has(video)) {
      console.log(LOG_PREFIX, '🎥 Video found! Creating translator...');
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
console.log(LOG_PREFIX, '✅ Content script loaded on:', window.location.href);

// --- YouTube SPA Navigation Support ---
// YouTube uses pushState/replaceState for navigation — page doesn't reload
// We need to detect URL changes and re-scan for videos

function handleUrlChange() {
  const newUrl = window.location.href;
  if (newUrl !== currentUrl) {
    console.log(LOG_PREFIX, '🔄 URL changed:', currentUrl, '→', newUrl);
    currentUrl = newUrl;

    // Give YouTube time to render the new page
    setTimeout(() => {
      console.log(LOG_PREFIX, 'Re-scanning for videos after navigation...');
      // Destroy old translators (YouTube reuses video element, but subtitles change)
      translators.forEach((translator, video) => {
        translator.destroy();
      });
      translators.clear();
      // Re-scan
      detector.scan();
    }, 2000);
  }
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
window.addEventListener('yt-navigate-finish', () => {
  console.log(LOG_PREFIX, '🔄 YouTube navigation finished');
  handleUrlChange();
});
