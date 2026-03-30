/**
 * Platform Registry — maps URL patterns to platform-specific caption configs.
 *
 * Each platform config tells the subtitle extractor:
 *  - WHERE to find captions in the DOM
 *  - WHICH element to observe for mutations
 *  - HOW to filter out UI text (settings menus, etc.)
 *  - CSS to hide native captions (so we can replace them)
 */

export const PLATFORMS = [
  {
    name: 'youtube',
    hostPattern: /^(www\.)?youtube\.com$/,
    videoSelector: '#movie_player video.html5-main-video',
    captionContainer: '#movie_player',
    captionSelector: '.ytp-caption-segment',
    captionWindowSelector: '.ytp-caption-window-bottom',
    hideCaptionCSS: `
      .ytp-caption-window-container .ytp-caption-window-bottom {
        color: transparent !important;
        background: transparent !important;
        text-shadow: none !important;
        -webkit-text-fill-color: transparent !important;
        pointer-events: none !important;
      }
    `,
    uiFilterPatterns: [
      /^(Tiếng|English|Français|Deutsch|Español|日本語|한국어|中文|العربية)/,
      /được tạo tự động/,
      /auto-generated/i,
      /Nhấp vào/,
      /Click .* settings/i,
      /để biết cài đặt/,
      /caption settings/i,
    ],
    // YouTube needs special multi-window reading
    readCaptions(container, segmentSelector) {
      const captionWindows = container.querySelectorAll(this.captionWindowSelector);
      const lines = [];

      captionWindows.forEach(win => {
        const segments = win.querySelectorAll(segmentSelector);
        if (segments.length > 0) {
          const words = [];
          segments.forEach(seg => {
            const text = seg.textContent.trim();
            if (text && !this.uiFilterPatterns.some(p => p.test(text))) {
              words.push(text);
            }
          });
          const lineText = words.join(' ');
          if (lineText) lines.push(lineText);
        }
      });

      return lines.join(' ');
    },
  },

  {
    name: 'netflix',
    hostPattern: /^(www\.)?netflix\.com$/,
    videoSelector: 'video',
    captionContainer: '.player-timedtext',
    captionSelector: '.player-timedtext-text-container span',
    hideCaptionCSS: `
      .player-timedtext {
        color: transparent !important;
        -webkit-text-fill-color: transparent !important;
      }
      .player-timedtext-text-container {
        background: transparent !important;
      }
    `,
    uiFilterPatterns: [],
  },

  {
    name: 'vimeo',
    hostPattern: /^(www\.)?vimeo\.com$/,
    videoSelector: 'video',
    captionContainer: '.vp-captions',
    captionSelector: '.vp-captions span',
    hideCaptionCSS: `
      .vp-captions {
        color: transparent !important;
        -webkit-text-fill-color: transparent !important;
      }
    `,
    uiFilterPatterns: [],
  },

  {
    name: 'facebook',
    hostPattern: /^(www\.)?(facebook\.com|fb\.watch)$/,
    videoSelector: 'video',
    captionContainer: 'div[data-testid="video_overlay_wrapper"]',
    captionSelector: 'div[data-testid="video_caption"] span',
    hideCaptionCSS: `
      div[data-testid="video_caption"] {
        color: transparent !important;
        -webkit-text-fill-color: transparent !important;
      }
    `,
    uiFilterPatterns: [],
  },

  {
    name: 'udemy',
    hostPattern: /^(www\.)?udemy\.com$/,
    videoSelector: 'video',
    captionContainer: '.captions-display--captions-container',
    captionSelector: '.captions-display--captions-cue-text span',
    hideCaptionCSS: `
      .captions-display--captions-container {
        color: transparent !important;
        -webkit-text-fill-color: transparent !important;
        background: transparent !important;
      }
    `,
    uiFilterPatterns: [],
  },

  {
    name: 'coursera',
    hostPattern: /^(www\.)?coursera\.org$/,
    videoSelector: 'video',
    captionContainer: '.rc-Phrase',
    captionSelector: '.rc-Phrase span',
    // Coursera also uses TextTrack — DOM observation is fallback
    hideCaptionCSS: `
      .rc-Phrase {
        color: transparent !important;
        -webkit-text-fill-color: transparent !important;
      }
    `,
    uiFilterPatterns: [],
  },

  {
    name: 'edx',
    hostPattern: /^(courses\.)?edx\.org$/,
    videoSelector: 'video',
    captionContainer: '.subtitles-menu',
    captionSelector: '.subtitles-menu li.current',
    hideCaptionCSS: `
      .subtitles-menu li.current {
        color: transparent !important;
        -webkit-text-fill-color: transparent !important;
      }
    `,
    uiFilterPatterns: [],
  },

  {
    name: 'khan-academy',
    hostPattern: /^(www\.)?khanacademy\.org$/,
    videoSelector: 'video',
    captionContainer: '.video-js',
    captionSelector: '.vjs-text-track-cue div',
    hideCaptionCSS: `
      .vjs-text-track-cue div {
        color: transparent !important;
        -webkit-text-fill-color: transparent !important;
      }
    `,
    uiFilterPatterns: [],
  },

  {
    name: 'tiktok',
    hostPattern: /^(www\.)?tiktok\.com$/,
    videoSelector: 'video',
    captionContainer: 'div[class*="DivCaptionText"]',
    captionSelector: 'div[class*="DivCaptionText"] span',
    hideCaptionCSS: `
      div[class*="DivCaptionText"] {
        color: transparent !important;
        -webkit-text-fill-color: transparent !important;
      }
    `,
    uiFilterPatterns: [],
  },

  {
    name: 'twitter',
    hostPattern: /^(www\.)?(twitter\.com|x\.com)$/,
    videoSelector: 'video',
    captionContainer: 'div[data-testid="videoPlayer"]',
    captionSelector: 'div[data-testid="videoPlayer"] span[class*="caption"]',
    hideCaptionCSS: '',
    uiFilterPatterns: [],
  },

  {
    name: 'dailymotion',
    hostPattern: /^(www\.)?dailymotion\.com$/,
    videoSelector: 'video',
    captionContainer: '.cue-region',
    captionSelector: '.cue-region span',
    hideCaptionCSS: `
      .cue-region {
        color: transparent !important;
        -webkit-text-fill-color: transparent !important;
      }
    `,
    uiFilterPatterns: [],
  },

  {
    name: 'bilibili',
    hostPattern: /^(www\.)?bilibili\.com$/,
    videoSelector: 'video',
    captionContainer: '.bilibili-player-video-subtitle',
    captionSelector: '.bilibili-player-video-subtitle span',
    hideCaptionCSS: `
      .bilibili-player-video-subtitle {
        color: transparent !important;
        -webkit-text-fill-color: transparent !important;
      }
    `,
    uiFilterPatterns: [],
  },
];

/**
 * Detect which platform the current URL belongs to.
 * @param {string} url — full page URL (window.location.href)
 * @returns {Object|null} — platform config or null for unknown sites
 */
export function detectPlatform(url) {
  let hostname;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return null;
  }

  for (const platform of PLATFORMS) {
    if (platform.hostPattern.test(hostname)) {
      return platform;
    }
  }
  return null;
}

/**
 * Default caption reading logic for platforms without custom readCaptions().
 * Reads all text from captionSelector elements inside the container.
 */
export function defaultReadCaptions(container, captionSelector, uiFilterPatterns = []) {
  const segments = container.querySelectorAll(captionSelector);
  if (!segments || segments.length === 0) {
    return container.textContent.trim();
  }

  const parts = [];
  segments.forEach(seg => {
    const text = seg.textContent.trim();
    if (text && !uiFilterPatterns.some(p => p.test(text))) {
      parts.push(text);
    }
  });
  return parts.join(' ').trim();
}
