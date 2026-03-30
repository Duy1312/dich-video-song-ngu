/**
 * YouTube Caption Bridge
 *
 * Communicates with youtube-page-script.js (world: "MAIN") to:
 * 1. Request activation of captions via YouTube player API
 * 2. Receive confirmation of which track was activated
 *
 * The actual caption text is read from the DOM by subtitle-extractor.js
 * observing .ytp-caption-segment elements.
 */

const LOG_PREFIX = '[DịchVideo][YT-Captions]';
const MSG_TYPE = 'dvsn-yt-captions';

/**
 * Request the page script to activate YouTube captions.
 * Returns { tracks, selectedTrack, activated } or null on timeout.
 * @param {number} timeoutMs - Max wait time
 * @param {boolean} forceToggle - Force CC off/on cycle (use after SPA navigation)
 */
export function requestActivateCaptions(timeoutMs = 12000, forceToggle = false) {
  return new Promise((resolve) => {
    let resolved = false;

    const handler = (event) => {
      if (event.source !== window) return;
      if (!event.data || event.data.type !== MSG_TYPE + '-activated') return;

      if (!resolved) {
        resolved = true;
        window.removeEventListener('message', handler);
        console.log(LOG_PREFIX, 'Activation result:',
          event.data.activated ? '✅' : '❌',
          event.data.selectedTrack
            ? `${event.data.selectedTrack.name} (${event.data.selectedTrack.languageCode})`
            : 'no track');
        resolve({
          tracks: event.data.tracks || [],
          selectedTrack: event.data.selectedTrack || null,
          activated: event.data.activated || false,
        });
      }
    };

    window.addEventListener('message', handler);

    // Send activation request
    window.postMessage({ type: MSG_TYPE + '-activate', forceToggle }, '*');

    // Timeout
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        window.removeEventListener('message', handler);
        console.log(LOG_PREFIX, 'Activation timeout after', timeoutMs, 'ms');
        resolve(null);
      }
    }, timeoutMs);
  });
}

/**
 * Select the best caption track to use.
 * Priority: manual > auto-generated > first available
 */
export function selectBestTrack(tracks) {
  if (!tracks || tracks.length === 0) return null;

  const manual = tracks.filter(t => t.kind !== 'asr');
  if (manual.length > 0) return manual[0];

  const asr = tracks.filter(t => t.kind === 'asr');
  if (asr.length > 0) return asr[0];

  return tracks[0];
}
