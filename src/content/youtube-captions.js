/**
 * YouTube Caption Fetcher
 *
 * Primary approach: ask youtube-page-script.js (world: "MAIN") to both
 * extract caption tracks AND fetch caption data. The page script runs in
 * YouTube's JS context with full access to cookies/session, which is
 * necessary for YouTube's timedtext API to return data.
 *
 * Fallback: parse script tags, then DOM observation.
 */

const LOG_PREFIX = '[DịchVideo][YT-Captions]';
const MSG_TYPE = 'dvsn-yt-captions';

/**
 * Request parsed caption cues directly from the page-context script.
 * The page script extracts tracks, selects the best one, fetches data,
 * and returns ready-to-use cues — all within YouTube's page context.
 *
 * Returns { cues: Array, track: { name, languageCode, kind } | null }
 */
export function requestCaptionCues(timeoutMs = 8000) {
  return new Promise((resolve) => {
    const requestId = 'cues-' + Date.now();
    let resolved = false;

    const handler = (event) => {
      if (event.source !== window) return;
      if (!event.data || event.data.type !== MSG_TYPE + '-cues-response') return;

      if (!resolved) {
        resolved = true;
        window.removeEventListener('message', handler);
        const cueCount = event.data.cues ? event.data.cues.length : 0;
        console.log(LOG_PREFIX, 'Received', cueCount, 'cues via postMessage',
          '(source:', event.data.requestId, ')');
        if (event.data.track) {
          console.log(LOG_PREFIX, 'Track:', event.data.track.name, event.data.track.languageCode);
        }
        resolve({
          cues: event.data.cues || [],
          track: event.data.track || null,
          error: event.data.error || null,
        });
      }
    };

    window.addEventListener('message', handler);

    // Send request to page context script
    window.postMessage({ type: MSG_TYPE + '-fetch-cues', requestId }, '*');

    // Timeout fallback
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        window.removeEventListener('message', handler);
        console.log(LOG_PREFIX, 'Cues request timeout after', timeoutMs, 'ms');
        resolve({ cues: [], track: null, error: 'timeout' });
      }
    }, timeoutMs);
  });
}

/**
 * Setup a listener for auto-pushed cues from the page script
 * (sent on page load and SPA navigation).
 */
export function listenForAutoCues(callback) {
  const handler = (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== MSG_TYPE + '-cues-response') return;
    // Only handle auto/navigation pushes
    if (event.data.requestId === 'auto' || event.data.requestId === 'navigation') {
      const cueCount = event.data.cues ? event.data.cues.length : 0;
      console.log(LOG_PREFIX, 'Auto-received', cueCount, 'cues (source:', event.data.requestId, ')');
      callback({
        cues: event.data.cues || [],
        track: event.data.track || null,
      });
    }
  };

  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}

/**
 * Select the best caption track to use.
 * Priority: manual > auto-generated > first available
 */
export function selectBestTrack(tracks) {
  if (!tracks || tracks.length === 0) return null;

  const manual = tracks.filter(t => t.kind !== 'asr');
  if (manual.length > 0) {
    console.log(LOG_PREFIX, 'Using manual caption track:', manual[0].name, manual[0].languageCode);
    return manual[0];
  }

  const asr = tracks.filter(t => t.kind === 'asr');
  if (asr.length > 0) {
    console.log(LOG_PREFIX, 'Using auto-generated caption track:', asr[0].name, asr[0].languageCode);
    return asr[0];
  }

  console.log(LOG_PREFIX, 'Using first available track:', tracks[0].name, tracks[0].languageCode);
  return tracks[0];
}
