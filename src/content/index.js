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

    if (this._settings.displayMode === 'overlay' || this._settings.displayMode === 'both') {
      this._controlBtn.setState({ overlayOn: true });
    }
    if (this._settings.displayMode === 'panel' || this._settings.displayMode === 'both') {
      this._controlBtn.setState({ panelOn: true });
      this._sidePanel.init();
    }

    this._tryExtractSubtitles();

    this._timeUpdateHandler = () => {
      if (this._debounceTimer) clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => this._onTimeUpdate(), 200);
    };
    this._video.addEventListener('timeupdate', this._timeUpdateHandler);

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
      const track = tracks[0].track;
      track.mode = 'hidden';

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
      this._tryPlatformSubtitles();
    }
  }

  _tryPlatformSubtitles() {
    const url = window.location.href;

    if (this._extractor.isYouTube(url)) {
      this._extractor.observeDomSubtitles(
        '.ytp-caption-segment',
        (text) => this._onLiveCue(text)
      );
    } else {
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
    if (this._settings.displayMode !== 'panel') {
      this._overlay.showSubtitle(cue.text, '...');
    }

    const translation = await this._requestTranslation(cue.text);

    this._translatedCues.set(id, translation);

    if (this._settings.displayMode !== 'panel') {
      this._overlay.showSubtitle(cue.text, translation);
    }

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
              resolve(text);
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
