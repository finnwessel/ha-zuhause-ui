/* appliance-status-card – Status/Fortschritt für Haushaltsgeräte (Waschmaschine, Trockner, …) */
/* Flach & getönt; Akzent per Rollenfarbe (Standard: --zh-appliance). Hex- und var()-Farben gehen beide. */
const APC_HINT = "var(--zh-hint, var(--warning-color, #ff9800))";
const APC_ERR = "var(--zh-error, var(--error-color, #db4437))";

class ApplianceStatusCard extends HTMLElement {
  setConfig(config) {
    if (!config.state_entity && !config.power_entity) {
      throw new Error('appliance-status-card: state_entity oder power_entity ist erforderlich');
    }
    this.config = {
      name: 'Gerät',
      icon: 'mdi:washing-machine',
      color: 'var(--zh-appliance, var(--blue-color, #2196f3))',
      idle_states: ['off', 'idle', 'inactive', 'ready', 'end', 'finished', 'power_off', 'aborting', 'reserved', 'initial'],
      state_labels: {},
      program_labels: {},
      ...config,
    };
    this._built = false;
    this._armed = null;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._built) { this._build(); this._built = true; }
    this._update();
  }

  disconnectedCallback() { clearTimeout(this._armTimer); }
  getCardSize() { return 3; }

  _build() {
    this.innerHTML = `
      <ha-card id="card">
        <style>
          appliance-status-card ha-card { padding: var(--zh-pad, 16px); }
          appliance-status-card .row { display: flex; align-items: center; gap: 12px; }
          appliance-status-card .icon-wrap {
            position: relative; width: var(--zh-touch, 40px); height: var(--zh-touch, 40px); min-width: var(--zh-touch, 40px); border-radius: 50%;
            display: flex; align-items: center; justify-content: center; cursor: pointer;
            background: color-mix(in srgb, var(--acc) 16%, transparent); color: var(--acc);
            transition: background .3s, color .3s, transform .15s;
          }
          appliance-status-card .icon-wrap:active { transform: scale(.92); }
          appliance-status-card .icon-wrap ha-icon { --mdc-icon-size: 22px; }
          appliance-status-card .icon-wrap.idle { background: color-mix(in srgb, var(--secondary-text-color) 12%, transparent); color: var(--secondary-text-color); }
          appliance-status-card .icon-wrap.active { animation: apc-pulse 2s ease-in-out infinite; }
          appliance-status-card .icon-wrap.door-alert { background: color-mix(in srgb, ${APC_HINT} 18%, transparent); color: ${APC_HINT}; }
          @keyframes apc-pulse { 0%,100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--acc) 40%, transparent); } 50% { box-shadow: 0 0 0 7px transparent; } }
          appliance-status-card .info { flex: 1; min-width: 0; cursor: pointer; }
          appliance-status-card .name { font-size: var(--zh-f-card, 15px); font-weight: 600; color: var(--primary-text-color); }
          appliance-status-card .status { font-size: var(--zh-f-meta, 13px); color: var(--secondary-text-color); margin-top: 2px; }
          appliance-status-card .status.active { color: var(--acc); font-weight: 600; }
          appliance-status-card .status.door-alert { color: ${APC_HINT}; font-weight: 600; }
          appliance-status-card .toggle {
            width: 44px; height: 24px; border-radius: 12px; flex: none; cursor: pointer;
            background: color-mix(in srgb, var(--secondary-text-color) 35%, transparent);
            position: relative; transition: background .25s; display: none;
          }
          appliance-status-card .toggle .knob {
            position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%;
            background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.3); transition: left .25s;
          }
          appliance-status-card .toggle.on { background: var(--acc); }
          appliance-status-card .toggle.on .knob { left: 22px; }
          appliance-status-card .bar-wrap { margin-top: var(--zh-gap, 12px); display: none; }
          appliance-status-card .bar-top { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 6px; }
          appliance-status-card .bar-pct { font-size: var(--zh-f-title, 18px); font-weight: 600; color: var(--primary-text-color); }
          appliance-status-card .bar-finish { display: inline-flex; align-items: center; gap: 4px; font-size: var(--zh-f-label, 12px); color: var(--secondary-text-color); }
          appliance-status-card .bar-finish ha-icon { --mdc-icon-size: 14px; }
          appliance-status-card .bar-track { height: 8px; border-radius: 4px; background: var(--secondary-background-color, rgba(127,127,127,.16)); overflow: hidden; }
          appliance-status-card .bar-fill { height: 100%; border-radius: 4px; width: 0%; background: var(--acc); transition: width .7s ease; }
          appliance-status-card .info-tiles { display: flex; gap: 8px; margin-top: var(--zh-gap, 12px); }
          appliance-status-card .info-tile {
            flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; padding: 8px 10px;
            border-radius: var(--zh-r-in, 12px); background: var(--secondary-background-color, rgba(127,127,127,.1)); cursor: pointer;
            transition: transform .12s;
          }
          appliance-status-card .info-tile:active { transform: scale(.96); }
          appliance-status-card .it-badge {
            width: 28px; height: 28px; min-width: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
            background: color-mix(in srgb, var(--acc) 16%, transparent); color: var(--acc);
          }
          appliance-status-card .it-badge ha-icon { --mdc-icon-size: 16px; }
          appliance-status-card .it-text { min-width: 0; }
          appliance-status-card .it-val { font-size: var(--zh-f-meta, 13px); font-weight: 600; color: var(--primary-text-color); line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          appliance-status-card .it-lbl { font-size: 11px; color: var(--secondary-text-color); }
          appliance-status-card .info-tile.warn .it-badge { background: color-mix(in srgb, ${APC_HINT} 18%, transparent); color: ${APC_HINT}; }
          appliance-status-card .info-tile.warn .it-val { color: ${APC_HINT}; }
          appliance-status-card .action-btn {
            display: none; align-items: center; justify-content: center; gap: 8px;
            margin-top: 10px; min-height: var(--zh-touch, 40px); border-radius: var(--zh-r-in, 12px);
            font-size: var(--zh-f-body, 14px); font-weight: 600; cursor: pointer; color: var(--primary-text-color);
            background: color-mix(in srgb, var(--btn-fg) 14%, var(--card-background-color));
            transition: transform .12s;
          }
          appliance-status-card .action-btn:active { transform: scale(.97); }
          appliance-status-card .action-btn ha-icon { --mdc-icon-size: 18px; color: var(--btn-fg); }
          appliance-status-card .action-btn.stop { --btn-fg: ${APC_ERR}; }
          appliance-status-card .action-btn.start { --btn-fg: var(--acc); }
          appliance-status-card .action-btn.armed { animation: apc-armed 1s ease-in-out infinite; }
          @keyframes apc-armed { 0%,100% { transform: scale(1); } 50% { transform: scale(1.02); } }
        </style>
        <div class="row">
          <div class="icon-wrap" id="icon-wrap"><ha-icon id="icon"></ha-icon></div>
          <div class="info" id="info">
            <div class="name" id="name"></div>
            <div class="status" id="status"></div>
          </div>
          <div class="toggle" id="power"><div class="knob"></div></div>
        </div>
        <div class="bar-wrap" id="bar-wrap">
          <div class="bar-top">
            <span class="bar-pct" id="bar-pct"></span>
            <span class="bar-finish" id="bar-finish"></span>
          </div>
          <div class="bar-track"><div class="bar-fill" id="bar-fill"></div></div>
        </div>
        <div class="info-tiles" id="info-tiles"></div>
        <div class="action-btn" id="action-btn"><ha-icon id="action-icon" icon="mdi:stop-circle-outline"></ha-icon><span id="action-label">Programm stoppen</span></div>
      </ha-card>
    `;
    this.style.setProperty('--acc', this.config.color);

    // Icon öffnet Details – Schalten nur über den Toggle rechts
    this.querySelector('#icon-wrap').addEventListener('click', (e) => { e.stopPropagation(); this._moreInfo(this.config.state_entity || this.config.power_entity); });
    this.querySelector('#power').addEventListener('click', (e) => { e.stopPropagation(); this._toggle(); });
    this.querySelector('#info').addEventListener('click', () => this._moreInfo(this.config.state_entity || this.config.power_entity));
  }

  _toggle() {
    const entity = this.config.power_entity;
    if (!entity || !this._hass) return;
    this._hass.callService('homeassistant', 'toggle', {}, { entity_id: entity });
  }

  // Erster Tipp schärft, zweiter Tipp (innerhalb 3,5 s) führt aus
  _arm(key, fn) {
    if (this._armed === key) {
      this._armed = null;
      clearTimeout(this._armTimer);
      fn();
    } else {
      this._armed = key;
      clearTimeout(this._armTimer);
      this._armTimer = setTimeout(() => { this._armed = null; this._update(); }, 3500);
    }
    this._update();
  }

  _moreInfo(entityId) {
    if (!entityId) return;
    this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true }));
  }

  _stateOf(entityId) {
    return entityId && this._hass ? this._hass.states[entityId] : undefined;
  }

  _update() {
    if (!this._hass) return;
    const cfg = this.config;
    const stateEntity = this._stateOf(cfg.state_entity);
    const powerEntity = this._stateOf(cfg.power_entity);
    const doorEntity = this._stateOf(cfg.door_entity);
    const doorOpen = !!doorEntity && (doorEntity.state === 'open' || doorEntity.state === 'on');
    const rawState = stateEntity ? stateEntity.state : null;
    const knownRaw = rawState && rawState !== 'unknown' && rawState !== 'unavailable';
    const isActive = knownRaw ? !cfg.idle_states.includes(rawState) : (powerEntity ? powerEntity.state === 'on' : false);

    this.querySelector('#name').textContent = cfg.name;
    this.querySelector('#icon').setAttribute('icon', cfg.icon);
    const iconEl = this.querySelector('#icon-wrap');
    iconEl.classList.toggle('active', isActive && !doorOpen);
    iconEl.classList.toggle('idle', !isActive && !doorOpen);
    iconEl.classList.toggle('door-alert', doorOpen);

    const label = knownRaw
      ? (cfg.state_labels[rawState] || rawState.charAt(0).toUpperCase() + rawState.slice(1).replace(/_/g, ' '))
      : (powerEntity ? (powerEntity.state === 'on' ? 'Ein' : 'Aus') : '–');
    const statusEl = this.querySelector('#status');
    statusEl.textContent = doorOpen ? 'Tür offen' : label;
    statusEl.classList.toggle('active', isActive && !doorOpen);
    statusEl.classList.toggle('door-alert', doorOpen);

    const powerEl = this.querySelector('#power');
    if (cfg.power_entity) {
      powerEl.style.display = 'block';
      powerEl.classList.toggle('on', !!powerEntity && powerEntity.state === 'on');
    } else {
      powerEl.style.display = 'none';
    }

    this._updateBar(isActive);
    this._updateInfoTiles();
    this._updateActionButton(isActive);
  }

  _updateBar(isActive) {
    const cfg = this.config;
    const barWrap = this.querySelector('#bar-wrap');
    if (!isActive || (!cfg.progress_entity && !(cfg.finish_entity && cfg.duration_entity))) {
      barWrap.style.display = 'none';
      return false;
    }
    let pct = null;
    if (cfg.progress_entity) {
      const s = this._stateOf(cfg.progress_entity);
      const v = s ? parseFloat(s.state) : NaN;
      if (!isNaN(v)) pct = Math.max(0, Math.min(100, v));
    }
    let finishText = '';
    if (cfg.finish_entity) {
      const f = this._stateOf(cfg.finish_entity);
      if (f && !isNaN(Date.parse(f.state))) {
        const finishDate = new Date(f.state);
        finishText = 'fertig um ' + finishDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        if (pct === null && cfg.duration_entity) {
          const d = this._stateOf(cfg.duration_entity);
          const durationMin = d ? parseFloat(d.state) : NaN;
          const remainingMin = (finishDate.getTime() - Date.now()) / 60000;
          if (!isNaN(durationMin) && durationMin > 0) {
            pct = Math.max(0, Math.min(100, ((durationMin - remainingMin) / durationMin) * 100));
          }
        }
      }
    }
    if (pct === null) { barWrap.style.display = 'none'; return false; }
    barWrap.style.display = 'block';
    this.querySelector('#bar-fill').style.width = pct.toFixed(0) + '%';
    this.querySelector('#bar-pct').textContent = pct.toFixed(0) + ' %';
    this.querySelector('#bar-finish').innerHTML = finishText ? `<ha-icon icon="mdi:clock-outline"></ha-icon>${finishText}` : '';
    return true;
  }

  _updateInfoTiles() {
    const cfg = this.config;
    const wrap = this.querySelector('#info-tiles');
    const items = [];
    if (cfg.door_entity) {
      const d = this._stateOf(cfg.door_entity);
      if (d && d.state !== 'unknown' && d.state !== 'unavailable') {
        const open = d.state === 'open' || d.state === 'on';
        items.push({ icon: open ? 'mdi:door-open' : 'mdi:door', lbl: 'Tür', val: open ? 'Offen' : 'Zu', warn: open, entity: cfg.door_entity });
      }
    }
    if (cfg.program_entity) {
      const p = this._stateOf(cfg.program_entity);
      if (p) {
        const known = p.state && p.state !== 'unknown' && p.state !== 'unavailable';
        const val = known ? (cfg.program_labels[p.state] || p.state.replace(/_/g, ' ')) : 'Kein Programm';
        items.push({ icon: 'mdi:tune-variant', lbl: 'Programm', val, entity: cfg.program_entity });
      }
    }
    if (cfg.energy_entity) {
      const e = this._stateOf(cfg.energy_entity);
      if (e && !isNaN(parseFloat(e.state))) {
        const val = parseFloat(e.state);
        const unit = e.attributes.unit_of_measurement || '';
        const text = unit === 'Wh' && val >= 1000 ? (val / 1000).toFixed(2) + ' kWh' : val + ' ' + unit;
        items.push({ icon: 'mdi:lightning-bolt', lbl: 'Energie', val: text, entity: cfg.energy_entity });
      }
    }
    const sig = JSON.stringify(items);
    if (sig === this._tileSig) return items.length > 0;
    this._tileSig = sig;
    wrap.innerHTML = '';
    wrap.style.display = items.length ? 'flex' : 'none';
    for (const item of items) {
      const el = document.createElement('div');
      el.className = 'info-tile' + (item.warn ? ' warn' : '');
      el.innerHTML = `<span class="it-badge"><ha-icon icon="${item.icon}"></ha-icon></span><div class="it-text"><div class="it-val">${item.val}</div><div class="it-lbl">${item.lbl}</div></div>`;
      el.addEventListener('click', (e) => { e.stopPropagation(); this._moreInfo(item.entity); });
      wrap.appendChild(el);
    }
    return items.length > 0;
  }

  _updateActionButton(isActive) {
    const cfg = this.config;
    const btn = this.querySelector('#action-btn');
    const icon = this.querySelector('#action-icon');
    const label = this.querySelector('#action-label');
    const armedIcon = 'mdi:gesture-tap';

    if (cfg.stop_entity && isActive) {
      const armed = this._armed === 'stop';
      btn.style.display = 'flex';
      btn.className = 'action-btn stop' + (armed ? ' armed' : '');
      icon.setAttribute('icon', armed ? armedIcon : 'mdi:stop-circle-outline');
      label.textContent = armed ? 'Zum Stoppen nochmal tippen' : 'Programm stoppen';
      btn.onclick = (e) => {
        e.stopPropagation();
        this._arm('stop', () => this._hass.callService('button', 'press', {}, { entity_id: cfg.stop_entity }));
      };
      return;
    }
    if (cfg.action_entity) {
      btn.style.display = 'flex';
      const mode = isActive ? 'stop' : 'start';
      const armed = this._armed === mode;
      btn.className = `action-btn ${mode}` + (armed ? ' armed' : '');
      icon.setAttribute('icon', armed ? armedIcon : (isActive ? 'mdi:stop-circle-outline' : 'mdi:play-circle-outline'));
      label.textContent = armed ? `Zum ${isActive ? 'Stoppen' : 'Starten'} nochmal tippen` : (isActive ? 'Stoppen' : 'Starten');
      const option = isActive ? (cfg.action_stop_option || 'stop') : (cfg.action_start_option || 'start');
      btn.onclick = (e) => {
        e.stopPropagation();
        this._arm(mode, () => this._hass.callService('select', 'select_option', { option }, { entity_id: cfg.action_entity }));
      };
      return;
    }
    btn.style.display = 'none';
    btn.onclick = null;
  }
}

if (!customElements.get('appliance-status-card')) {
  customElements.define('appliance-status-card', ApplianceStatusCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'appliance-status-card',
    name: 'Appliance Status Card',
    description: 'Status/Fortschritt für Haushaltsgeräte (Waschmaschine, Trockner, …)',
  });
}
