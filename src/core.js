/* zuhause-ui – gemeinsamer Baukasten für ein mobiles Home-Assistant-Dashboard
 * Tokens (Styleguide), Hilfsfunktionen, zh-button, zh-tabs, raum-kachel-card,
 * Verlaufsansicht (Bottom-Sheet) und Farbangleich für die Flower Card.
 * Farben nur als Rollen bzw. HA-Farbnamen, nie als Hex-Wert.
 */
const ZH = (window.ZH = window.ZH || {});
ZH.version = "__VERSION__";

/* ---------- Tokens ----------
 * Fallback-Werte. Ein Theme (themes/zuhause.yaml) setzt dieselben Variablen
 * am <html>-Element und gewinnt damit automatisch.
 */
if (!document.getElementById("zuhause-ui-tokens")) {
  const tokens = document.createElement("style");
  tokens.id = "zuhause-ui-tokens";
  tokens.textContent = `html{
    --zh-pad:16px; --zh-gap:12px; --zh-r-in:12px; --zh-row:56px; --zh-touch:40px;
    --zh-f-title:18px; --zh-f-card:15px; --zh-f-body:14px; --zh-f-meta:13px; --zh-f-label:12px;
    --zh-light:var(--amber-color); --zh-warm:var(--deep-orange-color); --zh-water:var(--cyan-color);
    --zh-appliance:var(--blue-color); --zh-robot:var(--deep-purple-color); --zh-night:var(--indigo-color);
    --zh-personal:var(--pink-color); --zh-hint:var(--warning-color); --zh-error:var(--error-color);
    --zh-ok:var(--success-color); --zh-neutral:var(--secondary-text-color);
  }`;
  document.head.appendChild(tokens);
}

ZH.tint = (c, p = 16) => `color-mix(in srgb, ${c} ${p}%, var(--card-background-color))`;
ZH.color = (c) => {
  if (!c) return "var(--zh-neutral)";
  c = String(c).trim();
  if (/^(#|rgb|hsl|var\(|color-mix)/.test(c)) return c;
  if (c === "grey" || c === "gray" || c === "neutral") return "var(--zh-neutral)";
  return `var(--${c}-color)`;
};
ZH.isTpl = (s) => typeof s === "string" && (s.includes("{{") || s.includes("{%"));
ZH.truthy = (v) => ["true", "on", "yes", "1"].includes(String(v).trim().toLowerCase());
ZH.esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
ZH.fire = (node, type, detail) => node.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
ZH.haptic = (node, kind = "light") => ZH.fire(node, "haptic", kind);
ZH.hass = () => { const ha = document.querySelector("home-assistant"); return ha && ha.hass; };

/* Variable wie var(--blue-color) in einen Hex-Wert auflösen (für Karten, die mit RGB rechnen) */
ZH.resolveHex = (c, fallback = "#9e9e9e") => {
  c = String(c || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  if (/^#[0-9a-f]{3}$/i.test(c)) return "#" + c.slice(1).split("").map((x) => x + x).join("");
  const m = /^var\((--[\w-]+)/.exec(c) || (/^[\w-]+$/.test(c) ? [null, `--${c}-color`] : null);
  if (!m) return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim();
  if (/^#[0-9a-f]{3,6}$/i.test(raw)) return ZH.resolveHex(raw, fallback);
  const rgb = /rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/i.exec(raw);
  return rgb ? "#" + [rgb[1], rgb[2], rgb[3]].map((x) => Number(x).toString(16).padStart(2, "0")).join("") : fallback;
};

ZH.navigate = (path) => {
  history.pushState(null, "", path);
  window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
};

/* Aktionen wie bei HA-Karten: navigate, more-info, toggle, perform-action, fire-dom-event, none */
ZH.runAction = (node, hass, action, entity, stateObj) => {
  if (!action || action.action === "none") return;
  if (action.confirmation) {
    const text = typeof action.confirmation === "object" ? action.confirmation.text : "Sicher?";
    if (!window.confirm(text || "Sicher?")) return;
  }
  const fill = (v) => (typeof v === "string" && stateObj ? v.replace(/\[\[state\]\]/g, stateObj.state) : v);
  const deep = (o) => (Array.isArray(o) ? o.map(deep) : o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, deep(v)])) : fill(o));
  switch (action.action) {
    case "navigate":
      ZH.haptic(node);
      ZH.navigate(action.navigation_path);
      break;
    case "more-info":
      ZH.fire(node, "hass-more-info", { entityId: action.entity || entity });
      break;
    case "toggle":
      ZH.haptic(node);
      hass.callService("homeassistant", "toggle", { entity_id: action.entity || entity });
      break;
    case "perform-action":
    case "call-service": {
      ZH.haptic(node, action.haptic || "light");
      const svc = action.perform_action || action.service;
      const [d, s] = svc.split(".");
      hass.callService(d, s, deep(action.data || action.service_data || {}), deep(action.target));
      break;
    }
    case "fire-dom-event":
      ZH.fire(node, "ll-custom", action);
      break;
    case "url":
      window.open(action.url_path, "_blank");
      break;
  }
};

/* Tippen / Halten an ein Element binden */
ZH.bindPress = (el, onTap, onHold) => {
  let timer = null, held = false, sx = 0, sy = 0;
  el.addEventListener("pointerdown", (ev) => {
    if (ev.button !== undefined && ev.button !== 0) return;
    held = false; sx = ev.clientX; sy = ev.clientY;
    if (onHold) timer = setTimeout(() => { held = true; onHold(); }, 500);
  });
  const cancel = () => { clearTimeout(timer); timer = null; };
  el.addEventListener("pointermove", (ev) => { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8) cancel(); });
  el.addEventListener("pointercancel", cancel);
  el.addEventListener("pointerleave", cancel);
  el.addEventListener("pointerup", cancel);
  el.addEventListener("click", (ev) => { ev.stopPropagation(); if (held) { held = false; return; } onTap(); });
  el.addEventListener("contextmenu", (ev) => { if (onHold) ev.preventDefault(); });
};

ZH.define = (tag, cls, name, description) => {
  if (customElements.get(tag)) return;
  customElements.define(tag, cls);
  window.customCards = window.customCards || [];
  window.customCards.push({ type: tag, name, description });
};

/* Basis mit Template-Abos (render_template) */
class ZHBase extends HTMLElement {
  constructor() {
    super();
    this._vals = {};
    this._unsubs = {};
    this.attachShadow({ mode: "open" });
  }
  connectedCallback() { this._connected = true; this._subscribeAll(); this._render(); }
  disconnectedCallback() { this._connected = false; this._unsubAll(); }
  _unsubAll() {
    Object.values(this._unsubs).forEach((p) => Promise.resolve(p).then((u) => u && u()).catch(() => {}));
    this._unsubs = {};
  }
  _tplSources() { return {}; }
  _subscribeAll() {
    if (!this._hass || !this._connected) return;
    Object.entries(this._tplSources()).forEach(([key, tpl]) => {
      if (this._unsubs[key] || !ZH.isTpl(tpl)) return;
      this._unsubs[key] = this._hass.connection.subscribeMessage(
        (msg) => {
          if (msg.result === undefined) return;
          this._vals[key] = msg.result;
          this._render();
        },
        { type: "render_template", template: tpl, variables: { entity: this._config && this._config.entity }, strict: false, report_errors: false }
      ).catch(() => {});
    });
  }
  _v(key, raw) {
    if (ZH.isTpl(raw)) return this._vals[key] !== undefined ? this._vals[key] : "";
    return raw;
  }
  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._subscribeAll();
    if (this._shouldRender(hass)) this._render();
  }
  _shouldRender() { return true; }
}
ZH.Base = ZHBase;

ZH.BASE_CSS = `
  :host{display:block;height:100%}
  ha-card{height:100%;box-sizing:border-box;overflow:hidden;position:relative;-webkit-tap-highlight-color:transparent}
  button{all:unset;cursor:pointer;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  .p{font-size:var(--zh-f-card);font-weight:600;color:var(--primary-text-color);line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .s{font-size:var(--zh-f-meta);color:var(--secondary-text-color);line-height:1.3;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .s.ml{white-space:normal}
  ha-icon,ha-state-icon{display:flex}
`;
const BASE_CSS = ZH.BASE_CSS;

/* ---------- zh-button ----------
 * Ein Baustein für Aktion, Navigation, Kennzahl, Status und Bild-Kachel.
 * variant: plain | tint | nav | ghost   layout: row | vertical | image
 */
class ZHButton extends ZHBase {
  setConfig(c) {
    if (!c) throw new Error("Konfiguration fehlt");
    this._unsubAll();
    this._vals = {};
    this._config = { variant: "plain", layout: "row", tap_action: { action: c.entity ? "more-info" : "none" }, ...c };
    this._subscribeAll();
    this._render();
  }
  getGridOptions() {
    const c = this._config || {};
    if (c.layout === "image") return { columns: 6, rows: "auto", min_columns: 4 };
    if (c.layout === "vertical") return { columns: 6, rows: 2, min_columns: 3 };
    return { columns: 12, rows: c.gauge || c.vacuum_commands ? "auto" : 1, min_columns: 4 };
  }
  getCardSize() { return this._config && this._config.layout === "image" ? 3 : 1; }
  _tplSources() {
    const c = this._config || {};
    const out = {};
    ["primary", "secondary", "icon", "color", "badge_icon", "badge_color", "selected"].forEach((k) => { if (ZH.isTpl(c[k])) out[k] = c[k]; });
    return out;
  }
  _ids() {
    const c = this._config || {};
    return [c.entity, c.gauge && c.gauge.entity].filter(Boolean);
  }
  _shouldRender(hass) {
    const sig = this._ids().map((id) => { const s = hass.states[id]; return s ? s.state + s.last_updated : "-"; }).join("|");
    if (sig === this._sig) return false;
    this._sig = sig;
    return true;
  }
  _resolved() {
    const c = this._config;
    const st = c.entity && this._hass ? this._hass.states[c.entity] : null;
    const m = c.state_map && st ? c.state_map[st.state] || c.state_map._default || null : null;
    const pick = (k) => (m && m[k] !== undefined ? m[k] : this._v(k, c[k]));
    let secondary = pick("secondary");
    if (c.state_prefix && st && this._hass.formatEntityState) {
      const label = this._hass.formatEntityState(st);
      secondary = secondary ? `${label} · ${secondary}` : label;
    }
    let primary = pick("primary");
    if ((primary === undefined || primary === null) && st) primary = st.attributes.friendly_name || c.entity;
    return {
      st, primary, secondary,
      icon: pick("icon") || (st ? "" : "mdi:gesture-tap"),
      color: pick("color"),
      badge_icon: pick("badge_icon"),
      badge_color: pick("badge_color"),
      selected: ZH.truthy(pick("selected")),
    };
  }
  _render() {
    if (!this._config || !this._hass) return;
    const c = this._config;
    const r = this._resolved();
    const col = ZH.color(r.color);
    const iconHtml = r.icon ? `<ha-icon icon="${ZH.esc(r.icon)}"></ha-icon>` : r.st ? `<ha-state-icon></ha-state-icon>` : "";
    const badge = r.badge_icon ? `<span class="badge" style="background:${ZH.color(r.badge_color || "red")}"><ha-icon icon="${ZH.esc(r.badge_icon)}"></ha-icon></span>` : "";
    const variant = c.variant;
    const layout = c.layout;
    const cardBg = variant === "tint" ? ZH.tint(col, 16) : variant === "ghost" ? "none" : "";

    let gauge = "";
    if (c.gauge) {
      const g = c.gauge;
      const gs = g.entity ? this._hass.states[g.entity] : null;
      const val = Number(gs ? gs.state : g.value) || 0;
      const min = g.min != null ? g.min : 0, max = g.max != null ? g.max : 100;
      const pct = Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
      gauge = `<div class="gauge"><div class="gfill" style="width:${pct}%;background:${col}"></div></div>`;
    }
    let cmds = "";
    if (c.vacuum_commands && r.st) {
      const cleaning = r.st.state === "cleaning";
      const map = {
        start_pause: { icon: cleaning ? "mdi:pause" : "mdi:play", svc: cleaning ? "vacuum.pause" : "vacuum.start" },
        stop: { icon: "mdi:stop", svc: "vacuum.stop" },
        return_home: { icon: "mdi:home-import-outline", svc: "vacuum.return_to_base" },
        locate: { icon: "mdi:map-marker", svc: "vacuum.locate" },
      };
      cmds = `<div class="cmds">${c.vacuum_commands.filter((k) => map[k]).map((k) =>
        `<button class="cmd" data-cmd="${map[k].svc}" title="${k}"><ha-icon icon="${map[k].icon}"></ha-icon></button>`).join("")}</div>`;
    }

    const p = r.primary != null && r.primary !== "" ? `<div class="p">${ZH.esc(r.primary)}</div>` : "";
    const s = r.secondary != null && r.secondary !== "" ? `<div class="s${c.multiline_secondary ? " ml" : ""}">${ZH.esc(r.secondary)}</div>` : "";
    const chevron = variant === "nav" ? `<ha-icon class="chev" icon="mdi:chevron-right"></ha-icon>` : "";
    const iconCls = variant === "tint" || variant === "ghost" ? "ic bare" : "ic";

    let body;
    if (layout === "image") {
      body = `<div class="img" style="background-image:url('${ZH.esc(c.image || "")}')"></div>
        <div class="shade"></div><div class="lbl">${p}${s}</div>
        ${r.selected ? `<span class="check"><ha-icon icon="mdi:check"></ha-icon></span>` : ""}`;
    } else if (layout === "vertical") {
      body = `<div class="vert"><div class="${iconCls}">${iconHtml}${badge}</div><div class="txt">${p}${s}</div></div>${gauge}`;
    } else {
      body = `<div class="row"><div class="${iconCls}">${iconHtml}${badge}</div><div class="txt">${p}${s}</div>${chevron}</div>${gauge}${cmds}`;
    }

    this.shadowRoot.innerHTML = `
      <style>${BASE_CSS}
        ha-card{${cardBg ? `background:${cardBg};` : ""}${variant === "ghost" ? "border:none;box-shadow:none;" : ""}
          padding:${layout === "image" ? "0" : variant === "ghost" ? "0 4px" : "0 var(--zh-pad)"};cursor:pointer;
          display:flex;flex-direction:column;justify-content:center;gap:10px;
          ${r.selected ? "box-shadow:inset 0 0 0 2px var(--zh-light);" : ""}
          transition:transform .1s, background .25s}
        ha-card:active{transform:scale(.98)}
        ha-card.tall{padding-top:12px;padding-bottom:12px}
        .row{display:flex;align-items:center;gap:12px;min-height:var(--zh-row)}
        .ic{position:relative;flex:none;width:var(--zh-touch);height:var(--zh-touch);border-radius:50%;display:grid;place-items:center;
            color:${col};background:${ZH.tint(col, 22)}}
        .ic.bare{background:none;width:28px}
        .ic ha-icon,.ic ha-state-icon{--mdc-icon-size:${c.size === "title" ? "32px" : "22px"}}
        .badge{position:absolute;top:-3px;right:-3px;width:16px;height:16px;border-radius:50%;display:grid;place-items:center;color:#fff}
        .badge ha-icon{--mdc-icon-size:12px}
        .txt{flex:1;min-width:0}
        ${c.size === "title" ? ".p{font-size:var(--zh-f-title)}" : ""}
        .chev{color:var(--secondary-text-color);--mdc-icon-size:20px;flex:none}
        .vert{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;height:100%;text-align:center;padding:10px 0}
        .vert .txt{width:100%}
        .gauge{height:10px;border-radius:5px;background:${ZH.tint(col, 30)};overflow:hidden;margin:0 0 4px}
        .gfill{height:100%;border-radius:5px;transition:width .4s}
        .cmds{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:8px;margin-bottom:4px}
        .cmd{height:var(--zh-touch);border-radius:var(--zh-r-in);display:grid;place-items:center;background:var(--secondary-background-color);color:var(--primary-text-color)}
        .cmd ha-icon{--mdc-icon-size:20px}
        .img{position:absolute;inset:0;background-size:cover;background-position:center}
        .shade{position:absolute;left:0;right:0;bottom:0;height:55%;background:linear-gradient(transparent,rgba(0,0,0,.65))}
        .lbl{position:absolute;left:12px;right:12px;bottom:10px;text-align:center}
        .lbl .p{color:#fff;font-size:var(--zh-f-body)}
        .lbl .s{color:rgba(255,255,255,.8)}
        .check{position:absolute;top:8px;right:8px;width:24px;height:24px;border-radius:50%;background:var(--zh-light);color:#000;display:grid;place-items:center}
        .check ha-icon{--mdc-icon-size:16px}
      </style>
      <ha-card class="${c.gauge || c.vacuum_commands || (c.multiline_secondary && layout === "row") ? "tall" : ""}" style="${layout === "image" ? "aspect-ratio:5/3;height:auto" : ""}">${body}</ha-card>`;

    const si = this.shadowRoot.querySelector("ha-state-icon");
    if (si && r.st) { si.hass = this._hass; si.stateObj = r.st; }
    const card = this.shadowRoot.querySelector("ha-card");
    ZH.bindPress(
      card,
      () => ZH.runAction(this, this._hass, c.tap_action, c.entity, r.st),
      c.hold_action && c.hold_action.action !== "none" ? () => ZH.runAction(this, this._hass, c.hold_action, c.entity, r.st) : null
    );
    this.shadowRoot.querySelectorAll(".cmd").forEach((b) => b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      ZH.haptic(this);
      const [d, s2] = b.dataset.cmd.split(".");
      this._hass.callService(d, s2, { entity_id: c.entity });
    }));
  }
}

/* ---------- zh-tabs ----------
 * Tabs mit Unterkarten. Linksbündig; passt die Leiste nicht, zeigen
 * inaktive Tabs nur ihr Icon. Tab per URL-Hash wählbar (tabs[].id).
 */
class ZHTabs extends ZHBase {
  setConfig(c) {
    if (!c || !Array.isArray(c.tabs) || !c.tabs.length) throw new Error("tabs fehlt");
    this._unsubAll();
    this._vals = {};
    this._config = c;
    this._cards = {};
    this._active = this._hashIndex();
    if (this._active < 0) this._active = c.default_tab || 0;
    this._built = false;
    this._subscribeAll();
    this._render();
  }
  _hashIndex() {
    const h = (location.hash || "").replace("#", "");
    return h && this._config ? this._config.tabs.findIndex((t) => t.id === h) : -1;
  }
  connectedCallback() {
    super.connectedCallback();
    const i = this._hashIndex();
    if (i >= 0 && i !== this._active) { this._active = i; this._built = false; this._render(); }
  }
  getGridOptions() { return { columns: 12, rows: "auto" }; }
  getCardSize() { return 6; }
  _tplSources() {
    const out = {};
    this._config.tabs.forEach((t, i) => { if (ZH.isTpl(t.icon)) out["icon" + i] = t.icon; });
    return out;
  }
  _shouldRender(hass) {
    Object.values(this._cards).forEach((list) => list.forEach((el) => { el.hass = hass; }));
    return false;
  }
  async _makeCards(i) {
    if (this._cards[i]) return this._cards[i];
    const helpers = await window.loadCardHelpers();
    const list = (this._config.tabs[i].cards || []).map((cfg) => {
      const el = helpers.createCardElement(cfg);
      el.hass = this._hass;
      el.addEventListener("ll-rebuild", (ev) => {
        ev.stopPropagation();
        const n = helpers.createCardElement(cfg);
        n.hass = this._hass;
        el.replaceWith(n);
        this._cards[i][this._cards[i].indexOf(el)] = n;
      }, { once: true });
      return el;
    });
    this._cards[i] = list;
    return list;
  }
  _render() {
    if (!this._config || !this._hass) return;
    const c = this._config;
    if (!this._built) {
      this.shadowRoot.innerHTML = `
        <style>${BASE_CSS}
          .bar{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding:2px 0 10px}
          .bar::-webkit-scrollbar{display:none}
          .tab{display:flex;align-items:center;gap:6px;flex:none;height:var(--zh-touch);padding:0 14px;border-radius:999px;
               font-size:var(--zh-f-body);font-weight:500;color:var(--secondary-text-color);transition:background .2s,color .2s}
          .tab ha-icon{--mdc-icon-size:20px}
          .tab.on{color:var(--primary-text-color);background:${ZH.tint("var(--zh-light)", 28)}}
          .tab.on ha-icon{color:var(--zh-light)}
          .bar.compact .tab:not(.on):not(.noicon) .tl{display:none}
          .bar.compact .tab:not(.on):not(.noicon){padding:0 10px}
          .body{display:flex;flex-direction:column;gap:8px}
        </style>
        <div class="bar"></div><div class="body"></div>`;
      this._built = true;
      this._shownTab = -1;
    }
    const bar = this.shadowRoot.querySelector(".bar");
    bar.innerHTML = c.tabs.map((t, i) => {
      const icon = this._v("icon" + i, t.icon);
      return `<button class="tab${i === this._active ? " on" : ""}${icon ? "" : " noicon"}" data-i="${i}">${icon ? `<ha-icon icon="${ZH.esc(icon)}"></ha-icon>` : ""}<span class="tl">${ZH.esc(t.title || "")}</span></button>`;
    }).join("");
    bar.classList.remove("compact");
    requestAnimationFrame(() => { if (bar.scrollWidth > bar.clientWidth + 1) bar.classList.add("compact"); });
    bar.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => {
      const i = Number(b.dataset.i);
      if (i === this._active) return;
      ZH.haptic(this);
      this._active = i;
      this._render();
    }));
    if (this._shownTab !== this._active) {
      this._shownTab = this._active;
      const idx = this._active;
      this._makeCards(idx).then((list) => {
        if (this._shownTab !== idx) return;
        const body = this.shadowRoot.querySelector(".body");
        body.innerHTML = "";
        list.forEach((el) => { el.hass = this._hass; body.appendChild(el); });
      });
    }
  }
}

/* ---------- raum-kachel-card ----------
 * Raumkachel für die Startseite: Name, Temperatur/Feuchte, Lichter, Fenster/Bewegung,
 * kleiner Schimmel-Hinweis. Tippen = Raumansicht, Halten = Details,
 * Tippen auf die Messwerte = Verlauf.
 */
class RaumKachelCard extends ZHBase {
  setConfig(c) {
    if (!c || !c.name) throw new Error("name fehlt");
    this._config = { mold_threshold: 70, lights: [], sensors: [], ...c };
    this._render();
  }
  getGridOptions() { return { columns: 6, rows: 2, min_columns: 6 }; }
  getCardSize() { return 2; }
  _ids() {
    const c = this._config;
    return [c.entity, c.temperature, c.humidity, ...c.lights.map((l) => l.entity_id || l), ...c.sensors.map((s) => s.entity_id)].filter(Boolean);
  }
  _shouldRender(hass) {
    const sig = this._ids().map((id) => (hass.states[id] ? hass.states[id].state : "-")).join("|");
    if (sig === this._sig) return false;
    this._sig = sig;
    return true;
  }
  _num(id, d = 1) {
    const s = id && this._hass.states[id];
    if (!s || isNaN(parseFloat(s.state))) return null;
    return parseFloat(s.state).toLocaleString("de-DE", { maximumFractionDigits: d, minimumFractionDigits: d });
  }
  _history(active) {
    const c = this._config;
    const series = [];
    if (c.temperature) series.push({ entity: c.temperature, name: "Temperatur", color: "deep-orange", icon: "mdi:thermometer" });
    if (c.humidity) series.push({ entity: c.humidity, name: "Luftfeuchte", color: "cyan", icon: "mdi:water-percent" });
    if (series.length) ZH.openHistory(this._hass, { title: c.name, series, active });
  }
  _render() {
    if (!this._config || !this._hass) return;
    const c = this._config;
    const h = this._hass;
    const lights = c.lights.map((l) => (typeof l === "string" ? { entity_id: l } : l));
    const lit = lights.some((l) => h.states[l.entity_id] && h.states[l.entity_id].state === "on");
    const t = this._num(c.temperature, 1);
    const hu = this._num(c.humidity, 0);
    const huV = c.humidity && h.states[c.humidity] ? parseFloat(h.states[c.humidity].state) : NaN;
    const mold = c.humidity && huV >= c.mold_threshold;
    const stats = [t != null ? `<span class="stat" data-i="0">${t} °C</span>` : "", hu != null ? `<span class="stat" data-i="${t != null ? 1 : 0}">${hu} %</span>` : ""].filter(Boolean).join(`<span class="dot">·</span>`);
    const alerts = c.sensors.map((s) => {
      const st = h.states[s.entity_id];
      const rule = st && (s.states || []).find((x) => x.state === st.state);
      if (!rule || !rule.icon_color) return "";
      return `<ha-icon class="al" icon="${ZH.esc(rule.icon)}" style="color:${ZH.color(rule.icon_color)}"></ha-icon>`;
    }).join("");
    const btns = lights.map((l, i) => {
      const st = h.states[l.entity_id];
      const on = st && st.state === "on";
      return `<button class="lb${on ? " on" : ""}" data-i="${i}" aria-label="${ZH.esc(l.label || l.entity_id)}"><ha-icon icon="${ZH.esc(l.icon || "mdi:lightbulb")}"></ha-icon></button>`;
    }).join("");
    this.shadowRoot.innerHTML = `
      <style>${BASE_CSS}
        ha-card{padding:12px;display:grid;grid-template-columns:1fr auto;grid-template-rows:auto 1fr;gap:4px 8px;cursor:pointer;
                ${lit ? `background:${ZH.tint("var(--zh-light)", 12)};` : ""}transition:background .3s,transform .1s}
        ha-card:active{transform:scale(.98)}
        .head{min-width:0}
        .meta{display:flex;align-items:center;gap:4px;font-size:var(--zh-f-meta);color:var(--secondary-text-color);margin-top:2px;min-height:18px}
        .stat{padding:4px 0;margin:-4px 0}
        .dot{opacity:.6}
        .al{--mdc-icon-size:18px}
        .lights{grid-row:1/3;grid-column:2;display:flex;flex-direction:column;gap:6px}
        .lb{width:var(--zh-touch);height:var(--zh-touch);border-radius:50%;display:grid;place-items:center;
            color:var(--secondary-text-color);background:var(--secondary-background-color);transition:all .25s}
        .lb ha-icon{--mdc-icon-size:20px}
        .lb.on{color:var(--zh-light);background:${ZH.tint("var(--zh-light)", 30)}}
        .room{grid-row:2;grid-column:1;align-self:end;display:flex;align-items:flex-end;justify-content:space-between;gap:4px}
        .room ha-icon{--mdc-icon-size:40px;color:${lit ? "var(--zh-light)" : "var(--secondary-text-color)"};opacity:${lit ? "1" : ".45"};transition:all .3s}
        .mold{display:inline-flex;align-items:center;gap:2px;padding:1px 5px 1px 4px;border-radius:8px;font-size:9px;line-height:1;
              color:var(--zh-hint);background:${ZH.tint("var(--zh-hint)", 22)};white-space:nowrap;margin-bottom:2px}
        .mold ha-icon{--mdc-icon-size:10px}
      </style>
      <ha-card>
        <div class="head"><div class="p">${ZH.esc(c.name)}</div><div class="meta">${stats}${alerts}</div></div>
        <div class="lights">${btns}</div>
        <div class="room"><ha-icon icon="${ZH.esc(c.icon || "mdi:home")}"></ha-icon>${mold ? `<span class="mold"><ha-icon icon="mdi:water-alert"></ha-icon>Schimmel</span>` : ""}</div>
      </ha-card>`;
    const card = this.shadowRoot.querySelector("ha-card");
    ZH.bindPress(
      card,
      () => c.navigation_path && (ZH.haptic(this), ZH.navigate(c.navigation_path)),
      () => ZH.fire(this, "hass-more-info", { entityId: c.entity || (lights[0] && lights[0].entity_id) })
    );
    const stop = (el, fn) => {
      el.addEventListener("pointerdown", (ev) => ev.stopPropagation());
      el.addEventListener("click", (ev) => { ev.stopPropagation(); fn(); });
    };
    this.shadowRoot.querySelectorAll(".stat").forEach((s) => stop(s, () => { ZH.haptic(this); this._history(Number(s.dataset.i)); }));
    this.shadowRoot.querySelectorAll(".lb").forEach((b) => stop(b, () => {
      ZH.haptic(this);
      h.callService("homeassistant", "toggle", { entity_id: lights[Number(b.dataset.i)].entity_id });
    }));
  }
}

/* ---------- Verlauf (Bottom-Sheet) ----------
 * ZH.openHistory(hass, { title, series: [{ entity, name, color, icon }], active })
 * Aus Dashboard-Karten: tap_action { action: "fire-dom-event", zh_history: {...} }
 */
const ZH_RANGES = [
  { id: "24h", label: "24 Std.", hours: 24 },
  { id: "7d", label: "7 Tage", hours: 24 * 7 },
  { id: "30d", label: "30 Tage", hours: 24 * 30 },
];
const ZH_WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

class ZHHistorySheet extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._range = "24h";
    this._cache = {};
    this._onKey = (ev) => { if (ev.key === "Escape") this.close(); };
  }
  open(hass, opts) {
    this._hass = hass;
    this._opts = opts;
    this._active = Math.min(opts.active || 0, opts.series.length - 1);
    this._range = opts.range || "24h";
    document.addEventListener("keydown", this._onKey);
    this._build();
    requestAnimationFrame(() => this.shadowRoot.querySelector(".wrap").classList.add("in"));
    this._load();
  }
  close() {
    document.removeEventListener("keydown", this._onKey);
    const w = this.shadowRoot.querySelector(".wrap");
    if (!w) { this.remove(); return; }
    w.classList.remove("in");
    setTimeout(() => this.remove(), 220);
  }
  _s() { return this._opts.series[this._active]; }
  _col() { return ZH.color(this._s().color); }
  _unit() {
    const st = this._hass.states[this._s().entity];
    return (st && st.attributes.unit_of_measurement) || "";
  }
  _dec() { const s = this._s(); return s.decimals != null ? s.decimals : this._unit() === "%" ? 0 : 1; }
  _fmt(v) { return v == null || isNaN(v) ? "–" : Number(v).toLocaleString("de-DE", { minimumFractionDigits: this._dec(), maximumFractionDigits: this._dec() }); }

  _build() {
    const o = this._opts;
    this.shadowRoot.innerHTML = `
      <style>
        :host{position:fixed;inset:0;z-index:9999;font-family:var(--ha-font-family-body,inherit)}
        button{all:unset;cursor:pointer;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        .wrap{position:absolute;inset:0;display:flex;align-items:flex-end;justify-content:center}
        .bd{position:absolute;inset:0;background:rgba(0,0,0,.5);opacity:0;transition:opacity .2s}
        .sheet{position:relative;width:100%;max-width:560px;max-height:92vh;overflow:auto;box-sizing:border-box;
               background:var(--card-background-color,var(--ha-card-background));color:var(--primary-text-color);
               border-radius:var(--ha-card-border-radius,20px) var(--ha-card-border-radius,20px) 0 0;
               padding:8px var(--zh-pad) calc(var(--zh-pad) + env(safe-area-inset-bottom,0px));
               transform:translateY(100%);transition:transform .22s cubic-bezier(.2,.8,.2,1);display:flex;flex-direction:column;gap:14px}
        .wrap.in .bd{opacity:1}
        .wrap.in .sheet{transform:none}
        .grab{width:40px;height:4px;border-radius:2px;background:var(--divider-color,rgba(127,127,127,.4));margin:4px auto 2px}
        .hd{display:flex;align-items:center;gap:12px}
        .ic{width:var(--zh-touch);height:var(--zh-touch);border-radius:50%;display:grid;place-items:center;flex:none}
        .ic ha-icon{--mdc-icon-size:22px}
        .tt{flex:1;min-width:0}
        .t1{font-size:var(--zh-f-card);font-weight:600}
        .t2{font-size:var(--zh-f-meta);color:var(--secondary-text-color);margin-top:2px}
        .x{width:var(--zh-touch);height:var(--zh-touch);border-radius:50%;display:grid;place-items:center;color:var(--secondary-text-color);background:var(--secondary-background-color)}
        .x ha-icon{--mdc-icon-size:20px}
        .now{display:flex;align-items:baseline;gap:6px}
        .now b{font-size:40px;font-weight:700;line-height:1;letter-spacing:-.5px}
        .now span{font-size:var(--zh-f-body);color:var(--secondary-text-color)}
        .seg{display:flex;gap:6px;flex-wrap:wrap}
        .chip{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 14px;border-radius:999px;font-size:var(--zh-f-body);font-weight:500;
              color:var(--secondary-text-color);background:var(--secondary-background-color)}
        .chip ha-icon{--mdc-icon-size:18px}
        .chip.on{color:var(--primary-text-color)}
        .rng{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:4px;border-radius:var(--zh-r-in);background:var(--secondary-background-color)}
        .rng button{height:34px;border-radius:calc(var(--zh-r-in) - 3px);display:grid;place-items:center;font-size:var(--zh-f-meta);font-weight:600;color:var(--secondary-text-color)}
        .rng button.on{color:var(--primary-text-color);background:var(--card-background-color)}
        .chart{position:relative;height:220px;touch-action:pan-y;user-select:none;-webkit-user-select:none}
        .chart svg{display:block;width:100%;height:100%;overflow:visible}
        .chart .msg{position:absolute;inset:0;display:grid;place-items:center;font-size:var(--zh-f-meta);color:var(--secondary-text-color)}
        .tip{position:absolute;top:0;transform:translateX(-50%);padding:4px 10px;border-radius:999px;font-size:var(--zh-f-meta);font-weight:600;
             background:var(--primary-text-color);color:var(--card-background-color);white-space:nowrap;pointer-events:none;display:none}
        .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
        .st{border-radius:var(--zh-r-in);background:var(--secondary-background-color);padding:10px 12px}
        .st .l{font-size:var(--zh-f-label);font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--secondary-text-color)}
        .st .v{font-size:var(--zh-f-card);font-weight:600;margin-top:4px}
        .st .v small{font-size:var(--zh-f-meta);font-weight:500;color:var(--secondary-text-color)}
      </style>
      <div class="wrap">
        <div class="bd"></div>
        <div class="sheet" role="dialog" aria-label="Verlauf ${ZH.esc(o.title || "")}">
          <div class="grab"></div>
          <div class="hd">
            <div class="ic"><ha-icon></ha-icon></div>
            <div class="tt"><div class="t1">${ZH.esc(o.title || "")}</div><div class="t2"></div></div>
            <button class="x" aria-label="Schließen"><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="now"><b></b><span></span></div>
          ${o.series.length > 1 ? `<div class="seg">${o.series.map((s, i) =>
            `<button class="chip" data-i="${i}"><ha-icon icon="${ZH.esc(s.icon || "mdi:chart-line")}"></ha-icon>${ZH.esc(s.name || s.entity)}</button>`).join("")}</div>` : ""}
          <div class="rng">${ZH_RANGES.map((r) => `<button data-r="${r.id}">${r.label}</button>`).join("")}</div>
          <div class="chart"><svg></svg><div class="tip"></div><div class="msg">Lädt …</div></div>
          <div class="stats">
            <div class="st"><div class="l">Min</div><div class="v" data-k="min">–</div></div>
            <div class="st"><div class="l">Ø</div><div class="v" data-k="avg">–</div></div>
            <div class="st"><div class="l">Max</div><div class="v" data-k="max">–</div></div>
          </div>
        </div>
      </div>`;
    const r = this.shadowRoot;
    r.querySelector(".bd").addEventListener("click", () => this.close());
    r.querySelector(".x").addEventListener("click", () => this.close());
    r.querySelectorAll(".chip").forEach((b) => b.addEventListener("click", () => { this._active = Number(b.dataset.i); this._load(); }));
    r.querySelectorAll(".rng button").forEach((b) => b.addEventListener("click", () => { this._range = b.dataset.r; this._load(); }));
    /* Nach unten wischen schließt */
    const sheet = r.querySelector(".sheet");
    let y0 = null;
    const grabArea = [r.querySelector(".grab"), r.querySelector(".hd")];
    grabArea.forEach((el) => el.addEventListener("pointerdown", (ev) => { y0 = ev.clientY; sheet.style.transition = "none"; }));
    window.addEventListener("pointermove", this._mv = (ev) => {
      if (y0 == null) return;
      const dy = Math.max(0, ev.clientY - y0);
      sheet.style.transform = `translateY(${dy}px)`;
    });
    window.addEventListener("pointerup", this._up = (ev) => {
      if (y0 == null) return;
      const dy = ev.clientY - y0;
      y0 = null;
      sheet.style.transition = "";
      sheet.style.transform = "";
      if (dy > 90) this.close();
    });
    const chart = r.querySelector(".chart");
    chart.addEventListener("pointerdown", (ev) => this._scrub(ev));
    chart.addEventListener("pointermove", (ev) => { if (ev.pointerType !== "mouse" || ev.buttons || true) this._scrub(ev); });
    chart.addEventListener("pointerleave", () => this._scrub(null));
  }
  disconnectedCallback() {
    window.removeEventListener("pointermove", this._mv);
    window.removeEventListener("pointerup", this._up);
    document.removeEventListener("keydown", this._onKey);
  }

  _header() {
    const r = this.shadowRoot;
    const s = this._s();
    const col = this._col();
    const st = this._hass.states[s.entity];
    const ic = r.querySelector(".ic");
    ic.style.color = col;
    ic.style.background = ZH.tint(col, 22);
    ic.querySelector("ha-icon").setAttribute("icon", s.icon || "mdi:chart-line");
    r.querySelector(".t2").textContent = s.name || (st && st.attributes.friendly_name) || s.entity;
    r.querySelector(".now b").textContent = st ? this._fmt(parseFloat(st.state)) : "–";
    r.querySelector(".now span").textContent = `${this._unit()} jetzt`;
    r.querySelectorAll(".chip").forEach((b) => {
      const on = Number(b.dataset.i) === this._active;
      const c = ZH.color(this._opts.series[Number(b.dataset.i)].color);
      b.classList.toggle("on", on);
      b.style.background = on ? ZH.tint(c, 24) : "";
      b.querySelector("ha-icon").style.color = on ? c : "";
    });
    r.querySelectorAll(".rng button").forEach((b) => b.classList.toggle("on", b.dataset.r === this._range));
  }

  async _fetch(entity, range) {
    const key = `${entity}|${range.id}`;
    if (this._cache[key]) return this._cache[key];
    const end = new Date();
    const start = new Date(end.getTime() - range.hours * 3600 * 1000);
    let pts = [];
    if (range.id !== "24h") {
      try {
        const res = await this._hass.callWS({
          type: "recorder/statistics_during_period",
          start_time: start.toISOString(), end_time: end.toISOString(),
          statistic_ids: [entity], period: "hour", types: ["mean", "min", "max"], units: {},
        });
        pts = (res[entity] || []).map((p) => ({
          t: typeof p.start === "number" ? p.start : Date.parse(p.start),
          v: p.mean, lo: p.min, hi: p.max,
        })).filter((p) => p.v != null);
      } catch (e) { pts = []; }
    }
    if (!pts.length) {
      const res = await this._hass.callWS({
        type: "history/history_during_period",
        start_time: start.toISOString(), end_time: end.toISOString(),
        entity_ids: [entity], minimal_response: true, no_attributes: true, significant_changes_only: false,
      });
      pts = (res[entity] || []).map((p) => ({ t: (p.lu || p.lc) * 1000, v: parseFloat(p.s) })).filter((p) => !isNaN(p.v));
      const now = this._hass.states[entity];
      if (pts.length && now && !isNaN(parseFloat(now.state))) pts.push({ t: end.getTime(), v: parseFloat(now.state) });
    }
    pts.sort((a, b) => a.t - b.t);
    const out = { pts, start: start.getTime(), end: end.getTime() };
    this._cache[key] = out;
    return out;
  }

  async _load() {
    this._header();
    const r = this.shadowRoot;
    const msg = r.querySelector(".msg");
    msg.textContent = "Lädt …";
    msg.style.display = "grid";
    const range = ZH_RANGES.find((x) => x.id === this._range);
    const token = (this._token = Symbol());
    let data;
    try { data = await this._fetch(this._s().entity, range); }
    catch (e) { msg.textContent = "Verlauf nicht verfügbar"; return; }
    if (token !== this._token) return;
    this._data = data;
    if (data.pts.length < 2) { msg.textContent = "Noch keine Daten in diesem Zeitraum"; r.querySelector("svg").innerHTML = ""; return; }
    msg.style.display = "none";
    this._draw();
  }

  _draw() {
    const r = this.shadowRoot;
    const svg = r.querySelector("svg");
    const box = r.querySelector(".chart").getBoundingClientRect();
    const W = Math.max(200, box.width), H = 220;
    const L = 34, R = 6, T = 30, B = 22;
    const { pts, start, end } = this._data;
    const col = this._col();
    const vals = pts.map((p) => p.v);
    const los = pts.map((p) => (p.lo != null ? p.lo : p.v));
    const his = pts.map((p) => (p.hi != null ? p.hi : p.v));
    let min = Math.min(...los), max = Math.max(...his);
    const span = max - min || 1;
    const step = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50].find((s) => span / s <= 4) || 100;
    min = Math.floor((min - span * 0.08) / step) * step;
    max = Math.ceil((max + span * 0.08) / step) * step;
    const x = (t) => L + ((t - start) / (end - start)) * (W - L - R);
    const y = (v) => T + (1 - (v - min) / (max - min)) * (H - T - B);
    this._geo = { x, y, L, R, W, H, T, B };

    const line = pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
    const area = `${line}L${x(pts[pts.length - 1].t).toFixed(1)},${H - B}L${x(pts[0].t).toFixed(1)},${H - B}Z`;
    const hasBand = pts.some((p) => p.lo != null && p.hi != null && p.hi > p.lo);
    const band = hasBand
      ? pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.hi != null ? p.hi : p.v).toFixed(1)}`).join("") +
        pts.slice().reverse().map((p) => `L${x(p.t).toFixed(1)},${y(p.lo != null ? p.lo : p.v).toFixed(1)}`).join("") + "Z"
      : "";

    const grid = [];
    for (let v = min; v <= max + 1e-9; v += step) {
      grid.push(`<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--divider-color,rgba(127,127,127,.25))" stroke-dasharray="2 4"/>
        <text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${Number(v).toLocaleString("de-DE", { maximumFractionDigits: step < 1 ? 1 : 0 })}</text>`);
    }
    const ticks = [];
    const d0 = new Date(start);
    if (this._range === "24h") {
      const t = new Date(d0); t.setMinutes(0, 0, 0); t.setHours(Math.ceil(t.getHours() / 6) * 6);
      for (; t.getTime() < end; t.setHours(t.getHours() + 6)) ticks.push([t.getTime(), `${String(t.getHours()).padStart(2, "0")}:00`]);
    } else {
      const t = new Date(d0); t.setHours(24, 0, 0, 0);
      const every = this._range === "7d" ? 1 : 7;
      for (; t.getTime() < end; t.setDate(t.getDate() + every))
        ticks.push([t.getTime(), this._range === "7d" ? ZH_WD[t.getDay()] : `${t.getDate()}.${t.getMonth() + 1}.`]);
    }
    const xt = ticks.map(([t, l]) => `<text x="${x(t)}" y="${H - 4}" text-anchor="middle">${l}</text>`).join("");

    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.innerHTML = `
      <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${col}" stop-opacity=".32"/><stop offset="100%" stop-color="${col}" stop-opacity="0"/>
      </linearGradient></defs>
      <g fill="var(--secondary-text-color)" font-size="11">${grid.join("")}${xt}</g>
      ${band ? `<path d="${band}" fill="${col}" fill-opacity=".14"/>` : ""}
      <path d="${area}" fill="url(#g)"/>
      <path d="${line}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      <g class="cur" style="display:none">
        <line y1="${T - 6}" y2="${H - B}" stroke="var(--secondary-text-color)" stroke-width="1"/>
        <circle r="5" fill="${col}" stroke="var(--card-background-color)" stroke-width="2"/>
      </g>`;

    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const unit = this._unit();
    const set = (k, v) => { r.querySelector(`.v[data-k="${k}"]`).innerHTML = `${this._fmt(v)} <small>${ZH.esc(unit)}</small>`; };
    set("min", Math.min(...los));
    set("avg", avg);
    set("max", Math.max(...his));
  }

  _scrub(ev) {
    const r = this.shadowRoot;
    const tip = r.querySelector(".tip");
    const cur = r.querySelector(".cur");
    if (!ev || !this._data || !this._geo || !cur) { if (tip) tip.style.display = "none"; if (cur) cur.style.display = "none"; return; }
    const box = r.querySelector(".chart").getBoundingClientRect();
    const px = ((ev.clientX - box.left) / box.width) * this._geo.W;
    const { pts } = this._data;
    let best = pts[0], bd = Infinity;
    for (const p of pts) { const d = Math.abs(this._geo.x(p.t) - px); if (d < bd) { bd = d; best = p; } }
    const cx = this._geo.x(best.t), cy = this._geo.y(best.v);
    cur.style.display = "";
    cur.querySelector("line").setAttribute("x1", cx);
    cur.querySelector("line").setAttribute("x2", cx);
    cur.querySelector("circle").setAttribute("cx", cx);
    cur.querySelector("circle").setAttribute("cy", cy);
    const d = new Date(best.t);
    const when = this._range === "24h"
      ? d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })
      : `${ZH_WD[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}. ${String(d.getHours()).padStart(2, "0")}:00`;
    tip.textContent = `${this._fmt(best.v)} ${this._unit()} · ${when}`;
    tip.style.display = "block";
    const left = (cx / this._geo.W) * box.width;
    tip.style.left = `${Math.min(box.width - tip.offsetWidth / 2, Math.max(tip.offsetWidth / 2, left))}px`;
  }
}
if (!customElements.get("zh-history-sheet")) customElements.define("zh-history-sheet", ZHHistorySheet);

ZH.openHistory = (hass, opts) => {
  hass = hass || ZH.hass();
  if (!hass || !opts || !Array.isArray(opts.series) || !opts.series.length) return;
  document.querySelectorAll("zh-history-sheet").forEach((s) => s.remove());
  const el = document.createElement("zh-history-sheet");
  document.body.appendChild(el);
  el.open(hass, opts);
};

/* fire-dom-event aus beliebigen HA-Karten und Badges */
if (!window.__zhHistoryListener) {
  window.__zhHistoryListener = true;
  window.addEventListener("ll-custom", (ev) => {
    const d = ev.detail || {};
    if (d.zh_history) ZH.openHistory(ZH.hass(), d.zh_history);
  });
}

ZH.define("zh-button", ZHButton, "Zuhause Button", "Aktion, Navigation, Kennzahl, Status oder Bild-Kachel");
ZH.define("zh-tabs", ZHTabs, "Zuhause Tabs", "Tabs mit Unterkarten, mobil optimiert");
ZH.define("raum-kachel-card", RaumKachelCard, "Raumkachel", "Raum-Übersicht mit Lichtern, Klima, Hinweisen und Verlauf");

/* ---------- Flower Card an die Statusfarben angleichen ---------- */
const ZH_FLOWER_CSS = `
  .meter{height:8px;border-radius:4px;background-color:color-mix(in srgb,var(--primary-text-color) 10%,transparent)}
  .meter > .good{background-color:var(--zh-ok)}
  .meter > .bad{background-color:var(--zh-hint)}
  .meter > .unavailable{background-color:var(--disabled-text-color,#9e9e9e)}
  #name ha-icon{color:var(--zh-hint)}
  #species{color:var(--secondary-text-color);opacity:1}
  #name{font-size:var(--zh-f-card)}
`;
customElements.whenDefined("flower-card").then(() => {
  const C = customElements.get("flower-card");
  if (!C || C.prototype.__zhStyled) return;
  C.prototype.__zhStyled = true;
  let sheet = null;
  try { sheet = new CSSStyleSheet(); sheet.replaceSync(ZH_FLOWER_CSS); } catch (e) { sheet = null; }
  const apply = (el) => {
    const sr = el.shadowRoot;
    if (!sr) return;
    if (sheet && sr.adoptedStyleSheets && !sr.adoptedStyleSheets.includes(sheet)) sr.adoptedStyleSheets = [...sr.adoptedStyleSheets, sheet];
    else if (!sheet && !sr.querySelector("style[data-zh]")) {
      const s = document.createElement("style"); s.dataset.zh = "1"; s.textContent = ZH_FLOWER_CSS; sr.appendChild(s);
    }
  };
  const orig = C.prototype.connectedCallback;
  C.prototype.connectedCallback = function () {
    if (orig) orig.call(this);
    requestAnimationFrame(() => apply(this));
  };
  const deep = (root, out = []) => { root.querySelectorAll("*").forEach((e) => { if (e.tagName === "FLOWER-CARD") out.push(e); if (e.shadowRoot) deep(e.shadowRoot, out); }); return out; };
  deep(document).forEach(apply);
});
