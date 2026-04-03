# Plan: Multi-Platform Video Subtitle Translation

## Goal
Expand the extension from YouTube-only to support Netflix, Vimeo, Facebook, Udemy, Coursera, and other sites. Improve HTML5 TextTrack detection. Add video audio capture for STT (instead of microphone).

---

## Part 1: Platform Registry + DOM Caption Extractors

### Architecture: Data-Driven Platform Config

Create `src/content/platform-registry.js` — a registry that maps URL patterns to platform-specific configs. Each platform config defines:

```js
{
  name: 'netflix',
  hostPattern: /netflix\.com/,
  videoSelector: 'video',                          // CSS selector for video
  captionContainer: '.player-timedtext',            // stable parent for MutationObserver
  captionSelector: '.player-timedtext-text-container span', // text elements
  hideCaptionCSS: '.player-timedtext { color: transparent !important; }',
  uiFilterPatterns: [],                             // regex patterns to filter UI text
}
```

### Platforms to support:

| Platform | `captionContainer` | `captionSelector` | Notes |
|---|---|---|---|
| **YouTube** | `#movie_player` | `.ytp-caption-segment` | Already works, migrate to registry |
| **Netflix** | `.player-timedtext` | `.player-timedtext-text-container span` | DRM video, DOM captions |
| **Vimeo** | `.vp-captions` | `.vp-captions span` | Also has TextTrack |
| **Facebook** | `div[data-testid="video_overlay_wrapper"]` | `div[data-testid="video_caption"] span` | Reels + Watch |
| **Udemy** | `.captions-display--captions-container` | `.captions-display--captions-cue-text` | Shaka player |
| **Coursera** | `.rc-CML` or video parent | `video track` / `.subtitle-container span` | Uses TextTrack sometimes |
| **edX** | `.video-wrapper` | `.subtitles-menu li.current` | Custom player |
| **Khan Academy** | `.video-js` | `.vjs-text-track-cue div` | video.js based |
| **TikTok** | TBD | TBD | Rapidly changing selectors |
| **Twitter/X** | `div[data-testid="videoPlayer"]` | Caption spans | Embedded player |

### Files to modify:

1. **NEW `src/content/platform-registry.js`** (~100 lines)
   - Export `PLATFORMS` array of config objects
   - Export `detectPlatform(url)` — returns matching config or null
   - Export `getHideCaptionCSS(platform)` — returns CSS string

2. **MODIFY `src/content/subtitle-extractor.js`**
   - Refactor `observeDomSubtitles()` to accept a platform config object:
     ```js
     observeDomSubtitles(platformConfig, onCueChange, maxRetries)
     ```
   - Move YouTube-specific logic (UI text filtering, caption-window reading) into the platform config
   - The generic reading logic stays in the method

3. **MODIFY `src/content/index.js` → `_tryPlatformSubtitles()`**
   - Replace the YouTube-only `if/else` with platform registry lookup:
     ```js
     const platform = detectPlatform(url);
     if (platform?.name === 'youtube') {
       this._tryYouTubeApiCaptions();
     } else if (platform) {
       this._tryDomCaptions(platform);
     } else {
       this._startSpeechRecognition();
     }
     ```
   - Add new `_tryDomCaptions(platform)` method that:
     1. Injects platform-specific caption-hiding CSS
     2. Calls `observeDomSubtitles(platform, callback)`
     3. Sets `_isLiveMode = true`, routes text to `_onLiveCue()`
     4. Falls back to STT after timeout

4. **MODIFY `src/content/video-detector.js`**
   - Import platform registry
   - Use `platform.videoSelector` for platform-specific video finding

5. **MODIFY `src/styles/overlay.css`**
   - Add caption-hiding rules for Netflix, Vimeo, Udemy, etc.
   - Keep YouTube rules as-is

---

## Part 2: Robust HTML5 TextTrack Detection

### Current problem:
`findSubtitleTracks()` checks `video.textTracks` once. Many players (Vimeo, Coursera, edX) add tracks dynamically after video loads.

### Solution — MODIFY `src/content/subtitle-extractor.js`:

1. **Add `watchForTracks(video, callback)`** method:
   ```js
   watchForTracks(video, callback) {
     // Immediate check
     const tracks = this.findSubtitleTracks(video);
     if (tracks.length > 0) { callback(tracks); return; }

     // Listen for dynamically added tracks
     const handler = () => {
       const tracks = this.findSubtitleTracks(video);
       if (tracks.length > 0) {
         video.textTracks.removeEventListener('addtrack', handler);
         callback(tracks);
       }
     };
     video.textTracks.addEventListener('addtrack', handler);

     // Also poll for 15 seconds (some players don't fire addtrack)
     let attempts = 0;
     const poll = setInterval(() => {
       attempts++;
       const tracks = this.findSubtitleTracks(video);
       if (tracks.length > 0 || attempts >= 30) {
         clearInterval(poll);
         video.textTracks.removeEventListener('addtrack', handler);
         if (tracks.length > 0) callback(tracks);
       }
     }, 500);
   }
   ```

2. **Improve track selection** in `findSubtitleTracks()`:
   - Prefer manual tracks over auto-generated
   - Prefer tracks matching target language or English
   - Sort by quality: `subtitles` > `captions`

3. **MODIFY `src/content/index.js` → `_tryExtractSubtitles()`**:
   - Use `watchForTracks()` instead of one-shot `findSubtitleTracks()`
   - Try TextTrack first; if found → use it (time-based mode)
   - If TextTrack not found within 5s → try platform DOM captions
   - If neither → fall back to STT

---

## Part 3: Video Audio Capture for STT

### Current problem:
`SpeechRecognizer` uses `window.SpeechRecognition` which ONLY captures microphone audio. Useless for translating video on other sites.

### Solution: Audio capture from video element → Whisper API

**NEW `src/content/audio-capture-stt.js`** (~150 lines):

```js
export class AudioCaptureStt {
  constructor({ video, onResult, onError, apiKey, lang }) { ... }

  start() {
    // 1. Get MediaStream from video
    const stream = this._captureVideoAudio();

    // 2. Record audio in chunks (5-second segments)
    this._recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    this._recorder.ondataavailable = (e) => this._processChunk(e.data);
    this._recorder.start(5000); // 5s chunks
  }

  _captureVideoAudio() {
    // Try captureStream() first (same-origin videos)
    if (this._video.captureStream) {
      return this._video.captureStream();
    }
    // Try mozCaptureStream (Firefox)
    if (this._video.mozCaptureStream) {
      return this._video.mozCaptureStream();
    }
    throw new Error('Cannot capture video audio');
  }

  async _processChunk(blob) {
    // Send to Whisper API via background service worker
    const arrayBuffer = await blob.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    chrome.runtime.sendMessage({
      type: 'whisper-transcribe',
      audio: base64,
      lang: this._lang,
      apiKey: this._apiKey,
    }, (response) => {
      if (response?.text) {
        this._onResult({ text: response.text, timestamp: Date.now() });
      }
    });
  }

  destroy() { ... }
}
```

**MODIFY `src/background/service-worker.js`**:
- Add `whisper-transcribe` message handler
- Send audio to OpenAI Whisper API (`/v1/audio/transcriptions`)
- Return transcribed text

**MODIFY `src/content/index.js` → `_startSpeechRecognition()`**:
```js
_startSpeechRecognition() {
  if (this._settings.sttProvider === 'whisper' && this._apiKeys.whisperApiKey) {
    // Use video audio capture + Whisper
    this._audioCaptureStt = new AudioCaptureStt({
      video: this._video,
      onResult: ({ text }) => this._onLiveCue(text),
      onError: (err) => {
        console.warn('Audio capture failed, falling back to mic STT');
        this._startMicSpeechRecognition();
      },
      apiKey: this._apiKeys.whisperApiKey,
      lang: 'en',
    });
    this._audioCaptureStt.start();
  } else {
    this._startMicSpeechRecognition(); // existing Web Speech API
  }
}
```

**MODIFY `src/content/speech-recognizer.js`**:
- Rename current class to make room for the new one
- No breaking changes — `SpeechRecognizer` stays as mic-based fallback

### CORS limitation note:
- `captureStream()` fails on cross-origin videos (Netflix, etc.)
- For DRM/cross-origin: DOM captions (Part 1) are the primary solution
- Audio capture STT is for sites that have NO captions (random video embeds)
- If `captureStream()` fails → graceful fallback to mic STT with user notification

---

## Implementation Order

### Step 1: Platform Registry (foundation)
- [ ] Create `platform-registry.js` with 8+ platform configs
- [ ] Add tests for `detectPlatform()`

### Step 2: Refactor SubtitleExtractor
- [ ] Refactor `observeDomSubtitles()` to accept platform config
- [ ] Move YouTube-specific logic into platform config
- [ ] Verify YouTube still works (regression test)

### Step 3: Wire up platform detection in VideoTranslator
- [ ] Modify `_tryPlatformSubtitles()` to use registry
- [ ] Add `_tryDomCaptions(platform)` method
- [ ] Add caption-hiding CSS per platform
- [ ] Update `video-detector.js` for platform video selectors

### Step 4: Robust TextTrack
- [ ] Add `watchForTracks()` method
- [ ] Improve track selection logic
- [ ] Update `_tryExtractSubtitles()` to use it
- [ ] Add tests

### Step 5: Audio Capture STT
- [ ] Create `audio-capture-stt.js`
- [ ] Add Whisper API handler in service-worker
- [ ] Wire up in `_startSpeechRecognition()`
- [ ] Graceful fallback when captureStream fails
- [ ] Add tests

### Step 6: Build & Integration Test
- [ ] Verify all tests pass
- [ ] Build for Chrome/Firefox/Edge
- [ ] Manual test on YouTube (regression)

---

## Files Summary

| Action | File | Lines (est.) |
|--------|------|-------------|
| NEW | `src/content/platform-registry.js` | ~120 |
| NEW | `src/content/audio-capture-stt.js` | ~150 |
| NEW | `tests/content/platform-registry.test.js` | ~60 |
| NEW | `tests/content/audio-capture-stt.test.js` | ~80 |
| MODIFY | `src/content/subtitle-extractor.js` | +40, -20 |
| MODIFY | `src/content/index.js` | +60, -15 |
| MODIFY | `src/content/video-detector.js` | +10, -5 |
| MODIFY | `src/background/service-worker.js` | +40 |
| MODIFY | `src/styles/overlay.css` | +30 |
| MODIFY | `tests/content/subtitle-extractor.test.js` | +30 |
