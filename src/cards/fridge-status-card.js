/* fridge-status-card – Kühlschrank: Tür, Temperatur, Zonen, Modi */
/* Flach & getönt; Akzent per Rollenfarbe (Standard: --zh-appliance). Hex- und var()-Farben gehen beide. */
const FSC_HINT = "var(--zh-hint, var(--warning-color, #ff9800))";

class FridgeStatusCard extends HTMLElement {
  setConfig(config) {
    if (!config.temperature_entity && !config.door_entity) {
      throw new Error('fridge-status-card: mindestens temperature_entity oder door_entity angeben');
    }
    this.config = {
      name: 'Kühlschrank',
      icon: 'mdi:fridge-outline',
      color: 'var(--zh-appliance, var(--blue-color, #2196f3))',
      zones: [],
      modes: [],
      ...config,
    };
    this._built = false;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._built) { this._build(); this._built = true; }
    const ids = [this.config.door_entity, this.config.temperature_entity, this.config.humidity_entity,
      ...this.config.zones.map((z) => z.entity), ...this.config.modes.map((m) => m.entity)];
    const sig = ids.map((i) => { const s = i && hass.states[i]; return s ? s.state + (s.attributes.min ?? '') + (s.attributes.max ?? '') : '-'; }).join('|');
    if (sig === this._sig) return;
    this._sig = sig;
    this._update();
  }

  getCardSize() { return 3; }

  _build() {
    const T = 'fridge-status-card';
    this.innerHTML = `
      <ha-card id="card">
        <style>
          ${T} ha-card { padding: var(--zh-pad, 16px); }
          ${T} .row { display: flex; align-items: center; gap: 12px; }
          ${T} .icon-wrap {
            width: var(--zh-touch, 40px); height: var(--zh-touch, 40px); min-width: var(--zh-touch, 40px); border-radius: 50%;
            display: flex; align-items: center; justify-content: center; cursor: pointer;
            background: color-mix(in srgb, var(--acc) 16%, transparent); color: var(--acc);
            transition: background .3s, color .3s, transform .15s;
          }
          ${T} .icon-wrap:active { transform: scale(.92); }
          ${T} .icon-wrap ha-icon { --mdc-icon-size: 22px; }
          ${T} .icon-wrap.alert { background: color-mix(in srgb, ${FSC_HINT} 18%, transparent); color: ${FSC_HINT}; animation: fsc-pulse 1.6s ease-in-out infinite; }
          @keyframes fsc-pulse { 0%,100% { box-shadow: 0 0 0 0 color-mix(in srgb, ${FSC_HINT} 45%, transparent); } 50% { box-shadow: 0 0 0 7px transparent; } }
          ${T} .info { flex: 1; cursor: pointer; }
          ${T} .name { font-size: var(--zh-f-card, 15px); font-weight: 600; color: var(--primary-text-color); }
          ${T} .status { font-size: var(--zh-f-meta, 13px); color: var(--secondary-text-color); margin-top: 2px; }
          ${T} .status.alert { color: ${FSC_HINT}; font-weight: 600; }
          ${T} .stats { display: flex; gap: 8px; margin-top: var(--zh-gap, 12px); }
          ${T} .stat {
            flex: 1; display: flex; align-items: center; gap: 10px; padding: 8px 12px;
            border-radius: var(--zh-r-in, 12px); background: var(--secondary-background-color, rgba(127,127,127,.1)); cursor: pointer;
            transition: transform .12s;
          }
          ${T} .stat:active { transform: scale(.96); }
          ${T} .badge {
            width: 28px; height: 28px; min-width: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
            background: color-mix(in srgb, var(--bc, var(--acc)) 16%, transparent); color: var(--bc, var(--acc));
          }
          ${T} .badge ha-icon { --mdc-icon-size: 16px; }
          ${T} .stat .val { font-size: var(--zh-f-card, 15px); font-weight: 600; color: var(--primary-text-color); line-height: 1.15; }
          ${T} .stat .lbl { font-size: 11px; color: var(--secondary-text-color); }
          ${T} .zones { display: flex; flex-direction: column; gap: 8px; margin-top: var(--zh-gap, 12px); }
          ${T} .zone-primary {
            display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: var(--zh-r-in, 12px);
            background: var(--secondary-background-color, rgba(127,127,127,.1));
          }
          ${T} .zp-info { flex: 1; min-width: 0; }
          ${T} .zp-name, ${T} .zname { font-size: var(--zh-f-label, 12px); font-weight: 600; color: var(--secondary-text-color); }
          ${T} .zp-range { position: relative; height: 4px; border-radius: 2px; background: color-mix(in srgb, var(--secondary-text-color) 22%, transparent); margin-top: 8px; }
          ${T} .zp-range-fill { position: absolute; top: 0; left: 0; height: 100%; border-radius: 2px; background: var(--acc); transition: width .4s; }
          ${T} .zp-ctrl, ${T} .zctrl { display: flex; align-items: center; gap: 8px; }
          ${T} .zp-val { font-size: var(--zh-f-title, 18px); font-weight: 600; color: var(--primary-text-color); min-width: 48px; text-align: center; cursor: pointer; }
          ${T} .zone-row { display: flex; gap: 8px; }
          ${T} .zone {
            flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px;
            padding: 10px 6px; border-radius: var(--zh-r-in, 12px); background: var(--secondary-background-color, rgba(127,127,127,.1));
          }
          ${T} .zval { font-size: var(--zh-f-card, 15px); font-weight: 600; color: var(--primary-text-color); min-width: 40px; text-align: center; cursor: pointer; }
          ${T} .stepper {
            width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
            background: color-mix(in srgb, var(--acc) 14%, transparent); color: var(--acc); cursor: pointer; transition: transform .12s;
          }
          ${T} .stepper:active { transform: scale(.85); }
          ${T} .stepper ha-icon { --mdc-icon-size: 16px; }
          ${T} .modes { display: flex; flex-wrap: wrap; gap: 8px; margin-top: var(--zh-gap, 12px); }
          ${T} .mode {
            display: flex; align-items: center; gap: 6px; padding: 4px 12px 4px 4px; min-height: 28px; border-radius: 999px;
            font-size: var(--zh-f-meta, 13px); font-weight: 500; color: var(--secondary-text-color);
            background: var(--secondary-background-color, rgba(127,127,127,.12));
            cursor: pointer; transition: background .25s, color .25s, transform .12s;
          }
          ${T} .mode:active { transform: scale(.95); }
          ${T} .mode .badge { --bc: var(--secondary-text-color); }
          ${T} .mode.on { color: var(--primary-text-color); background: color-mix(in srgb, var(--acc) 16%, var(--card-background-color)); }
          ${T} .mode.on .badge { --bc: var(--acc); }
        </style>
        <div class="row">
          <div class="icon-wrap" id="icon-wrap"><ha-icon id="icon"></ha-icon></div>
          <div class="info" id="info">
            <div class="name" id="name"></div>
            <div class="status" id="status"></div>
          </div>
        </div>
        <div class="stats" id="stats"></div>
        <div class="zones" id="zones"></div>
        <div class="modes" id="modes"></div>
      </ha-card>
    `;
    this.style.setProperty('--acc', this.config.color);
    this.querySelector('#icon-wrap').addEventListener('click', (e) => { e.stopPropagation(); this._moreInfo(this.config.door_entity); });
    this.querySelector('#info').addEventListener('click', () => this._moreInfo(this.config.door_entity || this.config.temperature_entity));
  }

  _moreInfo(entityId) {
    if (!entityId) return;
    this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true }));
  }

  _stateOf(id) { return id && this._hass ? this._hass.states[id] : undefined; }

  _update() {
    const cfg = this.config;
    const door = this._stateOf(cfg.door_entity);
    const isOpen = door ? (door.state === 'on' || door.state === 'open') : false;
    this.querySelector('#name').textContent = cfg.name;
    this.querySelector('#icon').setAttribute('icon', isOpen ? 'mdi:fridge-alert-outline' : cfg.icon);
    this.querySelector('#icon-wrap').classList.toggle('alert', isOpen);
    const statusEl = this.querySelector('#status');
    statusEl.textContent = door ? (isOpen ? 'Tür offen' : 'Tür geschlossen') : 'Status unbekannt';
    statusEl.classList.toggle('alert', isOpen);
    this._renderStats();
    this._renderZones();
    this._renderModes();
  }

  // Temperatur/Luftfeuchte öffnen den gemeinsamen Verlauf (zuhause-ui), sonst more-info
  _openStat(items, idx) {
    if (window.ZH && window.ZH.openHistory) {
      window.ZH.openHistory(this._hass, {
        title: this.config.name,
        series: items.map((i) => ({ entity: i.entity, name: i.lbl, color: i.color, icon: i.icon, decimals: i.decimals })),
        active: idx,
      });
    } else {
      this._moreInfo(items[idx].entity);
    }
  }

  _renderStats() {
    const cfg = this.config;
    const wrap = this.querySelector('#stats');
    const items = [];
    const t = this._stateOf(cfg.temperature_entity);
    if (t && !isNaN(parseFloat(t.state))) {
      items.push({ icon: 'mdi:thermometer', val: parseFloat(t.state).toFixed(1).replace('.', ',') + ' ' + (t.attributes.unit_of_measurement || '°C'), lbl: 'Temperatur', entity: cfg.temperature_entity, color: 'var(--zh-warm, var(--deep-orange-color))', decimals: 1 });
    }
    const h = this._stateOf(cfg.humidity_entity);
    const hVal = h ? parseFloat(h.state) : NaN;
    if (h && !isNaN(hVal) && hVal > 0.5) {
      items.push({ icon: 'mdi:water-percent', val: hVal.toFixed(0) + ' %', lbl: 'Luftfeuchte', entity: cfg.humidity_entity, color: 'var(--zh-water, var(--cyan-color))', decimals: 0 });
    }
    wrap.innerHTML = '';
    wrap.style.display = items.length ? 'flex' : 'none';
    items.forEach((item, idx) => {
      const el = document.createElement('div');
      el.className = 'stat';
      el.innerHTML = `<span class="badge" style="--bc:${item.color}"><ha-icon icon="${item.icon}"></ha-icon></span><div><div class="val">${item.val}</div><div class="lbl">${item.lbl}</div></div>`;
      el.addEventListener('click', (e) => { e.stopPropagation(); this._openStat(items, idx); });
      wrap.appendChild(el);
    });
  }

  _renderZones() {
    const cfg = this.config;
    const wrap = this.querySelector('#zones');
    wrap.innerHTML = '';
    wrap.style.display = cfg.zones.length ? 'flex' : 'none';
    if (!cfg.zones.length) return;
    const [primary, ...secondary] = cfg.zones;
    const primaryEl = this._buildZone(primary, true);
    if (primaryEl) wrap.appendChild(primaryEl);
    if (secondary.length) {
      const row = document.createElement('div');
      row.className = 'zone-row';
      for (const zone of secondary) {
        const el = this._buildZone(zone, false);
        if (el) row.appendChild(el);
      }
      if (row.children.length) wrap.appendChild(row);
    }
  }

  _buildZone(zone, primary) {
    const s = this._stateOf(zone.entity);
    if (!s) return null;
    const step = parseFloat(s.attributes.step || 1);
    const min = s.attributes.min !== undefined ? parseFloat(s.attributes.min) : (primary ? 0 : -Infinity);
    const max = s.attributes.max !== undefined ? parseFloat(s.attributes.max) : (primary ? 100 : Infinity);
    const unit = s.attributes.unit_of_measurement || '°C';
    const value = parseFloat(s.state);
    const rangeFor = (v) => (isFinite(max) && isFinite(min) && max > min ? Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100)) : 0);
    const icon = zone.icon || 'mdi:thermometer';
    const ctrl = (cls) => `<div class="${cls}"><div class="stepper minus"><ha-icon icon="mdi:minus"></ha-icon></div><div class="${primary ? 'zp-val' : 'zval'}">${value.toFixed(0)}${unit}</div><div class="stepper plus"><ha-icon icon="mdi:plus"></ha-icon></div></div>`;

    const el = document.createElement('div');
    el.className = primary ? 'zone-primary' : 'zone';
    el.innerHTML = primary
      ? `<span class="badge"><ha-icon icon="${icon}"></ha-icon></span>
         <div class="zp-info"><div class="zp-name">${zone.name}</div><div class="zp-range"><div class="zp-range-fill" style="width:${rangeFor(value)}%;"></div></div></div>
         ${ctrl('zp-ctrl')}`
      : `<span class="badge"><ha-icon icon="${icon}"></ha-icon></span><div class="zname">${zone.name}</div>${ctrl('zctrl')}`;
    const valEl = el.querySelector(primary ? '.zp-val' : '.zval');
    const fillEl = el.querySelector('.zp-range-fill');
    const setVal = (delta) => {
      const next = Math.max(min, Math.min(max, parseFloat(s.state) + delta));
      valEl.textContent = next.toFixed(0) + unit;
      if (fillEl) fillEl.style.width = rangeFor(next) + '%';
      this._hass.callService('number', 'set_value', { entity_id: zone.entity, value: next });
    };
    el.querySelector('.minus').addEventListener('click', (e) => { e.stopPropagation(); setVal(-step); });
    el.querySelector('.plus').addEventListener('click', (e) => { e.stopPropagation(); setVal(step); });
    valEl.addEventListener('click', (e) => { e.stopPropagation(); this._moreInfo(zone.entity); });
    return el;
  }

  _renderModes() {
    const cfg = this.config;
    const wrap = this.querySelector('#modes');
    wrap.innerHTML = '';
    wrap.style.display = cfg.modes.length ? 'flex' : 'none';
    for (const mode of cfg.modes) {
      const s = this._stateOf(mode.entity);
      if (!s) continue;
      const el = document.createElement('div');
      el.className = 'mode' + (s.state === 'on' ? ' on' : '');
      el.innerHTML = `<span class="badge"><ha-icon icon="${mode.icon || 'mdi:toggle-switch-outline'}"></ha-icon></span><span>${mode.name}</span>`;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this._hass.callService('homeassistant', 'toggle', {}, { entity_id: mode.entity });
      });
      wrap.appendChild(el);
    }
  }
}

if (!customElements.get('fridge-status-card')) {
  customElements.define('fridge-status-card', FridgeStatusCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'fridge-status-card',
    name: 'Fridge Status Card',
    description: 'Status/Steuerung für Kühlschränke (Tür, Temperatur, Zonen, Modi)',
  });
}
