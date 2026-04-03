const LOG_PREFIX = '[DịchVideo][ControlBtn]';

/**
 * SVG icon for the translate button (matches YouTube's icon style).
 * Shows "翻" character stylized or a translate icon.
 */
const ICON_SVG = `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor">
  <path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>
</svg>`;

export class ControlButton {
  constructor(video, { onToggleOverlay, onTogglePanel, onChangeLanguage }) {
    this._video = video;
    this._onToggleOverlay = onToggleOverlay;
    this._onTogglePanel = onTogglePanel;
    this._onChangeLanguage = onChangeLanguage;
    this._button = null;
    this._menu = null;
    this._menuVisible = false;
    this._overlayOn = true;
    this._panelOn = false;
    this._overlayItem = null;
    this._panelItem = null;
    this._clickOutsideHandler = null;
  }

  init() {
    if (this._button) return;

    const controlBar = this._findControlBar();
    if (controlBar) {
      this._injectIntoControlBar(controlBar);
    } else {
      // Fallback: floating button for non-YouTube sites
      console.log(LOG_PREFIX, 'No control bar found, using floating button');
      this._createFloatingButton();
    }
  }

  /**
   * Find the video player's control bar.
   * YouTube: .ytp-right-controls (right side of control bar)
   * Generic HTML5: look for common control bar patterns
   */
  _findControlBar() {
    const isYouTube = /youtube\.com/.test(window.location.hostname);

    if (isYouTube) {
      const rightControls = document.querySelector('.ytp-right-controls');
      if (rightControls) {
        console.log(LOG_PREFIX, 'Found YouTube control bar');
        return { type: 'youtube', element: rightControls };
      }
    }

    // Generic: look for video controls container
    const player = this._video.closest('[class*="player"]') || this._video.parentElement;
    if (player) {
      const controls = player.querySelector('[class*="controls"], [class*="toolbar"]');
      if (controls) {
        console.log(LOG_PREFIX, 'Found generic control bar');
        return { type: 'generic', element: controls };
      }
    }

    return null;
  }

  _injectIntoControlBar(controlBar) {
    if (controlBar.type === 'youtube') {
      this._injectYouTubeButton(controlBar.element);
    } else {
      this._injectGenericButton(controlBar.element);
    }
  }

  /**
   * Inject a button into YouTube's right controls bar.
   * Styled to match YouTube's native buttons (CC, settings, fullscreen).
   */
  _injectYouTubeButton(rightControls) {
    // Create button matching YouTube's .ytp-button style
    const btn = document.createElement('button');
    btn.className = 'ytp-button dvsn-toolbar-btn';
    btn.setAttribute('aria-label', 'Dịch Video Song Ngữ');
    btn.setAttribute('title', 'Dịch Video Song Ngữ (Bật/Tắt)');
    btn.setAttribute('data-priority', '4');
    btn.innerHTML = ICON_SVG;
    btn.style.cssText = `
      position: relative;
      width: 48px;
      height: 48px;
      padding: 6px;
      opacity: 0.9;
      color: #fff;
      cursor: pointer;
    `;

    // Active indicator dot
    const dot = document.createElement('span');
    dot.className = 'dvsn-active-dot';
    btn.appendChild(dot);

    // Create popup menu
    this._menu = this._createMenu();

    // Toggle menu on click
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleMenu();
    });

    // Insert before the settings button's direct child in rightControls.
    // YouTube may nest buttons inside wrappers, so we need to find
    // the direct child of rightControls that *contains* the target button.
    let insertTarget = null;
    const settingsBtn = rightControls.querySelector('.ytp-settings-button');
    const fullscreenBtn = rightControls.querySelector('.ytp-fullscreen-button');
    const refBtn = settingsBtn || fullscreenBtn;

    if (refBtn) {
      // Walk up from refBtn to find the direct child of rightControls
      let node = refBtn;
      while (node && node.parentElement !== rightControls) {
        node = node.parentElement;
      }
      insertTarget = node; // direct child of rightControls, or null
    }

    if (insertTarget && insertTarget.parentElement === rightControls) {
      rightControls.insertBefore(btn, insertTarget);
    } else {
      // Fallback: prepend to rightControls
      rightControls.prepend(btn);
    }

    // Attach menu to the player (not inside controls, to avoid clipping)
    const player = document.getElementById('movie_player') || this._video.parentElement;
    player.appendChild(this._menu);

    this._button = btn;

    // Close menu when clicking outside
    this._clickOutsideHandler = (e) => {
      if (this._menuVisible && !this._menu.contains(e.target) && !btn.contains(e.target)) {
        this._hideMenu();
      }
    };
    document.addEventListener('click', this._clickOutsideHandler, true);

    console.log(LOG_PREFIX, 'Injected into YouTube control bar');
  }

  _injectGenericButton(controlsElement) {
    const btn = document.createElement('button');
    btn.className = 'dvsn-toolbar-btn dvsn-toolbar-btn-generic';
    btn.setAttribute('title', 'Dịch Video Song Ngữ (Bật/Tắt)');
    btn.innerHTML = ICON_SVG;

    this._menu = this._createMenu();

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleMenu();
    });

    controlsElement.appendChild(btn);

    const player = this._video.closest('[class*="player"]') || this._video.parentElement;
    player.appendChild(this._menu);

    this._button = btn;

    this._clickOutsideHandler = (e) => {
      if (this._menuVisible && !this._menu.contains(e.target) && !btn.contains(e.target)) {
        this._hideMenu();
      }
    };
    document.addEventListener('click', this._clickOutsideHandler, true);

    console.log(LOG_PREFIX, 'Injected into generic control bar');
  }

  _createFloatingButton() {
    const parent = this._video.parentElement;

    const wrapper = document.createElement('div');
    wrapper.className = 'dvsn-floating-wrapper';

    const btn = document.createElement('button');
    btn.className = 'dvsn-floating-btn';
    btn.innerHTML = ICON_SVG;
    btn.setAttribute('title', 'Dịch Video Song Ngữ (Bật/Tắt)');

    this._menu = this._createMenu();
    this._menu.classList.add('dvsn-menu-floating');

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleMenu();
    });

    wrapper.appendChild(btn);
    wrapper.appendChild(this._menu);
    parent.appendChild(wrapper);

    this._button = btn;

    this._clickOutsideHandler = (e) => {
      if (this._menuVisible && !this._menu.contains(e.target) && !btn.contains(e.target)) {
        this._hideMenu();
      }
    };
    document.addEventListener('click', this._clickOutsideHandler, true);

    console.log(LOG_PREFIX, 'Created floating button');
  }

  _createMenu() {
    const menu = document.createElement('div');
    menu.className = 'dvsn-toolbar-menu';

    // Header
    const header = document.createElement('div');
    header.className = 'dvsn-menu-header';
    header.textContent = 'Dịch Video Song Ngữ';
    menu.appendChild(header);

    // Overlay toggle
    this._overlayItem = this._createMenuItem('overlay', 'Phụ đề trên video', this._overlayOn, () => {
      this._overlayOn = !this._overlayOn;
      this._updateItemStatus(this._overlayItem, this._overlayOn);
      this._onToggleOverlay(this._overlayOn);
      this._updateDot();
    });
    menu.appendChild(this._overlayItem);

    // Panel toggle
    this._panelItem = this._createMenuItem('panel', 'Bảng phiên dịch', this._panelOn, () => {
      this._panelOn = !this._panelOn;
      this._updateItemStatus(this._panelItem, this._panelOn);
      this._onTogglePanel(this._panelOn);
      this._updateDot();
    });
    menu.appendChild(this._panelItem);

    return menu;
  }

  _createMenuItem(id, label, isOn, onClick) {
    const item = document.createElement('div');
    item.className = 'dvsn-toolbar-menu-item';
    item.dataset.id = id;

    const labelSpan = document.createElement('span');
    labelSpan.className = 'dvsn-item-label';
    labelSpan.textContent = label;

    const toggle = document.createElement('div');
    toggle.className = `dvsn-toggle ${isOn ? 'on' : ''}`;
    const knob = document.createElement('div');
    knob.className = 'dvsn-toggle-knob';
    toggle.appendChild(knob);

    item.appendChild(labelSpan);
    item.appendChild(toggle);

    item.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });

    return item;
  }

  _updateItemStatus(item, isOn) {
    const toggle = item.querySelector('.dvsn-toggle');
    if (toggle) {
      toggle.className = `dvsn-toggle ${isOn ? 'on' : ''}`;
    }
  }

  _updateDot() {
    const dot = this._button?.querySelector('.dvsn-active-dot');
    if (dot) {
      const anyActive = this._overlayOn || this._panelOn;
      dot.style.display = anyActive ? 'block' : 'none';
    }
  }

  _toggleMenu() {
    if (this._menuVisible) {
      this._hideMenu();
    } else {
      this._showMenu();
    }
  }

  _showMenu() {
    if (!this._menu || !this._button) return;

    // Position menu above the button
    const btnRect = this._button.getBoundingClientRect();
    const playerEl = document.getElementById('movie_player') || this._video.parentElement;
    const playerRect = playerEl.getBoundingClientRect();

    // Position relative to player
    const bottomOffset = playerRect.bottom - btnRect.top + 8;
    const rightOffset = playerRect.right - btnRect.right + (btnRect.width / 2) - 90; // center menu

    this._menu.style.bottom = `${bottomOffset}px`;
    this._menu.style.right = `${Math.max(8, rightOffset)}px`;
    this._menu.style.display = 'block';
    this._menuVisible = true;
  }

  _hideMenu() {
    if (this._menu) {
      this._menu.style.display = 'none';
    }
    this._menuVisible = false;
  }

  setState({ overlayOn, panelOn }) {
    if (overlayOn !== undefined) {
      this._overlayOn = overlayOn;
      if (this._overlayItem) this._updateItemStatus(this._overlayItem, overlayOn);
    }
    if (panelOn !== undefined) {
      this._panelOn = panelOn;
      if (this._panelItem) this._updateItemStatus(this._panelItem, panelOn);
    }
    this._updateDot();
  }

  destroy() {
    if (this._button && this._button.parentElement) {
      this._button.parentElement.removeChild(this._button);
    }
    if (this._menu && this._menu.parentElement) {
      this._menu.parentElement.removeChild(this._menu);
    }
    if (this._clickOutsideHandler) {
      document.removeEventListener('click', this._clickOutsideHandler, true);
    }
    this._button = null;
    this._menu = null;
    this._menuVisible = false;
  }
}
