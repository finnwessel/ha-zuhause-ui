/* saugplan-card – Saugplan pro Raum (Modus + Intervall) und Warteschlange für den Saugroboter */
/* Getönt-flache Flächen – gleiches Schema wie die Aktions-Knöpfe im restlichen Dashboard */
const SPC_TINT = (c, p = 16) => `color-mix(in srgb, ${c} ${p}%, var(--card-background-color))`;
const SPC_FG = {
  lila: "var(--zh-robot, var(--deep-purple-color))",
  blau: "var(--zh-water, var(--cyan-color))",
  grau: "var(--zh-neutral, var(--secondary-text-color))",
  ok: "var(--zh-ok, var(--success-color))",
  hint: "var(--zh-hint, var(--warning-color))",
  err: "var(--zh-error, var(--error-color))",
};
const SPC_MODES = {
  aus: { label: "Aus", short: "Aus", icon: "mdi:close-circle-outline", fg: SPC_FG.grau },
  vacuum: { label: "Saugen", short: "Saugen", icon: "mdi:robot-vacuum", fg: SPC_FG.lila },
  vacuum_mop: { label: "Saugen & Wischen", short: "Beides", icon: "mdi:broom", fg: SPC_FG.lila },
  mop: { label: "Wischen", short: "Wischen", icon: "mdi:water", fg: SPC_FG.blau },
  mopping_after_sweeping: { label: "Erst saugen, dann wischen", short: "Nachein.", icon: "mdi:swap-horizontal", fg: SPC_FG.lila },
};
const SPC_ROOMS = [
  { id: 1, slug: "kuche", name: "Küche", icon: "mdi:silverware-fork-knife" },
  { id: 4, slug: "flur", name: "Flur", icon: "mdi:door" },
  { id: 5, slug: "wohnzimmer", name: "Wohnzimmer", icon: "mdi:sofa" },
  { id: 7, slug: "bad", name: "Bad", icon: "mdi:shower" },
  { id: 2, slug: "arbeitszimmer", name: "Arbeitszimmer", icon: "mdi:desk" },
  { id: 6, slug: "schlafzimmer", name: "Schlafzimmer", icon: "mdi:bed" },
];
const SPC_WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

class SaugplanCard extends HTMLElement {
  setConfig(config) {
    this._config = {
      vacuum: "vacuum.eufy_clean_x10_pro_omni",
      queue: "input_text.saugroboter_warteschlange",
      job: "input_text.saugroboter_auftrag",
      active: "input_boolean.saugroboter_warteschlange_aktiv",
      enqueue_script: "script.saugroboter_faellige_einreihen",
      rooms: SPC_ROOMS,
      ...config,
    };
    this._armed = null;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
  }

  set hass(hass) {
    this._hass = hass;
    const ids = [this._config.vacuum, this._config.queue, this._config.job, this._config.active];
    this._config.rooms.forEach((r) => ids.push(this._e(r, "modus"), this._e(r, "intervall"), this._e(r, "zuletzt")));
    const day = new Date().toDateString();
    const sig = ids.map((i) => (hass.states[i] ? hass.states[i].state : "-")).join("|") + day;
    if (sig === this._sig) return;
    this._sig = sig;
    this._render();
  }

  getCardSize() { return 12; }
  getGridOptions() { return { columns: 12, rows: "auto", min_columns: 6 }; }

  _e(room, kind) {
    const dom = { modus: "input_select", intervall: "input_number", zuletzt: "input_datetime" }[kind];
    return `${dom}.saugplan_${room.slug}_${kind}`;
  }
  _st(id) { const s = this._hass.states[id]; return s ? s.state : undefined; }

  _parseList(text) {
    return (text || "").split(",").map((e) => e.trim()).filter((e) => e.includes(":"))
      .map((e) => { const [id, mode] = e.split(":"); return { id: Number(id), mode: mode.trim() }; })
      .filter((e) => e.id > 0 && SPC_MODES[e.mode]);
  }
  _queue() { return this._parseList(this._st(this._config.queue)); }
  _setQueue(list) {
    this._hass.callService("input_text", "set_value", {
      entity_id: this._config.queue,
      value: list.map((e) => `${e.id}:${e.mode}`).join(","),
    });
  }
  _stages(list) {
    const rest = list.slice();
    const out = [];
    while (rest.length) {
      const mode = rest[0].mode;
      out.push({ mode, items: rest.filter((e) => e.mode === mode) });
      for (let i = rest.length - 1; i >= 0; i--) if (rest[i].mode === mode) rest.splice(i, 1);
    }
    return out;
  }
  _room(id) { return this._config.rooms.find((r) => r.id === Number(id)) || { id, name: `Raum ${id}`, icon: "mdi:floor-plan" }; }

  _dayDiff(d) {
    const a = new Date(); a.setHours(0, 0, 0, 0);
    const b = new Date(d); b.setHours(0, 0, 0, 0);
    return Math.round((b - a) / 86400000);
  }
  _planInfo(room) {
    const mode = this._st(this._e(room, "modus")) || "aus";
    const iv = parseInt(this._st(this._e(room, "intervall")), 10) || 0;
    const lastRaw = this._st(this._e(room, "zuletzt"));
    const last = lastRaw && lastRaw !== "unknown" ? new Date(lastRaw.replace(" ", "T")) : null;
    let lastTxt = "noch nie";
    if (last && !isNaN(last)) {
      const d = -this._dayDiff(last);
      lastTxt = d <= 0 ? "heute" : d === 1 ? "gestern" : `vor ${d} Tagen`;
    }
    let nextTxt = "", cls = "", due = false;
    if (mode === "aus") { nextTxt = "kein Plan"; cls = "off"; }
    else if (!last || isNaN(last)) { nextTxt = "jetzt fällig"; cls = "late"; due = true; }
    else {
      const n = new Date(last); n.setDate(n.getDate() + iv);
      const d = this._dayDiff(n);
      if (d < 0) { nextTxt = d === -1 ? "seit gestern fällig" : `seit ${-d} Tagen fällig`; cls = "late"; due = true; }
      else if (d === 0) { nextTxt = "heute fällig"; cls = "today"; due = true; }
      else if (d === 1) nextTxt = "morgen";
      else if (d < 7) nextTxt = `${SPC_WD[n.getDay()]} (in ${d} Tagen)`;
      else nextTxt = `${String(n.getDate()).padStart(2, "0")}.${String(n.getMonth() + 1).padStart(2, "0")}.`;
    }
    return { mode, iv, lastTxt, nextTxt, cls, due };
  }

  _arm(key, fn) {
    if (this._armed === key) { this._armed = null; clearTimeout(this._armTimer); fn(); this._sig = null; this._render(); return; }
    this._armed = key; clearTimeout(this._armTimer);
    this._armTimer = setTimeout(() => { this._armed = null; this._sig = null; this._render(); }, 3500);
    this._sig = null; this._render();
  }

  _render() {
    if (!this._hass || !this._config) return;
    const q = this._queue();
    const job = this._parseList(this._st(this._config.job));
    const jobAll = (this._st(this._config.job) || "").startsWith("alle");
    const active = this._st(this._config.active) === "on";
    const vac = this._st(this._config.vacuum);
    const docked = vac === "docked";
    const inQueue = new Set(q.map((e) => e.id));
    const inJob = new Set(job.map((e) => e.id));
    const plans = this._config.rooms.map((r) => ({ room: r, ...this._planInfo(r) }));
    const dueCount = plans.filter((p) => p.due && !inQueue.has(p.room.id)).length;

    let status, statusIcon, statusCol;
    if (jobAll) { status = "Vollreinigung läuft"; statusIcon = "mdi:robot-vacuum"; statusCol = SPC_FG.lila; }
    else if (job.length) { status = `Putzt: ${job.map((e) => this._room(e.id).name).join(", ")}`; statusIcon = "mdi:robot-vacuum"; statusCol = SPC_FG.lila; }
    else if (active && q.length) { status = "Läuft – nächste Etappe startet gleich"; statusIcon = "mdi:playlist-play"; statusCol = SPC_FG.lila; }
    else if (q.length) { status = "Wartet – startet, wenn ihr weg seid"; statusIcon = "mdi:playlist-check"; statusCol = SPC_FG.hint; }
    else { status = "Warteschlange leer"; statusIcon = "mdi:playlist-remove"; statusCol = SPC_FG.ok; }

    const stages = this._stages(q);
    const stageHtml = stages.map((s, si) => {
      const m = SPC_MODES[s.mode];
      const rows = s.items.map((e) => {
        const r = this._room(e.id);
        const running = inJob.has(e.id);
        return `<div class="qrow${running ? " run" : ""}">
          <ha-icon icon="${r.icon}"></ha-icon><span class="qn">${r.name}</span>
          ${running ? `<span class="tag run">läuft</span>` : ""}
          <button class="x" data-act="rm" data-id="${e.id}" title="Entfernen"><ha-icon icon="mdi:close"></ha-icon></button>
        </div>`;
      }).join("");
      return `<div class="stage"><div class="sh"><span class="sn">Etappe ${si + 1}</span><span class="chip" style="background:${SPC_TINT(m.fg)};--btn-fg:${m.fg}"><ha-icon icon="${m.icon}"></ha-icon>${m.label}</span></div>${rows}</div>`;
    }).join("");

    const startLabel = active ? "Anhalten" : this._armed === "start" ? "Nochmal tippen" : "Jetzt starten";
    const startFg = active ? SPC_FG.grau : SPC_FG.lila;
    const canStart = active || (q.length > 0 && docked);

    const planHtml = plans.map((p) => {
      const r = p.room;
      const queued = inQueue.has(r.id);
      const segs = Object.entries(SPC_MODES).map(([k, m]) =>
        `<button class="sg${k === p.mode ? " on" : ""}" data-act="mode" data-id="${r.id}" data-mode="${k}" style="${k === p.mode ? `background:${SPC_TINT(m.fg)};--btn-fg:${m.fg}` : ""}" title="${m.label}"><ha-icon icon="${m.icon}"></ha-icon><span>${m.short}</span></button>`).join("");
      return `<div class="room${p.mode === "aus" ? " dim" : ""}">
        <div class="rh">
          <div class="ri"><ha-icon icon="${r.icon}"></ha-icon></div>
          <div class="rt"><div class="rn">${r.name}</div>
            <div class="rs">zuletzt ${p.lastTxt} · <span class="nx ${p.cls}">${p.nextTxt}</span></div></div>
          <button class="add${queued ? " in" : ""}" data-act="${queued ? "rm" : "add"}" data-id="${r.id}">
            <ha-icon icon="${queued ? "mdi:playlist-check" : "mdi:playlist-plus"}"></ha-icon>${queued ? "Eingereiht" : "Einreihen"}</button>
        </div>
        <div class="seg">${segs}</div>
        <div class="iv${p.mode === "aus" ? " hide" : ""}">
          <button class="st" data-act="iv" data-id="${r.id}" data-d="-1"${p.iv <= 1 ? " disabled" : ""}><ha-icon icon="mdi:minus"></ha-icon></button>
          <span>${p.iv === 1 ? "jeden Tag" : `alle ${p.iv} Tage`}</span>
          <button class="st" data-act="iv" data-id="${r.id}" data-d="1"${p.iv >= 14 ? " disabled" : ""}><ha-icon icon="mdi:plus"></ha-icon></button>
        </div>
      </div>`;
    }).join("");

    this.shadowRoot.innerHTML = `
      <style>
        :host { --spc-r: var(--zh-r-in, 12px); }
        ha-card { padding: var(--zh-pad, 16px); display: flex; flex-direction: column; gap: var(--zh-gap, 12px); }
        .h2 { font-size: var(--zh-f-label, 12px); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--secondary-text-color); margin: 4px 0 -4px; }
        .status { display: flex; align-items: center; gap: 12px; }
        .dot { width: var(--zh-touch, 40px); height: var(--zh-touch, 40px); border-radius: 50%; display: grid; place-items: center; flex: none; color: ${statusCol}; background: color-mix(in srgb, ${statusCol} 18%, transparent); }
        .dot ha-icon { --mdc-icon-size: 22px; }
        .s1 { font-weight: 600; font-size: var(--zh-f-card, 15px); color: var(--primary-text-color); }
        .s2 { font-size: var(--zh-f-meta, 13px); color: var(--secondary-text-color); margin-top: 2px; }
        .stage { border-radius: var(--spc-r); background: var(--secondary-background-color, rgba(127,127,127,.12)); padding: 8px 10px; display: flex; flex-direction: column; gap: 2px; }
        .sh { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 2px; }
        .sn { font-size: var(--zh-f-label, 12px); font-weight: 600; color: var(--secondary-text-color); }
        .chip { display: inline-flex; align-items: center; gap: 4px; color: var(--primary-text-color); font-size: 11px; font-weight: 600; padding: 3px 8px 3px 6px; border-radius: 10px; }
        .chip ha-icon { --mdc-icon-size: 14px; color: var(--btn-fg); }
        .qrow { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: var(--zh-f-body, 14px); color: var(--primary-text-color); }
        .qrow ha-icon { --mdc-icon-size: 18px; color: var(--secondary-text-color); }
        .qn { flex: 1; }
        .tag.run { font-size: 11px; font-weight: 600; color: ${SPC_FG.lila}; background: ${SPC_TINT(SPC_FG.lila, 22)}; border-radius: 8px; padding: 2px 6px; }
        button { all: unset; cursor: pointer; -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        button[disabled] { opacity: .35; cursor: default; }
        .x { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 50%; }
        .x:active { background: rgba(127,127,127,.2); }
        .acts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .btn { border-radius: var(--spc-r); padding: 12px 10px; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: var(--zh-f-body, 14px); font-weight: 600; color: var(--primary-text-color); transition: transform .1s, filter .2s; }
        .btn:active { transform: scale(.98); }
        .btn ha-icon { --mdc-icon-size: 20px; color: var(--btn-fg); }
        .btn.armed { filter: brightness(1.15); }
        .clear { grid-column: 1 / -1; background: none; box-shadow: none; color: var(--secondary-text-color); font-weight: 500; font-size: var(--zh-f-meta, 13px); padding: 4px; }
        .clear.armed { color: ${SPC_FG.err}; }
        .hint { font-size: var(--zh-f-label, 12px); color: var(--secondary-text-color); text-align: center; margin-top: -6px; }
        .room { border-radius: var(--spc-r); border: 1px solid var(--divider-color, rgba(127,127,127,.25)); padding: 12px; display: flex; flex-direction: column; gap: 10px; }
        .room.dim .rn, .room.dim .ri { opacity: .55; }
        .rh { display: flex; align-items: center; gap: 10px; }
        .ri { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; flex: none; background: ${SPC_TINT(SPC_FG.lila)}; color: ${SPC_FG.lila}; }
        .ri ha-icon { --mdc-icon-size: 20px; }
        .rt { flex: 1; min-width: 0; }
        .rn { font-weight: 600; font-size: var(--zh-f-card, 15px); color: var(--primary-text-color); }
        .rs { font-size: var(--zh-f-label, 12px); color: var(--secondary-text-color); margin-top: 1px; }
        .nx.late { color: ${SPC_FG.err}; font-weight: 600; }
        .nx.today { color: ${SPC_FG.hint}; font-weight: 600; }
        .add { display: inline-flex; align-items: center; gap: 4px; font-size: var(--zh-f-label, 12px); font-weight: 600; padding: 6px 10px; border-radius: 12px; color: ${SPC_FG.lila}; background: ${SPC_TINT(SPC_FG.lila, 12)}; white-space: nowrap; }
        .add ha-icon { --mdc-icon-size: 16px; }
        .add.in { color: var(--primary-text-color); background: ${SPC_TINT(SPC_FG.lila, 26)}; }
        .add.in ha-icon { color: ${SPC_FG.lila}; }
        .seg { display: grid; grid-template-columns: repeat(5, 1fr); gap: 3px; padding: 3px; border-radius: var(--zh-r-in, 12px); background: var(--secondary-background-color, rgba(127,127,127,.12)); }
        .sg { border-radius: 9px; padding: 7px 2px; display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: 10.5px; font-weight: 500; color: var(--secondary-text-color); }
        .sg ha-icon { --mdc-icon-size: 19px; }
        .sg.on { color: var(--primary-text-color); }
        .sg.on ha-icon { color: var(--btn-fg); }
        .iv { display: flex; align-items: center; justify-content: center; gap: 14px; font-size: var(--zh-f-body, 14px); color: var(--primary-text-color); }
        .iv.hide { display: none; }
        .iv span { min-width: 104px; text-align: center; font-weight: 500; }
        .st { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: var(--secondary-background-color, rgba(127,127,127,.12)); }
        .st ha-icon { --mdc-icon-size: 18px; }
        .foot { font-size: var(--zh-f-label, 12px); color: var(--secondary-text-color); line-height: 1.4; }
      </style>
      <ha-card>
        <div class="h2">Warteschlange</div>
        <div class="status"><div class="dot"><ha-icon icon="${statusIcon}"></ha-icon></div>
          <div><div class="s1">${status}</div>
          <div class="s2">${q.length ? `${q.length} ${q.length === 1 ? "Raum" : "Räume"} in ${stages.length} ${stages.length === 1 ? "Etappe" : "Etappen"}` : "Räume unten einreihen oder fällige übernehmen"}</div></div></div>
        ${stageHtml}
        <div class="acts">
          <button class="btn" data-act="due" style="background:${SPC_TINT(SPC_FG.lila)};--btn-fg:${SPC_FG.lila}"${dueCount ? "" : " disabled"}><ha-icon icon="mdi:calendar-alert"></ha-icon>Fällige${dueCount ? ` (${dueCount})` : ""}</button>
          <button class="btn${this._armed === "start" ? " armed" : ""}" data-act="start" style="background:${SPC_TINT(startFg)};--btn-fg:${startFg}"${canStart ? "" : " disabled"}><ha-icon icon="${active ? "mdi:pause" : this._armed === "start" ? "mdi:gesture-tap" : "mdi:play"}"></ha-icon>${startLabel}</button>
          ${q.length ? `<button class="btn clear${this._armed === "clear" ? " armed" : ""}" data-act="clear">${this._armed === "clear" ? "Zum Leeren nochmal tippen" : "Warteschlange leeren"}</button>` : ""}
        </div>
        ${!docked && !active && q.length ? `<div class="hint">Starten geht nur, wenn er in der Station steht.</div>` : ""}
        <div class="h2">Plan pro Raum</div>
        ${planHtml}
        <div class="foot">Fällige Räume putzt er automatisch, sobald ihr beide weg seid (8–20 Uhr). Eingereihte Räume werden dabei mit erledigt. Ein Raum gilt erst als geputzt, wenn die Reinigung abgeschlossen ist – „Saugen“ zählt nicht für einen Wisch-Plan.</div>
      </ha-card>`;

    this.shadowRoot.querySelectorAll("[data-act]").forEach((el) => el.addEventListener("click", (ev) => this._click(ev.currentTarget)));
  }

  _click(el) {
    if (el.disabled) return;
    const act = el.dataset.act;
    const id = Number(el.dataset.id);
    const h = this._hass;
    const q = this._queue();
    if (act === "rm") this._setQueue(q.filter((e) => e.id !== id));
    else if (act === "add") {
      const room = this._room(id);
      let mode = this._st(this._e(room, "modus"));
      if (!SPC_MODES[mode] || mode === "aus") mode = "vacuum_mop";
      this._setQueue([...q.filter((e) => e.id !== id), { id, mode }]);
    } else if (act === "mode") {
      h.callService("input_select", "select_option", { entity_id: this._e(this._room(id), "modus"), option: el.dataset.mode });
    } else if (act === "iv") {
      const ent = this._e(this._room(id), "intervall");
      const v = Math.min(14, Math.max(1, (parseInt(this._st(ent), 10) || 1) + Number(el.dataset.d)));
      h.callService("input_number", "set_value", { entity_id: ent, value: v });
    } else if (act === "due") {
      const [d, s] = this._config.enqueue_script.split(".");
      h.callService(d, s, { starten: false });
    } else if (act === "start") {
      if (this._st(this._config.active) === "on") h.callService("input_boolean", "turn_off", { entity_id: this._config.active });
      else this._arm("start", () => h.callService("input_boolean", "turn_on", { entity_id: this._config.active }));
    } else if (act === "clear") {
      this._arm("clear", () => this._setQueue([]));
    }
  }

  static getStubConfig() { return {}; }
}

if (!customElements.get("saugplan-card")) {
  customElements.define("saugplan-card", SaugplanCard);
  window.customCards = window.customCards || [];
  window.customCards.push({ type: "saugplan-card", name: "Saugplan", description: "Saugplan pro Raum und Warteschlange für den Saugroboter" });
}
