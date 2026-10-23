/* automation-status-card – Automation an/aus mit optionalem Schlummern */
const ASC_HINT = "var(--zh-hint, var(--warning-color, #ff9800))";
const ASC_ON = "var(--zh-ok, var(--primary-color))";
const ASC_TINT = (c, p = 16) => `color-mix(in srgb, ${c} ${p}%, transparent)`;

class AutomationStatusCard extends HTMLElement {
  setConfig(config) {
    if (!config.entity) throw new Error('entity ist erforderlich');
    this._config = config;
  }
  set hass(hass) {
    this._hass = hass;
    if (!this._built) { this._build(); this._built = true; }
    this._render();
  }
  _build() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; }
        ha-card { padding: 12px var(--zh-pad, 16px); display:flex; flex-direction:column; gap:10px; }
        .row { display:flex; align-items:center; gap:12px; }
        .icon-wrap {
          width:var(--zh-touch, 40px); height:var(--zh-touch, 40px); border-radius:50%;
          display:flex; align-items:center; justify-content:center; flex-shrink:0;
          transition: background .2s, color .2s;
        }
        ha-icon { --mdc-icon-size: 22px; }
        .info { flex:1; min-width:0; cursor:pointer; }
        .name { font-weight:600; font-size:var(--zh-f-card, 15px); color: var(--primary-text-color); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .state { font-size:var(--zh-f-meta, 13px); color: var(--secondary-text-color); margin-top:1px; }
        .state.snoozing { color: ${ASC_HINT}; font-weight:600; }
        .desc {
          font-size:var(--zh-f-label, 12px); color: var(--secondary-text-color); margin-top:2px;
          display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
        }
        .desc[hidden] { display:none; }
        ha-switch { flex-shrink:0; }
        .progress { height:4px; border-radius:2px; background: var(--secondary-background-color, rgba(127,127,127,0.18)); overflow:hidden; }
        .progress > div { height:100%; background:${ASC_HINT}; transition: width 1s linear; }
        .actions { display:flex; gap:8px; }
        .btn {
          flex:1; display:flex; align-items:center; justify-content:center; gap:6px;
          min-height:36px; border-radius:var(--zh-r-in, 12px);
          font-size:var(--zh-f-meta, 13px); font-weight:600; color: var(--primary-text-color);
          cursor:pointer; user-select:none; -webkit-tap-highlight-color: transparent;
        }
        .btn ha-icon { --mdc-icon-size: 16px; color: var(--btn-fg); }
      </style>
      <ha-card>
        <div class="row">
          <div class="icon-wrap"><ha-icon></ha-icon></div>
          <div class="info">
            <div class="name"></div>
            <div class="state"></div>
          </div>
          <ha-switch></ha-switch>
        </div>
        <div class="desc" hidden></div>
        <div class="progress" hidden><div></div></div>
        <div class="actions" hidden></div>
      </ha-card>
    `;
    const q = (s) => this.shadowRoot.querySelector(s);
    q('.info').addEventListener('click', () => this._moreInfo());
    q('ha-switch').addEventListener('change', (e) => this._toggle(e));
    this._els = {
      iconWrap: q('.icon-wrap'), icon: q('ha-icon'), name: q('.name'), state: q('.state'),
      sw: q('ha-switch'), desc: q('.desc'), progress: q('.progress'), progressBar: q('.progress > div'), actions: q('.actions')
    };
  }
  _moreInfo() {
    this.dispatchEvent(new CustomEvent('hass-more-info', { bubbles: true, composed: true, detail: { entityId: this._config.entity } }));
  }
  _toggle(e) {
    this._hass.callService('automation', e.target.checked ? 'turn_on' : 'turn_off', {}, { entity_id: this._config.entity });
  }
  _snooze(minutes) {
    const script = this._config.snooze_script || 'script.automation_schlummern';
    const parts = script.split('.');
    this._hass.callService(parts[0], parts[1], { automation_entity: this._config.entity, minuten: minutes });
  }
  _resumeNow() {
    this._hass.callService('automation', 'turn_on', {}, { entity_id: this._config.entity });
    if (this._config.timer_entity) {
      this._hass.callService('timer', 'cancel', {}, { entity_id: this._config.timer_entity });
    }
  }
  _btn(fg, icon, label, fn) {
    const btn = document.createElement('div');
    btn.className = 'btn';
    btn.style.background = `color-mix(in srgb, ${fg} 14%, var(--card-background-color))`;
    btn.style.setProperty('--btn-fg', fg);
    btn.innerHTML = `<ha-icon icon="${icon}"></ha-icon> ${label}`;
    btn.addEventListener('click', fn);
    this._els.actions.appendChild(btn);
  }
  _render() {
    const hass = this._hass, cfg = this._config;
    const stateObj = hass.states[cfg.entity];
    if (!stateObj) { this._els.name.textContent = cfg.entity + ' nicht gefunden'; this._clearTick(); return; }
    const isOn = stateObj.state === 'on';
    this._els.icon.setAttribute('icon', cfg.icon || 'mdi:robot');
    this._els.name.textContent = cfg.name || stateObj.attributes.friendly_name || cfg.entity;
    this._els.sw.checked = isOn;

    if (cfg.description) {
      this._els.desc.textContent = cfg.description;
      this._els.desc.hidden = false;
    } else {
      this._els.desc.hidden = true;
    }

    const timerObj = cfg.timer_entity ? hass.states[cfg.timer_entity] : null;
    const snoozing = !!(timerObj && timerObj.state === 'active');

    this._els.state.classList.toggle('snoozing', snoozing);
    if (snoozing) {
      const finishesAt = new Date(timerObj.attributes.finishes_at).getTime();
      const remainMs = Math.max(0, finishesAt - Date.now());
      const mins = Math.ceil(remainMs / 60000);
      this._els.state.textContent = `Schlummert · noch ${mins} Min`;
      this._els.iconWrap.style.background = ASC_TINT(ASC_HINT);
      this._els.iconWrap.style.color = ASC_HINT;
      const d = (timerObj.attributes.duration || '0:00:00').split(':').map(Number);
      const totalMs = (d[0] * 3600 + d[1] * 60 + d[2]) * 1000;
      const pct = totalMs > 0 ? Math.min(100, ((totalMs - remainMs) / totalMs) * 100) : 0;
      this._els.progress.hidden = false;
      this._els.progressBar.style.width = pct + '%';
      this._ensureTick();
    } else {
      this._els.state.textContent = isOn ? 'Aktiv' : 'Pausiert';
      if (isOn) {
        this._els.iconWrap.style.background = ASC_TINT(ASC_ON);
        this._els.iconWrap.style.color = ASC_ON;
      } else {
        this._els.iconWrap.style.background = ASC_TINT('var(--disabled-text-color, #9e9e9e)', 14);
        this._els.iconWrap.style.color = 'var(--disabled-text-color, #9e9e9e)';
      }
      this._els.progress.hidden = true;
      this._clearTick();
    }

    this._els.actions.innerHTML = '';
    let showActions = false;
    if (snoozing) {
      showActions = true;
      this._btn(ASC_HINT, 'mdi:play', 'Jetzt reaktivieren', () => this._resumeNow());
    } else if (isOn && cfg.snooze_options && cfg.snooze_options.length && cfg.timer_entity) {
      showActions = true;
      cfg.snooze_options.forEach((opt) => this._btn('var(--primary-color)', 'mdi:timer-outline', opt.label, () => this._snooze(opt.minutes)));
    }
    this._els.actions.hidden = !showActions;
  }
  _ensureTick() {
    if (this._timerTick) return;
    this._timerTick = setInterval(() => this._render(), 1000);
  }
  _clearTick() {
    if (this._timerTick) { clearInterval(this._timerTick); this._timerTick = null; }
  }
  disconnectedCallback() { this._clearTick(); }
  getCardSize() {
    let size = (this._config && this._config.snooze_options) ? 3 : 2;
    if (this._config && this._config.description) size += 1;
    return size;
  }
  static getStubConfig() { return { entity: 'automation.example' }; }
}

if (!customElements.get('automation-status-card')) {
  customElements.define('automation-status-card', AutomationStatusCard);
  window.customCards = window.customCards || [];
  window.customCards.push({ type: 'automation-status-card', name: 'Automation Status Card', description: 'Statuskarte für Automationen mit optionalem Schlummern' });
}
