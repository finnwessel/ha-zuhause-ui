/* raum-reinigung-card – Raumreinigung mit Modus-Umschalter und Start-Knopf */
/* Getönt-flache Flächen – gleiches Schema wie die Aktions-Knöpfe im restlichen Dashboard */
const RRC_TINT = (c, p = 16) => `color-mix(in srgb, ${c} ${p}%, var(--card-background-color))`;
const RRC_ROBOT = "var(--zh-robot, var(--deep-purple-color))";
const RRC_WATER = "var(--zh-water, var(--cyan-color))";
const RRC_ERR = "var(--zh-error, var(--error-color))";
const RRC_MODES = {
  vacuum: { label: "Saugen", icon: "mdi:robot-vacuum", verb: "saugen", fg: RRC_ROBOT },
  vacuum_mop: { label: "Beides", icon: "mdi:broom", verb: "saugen & wischen", fg: RRC_ROBOT },
  mop: { label: "Wischen", icon: "mdi:water", verb: "wischen", fg: RRC_WATER },
};
const RRC_STATES = {
  cleaning: ["Putzt gerade", RRC_ROBOT],
  docked: ["In der Station", "var(--zh-ok, var(--success-color))"],
  returning: ["Fährt zur Station", "var(--blue-color)"],
  paused: ["Pausiert", "var(--zh-hint, var(--warning-color))"],
  idle: ["Bereit", "var(--zh-ok, var(--success-color))"],
  error: ["Fehler", RRC_ERR],
  unavailable: ["Nicht erreichbar", "var(--disabled-text-color, #9e9e9e)"],
};

class RaumReinigungCard extends HTMLElement {
  setConfig(config) {
    if (!config.room_id) throw new Error("room_id fehlt");
    this._config = {
      vacuum: "vacuum.eufy_clean_x10_pro_omni",
      script: "script.saugroboter_raum_reinigen",
      default_mode: "vacuum_mop",
      ...config,
    };
    const base = this._config.vacuum.replace("vacuum.", "");
    this._battery = this._config.battery_entity || `sensor.${base}_battery`;
    this._target = this._config.target_entity || `sensor.${base}_active_cleaning_target`;
    this._water = this._config.water_entity || `sensor.${base}_water_level`;
    this._storeKey = `rrc_mode_${this._config.room_id}`;
    let saved = null;
    try { saved = localStorage.getItem(this._storeKey); } catch (e) {}
    this._mode = RRC_MODES[saved] ? saved : this._config.default_mode;
    this._armed = false;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._built = false;
  }

  set hass(hass) {
    this._hass = hass;
    const v = hass.states[this._config.vacuum];
    const b = hass.states[this._battery];
    const t = hass.states[this._target];
    const w = hass.states[this._water];
    const sig = [v && v.state, b && b.state, w && w.state, t && JSON.stringify(t.attributes.room_ids)].join("|");
    if (sig === this._sig && this._built) return;
    this._sig = sig;
    this._render();
  }

  getCardSize() { return 4; }
  getGridOptions() { return { columns: 12, rows: "auto", min_columns: 6 }; }

  _here() {
    const t = this._hass.states[this._target];
    const ids = (t && t.attributes.room_ids) || [];
    return ids.map(Number).includes(Number(this._config.room_id));
  }

  _build() {
    this.shadowRoot.innerHTML = `
      <style>
        ha-card { padding: var(--zh-pad, 16px); display: flex; flex-direction: column; gap: var(--zh-gap, 12px); overflow: hidden; }
        .status { display: flex; align-items: center; gap: 12px; cursor: pointer; }
        .dot { width: var(--zh-touch, 40px); height: var(--zh-touch, 40px); border-radius: 50%; display: grid; place-items: center; flex: none;
               background: color-mix(in srgb, var(--rrc-col) 18%, transparent); color: var(--rrc-col); transition: all .3s; }
        .dot ha-icon { --mdc-icon-size: 22px; }
        .dot.pulse { animation: pulse 1.8s ease-in-out infinite; }
        @keyframes pulse { 0%,100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--rrc-col) 45%, transparent); } 50% { box-shadow: 0 0 0 8px transparent; } }
        .txt { flex: 1; min-width: 0; }
        .t1 { font-weight: 600; font-size: var(--zh-f-card, 15px); color: var(--primary-text-color); }
        .t2 { font-size: var(--zh-f-meta, 13px); color: var(--secondary-text-color); margin-top: 2px; display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: center; }
        .t2 .m { display: inline-flex; align-items: center; gap: 3px; }
        .t2 ha-icon { --mdc-icon-size: 15px; }
        .t2 .low { color: ${RRC_ERR}; font-weight: 600; }
        .chev { color: var(--secondary-text-color); --mdc-icon-size: 20px; }
        .seg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; padding: 4px; border-radius: var(--zh-r-in, 12px);
               background: var(--secondary-background-color, rgba(127,127,127,.12)); }
        .seg button { all: unset; cursor: pointer; border-radius: calc(var(--zh-r-in, 12px) - 3px); padding: 10px 4px; display: flex; flex-direction: column;
               align-items: center; gap: 4px; font-size: var(--zh-f-label, 12px); font-weight: 500; color: var(--secondary-text-color);
               transition: background .2s, color .2s; -webkit-tap-highlight-color: transparent; }
        .seg button ha-icon { --mdc-icon-size: 22px; }
        .seg button.on { color: var(--primary-text-color); }
        .seg button.on ha-icon { color: var(--btn-fg); }
        .go { all: unset; cursor: pointer; box-sizing: border-box; width: 100%; border-radius: var(--zh-r-in, 12px); padding: 14px 16px;
              display: flex; align-items: center; justify-content: center; gap: 10px; font-size: var(--zh-f-card, 15px); font-weight: 600;
              color: var(--primary-text-color);
              transition: transform .1s, filter .2s, background .3s; -webkit-tap-highlight-color: transparent; }
        .go:active { transform: scale(.98); }
        .go.armed { filter: brightness(1.15); animation: armed 1s ease-in-out infinite; }
        @keyframes armed { 0%,100% { transform: scale(1); } 50% { transform: scale(1.02); } }
        .go.stop { background: ${RRC_TINT(RRC_ERR)} !important; --btn-fg: ${RRC_ERR} !important; }
        .go ha-icon { --mdc-icon-size: 22px; color: var(--btn-fg); }
        .hint { font-size: var(--zh-f-label, 12px); color: var(--secondary-text-color); text-align: center; margin-top: -6px; min-height: 14px; }
      </style>
      <ha-card>
        <div class="status">
          <div class="dot"><ha-icon></ha-icon></div>
          <div class="txt"><div class="t1"></div><div class="t2"></div></div>
          <ha-icon class="chev" icon="mdi:chevron-right"></ha-icon>
        </div>
        <div class="seg"></div>
        <button class="go"><ha-icon></ha-icon><span></span></button>
        <div class="hint"></div>
      </ha-card>`;
    const seg = this.shadowRoot.querySelector(".seg");
    Object.entries(RRC_MODES).forEach(([k, m]) => {
      const btn = document.createElement("button");
      btn.dataset.mode = k;
      btn.innerHTML = `<ha-icon icon="${m.icon}"></ha-icon><span>${m.label}</span>`;
      btn.addEventListener("click", () => {
        this._mode = k;
        this._disarm();
        try { localStorage.setItem(this._storeKey, k); } catch (e) {}
        this._render();
      });
      seg.appendChild(btn);
    });
    this.shadowRoot.querySelector(".go").addEventListener("click", () => this._press());
    this.shadowRoot.querySelector(".status").addEventListener("click", () => {
      if (this._config.navigation_path) {
        history.pushState(null, "", this._config.navigation_path);
        window.dispatchEvent(new CustomEvent("location-changed"));
      } else {
        this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: this._config.vacuum } }));
      }
    });
    this._built = true;
  }

  _disarm() {
    this._armed = false;
    clearTimeout(this._armTimer);
  }

  _press() {
    const here = this._here();
    const v = this._hass.states[this._config.vacuum];
    if (here && v && ["cleaning", "paused"].includes(v.state)) {
      this._hass.callService("vacuum", "return_to_base", { entity_id: this._config.vacuum });
      return;
    }
    if (!this._armed) {
      this._armed = true;
      this._render();
      this._armTimer = setTimeout(() => { this._armed = false; this._render(); }, 3500);
      return;
    }
    this._disarm();
    const [domain, service] = this._config.script.split(".");
    this._hass.callService(domain, service, { raum_id: Number(this._config.room_id), modus: this._mode });
    this._started = Date.now();
    this._render();
  }

  _render() {
    if (!this._hass || !this._config) return;
    if (!this._built) this._build();
    const r = this.shadowRoot;
    const v = this._hass.states[this._config.vacuum];
    const b = this._hass.states[this._battery];
    const st = v ? v.state : "unavailable";
    const [label, col] = RRC_STATES[st] || [st, "var(--disabled-text-color, #9e9e9e)"];
    const here = this._here();
    const name = this._config.room_name || "Raum";
    const busy = ["cleaning", "returning", "paused"].includes(st);

    const dot = r.querySelector(".dot");
    dot.style.setProperty("--rrc-col", col);
    dot.classList.toggle("pulse", st === "cleaning");
    dot.querySelector("ha-icon").setAttribute("icon", st === "error" ? "mdi:robot-vacuum-alert" : "mdi:robot-vacuum");
    r.querySelector(".t1").textContent = here && busy ? `${label} · hier` : label;
    const w = this._hass.states[this._water];
    const parts = [];
    if (b && !isNaN(parseFloat(b.state))) {
      const bv = Math.round(parseFloat(b.state));
      const bi = bv >= 95 ? "mdi:battery" : `mdi:battery-${Math.max(10, Math.floor(bv / 10) * 10)}`;
      parts.push(`<span class="m${bv < 20 ? " low" : ""}"><ha-icon icon="${bi}"></ha-icon>${bv} %</span>`);
    }
    if (w && !isNaN(parseFloat(w.state))) {
      const wv = Math.round(parseFloat(w.state));
      parts.push(`<span class="m${wv < 20 ? " low" : ""}"><ha-icon icon="mdi:cup-water"></ha-icon>${wv < 20 ? "Wasser auffüllen · " : ""}${wv} %</span>`);
    }
    if (busy && !here) parts.push(`<span class="m">in einem anderen Raum</span>`);
    r.querySelector(".t2").innerHTML = parts.join("");

    r.querySelectorAll(".seg button").forEach((btn) => {
      const m = RRC_MODES[btn.dataset.mode];
      const on = btn.dataset.mode === this._mode;
      btn.classList.toggle("on", on);
      btn.style.background = on ? RRC_TINT(m.fg) : "transparent";
      btn.style.setProperty("--btn-fg", m.fg);
    });

    const m = RRC_MODES[this._mode];
    const go = r.querySelector(".go");
    const hint = r.querySelector(".hint");
    const stopMode = here && ["cleaning", "paused"].includes(st);
    go.classList.toggle("stop", stopMode);
    go.classList.toggle("armed", this._armed && !stopMode);
    go.style.background = RRC_TINT(m.fg);
    go.style.setProperty("--btn-fg", m.fg);
    let icon = "mdi:play";
    let text = `${name} ${m.verb}`;
    let h = "";
    if (stopMode) {
      icon = "mdi:home-import-outline";
      text = "Abbrechen & zur Station";
    } else if (this._armed) {
      icon = "mdi:gesture-tap";
      text = "Zum Starten nochmal tippen";
    } else if (this._started && Date.now() - this._started < 8000) {
      icon = "mdi:check";
      text = "Gestartet";
    } else if (busy && !here) {
      h = "Startet sofort und unterbricht die laufende Reinigung";
    }
    go.querySelector("ha-icon").setAttribute("icon", icon);
    go.querySelector("span").textContent = text;
    hint.textContent = h;
    hint.style.display = h ? "block" : "none";
  }

  static getStubConfig() { return { room_id: 1, room_name: "Küche" }; }
}

if (!customElements.get("raum-reinigung-card")) {
  customElements.define("raum-reinigung-card", RaumReinigungCard);
  window.customCards = window.customCards || [];
  window.customCards.push({ type: "raum-reinigung-card", name: "Raum-Reinigung", description: "Raum saugen/wischen mit Modus-Umschalter" });
}
