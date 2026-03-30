import { defaultReadCaptions } from './platform-registry.js';

const LOG_PREFIX = '[DịchVideo]';

export class SubtitleExtractor {
  constructor() {
    this._domObserver = null;
    this._pollTimer = null;
    this._captionPollTimer = null;
    this._lastCueText = '';
    this._debounceTimer = null;
    this._trackWatchCleanup = null;
  }

  // ─── TextTrack methods ─────────────────────────────────────

  findSubtitleTracks(video, preferLang = null) {
    const tracks = [];
    if (!video.textTracks) return tracks;

    for (let i = 0; i < video.textTracks.length; i++) {
      const track = video.textTracks[i];
      if (track.kind === 'subtitles' || track.kind === 'captions') {
        tracks.push({
          index: i,
          language: track.language || 'unknown',
          label: track.label || track.language || 'Unknown',
          kind: track.kind,
          track,
        });
      }
    }

    // Sort: prefer subtitles over captions, prefer matching language
    if (preferLang && tracks.length > 1) {
      tracks.sort((a, b) => {
        const aMatch = a.language === preferLang ? -2 : (a.language === 'en' ? -1 : 0);
        const bMatch = b.language === preferLang ? -2 : (b.language === 'en' ? -1 : 0);
        const kindScore = (k) => k === 'subtitles' ? -1 : 0;
        return (aMatch + kindScore(a.kind)) - (bMatch + kindScore(b.kind));
      });
    }

    return tracks;
  }

  /**
   * Watch for TextTracks to appear on a video element.
   * Many players (Vimeo, Coursera, edX) add tracks dynamically after load.
   *
   * @param {HTMLVideoElement} video
   * @param {function(Array)} onTracksFound — called once when tracks appear
   * @param {number} timeoutMs — how long to wait before giving up (default 10s)
   */
  watchForTracks(video, onTracksFound, timeoutMs = 10000) {
    // Immediate check
    const immediate = this.findSubtitleTracks(video);
    if (immediate.length > 0) {
      console.log(LOG_PREFIX, 'TextTracks found immediately:', immediate.length);
      onTracksFound(immediate);
      return;
    }

    let resolved = false;
    const cleanup = () => {
      resolved = true;
      if (handler) {
        try { video.textTracks.removeEventListener('addtrack', handler); } catch (e) { /* ignore */ }
      }
      if (pollId) clearInterval(pollId);
      if (timeoutId) clearTimeout(timeoutId);
    };

    const resolve = (tracks) => {
      if (resolved) return;
      cleanup();
      onTracksFound(tracks);
    };

    // Listen for addtrack event (standard way)
    const handler = () => {
      const tracks = this.findSubtitleTracks(video);
      if (tracks.length > 0) {
        console.log(LOG_PREFIX, 'TextTracks found via addtrack event:', tracks.length);
        resolve(tracks);
      }
    };

    if (video.textTracks && typeof video.textTracks.addEventListener === 'function') {
      video.textTracks.addEventListener('addtrack', handler);
    }

    // Poll fallback (some players don't fire addtrack reliably)
    const pollId = setInterval(() => {
      const tracks = this.findSubtitleTracks(video);
      if (tracks.length > 0) {
        console.log(LOG_PREFIX, 'TextTracks found via polling:', tracks.length);
        resolve(tracks);
      }
    }, 500);

    // Timeout — give up and call with empty array
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        console.log(LOG_PREFIX, 'No TextTracks found after', timeoutMs, 'ms');
        cleanup();
        onTracksFound([]);
      }
    }, timeoutMs);

    // Store cleanup function for destroy()
    this._trackWatchCleanup = cleanup;
  }

  getAllCues(track) {
    if (!track || !track.cues) return [];
    const cues = [];
    for (let i = 0; i < track.cues.length; i++) {
      const cue = track.cues[i];
      cues.push({
        startTime: cue.startTime,
        endTime: cue.endTime,
        text: this.parseSubtitleText(cue.text || cue.getCueAsHTML?.()?.textContent || ''),
      });
    }
    return cues;
  }

  getCueAtTime(cues, currentTime) {
    for (const cue of cues) {
      if (currentTime >= cue.startTime && currentTime < cue.endTime) {
        return cue;
      }
    }
    return null;
  }

  getUpcomingCues(cues, currentTime, count = 5) {
    const upcoming = [];
    for (const cue of cues) {
      if (cue.startTime > currentTime) {
        upcoming.push(cue);
        if (upcoming.length >= count) break;
      }
    }
    return upcoming;
  }

  // ─── URL helpers (kept for backward compat) ────────────────

  isYouTube(url) {
    return /^https?:\/\/(www\.)?youtube\.com/.test(url);
  }

  isVimeo(url) {
    return /^https?:\/\/(www\.)?vimeo\.com/.test(url);
  }

  parseSubtitleText(text) {
    return text.replace(/<[^>]*>/g, '').trim();
  }

  // ─── DOM Caption Observation (multi-platform) ──────────────

  /**
   * Observe DOM-rendered subtitles for any supported platform.
   *
   * Accepts either:
   * - A platform config object (from platform-registry.js) — preferred
   * - A CSS selector string — backward compat (treated as YouTube)
   *
   * @param {Object|string} platformOrSelector — platform config or CSS selector
   * @param {function(string)} onCueChange — called with caption text
   * @param {number} maxRetries — how many seconds to poll for container
   */
  observeDomSubtitles(platformOrSelector, onCueChange, maxRetries = 60) {
    let platform;

    // Backward compat: accept a string selector (YouTube path)
    if (typeof platformOrSelector === 'string') {
      platform = {
        name: 'legacy',
        captionContainer: platformOrSelector === '.ytp-caption-segment' ? '#movie_player' : null,
        captionSelector: platformOrSelector,
        uiFilterPatterns: [],
        _isYouTube: platformOrSelector === '.ytp-caption-segment',
      };
    } else {
      platform = platformOrSelector;
    }

    let retries = 0;
    const containerSelector = platform.captionContainer;

    const tryAttach = () => {
      const container = document.querySelector(containerSelector);

      if (container) {
        console.log(LOG_PREFIX, `[${platform.name}] Found caption container:`, containerSelector);
        this._attachDomObserver(container, platform, onCueChange);
        return;
      }

      retries++;
      if (retries < maxRetries) {
        this._pollTimer = setTimeout(tryAttach, 1000);
        if (retries % 10 === 0) {
          console.log(LOG_PREFIX, `[${platform.name}] Waiting for caption container... attempt`, retries);
        }
      } else {
        console.warn(LOG_PREFIX, `[${platform.name}] Caption container not found after`, maxRetries,
          'retries. Make sure captions/CC are turned ON.');
      }
    };

    tryAttach();
  }

  _attachDomObserver(container, platform, onCueChange) {
    if (this._domObserver) {
      this._domObserver.disconnect();
    }
    if (this._captionPollTimer) {
      clearInterval(this._captionPollTimer);
      this._captionPollTimer = null;
    }

    const isYouTube = platform.name === 'youtube' || platform._isYouTube;
    const captionSelector = platform.captionSelector;
    const uiFilterPatterns = platform.uiFilterPatterns || [];

    // YouTube-specific UI text filter
    const YT_UI_PATTERNS = [
      /^(Tiếng|English|Français|Deutsch|Español|日本語|한국어|中文|العربية)/,
      /được tạo tự động/,
      /auto-generated/i,
      /Nhấp vào/,
      /Click .* settings/i,
      /để biết cài đặt/,
      /caption settings/i,
    ];

    const readCaptionText = () => {
      let fullText = '';

      if (isYouTube) {
        // YouTube: read from .ytp-caption-window-bottom windows
        const captionWindows = container.querySelectorAll(
          platform.captionWindowSelector || '.ytp-caption-window-bottom'
        );
        const lines = [];

        captionWindows.forEach(win => {
          const segments = win.querySelectorAll(captionSelector);
          if (segments.length > 0) {
            const words = [];
            segments.forEach(seg => {
              const text = seg.textContent.trim();
              if (text && !YT_UI_PATTERNS.some(p => p.test(text))) {
                words.push(text);
              }
            });
            const lineText = words.join(' ');
            if (lineText) lines.push(lineText);
          }
        });
        fullText = lines.join(' ');
      } else if (typeof platform.readCaptions === 'function') {
        // Platform has custom reader
        fullText = platform.readCaptions(container, captionSelector);
      } else {
        // Generic: use defaultReadCaptions from platform-registry
        fullText = defaultReadCaptions(container, captionSelector, uiFilterPatterns);
      }

      fullText = fullText.trim();

      // Deduplicate — only fire when text actually changes
      if (fullText && fullText !== this._lastCueText) {
        this._lastCueText = fullText;
        console.log(LOG_PREFIX, `[${platform.name}] Caption:`, fullText.substring(0, 60));
        onCueChange(fullText);
      }
    };

    // MutationObserver (primary, low-latency)
    this._domObserver = new MutationObserver(() => {
      if (this._debounceTimer) clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(readCaptionText, 300);
    });

    this._domObserver.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // Polling fallback (safety net for edge cases)
    this._captionPollTimer = setInterval(readCaptionText, 1500);

    console.log(LOG_PREFIX, `[${platform.name}] Observer + polling active`);

    // Initial read after short delay
    setTimeout(readCaptionText, 500);
  }

  // ─── Cleanup ───────────────────────────────────────────────

  destroy() {
    if (this._domObserver) {
      this._domObserver.disconnect();
      this._domObserver = null;
    }
    if (this._pollTimer) {
      clearTimeout(this._pollTimer);
      this._pollTimer = null;
    }
    if (this._captionPollTimer) {
      clearInterval(this._captionPollTimer);
      this._captionPollTimer = null;
    }
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    if (this._trackWatchCleanup) {
      this._trackWatchCleanup();
      this._trackWatchCleanup = null;
    }
    this._lastCueText = '';
  }
}
