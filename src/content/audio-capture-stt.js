/**
 * AudioCaptureSTT — captures audio from video via MediaStream
 * and sends chunks to OpenAI Whisper API for transcription.
 *
 * This is a fallback when:
 *  - No TextTracks are available
 *  - No DOM captions exist (YouTube CC off, no CC available)
 *  - Web Speech API is not available or user prefers Whisper
 *
 * Architecture:
 *  1. captureStream() on the <video> element → MediaStream
 *  2. MediaRecorder records chunks (every CHUNK_INTERVAL_MS)
 *  3. Each chunk is base64-encoded and sent to background service worker
 *  4. Background calls OpenAI Whisper API → returns text
 *  5. Text is passed to onResult callback
 */

const LOG_PREFIX = '[DịchVideo][AudioSTT]';
const CHUNK_INTERVAL_MS = 5000; // 5 second chunks

export class AudioCaptureSTT {
  constructor({ onResult, onError, apiKey, language }) {
    this._onResult = onResult;
    this._onError = onError || (() => {});
    this._apiKey = apiKey;
    this._language = language;
    this._mediaRecorder = null;
    this._stream = null;
    this._isRunning = false;
    this._lastText = '';
  }

  /**
   * Check if audio capture is supported and API key is available.
   */
  isSupported() {
    if (!this._apiKey) {
      console.warn(LOG_PREFIX, 'No Whisper API key — audio capture STT unavailable');
      return false;
    }
    // captureStream is available on most modern browsers
    if (typeof HTMLMediaElement === 'undefined') return false;
    const video = document.createElement('video');
    const hasCapture = typeof video.captureStream === 'function' ||
                       typeof video.mozCaptureStream === 'function';
    if (!hasCapture) {
      console.warn(LOG_PREFIX, 'captureStream not supported');
    }
    return hasCapture;
  }

  /**
   * Start capturing audio from a video element and transcribing.
   */
  start(video) {
    if (this._isRunning) return;

    try {
      // Get audio stream from video element
      this._stream = video.captureStream
        ? video.captureStream()
        : video.mozCaptureStream();

      // Only use audio tracks
      const audioTracks = this._stream.getAudioTracks();
      if (audioTracks.length === 0) {
        console.warn(LOG_PREFIX, 'No audio tracks in video stream');
        this._onError(new Error('No audio tracks available'));
        return;
      }

      // Create a stream with only audio
      const audioStream = new MediaStream(audioTracks);

      // Determine supported MIME type
      const mimeType = this._getSupportedMimeType();
      console.log(LOG_PREFIX, 'Starting audio capture, MIME:', mimeType);

      this._mediaRecorder = new MediaRecorder(audioStream, {
        mimeType,
        audioBitsPerSecond: 64000, // Low bitrate for faster upload
      });

      this._mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this._processChunk(event.data);
        }
      };

      this._mediaRecorder.onerror = (event) => {
        console.warn(LOG_PREFIX, 'MediaRecorder error:', event.error);
        this._onError(event.error);
      };

      this._mediaRecorder.start(CHUNK_INTERVAL_MS);
      this._isRunning = true;
      console.log(LOG_PREFIX, `Recording started (${CHUNK_INTERVAL_MS}ms chunks)`);
    } catch (error) {
      console.warn(LOG_PREFIX, 'Failed to start audio capture:', error.message);
      this._onError(error);
    }
  }

  stop() {
    if (!this._isRunning) return;

    this._isRunning = false;
    if (this._mediaRecorder && this._mediaRecorder.state !== 'inactive') {
      this._mediaRecorder.stop();
    }
    this._mediaRecorder = null;
    if (this._stream) {
      this._stream.getTracks().forEach(t => t.stop());
      this._stream = null;
    }
    console.log(LOG_PREFIX, 'Audio capture stopped');
  }

  destroy() {
    this.stop();
  }

  _getSupportedMimeType() {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return 'audio/webm'; // fallback
  }

  async _processChunk(blob) {
    if (!this._isRunning) return;

    try {
      // Convert blob to base64
      const base64 = await this._blobToBase64(blob);
      const fileExt = blob.type.includes('webm') ? 'webm'
        : blob.type.includes('ogg') ? 'ogg'
        : blob.type.includes('mp4') ? 'mp4' : 'webm';

      // Send to background for Whisper API transcription
      const response = await new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.runtime) {
          chrome.runtime.sendMessage({
            type: 'whisper-transcribe',
            audio: base64,
            fileExt,
            lang: this._language,
            apiKey: this._apiKey,
          }, (resp) => {
            if (chrome.runtime.lastError) {
              console.warn(LOG_PREFIX, 'Message error:', chrome.runtime.lastError.message);
              resolve(null);
              return;
            }
            resolve(resp);
          });
        } else {
          resolve(null);
        }
      });

      if (response?.success && response.text) {
        // Deduplicate — don't fire for same text
        if (response.text !== this._lastText) {
          this._lastText = response.text;
          console.log(LOG_PREFIX, 'Whisper result:', response.text.substring(0, 60));
          this._onResult({ text: response.text, isFinal: true });
        }
      }
    } catch (error) {
      console.warn(LOG_PREFIX, 'Chunk processing error:', error.message);
    }
  }

  _blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        // Strip data URL prefix: "data:audio/webm;base64,..."
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}
