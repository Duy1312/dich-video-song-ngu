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
    var asr = tracks.filter(function(t) { return t.kind === 'asr'; });
    var pool = manual.length > 0 ? manual : (asr.length > 0 ? asr : tracks);

    // Prefer English (original language for most content)
    var en = pool.filter(function(t) { return t.languageCode === 'en'; });
    if (en.length > 0) return en[0];

    // Then prefer common languages in priority order
    var preferredLangs = ['en', 'en-US', 'en-GB', 'vi', 'es', 'fr', 'de', 'pt', 'ja', 'ko', 'zh', 'zh-Hans', 'zh-Hant'];
    for (var i = 0; i < preferredLangs.length; i++) {
      for (var j = 0; j < pool.length; j++) {
        if (pool[j].languageCode === preferredLangs[i]) return pool[j];
      }
    }

    // Fallback: first track in pool
    return pool[0];
  }

  /**
   * Programmatically activate captions in the YouTube player.
   * This causes YouTube to load caption data and render it in the DOM.
   *
   * @param {Object} track - Track to activate
   * @param {boolean} forceToggle - Soft-refresh caption track (SPA navigation)
   */
  function activateCaptions(track, forceToggle) {
    var player = getPlayer();
    if (!player) {
      console.log('[DịchVideo][PageScript] No movie_player found');
      return false;
    }

    try {
      if (typeof player.loadModule === 'function') {
        player.loadModule('captions');
      }
    } catch(e) {
      console.log('[DịchVideo][PageScript] loadModule failed:', e.message);
    }

    var activated = false;
    var ccBtn = document.querySelector('.ytp-subtitles-button');

    if (forceToggle && ccBtn) {
      var pressed = ccBtn.getAttribute('aria-pressed');
      if (pressed === 'true') {
        // SPA navigation: CC is already ON but showing stale captions.
        // Strategy: Use setOption to switch to the new video's track WITHOUT
        // toggling CC off/on. The old force toggle (off→800ms→on) caused
        // YouTube to re-fetch caption data from scratch, taking 10-15 seconds.
        // setOption('captions', 'track', ...) alone forces a track reload
        // which is much faster (~1-2 seconds).
        console.log('[DịchVideo][PageScript] SPA refresh: reloading caption track via setOption...');

        try {
          if (typeof player.setOption === 'function') {
            // First, clear the current track to force a reload
            player.setOption('captions', 'track', {});

            // Small delay then set the correct track
            setTimeout(function() {
              try {
                player.setOption('captions', 'track', {
                  languageCode: track.languageCode,
                  kind: track.kind || undefined,
                  name: track.name || undefined,
                });
              } catch(e) {
                console.log('[DịchVideo][PageScript] setOption retry failed:', e.message);
              }

              console.log('[DịchVideo][PageScript] Caption track reloaded:',
                track.name, track.languageCode);

              // Notify content script
              window.postMessage({
                type: MSG_TYPE + '-activated',
                tracks: [],
                selectedTrack: {
                  name: track.name,
                  languageCode: track.languageCode,
                  kind: track.kind
                },
                activated: true
              }, '*');
            }, 300);
          }
        } catch(e) {
          console.log('[DịchVideo][PageScript] setOption failed:', e.message);
        }

        return true; // Async activation in progress
      } else {
        // CC button exists but is OFF — just click to turn ON (no off→on needed)
        console.log('[DịchVideo][PageScript] Force toggle: CC already off, clicking ON...');
      }
    }

    try {
      if (typeof player.setOption === 'function') {
        player.setOption('captions', 'track', {
          languageCode: track.languageCode,
          kind: track.kind || undefined,
          name: track.name || undefined,
        });
        console.log('[DịchVideo][PageScript] Activated caption track:',
          track.name, track.languageCode);
        activated = true;
      }
    } catch(e) {
      console.log('[DịchVideo][PageScript] setOption failed:', e.message);
    }

    // Fallback: if CC button is not active, click it
    if (ccBtn) {
      var pressed = ccBtn.getAttribute('aria-pressed');
      if (pressed !== 'true') {
        console.log('[DịchVideo][PageScript] CC not active, clicking button...');
        ccBtn.click();
        activated = true;
      }
    }

    return activated;
  }

  function initCaptions(forceToggle) {
    var tracks = extractCaptionTracks();
    if (tracks.length === 0) {
      console.log('[DịchVideo][PageScript] No caption tracks available');
      return;
    }

    var bestTrack = selectBestTrack(tracks);
    if (!bestTrack) return;

    console.log('[DịchVideo][PageScript] Found', tracks.length, 'track(s). Best:',
      bestTrack.name, bestTrack.languageCode);

    var asyncActivation = activateCaptions(bestTrack, forceToggle);

    // If activateCaptions handled async (forceToggle with CC already on),
    // it will send the postMessage itself after the toggle completes.
    if (asyncActivation && forceToggle) return;

    // Notify content script
    window.postMessage({
      type: MSG_TYPE + '-activated',
      tracks: tracks,
      selectedTrack: {
        name: bestTrack.name,
        languageCode: bestTrack.languageCode,
        kind: bestTrack.kind
      },
      activated: asyncActivation
    }, '*');
  }

  // Listen for requests from content script
  window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    if (!event.data) return;

    if (event.data.type === MSG_TYPE + '-activate') {
      var forceToggle = event.data.forceToggle || false;
      initCaptions(forceToggle);
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

  // Re-init on YouTube SPA navigation is now handled by the content script
  // which sends 'dvsn-yt-captions-activate' with forceToggle=true.
  // We no longer listen to yt-navigate-finish directly to avoid race conditions
  // between the page script and content script both toggling CC simultaneously.
})();
