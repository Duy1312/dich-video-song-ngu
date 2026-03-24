/**
 * YouTube Page Context Script (runs in world: "MAIN")
 *
 * This script runs in YouTube's page JS context, NOT the extension's
 * isolated world. It can access window.ytInitialPlayerResponse and
 * other YouTube globals that content scripts cannot.
 *
 * Communicates with the content script via window.postMessage.
 */

(function() {
  const MSG_TYPE = 'dvsn-yt-captions';

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

  // Listen for requests from content script
  window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== MSG_TYPE + '-request') return;

    var tracks = extractCaptionTracks();

    window.postMessage({
      type: MSG_TYPE + '-response',
      tracks: tracks,
      requestId: event.data.requestId
    }, '*');
  });

  // Also auto-send on page load (content script may already be waiting)
  // Use a small delay to ensure ytInitialPlayerResponse is populated
  setTimeout(function() {
    var tracks = extractCaptionTracks();
    if (tracks.length > 0) {
      window.postMessage({
        type: MSG_TYPE + '-response',
        tracks: tracks,
        requestId: 'auto'
      }, '*');
    }
  }, 1500);

  // Listen for YouTube SPA navigation and re-extract
  window.addEventListener('yt-navigate-finish', function() {
    setTimeout(function() {
      var tracks = extractCaptionTracks();
      window.postMessage({
        type: MSG_TYPE + '-response',
        tracks: tracks,
        requestId: 'navigation'
      }, '*');
    }, 2000);
  });
})();
