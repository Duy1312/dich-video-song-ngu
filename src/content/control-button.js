export class ControlButton {
  constructor(video, { onToggleOverlay, onTogglePanel, onChangeLanguage }) {
    this._video = video;
    this._onToggleOverlay = onToggleOverlay;
    this._onTogglePanel = onTogglePanel;
    this._onChangeLanguage = onChangeLanguage;
    this._container = null;
    this._overlayOn = true;
    this._panelOn = false;
  }

  init() {
    if (this._container) return;

    const parent = this._video.parentElement;

    this._container = document.createElement('div');
    this._container.style.position = 'absolute';
    this._container.style.bottom = '50px';
    this._container.style.right = '12px';
    this._container.style.zIndex = '2147483647';

    const btn = document.createElement('button');
    btn.className = 'dvsn-control-btn';
    btn.textContent = '\u7FFB'; // 翻
    btn.title = 'Dịch Video Song Ngữ';

    const menu = document.createElement('div');
    menu.className = 'dvsn-control-menu';

    this._overlayItem = this._createMenuItem('overlay', '\uD83D\uDC41', 'Overlay', this._overlayOn, () => {
      this._overlayOn = !this._overlayOn;
      this._updateItemStatus(this._overlayItem, this._overlayOn);
      this._onToggleOverlay(this._overlayOn);
    });

    this._panelItem = this._createMenuItem('panel', '\uD83D\uDCDD', 'Side Panel', this._panelOn, () => {
      this._panelOn = !this._panelOn;
      this._updateItemStatus(this._panelItem, this._panelOn);
      this._onTogglePanel(this._panelOn);
    });

    const divider = document.createElement('div');
    divider.className = 'dvsn-menu-divider';

    menu.appendChild(this._overlayItem);
    menu.appendChild(this._panelItem);
    menu.appendChild(divider);

    this._container.appendChild(btn);
    this._container.appendChild(menu);
    parent.appendChild(this._container);
  }

  _createMenuItem(id, icon, label, isOn, onClick) {
    const item = document.createElement('button');
    item.className = `dvsn-menu-item ${isOn ? 'active' : ''}`;
    item.dataset.id = id;

    item.innerHTML = `
      <span>${icon}</span>
      <span>${label}</span>
      <span class="dvsn-menu-status ${isOn ? 'on' : 'off'}">${isOn ? '\u2713 ON' : 'OFF'}</span>
    `;

    item.addEventListener('click', onClick);
    return item;
  }

  _updateItemStatus(item, isOn) {
    const status = item.querySelector('.dvsn-menu-status');
    status.className = `dvsn-menu-status ${isOn ? 'on' : 'off'}`;
    status.textContent = isOn ? '\u2713 ON' : 'OFF';
    item.className = `dvsn-menu-item ${isOn ? 'active' : ''}`;
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
  }

  destroy() {
    if (this._container && this._container.parentElement) {
      this._container.parentElement.removeChild(this._container);
    }
    this._container = null;
  }
}
