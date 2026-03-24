/**
 * YouTube Caption Fetcher
 *
 * Fetches caption tracks directly from YouTube's player data
 * instead of relying on DOM observation.
 *
 * Content scripts run in an isolated world, so we can't access
 * window.ytInitialPlayerResponse directly. We use two approaches:
 * 1. Inject a script into the page context to read the global variable
 * 2. Parse script tags in the HTML source
 */

const LOG_PREFIX = '[DịchVideo][YT-Captions]';

/**
 * Extract caption track list from YouTube page data.
 * Uses multiple fallback strategies.
 */
export function extractCaptionTracks() {
  // Method 1: Inject script into page context to access global vars
  const tracksFromPageContext = extractViaPageInjection();
  if (tracksFromPageContext && tracksFromPageContext.length > 0) {
    console.log(LOG_PREFIX, 'Found tracks via page injection:', tracksFromPageContext.length);
    return tracksFromPageContext;
  }

  // Method 2: Parse from script tags in page HTML
  try {
    const tracks = extractFromScriptTags();
    if (tracks && tracks.length > 0) {
      console.log(LOG_PREFIX, 'Found tracks from script tags:', tracks.length);
      return tracks;
    }
  } catch (e) {
    console.warn(LOG_PREFIX, 'Script tag parsing failed:', e.message);
  }

  console.warn(LOG_PREFIX, 'No caption tracks found from any method');
  return [];
}

/**
 * Inject a script into the page context to read ytInitialPlayerResponse.
 * Communicates back via a custom DOM event.
 */
function extractViaPageInjection() {
  // Check if we already have data from a previous injection
  const existing = document.getElementById('dvsn-yt-caption-data');
  if (existing) {
    try {
      const data = JSON.parse(existing.textContent);
      existing.remove();
      return data;
    } catch (e) {
      existing.remove();
    }
  }

  // Inject a script that reads the global and writes to a hidden element
  const script = document.createElement('script');
  script.textContent = `
    (function() {
      try {
        var tracks = [];
        var sources = [
          window.ytInitialPlayerResponse,
          window.ytplayer && window.ytplayer.config && window.ytplayer.config.args && window.ytplayer.config.args.raw_player_response
        ];

        // Also try movie_player API
        var player = document.getElementById('movie_player');
        if (player && typeof player.getPlayerResponse === 'function') {
          sources.push(player.getPlayerResponse());
        }

        for (var i = 0; i < sources.length; i++) {
          var response = sources[i];
          if (!response) continue;
          var captionData = response.captions && response.captions.playerCaptionsTracklistRenderer;
          if (!captionData || !captionData.captionTracks) continue;
          tracks = captionData.captionTracks.map(function(t) {
            return {
              baseUrl: t.baseUrl,
              languageCode: t.languageCode,
              name: (t.name && (t.name.simpleText || (t.name.runs && t.name.runs[0] && t.name.runs[0].text))) || t.languageCode,
              kind: t.kind || '',
              isTranslatable: t.isTranslatable || false,
              vssId: t.vssId || ''
            };
          });
          if (tracks.length > 0) break;
        }

        var el = document.createElement('div');
        el.id = 'dvsn-yt-caption-data';
        el.style.display = 'none';
        el.textContent = JSON.stringify(tracks);
        document.documentElement.appendChild(el);
      } catch(e) {
        // silently fail
      }
    })();
  `;
  document.documentElement.appendChild(script);
  script.remove();

  // Now read the data element
  const dataEl = document.getElementById('dvsn-yt-caption-data');
  if (dataEl) {
    try {
      const data = JSON.parse(dataEl.textContent);
      dataEl.remove();
      return data;
    } catch (e) {
      dataEl.remove();
    }
  }

  return null;
}

function extractFromScriptTags() {
  const scripts = document.querySelectorAll('script');
  for (const script of scripts) {
    const text = script.textContent;
    if (!text) continue;

    // Look for ytInitialPlayerResponse in script content
    const match = text.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
    if (match) {
      try {
        const data = JSON.parse(match[1]);
        const tracks = getTracksFromPlayerResponse(data);
        if (tracks && tracks.length > 0) return tracks;
      } catch (e) {
        // JSON parse failed, try next
      }
    }

    // Also try var ytInitialPlayerResponse = {...}
    const match2 = text.match(/var\s+ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
    if (match2) {
      try {
        const data = JSON.parse(match2[1]);
        const tracks = getTracksFromPlayerResponse(data);
        if (tracks && tracks.length > 0) return tracks;
      } catch (e) {
        // JSON parse failed
      }
    }
  }
  return [];
}

/**
 * Fetch subtitle cues from a caption track URL.
 * YouTube returns XML (timedtext) or JSON (json3) format.
 * @param {string} baseUrl - The caption track URL from YouTube
 * @param {string} format - 'json3' or 'srv3' (default: json3)
 * @returns {Array<{startTime: number, endTime: number, text: string}>}
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
    // Skip events without segments (e.g., format events)
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
 * Priority: original language > auto-generated > first available
 */
export function selectBestTrack(tracks) {
  if (!tracks || tracks.length === 0) return null;

  // Prefer non-ASR (manual) tracks
  const manual = tracks.filter(t => t.kind !== 'asr');
  if (manual.length > 0) {
    console.log(LOG_PREFIX, 'Using manual caption track:', manual[0].name, manual[0].languageCode);
    return manual[0];
  }

  // Fall back to ASR (auto-generated)
  const asr = tracks.filter(t => t.kind === 'asr');
  if (asr.length > 0) {
    console.log(LOG_PREFIX, 'Using auto-generated caption track:', asr[0].name, asr[0].languageCode);
    return asr[0];
  }

  // Use first available
  console.log(LOG_PREFIX, 'Using first available track:', tracks[0].name, tracks[0].languageCode);
  return tracks[0];
}
