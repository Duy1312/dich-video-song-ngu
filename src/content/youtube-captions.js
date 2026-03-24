/**
 * YouTube Caption Fetcher
 *
 * Fetches caption tracks from YouTube's player data using two approaches:
 * 1. Communicate with youtube-page-script.js (runs in world: "MAIN")
 *    via window.postMessage — bypasses YouTube CSP
 * 2. Parse script tags in the HTML source as fallback
 */

const LOG_PREFIX = '[DịchVideo][YT-Captions]';
const MSG_TYPE = 'dvsn-yt-captions';

/**
 * Request caption tracks from the page-context script via postMessage.
 * Returns a promise that resolves with tracks array.
 * Times out after the specified ms.
 */
export function requestCaptionTracks(timeoutMs = 3000) {
  return new Promise((resolve) => {
    const requestId = 'req-' + Date.now();
    let resolved = false;

    const handler = (event) => {
      if (event.source !== window) return;
      if (!event.data || event.data.type !== MSG_TYPE + '-response') return;
      // Accept any response (auto, navigation, or our specific request)
      if (event.data.tracks && event.data.tracks.length > 0) {
        if (!resolved) {
          resolved = true;
          window.removeEventListener('message', handler);
          console.log(LOG_PREFIX, 'Received tracks via postMessage:', event.data.tracks.length,
            '(source:', event.data.requestId, ')');
          resolve(event.data.tracks);
        }
      }
    };

    window.addEventListener('message', handler);

    // Send request to page context script
    window.postMessage({ type: MSG_TYPE + '-request', requestId }, '*');

    // Timeout fallback
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        window.removeEventListener('message', handler);
        console.log(LOG_PREFIX, 'postMessage timeout after', timeoutMs, 'ms');
        resolve([]);
      }
    }, timeoutMs);
  });
}

/**
 * Extract caption tracks by parsing script tags in page HTML.
 * This works from the content script's isolated world.
 */
export function extractFromScriptTags() {
  const scripts = document.querySelectorAll('script');
  for (const script of scripts) {
    const text = script.textContent;
    if (!text || text.length < 100) continue;

    // Look for "captionTracks" in the script content (fast pre-check)
    if (!text.includes('captionTracks')) continue;

    // Try to extract ytInitialPlayerResponse
    const match = text.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});\s*(?:var|let|const|if|<\/script)/s);
    if (match) {
      try {
        const data = JSON.parse(match[1]);
        const tracks = getTracksFromPlayerResponse(data);
        if (tracks && tracks.length > 0) {
          console.log(LOG_PREFIX, 'Found tracks from script tags:', tracks.length);
          return tracks;
        }
      } catch (e) {
        // JSON parse failed, continue searching
      }
    }
  }
  return [];
}

function getTracksFromPlayerResponse(response) {
  const captionData = response?.captions?.playerCaptionsTracklistRenderer;
  if (!captionData || !captionData.captionTracks) return [];

  return captionData.captionTracks.map(track => ({
    baseUrl: track.baseUrl,
    languageCode: track.languageCode,
    name: track.name?.simpleText || track.name?.runs?.[0]?.text || track.languageCode,
    kind: track.kind || '',
    isTranslatable: track.isTranslatable || false,
    vssId: track.vssId || '',
  }));
}

/**
 * Combined extraction: try postMessage first, then script tags.
 */
export async function extractCaptionTracks() {
  // Method 1: Request from page-context script via postMessage
  const tracks = await requestCaptionTracks(3000);
  if (tracks.length > 0) return tracks;

  // Method 2: Parse script tags (fallback)
  try {
    const scriptTracks = extractFromScriptTags();
    if (scriptTracks.length > 0) return scriptTracks;
  } catch (e) {
    console.warn(LOG_PREFIX, 'Script tag parsing failed:', e.message);
  }

  console.warn(LOG_PREFIX, 'No caption tracks found');
  return [];
}

/**
 * Fetch subtitle cues from a caption track URL.
 * YouTube returns XML (timedtext) or JSON (json3) format.
 */
export async function fetchCaptionCues(baseUrl, format = 'json3') {
  try {
    const url = new URL(baseUrl);
    url.searchParams.set('fmt', format);

    console.log(LOG_PREFIX, 'Fetching captions from:', url.toString().substring(0, 100) + '...');

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    if (format === 'json3') {
      return await parseJson3(response);
    } else {
      return await parseSrv3Xml(response);
    }
  } catch (error) {
    console.error(LOG_PREFIX, 'Failed to fetch captions:', error.message);

    // Retry with srv3 XML format if json3 failed
    if (format === 'json3') {
      console.log(LOG_PREFIX, 'Retrying with srv3 XML format...');
      return fetchCaptionCues(baseUrl, 'srv3');
    }
    return [];
  }
}

async function parseJson3(response) {
  const data = await response.json();
  const cues = [];

  if (!data.events) return cues;

  for (const event of data.events) {
    if (!event.segs) continue;

    const text = event.segs
      .map(seg => seg.utf8)
      .join('')
      .replace(/\n/g, ' ')
      .trim();

    if (!text) continue;

    const startMs = event.tStartMs || 0;
    const durationMs = event.dDurationMs || 3000;

    cues.push({
      startTime: startMs / 1000,
      endTime: (startMs + durationMs) / 1000,
      text,
    });
  }

  console.log(LOG_PREFIX, 'Parsed', cues.length, 'cues from json3 format');
  return cues;
}

async function parseSrv3Xml(response) {
  const text = await response.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/xml');
  const cues = [];

  const textElements = doc.querySelectorAll('text');
  for (const el of textElements) {
    const start = parseFloat(el.getAttribute('start') || '0');
    const dur = parseFloat(el.getAttribute('dur') || '3');
    const content = el.textContent
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/<[^>]*>/g, '')
      .trim();

    if (!content) continue;

    cues.push({
      startTime: start,
      endTime: start + dur,
      text: content,
    });
  }

  console.log(LOG_PREFIX, 'Parsed', cues.length, 'cues from srv3 XML format');
  return cues;
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
