/* saugplan-card – Warteschlange und Plan pro Raum, Datenquelle: Integration „Vacuum Planner“ */
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
  off: { label: "Aus", short: "Aus", icon: "mdi:close-circle-outline", fg: SPC_FG.grau },
  vacuum: { label: "Saugen", short: "Saugen", icon: "mdi:robot-vacuum", fg: SPC_FG.lila },
  vacuum_mop: { label: "Saugen & Wischen", short: "Beides", icon: "mdi:broom", fg: SPC_FG.lila },
  mop: { label: "Wischen", short: "Wischen", icon: "mdi:water", fg: SPC_FG.blau },
  mopping_after_sweeping: { label: "Erst saugen, dann wischen", short: "Nachein.", icon: "mdi:swap-horizontal", fg: SPC_FG.lila },
};
const SPC_CLEAN = ["vacuum", "vacuum_mop", "mop", "mopping_after_sweeping"];
const SPC_WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const SPC_BLOCK = {
  busy: { icon: "mdi:television-play", text: "gerade belegt" },
  paused: { icon: "mdi:pause-circle-outline", text: "ausgesetzt" },
  skipped: { icon: "mdi:calendar-remove", text: "heute ausgelassen" },
  failed: { icon: "mdi:alert-circle-outline", text: "nach Fehler ausgelassen" },
};
const SPC_RETURN_SRC = { learned: "gelernt", calendar: "Kalender", default: "Annahme", overdue: "überfällig" };

class SaugplanCard extends HTMLElement {
  setConfig(config) {
    this._config = {
      queue: "sensor.vacuum_planner_queue",
      status: "sensor.vacuum_planner_status",
      domain: "vacuum_planner",
      ...config,
    };
    this._armed = null;
    this._sel = null; // ausgewählter Chip (Raum-ID)
    this._open = new Set(); // aufgeklappte Räume im Plan
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
  }

  set hass(hass) {
    this._hass = hass;
    const q = hass.states[this._config.queue];
    const s = hass.states[this._config.status];
    const sig = [q && q.last_updated, s && s.last_updated, new Date().getMinutes()].join("|");
    if (sig === this._sig) return;
    this._sig = sig;
    this._render();
  }

  getCardSize() { return 12; }
  getGridOptions() { return { columns: 12, rows: "auto", min_columns: 6 }; }

  _call(service, data = {}) { this._hass.callService(this._config.domain, service, data); }
  _esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m])); }
  _hm(iso) { if (!iso) return ""; const d = new Date(iso); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; }
  _dayDiff(d) {
    const a = new Date(); a.setHours(0, 0, 0, 0);
    const b = new Date(d); b.setHours(0, 0, 0, 0);
    return Math.round((b - a) / 86400000);
  }
  _when(iso) {
    if (!iso) return "";
    const d = this._dayDiff(iso);
    const t = this._hm(iso);
    if (d === 0) return t;
    if (d === 1) return `morgen ${t}`;
    return `${SPC_WD[new Date(iso).getDay()]} ${t}`;
  }
  _dur(min) { min = Math.round(min || 0); return min >= 60 ? `${Math.floor(min / 60)} Std ${min % 60 ? `${min % 60} Min` : ""}`.trim() : `${min} Min`; }

  _arm(key, fn) {
    if (this._armed === key) { this._armed = null; clearTimeout(this._armTimer); fn(); this._sig = null; this._render(); return; }
    this._armed = key; clearTimeout(this._armTimer);
    this._armTimer = setTimeout(() => { this._armed = null; this._sig = null; this._render(); }, 3500);
    this._sig = null; this._render();
  }

  _status(st, q) {
    const a = st.attributes;
    const d = a.reason_data || {};
    const r = a.reason;
    const names = (ids) => (ids || []).map((id) => (q.rooms.find((x) => x.id === id) || { name: `Raum ${id}` }).name).join(", ");
    const L = SPC_FG.lila, H = SPC_FG.hint, O = SPC_FG.ok, G = SPC_FG.grau, E = SPC_FG.err;
    switch (st.state) {
      case "cleaning": {
        const j = a.job || {};
        return r === "returning_soon"
          ? ["mdi:home-import-outline", H, "Fährt gleich zurück", "Jemand kommt heim – ohne Antwort in 3 Min zur Station."]
          : ["mdi:robot-vacuum", L, `Putzt: ${names(j.rooms)}`, j.finish ? `Diese Etappe fertig gegen ${this._hm(j.finish)}` : ""];
      }
      case "starting": return ["mdi:robot-vacuum", L, "Fährt los …", names((a.job || {}).rooms)];
      case "prewarn": return ["mdi:bell-ring-outline", L, `Startet um ${this._hm(d.until)}`, "Vorwarnung ist raus – „Heute nicht“ hält ihn auf."];
      case "between_stages": return ["mdi:home-import-outline", L, "Kurz in der Station", "Mopp waschen, absaugen – dann nächste Etappe."];
      case "error": return ["mdi:robot-vacuum-alert", E, "Braucht Hilfe", d.message || "Fehler"];
      case "waiting": {
        const map = {
          someone_home: ["mdi:home-account", H, "Wartet, bis ihr weg seid", ""],
          auto_off: ["mdi:robot-vacuum-off", G, "Automatik ist aus", "Starten nur von Hand."],
          guest_mode: ["mdi:account-group", G, "Gastmodus", "Kein automatischer Start."],
          skipped_today: ["mdi:calendar-remove", G, "Heute nicht", "Morgen geht's automatisch weiter."],
          quiet_midday: ["mdi:volume-off", H, "Mittagsruhe", `Weiter ab ${this._when(d.until)}`],
          quiet_sunday: ["mdi:calendar-weekend", H, "Sonntagsruhe", `Weiter ab ${this._when(d.until)}`],
          quiet_holiday: ["mdi:calendar-star", H, "Feiertagsruhe", `Weiter ab ${this._when(d.until)}`],
          quiet_night: ["mdi:weather-night", H, "Ruhezeit", `Weiter ab ${this._when(d.until)}`],
          no_time: ["mdi:timer-sand", H, "Zu wenig Zeit", `Nur ${d.budget || 0} Min bis zur Rückkehr bzw. Ruhezeit.`],
          rooms_blocked: ["mdi:television-play", H, "Räume gerade belegt", names(d.rooms)],
          robot_busy: ["mdi:robot-vacuum", G, "Roboter ist unterwegs", "Wartet, bis er in der Station steht."],
          charging: ["mdi:battery-charging-50", H, "Lädt", `Akku ${Math.round(d.battery || 0)} %`],
          water_low: ["mdi:water-alert", E, "Frischwasser fast leer", `Noch ${Math.round(d.water || 0)} %`],
        };
        return map[r] || ["mdi:timer-sand", H, "Wartet", r || ""];
      }
      default: {
        if (r === "aborted") return ["mdi:home-import-outline", G, "Zurückgerufen", "Die Räume bleiben in der Warteschlange."];
        if (r === "stopped") return ["mdi:stop-circle-outline", G, "Angehalten", "Startet wieder, wenn ihr das nächste Mal weg seid."];
        if (r === "no_start") return ["mdi:alert-circle-outline", E, "Ist nicht losgefahren", "Beim nächsten Weggehen versucht er es erneut."];
        const next = q.rooms.filter((x) => x.mode !== "off" && x.next_due).sort((x, y) => x.next_due.localeCompare(y.next_due))[0];
        return ["mdi:check-circle-outline", O, "Alles erledigt", next ? `Als Nächstes: ${next.name} ${this._dueText(next).toLowerCase()}` : ""];
      }
    }
  }

  _dueText(r) {
    if (r.mode === "off") return "Kein Plan";
    if (!r.last_cleaned) return "Jetzt fällig";
    const d = this._dayDiff(r.next_due);
    if (d < 0) return d === -1 ? "Seit gestern fällig" : `Seit ${-d} Tagen fällig`;
    if (d === 0) return "Heute fällig";
    if (d === 1) return "Morgen";
    if (d < 7) return `${SPC_WD[new Date(r.next_due).getDay()]} (in ${d} Tagen)`;
    const n = new Date(r.next_due);
    return `${String(n.getDate()).padStart(2, "0")}.${String(n.getMonth() + 1).padStart(2, "0")}.`;
  }
  _lastText(r) {
    if (!r.last_cleaned) return "noch nie";
    const d = -this._dayDiff(r.last_cleaned);
    return d <= 0 ? `heute ${this._hm(r.last_cleaned)}` : d === 1 ? "gestern" : `vor ${d} Tagen`;
  }

  _render() {
    if (!this._hass || !this._config) return;
    const qs = this._hass.states[this._config.queue];
    const st = this._hass.states[this._config.status];
    if (!qs || !st) {
      this.shadowRoot.innerHTML = `<ha-card style="padding:16px">Vacuum Planner nicht gefunden (${this._esc(this._config.queue)}).</ha-card>`;
      return;
    }
    const q = { items: [], stages: [], rooms: [], ...qs.attributes };
    const a = st.attributes;
    const running = ["cleaning", "starting", "between_stages", "prewarn"].includes(st.state) || a.session_active;
    const items = Object.fromEntries(q.items.map((i) => [i.id, i]));
    const rooms = Object.fromEntries(q.rooms.map((r) => [r.id, r]));
    if (this._sel != null && !items[this._sel]) this._sel = null;

    const [sIcon, sCol, sTitle, sSub] = this._status(st, q);

    // Etappen mit Chips
    const stageHtml = q.stages.map((s, i) => {
      const m = SPC_MODES[s.mode] || SPC_MODES.vacuum;
      const chips = s.rooms.map((id) => {
        const it = items[id] || { id, name: `Raum ${id}` };
        const r = rooms[id] || {};
        const blk = it.blocked && SPC_BLOCK[it.blocked];
        const cls = ["chip", it.running ? "run" : "", blk ? "blk" : "", it.next ? "next" : "", this._sel === id ? "sel" : ""].join(" ");
        return `<button class="${cls}" data-act="sel" data-id="${id}" style="--c:${m.fg}">
          <ha-icon icon="${blk ? blk.icon : r.icon || "mdi:floor-plan"}"></ha-icon><span>${this._esc(it.name)}</span>${it.source === "manual" ? `<i class="mdot" title="von Hand"></i>` : ""}</button>`;
      }).join("");
      return `<div class="stage">
        <div class="sh"><span class="sn">${i + 1}</span><ha-icon icon="${m.icon}" style="color:${m.fg}"></ha-icon><span class="sm">${m.label}${s.alone ? " · einzeln" : ""}</span><span class="st">≈ ${this._dur(s.minutes)}</span></div>
        <div class="chips">${chips}</div></div>`;
    }).join("");

    // Aktionen für den ausgewählten Chip
    let selHtml = "";
    if (this._sel != null) {
      const it = items[this._sel];
      const r = rooms[this._sel] || {};
      const blk = it.blocked && SPC_BLOCK[it.blocked];
      const segs = SPC_CLEAN.map((k) => {
        const m = SPC_MODES[k];
        const on = k === it.mode;
        return `<button class="sg${on ? " on" : ""}" data-act="qmode" data-mode="${k}" style="${on ? `background:${SPC_TINT(m.fg)};--btn-fg:${m.fg}` : ""}"><ha-icon icon="${m.icon}"></ha-icon><span>${m.short}</span></button>`;
      }).join("");
      const removeLabel = it.source === "plan" && r.due ? "Heute auslassen" : "Entfernen";
      selHtml = `<div class="selbox">
        <div class="selh"><b>${this._esc(it.name)}</b><span>${it.source === "manual" ? "von Hand eingereiht" : "laut Plan fällig"} · ≈ ${this._dur(it.minutes)}${blk ? ` · ${blk.text}` : ""}</span></div>
        <div class="seg">${segs}</div>
        <div class="selacts">
          <button class="mini" data-act="front"><ha-icon icon="mdi:arrow-collapse-up"></ha-icon>Zuerst</button>
          ${it.blocked === "paused" || it.blocked === "failed" || it.blocked === "skipped" ? `<button class="mini" data-act="resume"><ha-icon icon="mdi:play-circle-outline"></ha-icon>Freigeben</button>` : ""}
          <button class="mini warn" data-act="rm"><ha-icon icon="mdi:playlist-remove"></ha-icon>${removeLabel}</button>
        </div></div>`;
    }

    // Zusammenfassung
    const parts = [];
    if (q.items.length) parts.push(`${q.items.length} ${q.items.length === 1 ? "Raum" : "Räume"} · ≈ ${this._dur(q.total_minutes)}`);
    if (q.finish && running) parts.push(`fertig ≈ ${this._hm(q.finish)}`);
    if (a.expected_return) parts.push(`Rückkehr ≈ ${this._when(a.expected_return)} (${SPC_RETURN_SRC[a.return_source] || a.return_source})`);

    const startLabel = running ? "Stoppen" : this._armed === "start" ? "Nochmal tippen" : "Jetzt starten";
    const startFg = running ? SPC_FG.grau : SPC_FG.lila;
    const canStart = running || (q.items.length > 0 && !["error"].includes(st.state));
    const skipOn = a.skipped_today;

    // Plan pro Raum
    const planHtml = q.rooms.map((r) => {
      const open = this._open.has(r.id);
      const queued = !!items[r.id];
      const m = SPC_MODES[r.mode] || SPC_MODES.off;
      const due = this._dueText(r);
      const cls = r.mode === "off" ? "off" : r.overdue_days > 0 ? "late" : r.overdue_days === 0 || !r.last_cleaned ? "today" : "";
      const skip = r.skip_reason && SPC_BLOCK[r.skip_reason];
      const segs = Object.entries(SPC_MODES).map(([k, mm]) =>
        `<button class="sg${k === r.mode ? " on" : ""}" data-act="mode" data-id="${r.id}" data-mode="${k}" style="${k === r.mode ? `background:${SPC_TINT(mm.fg)};--btn-fg:${mm.fg}` : ""}"><ha-icon icon="${mm.icon}"></ha-icon><span>${mm.short}</span></button>`).join("");
      const mins = r.minutes || {};
      return `<div class="room${r.mode === "off" ? " dim" : ""}${open ? " open" : ""}">
        <div class="rh" data-act="toggle" data-id="${r.id}">
          <div class="ri" style="color:${m.fg};background:${SPC_TINT(m.fg)}"><ha-icon icon="${r.icon}"></ha-icon></div>
          <div class="rt"><div class="rn">${this._esc(r.name)}</div>
            <div class="rs">${skip ? `<span class="nx skip"><ha-icon icon="${skip.icon}"></ha-icon>${skip.text}${r.skip_reason === "paused" && r.skip_until ? ` bis ${SPC_WD[new Date(r.skip_until).getDay()]}` : ""}</span>` : `<span class="nx ${cls}">${due}</span>`} · zuletzt ${this._lastText(r)}</div></div>
          <button class="add${queued ? " in" : ""}" data-act="${queued ? "unq" : "add"}" data-id="${r.id}"${r.mode === "off" && !queued ? "" : ""}>
            <ha-icon icon="${queued ? "mdi:playlist-check" : "mdi:playlist-plus"}"></ha-icon>${queued ? "Drin" : "Einreihen"}</button>
        </div>
        ${open ? `<div class="rd">
          <div class="seg five">${segs}</div>
          <div class="iv${r.mode === "off" ? " hide" : ""}">
            <button class="stp" data-act="iv" data-id="${r.id}" data-d="-1"${r.interval <= 1 ? " disabled" : ""}><ha-icon icon="mdi:minus"></ha-icon></button>
            <span>${r.interval === 1 ? "jeden Tag" : `alle ${r.interval} Tage`}</span>
            <button class="stp" data-act="iv" data-id="${r.id}" data-d="1"${r.interval >= 30 ? " disabled" : ""}><ha-icon icon="mdi:plus"></ha-icon></button>
          </div>
          <div class="pz">
            ${r.skip_reason ? `<button class="mini" data-act="resume" data-id="${r.id}"><ha-icon icon="mdi:play-circle-outline"></ha-icon>Wieder einplanen</button>`
              : `<span class="pl">Aussetzen</span>${[1, 3, 7].map((d) => `<button class="mini" data-act="pause" data-id="${r.id}" data-days="${d}">${d === 1 ? "bis morgen" : d === 7 ? "1 Woche" : `${d} Tage`}</button>`).join("")}`}
          </div>
          <div class="meta">≈ ${Math.round(mins.dry || 0)} Min saugen · ${Math.round(mins.wet || 0)} Min wischen · ${r.cleaned || 0}× geputzt${r.failed ? ` · ${r.failed}× Fehler` : ""}</div>
        </div>` : ""}
      </div>`;
    }).join("");

    this.shadowRoot.innerHTML = `
      <style>
        :host { --spc-r: var(--zh-r-in, 12px); }
        ha-card { padding: var(--zh-pad, 16px); display: flex; flex-direction: column; gap: var(--zh-gap, 12px); }
        button { all: unset; cursor: pointer; -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        button[disabled] { opacity: .35; cursor: default; }
        .h2 { font-size: var(--zh-f-label, 12px); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--secondary-text-color); margin: 4px 0 -4px; }
        .status { display: flex; align-items: center; gap: 12px; }
        .dot { width: var(--zh-touch, 40px); height: var(--zh-touch, 40px); border-radius: 50%; display: grid; place-items: center; flex: none; color: ${sCol}; background: color-mix(in srgb, ${sCol} 18%, transparent); }
        .dot ha-icon { --mdc-icon-size: 22px; }
        .s1 { font-weight: 600; font-size: var(--zh-f-card, 15px); color: var(--primary-text-color); }
        .s2 { font-size: var(--zh-f-meta, 13px); color: var(--secondary-text-color); margin-top: 2px; }
        .sum { font-size: var(--zh-f-label, 12px); color: var(--secondary-text-color); display: flex; flex-wrap: wrap; gap: 4px 10px; }
        .stage { border-radius: var(--spc-r); background: var(--secondary-background-color, rgba(127,127,127,.12)); padding: 8px 10px 10px; display: flex; flex-direction: column; gap: 8px; }
        .sh { display: flex; align-items: center; gap: 6px; font-size: var(--zh-f-label, 12px); color: var(--secondary-text-color); }
        .sh ha-icon { --mdc-icon-size: 16px; }
        .sn { width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center; font-weight: 700; font-size: 11px; background: var(--card-background-color); }
        .sm { font-weight: 600; color: var(--primary-text-color); flex: 1; }
        .chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px 6px 8px; border-radius: 16px; font-size: var(--zh-f-meta, 13px); font-weight: 500; color: var(--primary-text-color); background: ${SPC_TINT("var(--c)", 18)}; border: 1.5px solid transparent; position: relative; min-height: 32px; }
        .chip ha-icon { --mdc-icon-size: 17px; color: var(--c); }
        .chip.next { border-color: color-mix(in srgb, var(--c) 55%, transparent); }
        .chip.sel { border-color: var(--c); background: ${SPC_TINT("var(--c)", 30)}; }
        .chip.blk { background: var(--card-background-color); color: var(--secondary-text-color); }
        .chip.blk ha-icon { color: var(--secondary-text-color); }
        .chip.run::after { content: ""; position: absolute; inset: -1.5px; border-radius: 16px; border: 1.5px solid var(--c); animation: spcPulse 1.6s ease-in-out infinite; }
        @keyframes spcPulse { 50% { opacity: .2; } }
        .chip .mdot { width: 6px; height: 6px; border-radius: 50%; background: var(--c); }
        .selbox { border-radius: var(--spc-r); border: 1px solid var(--divider-color, rgba(127,127,127,.25)); padding: 10px; display: flex; flex-direction: column; gap: 10px; }
        .selh { display: flex; flex-direction: column; gap: 2px; font-size: var(--zh-f-body, 14px); color: var(--primary-text-color); }
        .selh span { font-size: var(--zh-f-label, 12px); color: var(--secondary-text-color); }
        .selacts, .pz { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
        .pl { font-size: var(--zh-f-label, 12px); color: var(--secondary-text-color); margin-right: 2px; }
        .mini { display: inline-flex; align-items: center; gap: 4px; font-size: var(--zh-f-label, 12px); font-weight: 600; padding: 7px 10px; border-radius: 12px; color: var(--primary-text-color); background: var(--secondary-background-color, rgba(127,127,127,.12)); min-height: 32px; }
        .mini ha-icon { --mdc-icon-size: 16px; color: ${SPC_FG.lila}; }
        .mini.warn ha-icon { color: ${SPC_FG.err}; }
        .acts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .btn { border-radius: var(--spc-r); padding: 12px 10px; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: var(--zh-f-body, 14px); font-weight: 600; color: var(--primary-text-color); transition: transform .1s, filter .2s; }
        .btn:active { transform: scale(.98); }
        .btn ha-icon { --mdc-icon-size: 20px; color: var(--btn-fg); }
        .btn.armed { filter: brightness(1.15); }
        .links { grid-column: 1 / -1; display: flex; justify-content: center; gap: 18px; }
        .link { color: var(--secondary-text-color); font-weight: 500; font-size: var(--zh-f-meta, 13px); padding: 4px; }
        .link.armed { color: ${SPC_FG.err}; }
        .link.on { color: ${SPC_FG.hint}; }
        .empty { font-size: var(--zh-f-meta, 13px); color: var(--secondary-text-color); text-align: center; padding: 6px 0; }
        .room { border-radius: var(--spc-r); border: 1px solid var(--divider-color, rgba(127,127,127,.25)); padding: 10px 12px; display: flex; flex-direction: column; gap: 10px; }
        .room.dim .rn, .room.dim .ri { opacity: .55; }
        .rh { display: flex; align-items: center; gap: 10px; cursor: pointer; }
        .ri { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; flex: none; }
        .ri ha-icon { --mdc-icon-size: 20px; }
        .rt { flex: 1; min-width: 0; }
        .rn { font-weight: 600; font-size: var(--zh-f-card, 15px); color: var(--primary-text-color); }
        .rs { font-size: var(--zh-f-label, 12px); color: var(--secondary-text-color); margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .nx.late { color: ${SPC_FG.err}; font-weight: 600; }
        .nx.today { color: ${SPC_FG.hint}; font-weight: 600; }
        .nx.skip { color: ${SPC_FG.grau}; font-weight: 600; display: inline-flex; align-items: center; gap: 3px; }
        .nx.skip ha-icon { --mdc-icon-size: 13px; }
        .add { display: inline-flex; align-items: center; gap: 4px; font-size: var(--zh-f-label, 12px); font-weight: 600; padding: 7px 10px; border-radius: 12px; color: ${SPC_FG.lila}; background: ${SPC_TINT(SPC_FG.lila, 12)}; white-space: nowrap; min-height: 32px; }
        .add ha-icon { --mdc-icon-size: 16px; }
        .add.in { color: var(--primary-text-color); background: ${SPC_TINT(SPC_FG.lila, 26)}; }
        .add.in ha-icon { color: ${SPC_FG.lila}; }
        .rd { display: flex; flex-direction: column; gap: 10px; }
        .seg { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3px; padding: 3px; border-radius: var(--zh-r-in, 12px); background: var(--secondary-background-color, rgba(127,127,127,.12)); }
        .seg.five { grid-template-columns: repeat(5, 1fr); }
        .sg { border-radius: 9px; padding: 7px 2px; display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: 10.5px; font-weight: 500; color: var(--secondary-text-color); }
        .sg ha-icon { --mdc-icon-size: 19px; }
        .sg.on { color: var(--primary-text-color); }
        .sg.on ha-icon { color: var(--btn-fg); }
        .iv { display: flex; align-items: center; justify-content: center; gap: 14px; font-size: var(--zh-f-body, 14px); color: var(--primary-text-color); }
        .iv.hide { display: none; }
        .iv span { min-width: 104px; text-align: center; font-weight: 500; }
        .stp { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: var(--secondary-background-color, rgba(127,127,127,.12)); }
        .stp ha-icon { --mdc-icon-size: 18px; }
        .meta, .foot { font-size: var(--zh-f-label, 12px); color: var(--secondary-text-color); line-height: 1.4; }
      </style>
      <ha-card>
        <div class="h2">Warteschlange</div>
        <div class="status"><div class="dot"><ha-icon icon="${sIcon}"></ha-icon></div>
          <div><div class="s1">${this._esc(sTitle)}</div>${sSub ? `<div class="s2">${this._esc(sSub)}</div>` : ""}</div></div>
        ${parts.length ? `<div class="sum">${parts.map((p) => `<span>${this._esc(p)}</span>`).join("")}</div>` : ""}
        ${stageHtml || `<div class="empty">Nichts zu tun – fällige Räume landen automatisch hier.</div>`}
        ${selHtml}
        <div class="acts">
          <button class="btn${this._armed === "start" ? " armed" : ""}" data-act="start" style="grid-column:1/-1;background:${SPC_TINT(startFg)};--btn-fg:${startFg}"${canStart ? "" : " disabled"}><ha-icon icon="${running ? "mdi:stop" : this._armed === "start" ? "mdi:gesture-tap" : "mdi:play"}"></ha-icon>${startLabel}</button>
          <div class="links">
            <button class="link${skipOn ? " on" : ""}" data-act="skip">${skipOn ? "Heute doch putzen" : "Heute nicht"}</button>
            ${q.items.length ? `<button class="link${this._armed === "clear" ? " armed" : ""}" data-act="clear">${this._armed === "clear" ? "Nochmal tippen" : "Leeren"}</button>` : ""}
          </div>
        </div>
        <div class="h2">Plan pro Raum</div>
        ${planHtml}
        <div class="foot">Fällige Räume stehen automatisch in der Warteschlange. Geputzt wird, wenn ihr weg seid – nicht nachts, in der Mittagsruhe oder an Sonn- und Feiertagen und nur so viel, wie bis zu eurer Rückkehr fertig wird. Ein Raum gilt erst als geputzt, wenn die Reinigung abgeschlossen ist.</div>
      </ha-card>`;

    this.shadowRoot.querySelectorAll("[data-act]").forEach((el) => el.addEventListener("click", (ev) => { ev.stopPropagation(); this._click(ev.currentTarget); }));
  }

  _click(el) {
    if (el.disabled) return;
    const act = el.dataset.act;
    const id = el.dataset.id != null ? Number(el.dataset.id) : this._sel;
    const st = this._hass.states[this._config.status];
    const q = this._hass.states[this._config.queue].attributes;
    const running = st && (["cleaning", "starting", "between_stages", "prewarn"].includes(st.state) || st.attributes.session_active);
    const rerender = () => { this._sig = null; this._render(); };
    if (act === "sel") { this._sel = this._sel === id ? null : id; rerender(); }
    else if (act === "qmode") this._call("enqueue", { rooms: [this._sel], mode: el.dataset.mode });
    else if (act === "front") this._call("enqueue", { rooms: [this._sel], front: true });
    else if (act === "rm") { this._call("dequeue", { rooms: [this._sel], skip_today: true }); this._sel = null; }
    else if (act === "resume") this._call("resume_room", { rooms: [id] });
    else if (act === "toggle") { this._open.has(id) ? this._open.delete(id) : this._open.add(id); rerender(); }
    else if (act === "add") this._call("enqueue", { rooms: [id] });
    else if (act === "unq") this._call("dequeue", { rooms: [id], skip_today: true });
    else if (act === "mode") this._call("set_plan", { room: id, mode: el.dataset.mode });
    else if (act === "iv") {
      const r = (q.rooms || []).find((x) => x.id === id);
      const v = Math.min(30, Math.max(1, (r ? r.interval : 1) + Number(el.dataset.d)));
      this._call("set_plan", { room: id, interval: v });
    } else if (act === "pause") this._call("pause_room", { rooms: [id], days: Number(el.dataset.days) });
    else if (act === "start") {
      if (running) this._call("stop", { return_home: true });
      else this._arm("start", () => this._call("start", { force: true }));
    } else if (act === "skip") this._call("skip_today", { skip: !st.attributes.skipped_today });
    else if (act === "clear") this._arm("clear", () => this._call("clear_queue"));
  }

  static getStubConfig() { return {}; }
}

if (!customElements.get("saugplan-card")) {
  customElements.define("saugplan-card", SaugplanCard);
  window.customCards = window.customCards || [];
  window.customCards.push({ type: "saugplan-card", name: "Saugplan", description: "Warteschlange und Plan pro Raum (Vacuum Planner)" });
}
