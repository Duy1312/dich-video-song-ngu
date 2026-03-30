export class OverlayUI {
  constructor(video) {
    this._video = video;
    this._container = null;
    this._originalEl = null;
    this._translatedEl = null;
    this._hideTimer = null;
  }

  init() {
    if (this._container && this._container.isConnected) return;

    // Clean up old detached container if any
    if (this._container) {
      this._container = null;
      this._originalEl = null;
      this._translatedEl = null;
    }

    // Find the best parent to attach to
    const parent = this._findVideoContainer();
    if (!parent) {
      console.warn('[DịchVideo][Overlay] Could not find video container');
      return;
    }
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

    // Start hidden — showSubtitle() will make it visible
    this._container.style.display = 'none';

    parent.appendChild(this._container);

    console.log('[DịchVideo][Overlay] Initialized, attached to', parent.id || parent.className);
  }

  _findVideoContainer() {
    // For YouTube: use #movie_player so our overlay is at the same DOM level
    // as YouTube's own overlays (captions, controls, gradient).
    // .html5-video-container creates its own stacking context,
    // trapping our z-index — overlay would render BEHIND YouTube's layers.
    const ytPlayer = this._video.closest('#movie_player');
    if (ytPlayer) return ytPlayer;

    // For other sites: use video's parent
    return this._video.parentElement;
  }

  _hideNativeCaptions() {
    // CSS handles hiding via .ytp-caption-window-container { opacity:0 }
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

  /**
   * Ensure the overlay container is still in the DOM.
   * YouTube may remove it during re-renders.
   */
  _ensureAttached() {
    if (!this._container || !this._container.isConnected) {
      console.log('[DịchVideo][Overlay] Container detached, re-attaching...');
      this._container = null;
      this._originalEl = null;
      this._translatedEl = null;
      this.init();
    }
  }

  showSubtitle(originalText, translatedText) {
    this._ensureAttached();
    if (!this._container) return;

    // Clear any pending hide timer
    if (this._hideTimer) {
      clearTimeout(this._hideTimer);
      this._hideTimer = null;
    }

    // Direct text swap — no animation.
    // The settle timer already batches word-by-word updates,
    // so changes are infrequent (~every 1-2s) and direct swap is clean.
    this._originalEl.textContent = originalText || '';
    this._translatedEl.textContent = translatedText || '';

    // Show/hide original line depending on whether there's text
    this._originalEl.style.display = originalText ? '' : 'none';
    this._translatedEl.style.display = translatedText ? '' : 'none';

    this._container.style.display = '';
    this._container.style.opacity = '1';
  }

  /**
   * Update only the translation line without touching the original.
   * Prevents double-update flicker when translation arrives after settle.
   */
  updateTranslation(translatedText) {
    this._ensureAttached();
    if (!this._translatedEl) return;
    this._translatedEl.textContent = translatedText || '';
    this._translatedEl.style.display = translatedText ? '' : 'none';
  }

  hide() {
    if (this._container && this._container.isConnected) {
      this._container.style.opacity = '0';
      this._hideTimer = setTimeout(() => {
        if (this._container && this._container.isConnected) {
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
