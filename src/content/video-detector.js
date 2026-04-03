export class VideoDetector {
  constructor({ onVideoFound, onVideoRemoved }) {
    this._onVideoFound = onVideoFound;
    this._onVideoRemoved = onVideoRemoved;
    this._trackedVideos = new Set();
    this._observer = null;
    this._removalTimers = new Map(); // Debounce video removal on YouTube
  }

  scan() {
    let videos;
    const isYouTube = /youtube\.com/.test(window.location.hostname);

    if (isYouTube) {
      // YouTube has multiple <video> elements (main player, mini-player, ads, shorts previews).
      // Only track the MAIN player video to avoid duplicate translators.
      const mainVideo = document.querySelector('#movie_player video.html5-main-video');
      videos = mainVideo ? [mainVideo] : [];
      console.log('[DịchVideo][Detector] scan() YouTube mode: main video', mainVideo ? 'found' : 'NOT found');
    } else {
      videos = Array.from(document.querySelectorAll('video'));
    }

    console.log('[DịchVideo][Detector] scan() found', videos.length, 'video(s), tracking', this._trackedVideos.size);
    videos.forEach(video => {
      if (!this._trackedVideos.has(video)) {
        this._trackedVideos.add(video);
        this._onVideoFound(video);
      }
    });
  }

  observe() {
    this.scan();

    this._observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeName === 'VIDEO') {
            this._addVideo(node);
          }
          if (node.querySelectorAll) {
            node.querySelectorAll('video').forEach(v => this._addVideo(v));
          }
        }
        for (const node of mutation.removedNodes) {
          if (node.nodeName === 'VIDEO') {
            this._removeVideo(node);
          }
          if (node.querySelectorAll) {
            node.querySelectorAll('video').forEach(v => this._removeVideo(v));
          }
        }
      }
    });

    this._observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  _addVideo(video) {
    if (!this._trackedVideos.has(video)) {
      // On YouTube, only track the main player video
      const isYouTube = /youtube\.com/.test(window.location.hostname);
      if (isYouTube && !video.classList.contains('html5-main-video')) {
        return; // Skip mini-player, ad videos, shorts previews
      }
      this._trackedVideos.add(video);

      // Cancel pending removal debounce if video came back
      if (this._removalTimers.has(video)) {
        clearTimeout(this._removalTimers.get(video));
        this._removalTimers.delete(video);
        console.log('[DịchVideo][Detector] Video reappeared, cancelled removal');
        return; // Don't fire onVideoFound — translator is still alive
      }

      this._onVideoFound(video);
    } else {
      // Video already tracked but might have a pending removal — cancel it
      if (this._removalTimers.has(video)) {
        clearTimeout(this._removalTimers.get(video));
        this._removalTimers.delete(video);
        console.log('[DịchVideo][Detector] Video still in DOM, cancelled removal');
      }
    }
  }

  _removeVideo(video) {
    if (this._trackedVideos.has(video)) {
      const isYouTube = /youtube\.com/.test(window.location.hostname);

      if (isYouTube) {
        // YouTube temporarily detaches/reattaches DOM during SPA navigation
        // and yt-navigate-finish processing. Debounce removal by 1.5s to
        // avoid destroying a perfectly good translator that will be re-added.
        if (!this._removalTimers.has(video)) {
          console.log('[DịchVideo][Detector] Video removed from DOM, waiting 1.5s before destroying...');
          this._removalTimers.set(video, setTimeout(() => {
            this._removalTimers.delete(video);
            if (!document.body.contains(video)) {
              console.log('[DịchVideo][Detector] Video confirmed gone, destroying translator');
              this._trackedVideos.delete(video);
              this._onVideoRemoved(video);
            } else {
              console.log('[DịchVideo][Detector] Video back in DOM after debounce, keeping translator');
            }
          }, 1500));
        }
      } else {
        // Non-YouTube: immediate removal
        this._trackedVideos.delete(video);
        this._onVideoRemoved(video);
      }
    }
  }

  /**
   * Clear all tracked videos so next scan() treats them as new.
   * Used after SPA navigation when the same <video> element is reused.
   */
  reset() {
    console.log('[DịchVideo][Detector] reset() clearing', this._trackedVideos.size, 'tracked videos');
    this._trackedVideos.clear();
    // Cancel any pending removal debounces
    this._removalTimers.forEach(timer => clearTimeout(timer));
    this._removalTimers.clear();
  }

  getActiveVideos() {
    return Array.from(this._trackedVideos);
  }

  destroy() {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
    this._trackedVideos.clear();
    this._removalTimers.forEach(timer => clearTimeout(timer));
    this._removalTimers.clear();
  }
}
