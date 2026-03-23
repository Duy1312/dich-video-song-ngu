export class SubtitleExtractor {
  constructor() {
    this._domObserver = null;
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

  observeDomSubtitles(containerSelector, onCueChange) {
    const container = document.querySelector(containerSelector);
    if (!container) return null;

    this._domObserver = new MutationObserver(() => {
      const text = container.textContent.trim();
      if (text) onCueChange(text);
    });

    this._domObserver.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return this._domObserver;
  }

  destroy() {
    if (this._domObserver) {
      this._domObserver.disconnect();
      this._domObserver = null;
    }
  }
}
