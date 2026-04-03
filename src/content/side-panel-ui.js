export class SidePanelUI {
  constructor({ onCueClick }) {
    this._onCueClick = onCueClick;
    this._panel = null;
    this._body = null;
    this._cueElements = new Map();
    this._activeCueId = null;
  }

  init() {
    if (this._panel) return;

    this._panel = document.createElement('div');
    this._panel.className = 'dvsn-panel';

    const header = document.createElement('div');
    header.className = 'dvsn-panel-header';

    const title = document.createElement('span');
    title.className = 'dvsn-panel-header-title';
    title.textContent = 'Transcript';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'dvsn-panel-close';
    closeBtn.textContent = '\u00d7';
    closeBtn.addEventListener('click', () => this.hide());

    header.appendChild(title);
    header.appendChild(closeBtn);

    this._body = document.createElement('div');
    this._body.className = 'dvsn-panel-body';

    this._panel.appendChild(header);
    this._panel.appendChild(this._body);
    document.body.appendChild(this._panel);
  }

  addCue(id, { startTime, originalText, translatedText }) {
    if (!this._panel) this.init();

    const cueEl = document.createElement('div');
    cueEl.className = 'dvsn-panel-cue';
    cueEl.dataset.cueId = id;

    const timeEl = document.createElement('div');
    timeEl.className = 'dvsn-panel-cue-time';
    timeEl.textContent = this._formatTime(startTime);

    const origEl = document.createElement('div');
    origEl.className = 'dvsn-panel-cue-original';
    origEl.textContent = originalText;

    const transEl = document.createElement('div');
    transEl.className = 'dvsn-panel-cue-translated';
    transEl.textContent = translatedText;

    cueEl.appendChild(timeEl);
    cueEl.appendChild(origEl);
    cueEl.appendChild(transEl);

    cueEl.addEventListener('click', () => {
      this._onCueClick(startTime);
    });

    this._body.appendChild(cueEl);
    this._cueElements.set(id, cueEl);
  }

  updateCueTranslation(id, translatedText) {
    const cueEl = this._cueElements.get(id);
    if (!cueEl) return;
    const transEl = cueEl.querySelector('.dvsn-panel-cue-translated');
    if (transEl) transEl.textContent = translatedText;
  }

  setActiveCue(id) {
    if (this._activeCueId !== null) {
      const prev = this._cueElements.get(this._activeCueId);
      if (prev) prev.classList.remove('active');
    }

    const current = this._cueElements.get(id);
    if (current) {
      current.classList.add('active');
      current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    this._activeCueId = id;
  }

  show() {
    if (!this._panel) this.init();
    this._panel.style.display = '';
  }

  hide() {
    if (this._panel) {
      this._panel.style.display = 'none';
    }
  }

  clear() {
    if (this._body) this._body.innerHTML = '';
    this._cueElements.clear();
    this._activeCueId = null;
  }

  _formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  destroy() {
    if (this._panel && this._panel.parentElement) {
      this._panel.parentElement.removeChild(this._panel);
    }
    this._panel = null;
    this._body = null;
    this._cueElements.clear();
  }
}
