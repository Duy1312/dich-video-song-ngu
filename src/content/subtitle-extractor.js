export class SubtitleExtractor {
  constructor() {
    this._domObserver = null;
    this._pollTimer = null;
    this._lastCueText = '';
    this._debounceTimer = null;
  }

  findSubtitleTracks(video) {
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
    return tracks;
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

  isYouTube(url) {
    return /^https?:\/\/(www\.)?youtube\.com/.test(url);
  }

  isVimeo(url) {
    return /^https?:\/\/(www\.)?vimeo\.com/.test(url);
  }

  parseSubtitleText(text) {
    return text.replace(/<[^>]*>/g, '').trim();
  }

  /**
   * Observe DOM-rendered subtitles (e.g. YouTube captions).
   * For YouTube: always observes .ytp-caption-window-container (stable parent)
   * and reads text from .ytp-caption-segment children on each mutation.
   * Polls until the container appears, debounces, and deduplicates.
   */
  observeDomSubtitles(segmentSelector, onCueChange, maxRetries = 60) {
    let retries = 0;
    const isYouTube = segmentSelector === '.ytp-caption-segment';

    const tryAttach = () => {
      let observeTarget = null;

      if (isYouTube) {
        // ALWAYS observe the stable parent container for YouTube
        // YouTube destroys/recreates .ytp-caption-segment elements,
        // so observing the segment directly would lose the observer
        observeTarget = document.querySelector('.ytp-caption-window-container');
        if (observeTarget) {
          console.log('[DịchVideo] Attached observer to .ytp-caption-window-container');
        }
      } else {
        observeTarget = document.querySelector(segmentSelector);
        if (observeTarget) {
          console.log('[DịchVideo] Attached observer to:', segmentSelector);
        }
      }

      if (observeTarget) {
        this._attachDomObserver(observeTarget, segmentSelector, onCueChange);
        return;
      }

      retries++;
      if (retries < maxRetries) {
        this._pollTimer = setTimeout(tryAttach, 1000);
        if (retries % 10 === 0) {
          console.log('[DịchVideo] Still waiting for caption container... attempt', retries);
        }
      } else {
        console.warn('[DịchVideo] Caption container not found after', maxRetries, 'retries.',
          'Make sure captions/CC are turned ON in the video player.');
      }
    };

    tryAttach();
  }

  _attachDomObserver(observeTarget, segmentSelector, onCueChange) {
    if (this._domObserver) {
      this._domObserver.disconnect();
    }

    const isYouTube = segmentSelector === '.ytp-caption-segment';

    // YouTube caption settings UI text patterns to filter out.
    // These appear as .ytp-caption-segment inside the same container.
    const YT_UI_PATTERNS = [
      /^(Tiếng|English|Français|Deutsch|Español|日本語|한국어|中文|العربية)/,
      /được tạo tự động/,
      /auto-generated/i,
      /Nhấp vào/,
      /Click .* settings/i,
      /để biết cài đặt/,
      /caption settings/i,
    ];

    const isYouTubeUIText = (text) => {
      return YT_UI_PATTERNS.some(pattern => pattern.test(text.trim()));
    };

    this._domObserver = new MutationObserver(() => {
      // Debounce rapid mutations (YouTube updates char by char)
      if (this._debounceTimer) clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => {
        let fullText = '';

        if (isYouTube) {
          // YouTube-specific: read ONLY from caption windows, not UI elements.
          // Structure: .ytp-caption-window-container
          //   → .ytp-caption-window-bottom (one per line of captions)
          //     → span.captions-text → span.ytp-caption-segment (actual text)
          //     → [settings tooltip segments — FILTER these out]
          const captionWindows = observeTarget.querySelectorAll('.ytp-caption-window-bottom');
          const lines = [];

          captionWindows.forEach(win => {
            const segments = win.querySelectorAll(segmentSelector);
            if (segments.length > 0) {
              const words = [];
              segments.forEach(seg => {
                const text = seg.textContent.trim();
                // Filter out YouTube UI/settings text
                if (text && !isYouTubeUIText(text)) {
                  words.push(text);
                }
              });
              const lineText = words.join(' ');
              if (lineText) lines.push(lineText);
            }
          });

          fullText = lines.join(' ');
        } else {
          // Generic: search for segments from the observe target
          const segments = observeTarget.querySelectorAll(segmentSelector);
          if (segments && segments.length > 0) {
            const parts = [];
            segments.forEach(seg => { parts.push(seg.textContent.trim()); });
            fullText = parts.filter(Boolean).join(' ');
          } else {
            fullText = observeTarget.textContent;
          }
        }

        fullText = fullText.trim();

        // Deduplicate — don't fire for same text
        if (fullText && fullText !== this._lastCueText) {
          this._lastCueText = fullText;
          console.log('[DịchVideo] Caption detected:', fullText.substring(0, 80));
          onCueChange(fullText);
        }
      }, 300);
    });

    this._domObserver.observe(observeTarget, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    console.log('[DịchVideo] MutationObserver active, waiting for captions...');
  }

  destroy() {
    if (this._domObserver) {
      this._domObserver.disconnect();
      this._domObserver = null;
    }
    if (this._pollTimer) {
      clearTimeout(this._pollTimer);
      this._pollTimer = null;
    }
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    this._lastCueText = '';
  }
}
