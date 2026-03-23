export class VideoDetector {
  constructor({ onVideoFound, onVideoRemoved }) {
    this._onVideoFound = onVideoFound;
    this._onVideoRemoved = onVideoRemoved;
    this._trackedVideos = new Set();
    this._observer = null;
  }

  scan() {
    const videos = document.querySelectorAll('video');
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
      this._trackedVideos.add(video);
      this._onVideoFound(video);
    }
  }

  _removeVideo(video) {
    if (this._trackedVideos.has(video)) {
      this._trackedVideos.delete(video);
      this._onVideoRemoved(video);
    }
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
  }
}
