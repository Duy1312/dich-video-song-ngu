export class OverlayUI {
  constructor(video) {
    this._video = video;
    this._container = null;
    this._originalEl = null;
    this._translatedEl = null;
    this._tooltipEl = null;
    this._hideTimer = null;
    this._hoverTimer = null;
    this._onWordTranslate = null;
    this._currentOriginalText = '';
    this._currentTranslatedText = '';
  }

  /**
   * Set callback for translating individual words on hover.
   * @param {(word: string, targetLang: string) => Promise<string>} fn
   */
  setWordTranslateCallback(fn) {
    this._onWordTranslate = fn;
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

    // Create tooltip element (appended to body so it's not clipped by overlay)
    this._createTooltip();

    console.log('[DịchVideo][Overlay] Initialized, attached to', parent.id || parent.className);
  }

  _createTooltip() {
    if (this._tooltipEl && this._tooltipEl.isConnected) return;
    this._tooltipEl = document.createElement('div');
    this._tooltipEl.className = 'dvsn-tooltip';
    document.body.appendChild(this._tooltipEl);
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

  /**
   * Render text as clickable word spans inside an element.
   * @param {HTMLElement} element - The container element
   * @param {string} text - The text to render
   * @param {string} lang - Language code ('original' or 'translated')
   */
  _renderWords(element, text, lang) {
    element.innerHTML = '';
    if (!text) return;

    // Split by whitespace, keeping whitespace as separate tokens
    const tokens = text.split(/(\s+)/);
    tokens.forEach(token => {
      if (/^\s+$/.test(token)) {
        // Whitespace — plain text node
        element.appendChild(document.createTextNode(token));
      } else if (token.length > 0) {
        // Word — wrap in span
        const span = document.createElement('span');
        span.className = 'dvsn-word';
        span.textContent = token;
        span.dataset.lang = lang;
        span.addEventListener('mouseenter', () => this._onWordEnter(token, lang, span));
        span.addEventListener('mouseleave', () => this._onWordLeave());
        element.appendChild(span);
      }
    });
  }

  showSubtitle(originalText, translatedText) {
    this._ensureAttached();
    if (!this._container) return;

    // Clear any pending hide timer
    if (this._hideTimer) {
      clearTimeout(this._hideTimer);
      this._hideTimer = null;
    }

    // Store current texts for reverse lookup
    this._currentOriginalText = originalText || '';
    this._currentTranslatedText = translatedText || '';

    // Render words as hoverable spans
    if (originalText) {
      this._renderWords(this._originalEl, originalText, 'original');
    } else {
      this._originalEl.innerHTML = '';
    }

    if (translatedText) {
      this._renderWords(this._translatedEl, translatedText, 'translated');
    } else {
      this._translatedEl.innerHTML = '';
    }

    // Show/hide lines depending on whether there's text
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
    this._currentTranslatedText = translatedText || '';

    if (translatedText) {
      this._renderWords(this._translatedEl, translatedText, 'translated');
    } else {
      this._translatedEl.innerHTML = '';
    }
    this._translatedEl.style.display = translatedText ? '' : 'none';
  }

  /**
   * Handle mouse entering a word span — debounce then translate.
   */
  _onWordEnter(word, lang, spanEl) {
    // Cancel any pending hover
    if (this._hoverTimer) {
      clearTimeout(this._hoverTimer);
    }

    // Strip punctuation from word for translation
    const cleanWord = word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    if (!cleanWord) return;

    // Debounce: wait 150ms before showing tooltip
    this._hoverTimer = setTimeout(async () => {
      if (!this._onWordTranslate) {
        // No callback — just show the word itself
        this._showTooltip(cleanWord, spanEl);
        return;
      }

      // Determine target lang: original word → translate to target lang (vi)
      //                        translated word → translate back to source (en)
      const targetLang = lang === 'original' ? 'vi' : 'en';

      // Show loading state
      this._showTooltip('...', spanEl);

      try {
        const translation = await this._onWordTranslate(cleanWord, targetLang);
        // Only show if tooltip is still for this word
        if (this._tooltipEl && this._tooltipEl.dataset.word === cleanWord) {
          this._showTooltip(translation, spanEl, cleanWord);
        }
      } catch (e) {
        // On error, just show the word
        this._showTooltip(cleanWord, spanEl);
      }
    }, 150);
  }

  /**
   * Handle mouse leaving a word span — hide tooltip.
   */
  _onWordLeave() {
    if (this._hoverTimer) {
      clearTimeout(this._hoverTimer);
      this._hoverTimer = null;
    }
    this._hideTooltip();
  }

  /**
   * Position and show tooltip near the hovered word.
   * @param {string} text - Tooltip content
   * @param {HTMLElement} anchorEl - The word span to position near
   * @param {string} [highlightWord] - Optional word to highlight in gold
   */
  _showTooltip(text, anchorEl, highlightWord) {
    if (!this._tooltipEl) {
      this._createTooltip();
    }
    if (!this._tooltipEl) return;

    // Store which word this tooltip is for (used for async guard)
    const cleanWord = highlightWord || text;
    this._tooltipEl.dataset.word = cleanWord;

    // Set content
    if (highlightWord && text !== highlightWord) {
      this._tooltipEl.innerHTML =
        `<span class="dvsn-tooltip-word">${this._escapeHtml(highlightWord)}</span> — ${this._escapeHtml(text)}`;
    } else {
      this._tooltipEl.textContent = text;
    }

    // Position: above the word by default
    const rect = anchorEl.getBoundingClientRect();
    this._tooltipEl.style.left = '0';
    this._tooltipEl.style.top = '0';
    this._tooltipEl.classList.remove('dvsn-tooltip-visible', 'dvsn-tooltip-below');
    this._tooltipEl.style.display = 'block';

    const tipRect = this._tooltipEl.getBoundingClientRect();
    let top = rect.top - tipRect.height - 8;
    let left = rect.left + rect.width / 2 - tipRect.width / 2;

    // If no space above, show below
    if (top < 4) {
      top = rect.bottom + 8;
      this._tooltipEl.classList.add('dvsn-tooltip-below');
    }

    // Clamp horizontal to viewport
    left = Math.max(4, Math.min(left, window.innerWidth - tipRect.width - 4));

    this._tooltipEl.style.left = `${left}px`;
    this._tooltipEl.style.top = `${top}px`;
    this._tooltipEl.classList.add('dvsn-tooltip-visible');
  }

  _hideTooltip() {
    if (this._tooltipEl) {
      this._tooltipEl.classList.remove('dvsn-tooltip-visible');
      this._tooltipEl.dataset.word = '';
    }
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  hide() {
    this._hideTooltip();
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
    if (this._hoverTimer) {
      clearTimeout(this._hoverTimer);
    }
    if (this._container && this._container.parentElement) {
      this._container.parentElement.removeChild(this._container);
    }
    if (this._tooltipEl && this._tooltipEl.parentElement) {
      this._tooltipEl.parentElement.removeChild(this._tooltipEl);
    }
    this._container = null;
    this._originalEl = null;
    this._translatedEl = null;
    this._tooltipEl = null;
    this._onWordTranslate = null;
  }
}
