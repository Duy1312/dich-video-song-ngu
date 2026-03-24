/**
 * YouTube Page Context Script (runs in world: "MAIN")
 *
 * This script runs in YouTube's page JS context, NOT the extension's
 * isolated world. It can access window.ytInitialPlayerResponse and
 * other YouTube globals that content scripts cannot.
 *
 * It also fetches caption data directly — this is critical because
 * fetching from the content script's isolated world may fail due to
 * missing cookies/session tokens.
 *
 * Communicates with the content script via window.postMessage.
 */

(function() {
  var MSG_TYPE = 'dvsn-yt-captions';

  function extractCaptionTracks() {
    var tracks = [];
    var sources = [
      window.ytInitialPlayerResponse,
    ];

    // Try ytplayer.config
    try {
      if (window.ytplayer && window.ytplayer.config &&
          window.ytplayer.config.args &&
          window.ytplayer.config.args.raw_player_response) {
        sources.push(window.ytplayer.config.args.raw_player_response);
      }
    } catch(e) {}

    // Try movie_player API
    try {
      var player = document.getElementById('movie_player');
      if (player && typeof player.getPlayerResponse === 'function') {
        sources.push(player.getPlayerResponse());
      }
    } catch(e) {}

    for (var i = 0; i < sources.length; i++) {
      var response = sources[i];
      if (!response) continue;

      try {
        var captionData = response.captions &&
          response.captions.playerCaptionsTracklistRenderer;
        if (!captionData || !captionData.captionTracks) continue;

        tracks = captionData.captionTracks.map(function(t) {
          return {
            baseUrl: t.baseUrl,
            languageCode: t.languageCode,
            name: (t.name && (t.name.simpleText ||
              (t.name.runs && t.name.runs[0] && t.name.runs[0].text))) ||
              t.languageCode,
            kind: t.kind || '',
            isTranslatable: t.isTranslatable || false,
            vssId: t.vssId || ''
          };
        });

        if (tracks.length > 0) break;
      } catch(e) {}
    }

    return tracks;
  }

  function selectBestTrack(tracks) {
    if (!tracks || tracks.length === 0) return null;
    // Prefer manual tracks over auto-generated
    var manual = tracks.filter(function(t) { return t.kind !== 'asr'; });
    if (manual.length > 0) return manual[0];
    var asr = tracks.filter(function(t) { return t.kind === 'asr'; });
    if (asr.length > 0) return asr[0];
    return tracks[0];
  }

  function parseJson3(data) {
    var cues = [];
    if (!data || !data.events) return cues;

    for (var i = 0; i < data.events.length; i++) {
      var event = data.events[i];
      if (!event.segs) continue;

      var text = '';
      for (var j = 0; j < event.segs.length; j++) {
        text += event.segs[j].utf8 || '';
      }
      text = text.replace(/\n/g, ' ').trim();
      if (!text) continue;

      var startMs = event.tStartMs || 0;
      var durationMs = event.dDurationMs || 3000;

      cues.push({
        startTime: startMs / 1000,
        endTime: (startMs + durationMs) / 1000,
        text: text
      });
    }
    return cues;
  }

  function parseSrv3Xml(text) {
    var cues = [];
    var parser = new DOMParser();
    var doc = parser.parseFromString(text, 'text/xml');
    var elements = doc.querySelectorAll('text');

    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      var start = parseFloat(el.getAttribute('start') || '0');
      var dur = parseFloat(el.getAttribute('dur') || '3');
      var content = el.textContent
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
        text: content
      });
    }
    return cues;
  }

  function fetchAndParseCaptions(track) {
    var url = track.baseUrl;
    console.log('[DịchVideo][PageScript] Fetching captions:', track.name, track.languageCode);
    console.log('[DịchVideo][PageScript] URL:', url.substring(0, 120) + '...');

    return fetch(url, { credentials: 'include' })
      .then(function(response) {
        console.log('[DịchVideo][PageScript] Response status:', response.status, 'ok:', response.ok);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.text();
      })
      .then(function(text) {
        console.log('[DịchVideo][PageScript] Response length:', text.length, 'first 100:', text.substring(0, 100));

        if (!text || text.length < 10) {
          throw new Error('Empty response');
        }

        // Try JSON first
        if (text.trimStart().charAt(0) === '{') {
          try {
            var data = JSON.parse(text);
            var cues = parseJson3(data);
            if (cues.length > 0) {
              console.log('[DịchVideo][PageScript] Parsed', cues.length, 'cues (json3)');
              return cues;
            }
          } catch(e) {
            console.log('[DịchVideo][PageScript] JSON parse failed, trying XML');
          }
        }

        // Try XML
        if (text.indexOf('<text') !== -1 || text.indexOf('<?xml') !== -1) {
          var cues = parseSrv3Xml(text);
          if (cues.length > 0) {
            console.log('[DịchVideo][PageScript] Parsed', cues.length, 'cues (XML)');
            return cues;
          }
        }

        console.warn('[DịchVideo][PageScript] Could not parse response');
        return [];
      })
      .catch(function(error) {
        console.error('[DịchVideo][PageScript] Fetch failed:', error.message);
        return [];
      });
  }

  // Listen for requests from content script
  window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    if (!event.data) return;

    // Track list request
    if (event.data.type === MSG_TYPE + '-request') {
      var tracks = extractCaptionTracks();
      window.postMessage({
        type: MSG_TYPE + '-response',
        tracks: tracks,
        requestId: event.data.requestId
      }, '*');
    }

    // Fetch cues request (content script asks page script to fetch)
    if (event.data.type === MSG_TYPE + '-fetch-cues') {
      var tracks = extractCaptionTracks();
      var bestTrack = selectBestTrack(tracks);

      if (!bestTrack) {
        window.postMessage({
          type: MSG_TYPE + '-cues-response',
          cues: [],
          track: null,
          error: 'No caption tracks found',
          requestId: event.data.requestId
        }, '*');
        return;
      }

      fetchAndParseCaptions(bestTrack).then(function(cues) {
        window.postMessage({
          type: MSG_TYPE + '-cues-response',
          cues: cues,
          track: {
            name: bestTrack.name,
            languageCode: bestTrack.languageCode,
            kind: bestTrack.kind
          },
          requestId: event.data.requestId
        }, '*');
      });
    }
  });

  // Auto-fetch on page load
  setTimeout(function() {
    var tracks = extractCaptionTracks();
    if (tracks.length === 0) return;

    var bestTrack = selectBestTrack(tracks);
    if (!bestTrack) return;

    fetchAndParseCaptions(bestTrack).then(function(cues) {
      window.postMessage({
        type: MSG_TYPE + '-cues-response',
        cues: cues,
        track: {
          name: bestTrack.name,
          languageCode: bestTrack.languageCode,
          kind: bestTrack.kind
        },
        requestId: 'auto'
      }, '*');
    });
  }, 1500);

  // Re-fetch on YouTube SPA navigation
  window.addEventListener('yt-navigate-finish', function() {
    setTimeout(function() {
      var tracks = extractCaptionTracks();
      if (tracks.length === 0) return;

      var bestTrack = selectBestTrack(tracks);
      if (!bestTrack) return;

      fetchAndParseCaptions(bestTrack).then(function(cues) {
        window.postMessage({
          type: MSG_TYPE + '-cues-response',
          cues: cues,
          track: {
            name: bestTrack.name,
            languageCode: bestTrack.languageCode,
            kind: bestTrack.kind
          },
          requestId: 'navigation'
        }, '*');
      });
    }, 2000);
  });
})();
