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
