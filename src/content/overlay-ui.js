export class OverlayUI {
  constructor(video) {
    this._video = video;
    this._container = null;
    this._originalEl = null;
    this._translatedEl = null;
    this._hideTimer = null;
  }

  init() {
    if (this._container) return;

    // Find the best parent to attach to
    const parent = this._findVideoContainer();
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
    this._container.appendChild(this._translatedEl);

    parent.appendChild(this._container);

    // Hide YouTube's native captions by injecting a style if not already done
    this._hideNativeCaptions();
  }

  _findVideoContainer() {
    // For YouTube: use the .html5-video-container for precise positioning
    const ytContainer = this._video.closest('.html5-video-container');
    if (ytContainer) return ytContainer;

    // For other sites: use video's parent
    return this._video.parentElement;
  }

  _hideNativeCaptions() {
    // CSS handles hiding via .ytp-caption-window-container { display:none }
    // But also try to disable tracks programmatically
    if (this._video.textTracks) {
      for (let i = 0; i < this._video.textTracks.length; i++) {
        const track = this._video.textTracks[i];
        if (track.mode === 'showing') {
          track.mode = 'hidden';
        }
      }
    }
  }

  showSubtitle(originalText, translatedText) {
    if (!this._container) this.init();

    // Clear any pending hide timer
    if (this._hideTimer) {
      clearTimeout(this._hideTimer);
      this._hideTimer = null;
    }

    this._originalEl.textContent = originalText || '';
    this._translatedEl.textContent = translatedText || '';

    // Show/hide original line depending on whether there's text
    this._originalEl.style.display = originalText ? '' : 'none';
    this._translatedEl.style.display = translatedText ? '' : 'none';

    this._container.style.display = '';
    this._container.style.opacity = '1';
  }

  hide() {
    if (this._container) {
      this._container.style.opacity = '0';
      this._hideTimer = setTimeout(() => {
        if (this._container) {
          this._container.style.display = 'none';
        }
      }, 150);
    }
  }

  setFontSize(size) {
    if (this._container) {
      this._container.style.setProperty('--dvsn-font-size', `${size}px`);
    }
  }

  setBackground(on) {
    if (this._container) {
      this._container.classList.toggle('dvsn-bg-on', on);
    }
  }

  destroy() {
    if (this._hideTimer) {
      clearTimeout(this._hideTimer);
    }
    if (this._container && this._container.parentElement) {
      this._container.parentElement.removeChild(this._container);
    }
    this._container = null;
    this._originalEl = null;
    this._translatedEl = null;
  }
}
