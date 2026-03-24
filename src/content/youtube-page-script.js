/**
 * YouTube Page Context Script (runs in world: "MAIN")
 *
 * This script runs in YouTube's page JS context to:
 * 1. Extract available caption tracks from player data
 * 2. Programmatically activate captions via the YouTube player API
 *    (so captions appear in DOM even if user hasn't turned on CC)
 * 3. Communicate with the content script via window.postMessage
 *
 * We DON'T fetch from timedtext API (returns empty body).
 * Instead we let YouTube's player load captions, then the content
 * script reads them from the DOM.
 */

(function() {
  var MSG_TYPE = 'dvsn-yt-captions';

  function getPlayer() {
    return document.getElementById('movie_player');
  }

  function extractCaptionTracks() {
    var tracks = [];
    var sources = [
      window.ytInitialPlayerResponse,
    ];

    try {
      if (window.ytplayer && window.ytplayer.config &&
          window.ytplayer.config.args &&
          window.ytplayer.config.args.raw_player_response) {
        sources.push(window.ytplayer.config.args.raw_player_response);
      }
    } catch(e) {}

    try {
      var player = getPlayer();
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
    var manual = tracks.filter(function(t) { return t.kind !== 'asr'; });
    if (manual.length > 0) return manual[0];
    var asr = tracks.filter(function(t) { return t.kind === 'asr'; });
    if (asr.length > 0) return asr[0];
    return tracks[0];
  }

  /**
   * Programmatically activate captions in the YouTube player.
   * This causes YouTube to load caption data and render it in the DOM.
   */
  function activateCaptions(track) {
    var player = getPlayer();
    if (!player) {
      console.log('[DịchVideo][PageScript] No movie_player found');
      return false;
    }

    try {
      // Load the captions module
      if (typeof player.loadModule === 'function') {
        player.loadModule('captions');
        console.log('[DịchVideo][PageScript] Loaded captions module');
      }
    } catch(e) {
      console.log('[DịchVideo][PageScript] loadModule failed:', e.message);
    }

    try {
      // Set the caption track
      if (typeof player.setOption === 'function') {
        player.setOption('captions', 'track', {
          languageCode: track.languageCode,
          kind: track.kind || undefined,
          name: track.name || undefined,
        });
        console.log('[DịchVideo][PageScript] Activated caption track:',
          track.name, track.languageCode);
        return true;
      }
    } catch(e) {
      console.log('[DịchVideo][PageScript] setOption failed:', e.message);
    }

    // Fallback: try clicking the CC button
    try {
      var ccBtn = document.querySelector('.ytp-subtitles-button');
      if (ccBtn && ccBtn.getAttribute('aria-pressed') !== 'true') {
        ccBtn.click();
        console.log('[DịchVideo][PageScript] Clicked CC button');
        return true;
      } else if (ccBtn && ccBtn.getAttribute('aria-pressed') === 'true') {
        console.log('[DịchVideo][PageScript] CC already active');
        return true;
      }
    } catch(e) {}

    return false;
  }

  function initCaptions() {
    var tracks = extractCaptionTracks();
    if (tracks.length === 0) {
      console.log('[DịchVideo][PageScript] No caption tracks available');
      return;
    }

    var bestTrack = selectBestTrack(tracks);
    if (!bestTrack) return;

    console.log('[DịchVideo][PageScript] Found', tracks.length, 'track(s). Best:',
      bestTrack.name, bestTrack.languageCode);

    var activated = activateCaptions(bestTrack);

    // Notify content script
    window.postMessage({
      type: MSG_TYPE + '-activated',
      tracks: tracks,
      selectedTrack: {
        name: bestTrack.name,
        languageCode: bestTrack.languageCode,
        kind: bestTrack.kind
      },
      activated: activated
    }, '*');
  }

  // Listen for requests from content script
  window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    if (!event.data) return;

    if (event.data.type === MSG_TYPE + '-activate') {
      initCaptions();
    }
  });

  // Auto-init on page load with delay for player readiness
  function waitForPlayerAndInit() {
    var attempts = 0;
    var maxAttempts = 20; // 10 seconds max
    var interval = setInterval(function() {
      attempts++;
      var player = getPlayer();
      if (player && typeof player.loadModule === 'function') {
        clearInterval(interval);
        console.log('[DịchVideo][PageScript] Player ready after', attempts * 500, 'ms');
        initCaptions();
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
        console.log('[DịchVideo][PageScript] Player not found after 10s, trying anyway');
        initCaptions();
      }
    }, 500);
  }

  waitForPlayerAndInit();

  // Re-init on YouTube SPA navigation
  window.addEventListener('yt-navigate-finish', function() {
    setTimeout(function() {
      console.log('[DịchVideo][PageScript] SPA navigation, re-initializing...');
      initCaptions();
    }, 2000);
  });
})();
