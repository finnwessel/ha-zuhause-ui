/* geschirrspueler-card – Status, Restzeit und Steuerung für den Siemens-Geschirrspüler (Home Connect) */
/* Getönt-flache Flächen; Rolle „Gerät“ = --zh-appliance (blau) */
const GSC_TINT = (c, p = 16) => `color-mix(in srgb, ${c} ${p}%, var(--card-background-color))`;
const GSC_FG = {
  acc: "var(--zh-appliance, var(--blue-color))",
  ok: "var(--zh-ok, var(--success-color))",
  hint: "var(--zh-hint, var(--warning-color))",
  err: "var(--zh-error, var(--error-color))",
  grau: "var(--zh-neutral, var(--secondary-text-color))",
};
const GSC_STATES = {
  inactive: { label: "Aus", icon: "mdi:power-off", fg: GSC_FG.grau },
  ready: { label: "Bereit", icon: "mdi:dishwasher", fg: GSC_FG.ok },
  delayedstart: { label: "Startet später", icon: "mdi:timer-sand", fg: GSC_FG.hint },
  run: { label: "Spült", icon: "mdi:dishwasher", fg: GSC_FG.acc },
  pause: { label: "Pausiert", icon: "mdi:pause", fg: GSC_FG.hint },
  actionrequired: { label: "Aktion nötig", icon: "mdi:hand-back-right", fg: GSC_FG.hint },
  finished: { label: "Fertig", icon: "mdi:check-circle", fg: GSC_FG.ok },
  error: { label: "Fehler", icon: "mdi:alert-circle", fg: GSC_FG.err },
  aborting: { label: "Bricht ab", icon: "mdi:stop-circle", fg: GSC_FG.err },
  unavailable: { label: "Nicht erreichbar", icon: "mdi:wifi-off", fg: GSC_FG.grau },
};
const GSC_PROGRAMS = {
  dishcare_dishwasher_program_eco_50: { name: "Eco 50°", short: "Eco", icon: "mdi:leaf" },
  dishcare_dishwasher_program_auto_2: { name: "Auto 45–65°", short: "Auto", icon: "mdi:auto-mode" },
  dishcare_dishwasher_program_intensiv_70: { name: "Intensiv 70°", short: "Intensiv", icon: "mdi:pot-steam" },
  dishcare_dishwasher_program_quick_65: { name: "Schnell 65°", short: "Schnell 65", icon: "mdi:clock-fast" },
  dishcare_dishwasher_program_quick_45: { name: "Schnell 45°", short: "Schnell 45", icon: "mdi:run-fast" },
  dishcare_dishwasher_program_machine_care: { name: "Maschinenpflege", short: "Pflege", icon: "mdi:spray-bottle" },
  dishcare_dishwasher_program_pre_rinse: { name: "Vorspülen", short: "Vorspülen", icon: "mdi:water-outline" },
};
const GSC_RUNNING = ["run", "pause", "delayedstart", "actionrequired", "aborting"];

class GeschirrspuelerCard extends HTMLElement {
  setConfig(config) {
    const p = config.prefix || "geschirrspuler";
    this._config = {
      state: `sensor.${p}_betriebszustand`,
      end: `sensor.${p}_programm_endzeit`,
      progress: `sensor.${p}_programm_fortschritt`,
      program: `select.${p}_aktives_programm`,
      selected: `select.${p}_ausgewahltes_programm`,
      door: `sensor.${p}_tur`,
      power: `switch.${p}_einschalter`,
      remote_start: `binary_sensor.${p}_fernstart`,
      stop: `button.${p}_programm_stoppen`,
      options: [
        { entity: `switch.${p}_vario_speed`, label: "Vario Speed", icon: "mdi:speedometer" },
        { entity: "switch.kuche_dishwasher_stille_auf_abruf", label: "Leise", icon: "mdi:volume-off" },
        { entity: `switch.${p}_hygiene`, label: "Hygiene", icon: "mdi:shield-check-outline" },
        { entity: `switch.${p}_halbe_beladung`, label: "Halbe Ladung", icon: "mdi:circle-half-full" },
        { entity: `switch.${p}_intensivzone`, label: "Intensivzone", icon: "mdi:fire" },
      ],
      warnings: [
        { entity: `sensor.${p}_salz_fast_leer`, text: "Salz fast leer" },
        { entity: `sensor.${p}_salzmangel`, text: "Salz nachfüllen" },
        { entity: `sensor.${p}_klarspuler_fast_leer`, text: "Klarspüler fast leer" },
        { entity: `sensor.${p}_fehlender_klarspuler`, text: "Klarspüler nachfüllen" },
        { entity: `sensor.${p}_intelligente_erinnerung_zur_filterreinigung`, text: "Filter reinigen" },
        { entity: `sensor.${p}_erinnerung_zur_maschinenpflege`, text: "Maschinenpflege fällig" },
      ],
      ...config,
    };
    this._armed = null;
    this._pick = null;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    clearInterval(this._tick);
    this._tick = setInterval(() => { this._sig = null; this._render(); }, 20000);
  }
  disconnectedCallback() { clearInterval(this._tick); clearTimeout(this._armTimer); }

  set hass(hass) {
    this._hass = hass;
    const c = this._config;
    const ids = [c.state, c.end, c.progress, c.program, c.selected, c.door, c.power, c.remote_start,
      ...c.options.map((o) => o.entity), ...c.warnings.map((w) => w.entity)];
    const sig = ids.map((i) => (hass.states[i] ? hass.states[i].state : "-")).join("|");
    if (sig === this._sig) return;
    this._sig = sig;
    this._render();
  }

  getCardSize() { return 6; }
  getGridOptions() { return { columns: 12, rows: "auto", min_columns: 6 }; }

  _s(id) { const s = this._hass.states[id]; return s ? s.state : undefined; }
  _ok(v) { return v !== undefined && v !== "unavailable" && v !== "unknown"; }
  _hm(d) { return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }); }
  _dayWord(d) {
    const a = new Date(); a.setHours(0, 0, 0, 0);
    const b = new Date(d); b.setHours(0, 0, 0, 0);
    const diff = Math.round((b - a) / 86400000);
    return diff === 1 ? "morgen" : diff === -1 ? "gestern" : "";
  }

  _arm(key, fn) {
    if (this._armed === key) { this._armed = null; clearTimeout(this._armTimer); fn(); }
    else {
      this._armed = key; clearTimeout(this._armTimer);
      this._armTimer = setTimeout(() => { this._armed = null; this._sig = null; this._render(); }, 3500);
    }
    this._sig = null; this._render();
  }

  _render() {
    if (!this._hass || !this._config) return;
    const c = this._config;
    const h = this._hass;
    const stObj = h.states[c.state];
    let st = this._s(c.state);
    if (!this._ok(st)) st = "unavailable";
    const S = GSC_STATES[st] || { label: st, icon: "mdi:dishwasher", fg: GSC_FG.grau };
    const running = GSC_RUNNING.includes(st);

    const progRaw = this._s(c.program);
    const selRaw = this._s(c.selected);
    const prog = GSC_PROGRAMS[this._ok(progRaw) ? progRaw : selRaw];
    const progName = prog ? prog.name : "";

    const pct = Math.max(0, Math.min(100, parseFloat(this._s(c.progress)) || 0));
    const endRaw = this._s(c.end);
    const end = this._ok(endRaw) ? new Date(endRaw) : null;
    const now = new Date();
    const remMin = end && !isNaN(end) ? Math.max(0, Math.round((end - now) / 60000)) : null;

    // Ring + Mitte
    let big = "", small = "";
    if (st === "finished") { big = "✓"; small = "fertig"; }
    else if (running && remMin !== null) {
      big = remMin >= 60 ? `${Math.floor(remMin / 60)}:${String(remMin % 60).padStart(2, "0")}` : `${remMin}`;
      small = remMin >= 60 ? "Std. übrig" : "Min. übrig";
    } else if (running) { big = `${Math.round(pct)}`; small = "Prozent"; }
    const R = 54, C = 2 * Math.PI * R;
    const ringPct = st === "finished" ? 100 : running ? pct : 0;

    // Zeile unter dem Programm im Kopf – nur die Zeit, die gerade zählt
    let timeLine = "";
    if (running && end && st !== "aborting") {
      const dd = this._dayWord(end);
      timeLine = `Fertig ${dd ? dd + " " : ""}um ${this._hm(end)}`;
    } else if (st === "finished" && stObj) {
      const t = new Date(stObj.last_changed);
      const dd = this._dayWord(t);
      timeLine = `Seit ${dd ? dd + " " : ""}${this._hm(t)} Uhr`;
    }

    // Hinweise: [Symbol, Text, Art] – Art "warn" (Hinweis) oder "info" (Gerät)
    const door = this._s(c.door);
    const notes = c.warnings.filter((w) => this._s(w.entity) === "present").map((w) => ["mdi:alert-outline", w.text, "warn"]);
    if (st === "actionrequired") notes.unshift(["mdi:hand-back-right", "Der Geschirrspüler braucht dich – bitte am Gerät nachsehen", "warn"]);
    if (st === "error") notes.unshift(["mdi:alert-circle-outline", "Fehler am Gerät – Details in der Home-Connect-App", "warn"]);
    if (st === "finished") {
      notes.push(door === "open"
        ? ["mdi:weather-windy", "Tür ist offen – das Geschirr trocknet", "info"]
        : ["mdi:door-open", "Tür einen Spalt öffnen, damit das Geschirr trocknet", "info"]);
    }

    const opts = c.options.map((o) => ({ ...o, v: this._s(o.entity) })).filter((o) => this._ok(o.v));

    // Programmwahl (nur bereit)
    const canStart = st === "ready" && this._s(c.remote_start) === "on" && door !== "open";
    const pick = this._pick && GSC_PROGRAMS[this._pick] ? this._pick : (GSC_PROGRAMS[selRaw] ? selRaw : Object.keys(GSC_PROGRAMS)[0]);

    let actions = "";
    if (running && st !== "aborting") {
      actions = `<button class="btn stop${this._armed === "stop" ? " armed" : ""}" data-act="stop">
        <ha-icon icon="${this._armed === "stop" ? "mdi:gesture-tap" : "mdi:stop"}"></ha-icon>${this._armed === "stop" ? "Zum Abbrechen nochmal tippen" : "Programm abbrechen"}</button>`;
    } else if (st === "ready") {
      const chips = Object.entries(GSC_PROGRAMS).filter(([k]) => !k.endsWith("pre_rinse")).map(([k, p]) =>
        `<button class="pg${k === pick ? " on" : ""}" data-act="pick" data-p="${k}"><ha-icon icon="${p.icon}"></ha-icon><span>${p.short}</span></button>`).join("");
      actions = `<div class="h2">Programm</div><div class="pgs">${chips}</div>
        <button class="btn go${this._armed === "start" ? " armed" : ""}" data-act="start"${canStart ? "" : " disabled"}>
          <ha-icon icon="${this._armed === "start" ? "mdi:gesture-tap" : "mdi:play"}"></ha-icon>${this._armed === "start" ? "Zum Starten nochmal tippen" : `${GSC_PROGRAMS[pick].name} starten`}</button>
        ${canStart ? "" : `<div class="hint">${door === "open" ? "Tür schließen, dann starten." : "Fernstart am Gerät aktivieren, um von hier zu starten."}</div>`}`;
    } else if (st === "inactive") {
      actions = `<button class="btn go" data-act="power"><ha-icon icon="mdi:power"></ha-icon>Einschalten</button>`;
    }

    this.shadowRoot.innerHTML = `
      <style>
        ha-card { overflow: hidden; display: flex; flex-direction: column; }
        button { all: unset; cursor: pointer; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        button[disabled] { opacity: .4; cursor: default; }
        .hero { --fg: ${S.fg}; background: ${GSC_TINT(S.fg)}; color: var(--primary-text-color); padding: var(--zh-pad, 16px); display: flex; align-items: center; gap: 16px; }
        .ring { position: relative; width: 120px; height: 120px; flex: none; }
        .ring svg { transform: rotate(-90deg); }
        .ring .track { stroke: color-mix(in srgb, var(--fg) 25%, transparent); }
        .ring .bar { stroke: var(--fg); }
        .ring .mid { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
        .big { font-size: 32px; font-weight: 600; line-height: 1; letter-spacing: -.5px; }
        .small { font-size: var(--zh-f-label, 12px); color: var(--secondary-text-color); margin-top: 4px; }
        .ring .ic { --mdc-icon-size: 44px; color: var(--fg); }
        .info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
        .pill { align-self: flex-start; display: inline-flex; align-items: center; gap: 5px; font-size: var(--zh-f-label, 12px); font-weight: 600;
                background: color-mix(in srgb, var(--fg) 22%, transparent); padding: 4px 10px 4px 8px; border-radius: 12px; }
        .pill ha-icon { --mdc-icon-size: 15px; color: var(--fg); }
        .prog { font-size: var(--zh-f-title, 18px); font-weight: 600; line-height: 1.2; }
        .pct { font-size: var(--zh-f-meta, 13px); color: var(--secondary-text-color); }
        .body { padding: var(--zh-gap, 12px) var(--zh-pad, 16px) var(--zh-pad, 16px); display: flex; flex-direction: column; gap: var(--zh-gap, 12px); }
        .body:empty { display: none; }
        .time { font-size: var(--zh-f-body, 14px); font-weight: 600; }
        .note { display: flex; align-items: center; gap: 10px; font-size: var(--zh-f-body, 14px); font-weight: 500; padding: 12px 14px; border-radius: var(--zh-r-in, 12px); line-height: 1.3; color: var(--primary-text-color); }
        .note ha-icon { --mdc-icon-size: 20px; flex: none; }
        .note.warn { background: ${GSC_TINT(GSC_FG.hint)}; }
        .note.warn ha-icon { color: ${GSC_FG.hint}; }
        .note.info { background: ${GSC_TINT(GSC_FG.acc, 14)}; }
        .note.info ha-icon { color: ${GSC_FG.acc}; }
        .h2 { font-size: var(--zh-f-label, 12px); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--secondary-text-color); margin-bottom: -4px; }
        .opts { display: flex; flex-wrap: wrap; gap: 8px; }
        .op { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 12px; border-radius: 18px; font-size: var(--zh-f-meta, 13px); font-weight: 500;
              color: var(--secondary-text-color); background: var(--secondary-background-color, rgba(127,127,127,.12)); transition: background .2s; }
        .op ha-icon { --mdc-icon-size: 17px; }
        .op.on { color: var(--primary-text-color); background: ${GSC_TINT(GSC_FG.acc)}; }
        .op.on ha-icon { color: ${GSC_FG.acc}; }
        .pgs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
        .pg { border-radius: var(--zh-r-in, 12px); padding: 10px 4px; display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: var(--zh-f-label, 12px); font-weight: 500;
              color: var(--secondary-text-color); background: var(--secondary-background-color, rgba(127,127,127,.12)); }
        .pg ha-icon { --mdc-icon-size: 22px; }
        .pg.on { color: var(--primary-text-color); background: ${GSC_TINT(GSC_FG.acc)}; }
        .pg.on ha-icon { color: ${GSC_FG.acc}; }
        .btn { width: 100%; border-radius: var(--zh-r-in, 12px); padding: 14px 16px; display: flex; align-items: center; justify-content: center; gap: 10px;
               font-size: var(--zh-f-card, 15px); font-weight: 600; color: var(--primary-text-color); transition: transform .1s, filter .2s; }
        .btn:active { transform: scale(.98); }
        .btn ha-icon { --mdc-icon-size: 22px; color: var(--btn-fg); }
        .btn.go { background: ${GSC_TINT(GSC_FG.acc)}; --btn-fg: ${GSC_FG.acc}; }
        .btn.stop { background: ${GSC_TINT(GSC_FG.err)}; --btn-fg: ${GSC_FG.err}; }
        .btn.armed { filter: brightness(1.15); animation: armed 1s ease-in-out infinite; }
        @keyframes armed { 0%,100% { transform: scale(1); } 50% { transform: scale(1.02); } }
        .hint { font-size: var(--zh-f-label, 12px); color: var(--secondary-text-color); text-align: center; margin-top: -4px; }
      </style>
      <ha-card>
        <div class="hero">
          <div class="ring">
            <svg width="120" height="120" viewBox="0 0 128 128">
              <circle class="track" cx="64" cy="64" r="${R}" fill="none" stroke-width="10"/>
              <circle class="bar" cx="64" cy="64" r="${R}" fill="none" stroke-width="10" stroke-linecap="round"
                stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - ringPct / 100)}" style="transition: stroke-dashoffset .6s"/>
            </svg>
            <div class="mid">${big ? `<div class="big">${big}</div><div class="small">${small}</div>` : `<ha-icon class="ic" icon="${S.icon}"></ha-icon>`}</div>
          </div>
          <div class="info">
            <div class="pill"><ha-icon icon="${S.icon}"></ha-icon>${S.label}</div>
            <div class="prog">${running || st === "finished" ? (progName || "Geschirrspüler") : "Geschirrspüler"}</div>
            ${timeLine ? `<div class="time">${timeLine}</div>` : ""}
            ${st === "run" || st === "pause" ? `<div class="pct">${Math.round(pct)} % geschafft</div>` : ""}
          </div>
        </div>
        <div class="body">${notes.map(([i, t, k]) => `<div class="note ${k}"><ha-icon icon="${i}"></ha-icon><span>${t}</span></div>`).join("")}${opts.length ? `<div class="h2">Optionen</div><div class="opts">${opts.map((o) =>
            `<button class="op${o.v === "on" ? " on" : ""}" data-act="opt" data-e="${o.entity}"><ha-icon icon="${o.icon}"></ha-icon>${o.label}</button>`).join("")}</div>` : ""}${actions}</div>
      </ha-card>`;

    this.shadowRoot.querySelectorAll("[data-act]").forEach((el) => el.addEventListener("click", () => this._click(el)));
  }

  _click(el) {
    if (el.disabled) return;
    const c = this._config;
    const h = this._hass;
    const act = el.dataset.act;
    if (act === "opt") h.callService("switch", "toggle", { entity_id: el.dataset.e });
    else if (act === "pick") {
      this._pick = el.dataset.p; this._armed = null;
      h.callService("select", "select_option", { entity_id: c.selected, option: this._pick });
      this._sig = null; this._render();
    } else if (act === "start") {
      const p = this._pick || this._s(c.selected);
      this._arm("start", () => h.callService("select", "select_option", { entity_id: c.program, option: p }));
    } else if (act === "stop") {
      this._arm("stop", () => h.callService("button", "press", { entity_id: c.stop }));
    } else if (act === "power") {
      h.callService("switch", "turn_on", { entity_id: c.power });
    }
  }

  static getStubConfig() { return {}; }
}

if (!customElements.get("geschirrspueler-card")) {
  customElements.define("geschirrspueler-card", GeschirrspuelerCard);
  window.customCards = window.customCards || [];
  window.customCards.push({ type: "geschirrspueler-card", name: "Geschirrspüler", description: "Restzeit, Programm, Optionen und Start/Stopp für den Home-Connect-Geschirrspüler" });
}
