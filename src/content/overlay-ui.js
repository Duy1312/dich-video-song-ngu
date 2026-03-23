export class OverlayUI {
  constructor(video) {
    this._video = video;
    this._container = null;
    this._originalEl = null;
    this._translatedEl = null;
  }

  init() {
    if (this._container) return;

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
