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
   * Polls until the container appears, then attaches a MutationObserver.
   * Debounces rapid mutations and deduplicates identical text.
   */
  observeDomSubtitles(containerSelector, onCueChange, maxRetries = 60) {
    let retries = 0;

    const tryAttach = () => {
      // YouTube captions live inside .ytp-caption-window-container
      // and individual segments are .ytp-caption-segment
      // We observe the parent container for any child changes
      const container = document.querySelector(containerSelector);

      if (container) {
        console.log('[DịchVideo] Found caption container:', containerSelector);
        this._attachDomObserver(container, containerSelector, onCueChange);
        return;
      }

      // Also try the parent container for YouTube
      if (containerSelector === '.ytp-caption-segment') {
        const parentContainer = document.querySelector('.ytp-caption-window-container');
        if (parentContainer) {
          console.log('[DịchVideo] Found YouTube caption parent container, observing...');
          this._attachDomObserver(parentContainer, containerSelector, onCueChange);
          return;
        }
      }

      retries++;
      if (retries < maxRetries) {
        this._pollTimer = setTimeout(tryAttach, 1000);
      } else {
        console.warn('[DịchVideo] Caption container not found after', maxRetries, 'retries');
      }
    };

    tryAttach();
  }

  _attachDomObserver(container, segmentSelector, onCueChange) {
    if (this._domObserver) {
      this._domObserver.disconnect();
    }

    this._domObserver = new MutationObserver(() => {
      // Debounce rapid mutations (YouTube updates char by char)
      if (this._debounceTimer) clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => {
        // Collect all caption segment text
        const segments = container.querySelectorAll
          ? container.querySelectorAll(segmentSelector) || [container]
          : [container];

        let fullText = '';
        if (segments.length > 0 && segments !== [container]) {
          segments.forEach(seg => { fullText += seg.textContent; });
        } else {
          fullText = container.textContent;
        }

        fullText = fullText.trim();

        // Deduplicate — don't fire for same text
        if (fullText && fullText !== this._lastCueText) {
          this._lastCueText = fullText;
          console.log('[DịchVideo] Caption detected:', fullText.substring(0, 50));
          onCueChange(fullText);
        }
      }, 300);
    });

    this._domObserver.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });
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
