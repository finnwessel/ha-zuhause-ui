/*! Zuhause UI 1.1.0 – eigene Lovelace-Karten & Styleguide-Tokens · MIT */
/* zuhause-ui – gemeinsamer Baukasten für ein mobiles Home-Assistant-Dashboard
 * Tokens (Styleguide), Hilfsfunktionen, zh-button, zh-tabs, raum-kachel-card,
 * Verlaufsansicht (Bottom-Sheet) und Farbangleich für die Flower Card.
 * Farben nur als Rollen bzw. HA-Farbnamen, nie als Hex-Wert.
 */
const ZH = (window.ZH = window.ZH || {});
ZH.version = "1.1.0";

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


/* ── appliance-status-card.js ── */
{
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

}

/* ── automation-status-card.js ── */
{
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

}

/* ── beamer-card.js ── */
{
/* beamer-card – Beamer (Media Bridge): Bild/App-Logo, Fortschritt, Steuerung, Lautstärke, Apps */
/* Getönt-flache Flächen; Rolle „Gerät“ = --zh-appliance (blau) */
const BMC_TINT = (c, p = 16) => `color-mix(in srgb, ${c} ${p}%, var(--card-background-color))`;
const BMC_ACC = "var(--zh-appliance, var(--blue-color))";
const BMC_C = {
  acc: BMC_ACC,
  hint: "var(--zh-hint, var(--warning-color))",
  grau: "var(--zh-neutral, var(--secondary-text-color))",
  night: "var(--zh-night, var(--indigo-color))",
  err: "var(--zh-error, var(--error-color))",
};
const BMC_STATES = {
  playing: { label: "Läuft", icon: "mdi:play", c: BMC_C.acc },
  paused: { label: "Pausiert", icon: "mdi:pause", c: BMC_C.hint },
  buffering: { label: "Lädt", icon: "mdi:loading", c: BMC_C.acc },
  idle: { label: "Bereit", icon: "mdi:projector", c: BMC_C.grau },
  on: { label: "An", icon: "mdi:projector", c: BMC_C.grau },
  off: { label: "Aus", icon: "mdi:projector-off", c: BMC_C.grau },
  unavailable: { label: "Nicht erreichbar", icon: "mdi:lan-disconnect", c: BMC_C.grau },
};
const BMC_MODES = { standard: "Standard", soft: "Weich", movie: "Film", office: "Büro", dynamic: "Dynamisch", vivid: "Lebhaft" };
const BMC_F = { PAUSE: 1, SEEK: 2, VOLUME_SET: 4, VOLUME_MUTE: 8, PREVIOUS: 16, NEXT: 32, TURN_ON: 128, TURN_OFF: 256 };
const BMC_LOGOS = new Map(); // "entity|app" -> Promise<signed url | null>

class BeamerCard extends HTMLElement {
  setConfig(config) {
    if (!config.entity) throw new Error("entity fehlt");
    const base = config.entity.split(".")[1];
    this._config = {
      apps: ["Netflix", "YouTube", "Prime Video", "ARD Mediathek"],
      end: `sensor.${base}_medienende`,
      next: `sensor.${base}_als_nachstes`,
      sleep: `switch.${base}_nach_diesem_titel_ausschalten`,
      picture_mode: `select.${base}_bildmodus`,
      screensaver: `binary_sensor.${base}_bildschirmschoner`,
      hidden_apps: ["Home", "Einstellungen", "System aktualisieren", "Play Store", "Play Games", "MultiMediaPlayer"],
      ...config,
    };
    this._modesOpen = false;
    this._allOpen = false;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    clearInterval(this._tick);
    this._tick = setInterval(() => this._progress(), 1000);
  }
  disconnectedCallback() { clearInterval(this._tick); }

  set hass(hass) {
    this._hass = hass;
    const c = this._config;
    const m = hass.states[c.entity];
    const a = m ? m.attributes : {};
    const sig = [m && m.state, a.media_title, a.media_artist, a.app_name, a.source, a.entity_picture, a.volume_level, a.is_volume_muted,
      a.media_position_updated_at, a.media_duration, (a.source_list || []).length,
      ...[c.end, c.next, c.sleep, c.picture_mode, c.screensaver].map((i) => hass.states[i] && hass.states[i].state)].join("|");
    if (sig === this._sig || this._dragging) return;
    this._sig = sig;
    this._render();
  }

  getCardSize() { return 7; }
  getGridOptions() { return { columns: 12, rows: "auto", min_columns: 6 }; }

  _s(id) { const s = this._hass.states[id]; return s ? s.state : undefined; }
  _ok(v) { return v !== undefined && v !== "unavailable" && v !== "unknown" && v !== ""; }
  _esc(t) { return String(t ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch])); }
  _fmt(sec) {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
  }
  _hm(d) { return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }); }

  _position() {
    const m = this._hass.states[this._config.entity];
    if (!m) return null;
    const a = m.attributes;
    if (a.media_duration == null || a.media_position == null) return null;
    let pos = a.media_position;
    if (m.state === "playing" && a.media_position_updated_at) {
      pos += (Date.now() - new Date(a.media_position_updated_at).getTime()) / 1000;
    }
    return { pos: Math.min(pos, a.media_duration), dur: a.media_duration };
  }

  _progress() {
    const r = this.shadowRoot;
    const p = this._hass && this._position();
    const bar = r && r.querySelector(".bar i");
    if (!p || !bar) return;
    bar.style.width = `${(100 * p.pos) / p.dur}%`;
    r.querySelector(".t-pos").textContent = this._fmt(p.pos);
    r.querySelector(".t-rest").textContent = `−${this._fmt(p.dur - p.pos)}`;
  }

  _logo(app, img) {
    const key = `${this._config.entity}|${app}`;
    if (!BMC_LOGOS.has(key)) {
      const path = `/api/media_bridge/icon/${this._config.entity}?app=${encodeURIComponent(app)}`;
      BMC_LOGOS.set(key, this._hass
        .callWS({ type: "auth/sign_path", path, expires: 7 * 86400 })
        .then((r) => r.path)
        .catch(() => null));
    }
    img.onerror = () => img.closest(".app")?.classList.add("noimg");
    BMC_LOGOS.get(key).then((url) => {
      if (url) img.src = url;
      else img.closest(".app")?.classList.add("noimg");
    });
  }

  _render() {
    if (!this._hass || !this._config) return;
    const c = this._config;
    const h = this._hass;
    const m = h.states[c.entity];
    let st = m ? m.state : "unavailable";
    if (!BMC_STATES[st]) st = "on";
    const a = m ? m.attributes : {};
    const feat = a.supported_features || 0;
    const has = (f) => (feat & f) === f;
    const off = st === "off" || st === "unavailable";
    const media = ["playing", "paused", "buffering"].includes(st);
    const dreaming = this._s(c.screensaver) === "on";
    const front = a.app_name || (a.source && a.source !== "Home" ? a.source : null);
    let S = BMC_STATES[st];
    if (dreaming && !media) S = { label: "Bildschirmschoner", icon: "mdi:weather-night", c: BMC_C.night };
    else if (!media && !off && front) S = { ...S, label: "Geöffnet", icon: "mdi:application-outline" };

    const pic = !off && a.entity_picture ? a.entity_picture : null;
    const isLogo = pic && pic.includes("cache=app-");
    const title = media ? a.media_title || a.app_name || "Wiedergabe" : off ? "Beamer" : front || "Startbildschirm";
    const sub = media ? [a.media_artist, a.media_title ? a.app_name : null].filter(Boolean).join(" · ") : "";

    const p = media ? this._position() : null;
    const endRaw = this._s(c.end);
    const end = this._ok(endRaw) ? new Date(endRaw) : null;
    const next = this._s(c.next);

    // Apps: nur die, die der Beamer auch kennt
    const sources = a.source_list || [];
    const apps = c.apps.filter((x) => sources.includes(x));
    const curApp = front;
    const more = sources.filter((x) => !c.apps.includes(x) && !c.hidden_apps.includes(x));

    const vol = Math.round((a.volume_level || 0) * 100);
    const muted = !!a.is_volume_muted;
    const sleepOn = this._s(c.sleep) === "on";
    const mode = this._s(c.picture_mode);
    const heroBg = BMC_TINT(S.c, off ? 10 : 16);

    const btn = (act, icon, cls = "", dis = false) =>
      `<button class="cb ${cls}" data-act="${act}"${dis ? " disabled" : ""}><ha-icon icon="${icon}"></ha-icon></button>`;

    this.shadowRoot.innerHTML = `
      <style>
        ha-card { overflow: hidden; display: flex; flex-direction: column; --acc: ${BMC_ACC}; }
        button { all: unset; cursor: pointer; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        button[disabled] { opacity: .35; cursor: default; }
        .hero { --fg: ${S.c}; position: relative; background: ${heroBg};
                padding: var(--zh-pad, 16px); display: flex; gap: 16px; align-items: center; overflow: hidden; }
        .bg { position: absolute; inset: -30px; background-size: cover; background-position: center; filter: blur(28px) saturate(1.3);
              opacity: .35; pointer-events: none; }
        .art { position: relative; flex: none; width: 128px; aspect-ratio: 16 / 9; border-radius: var(--zh-r-in, 12px); overflow: hidden;
               display: grid; place-items: center; background: color-mix(in srgb, var(--fg) 18%, var(--card-background-color)); }
        .art img { width: 100%; height: 100%; object-fit: cover; }
        .art ha-icon { --mdc-icon-size: 40px; color: var(--fg); }
        .info { position: relative; flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
        .pill { align-self: flex-start; display: inline-flex; align-items: center; gap: 5px; font-size: var(--zh-f-label, 12px); font-weight: 600;
                background: color-mix(in srgb, var(--fg) 22%, transparent); padding: 3px 10px 3px 8px; border-radius: 12px; }
        .pill ha-icon { --mdc-icon-size: 15px; color: var(--fg); }
        .ttl { font-size: var(--zh-f-title, 18px); font-weight: 600; line-height: 1.2; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .sub { font-size: var(--zh-f-meta, 13px); color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .prog { position: relative; padding: 0 var(--zh-pad, 16px) 14px; background: ${heroBg}; display: flex; flex-direction: column; gap: 6px; }
        .bar { height: 6px; border-radius: 3px; background: color-mix(in srgb, ${S.c} 25%, transparent); overflow: hidden; cursor: pointer; }
        .bar i { display: block; height: 100%; border-radius: 3px; background: ${S.c}; transition: width .9s linear; }
        .times { display: flex; justify-content: space-between; font-size: var(--zh-f-label, 12px); color: var(--secondary-text-color); font-variant-numeric: tabular-nums; }
        .times b { color: var(--primary-text-color); font-weight: 600; }
        .body { padding: 14px var(--zh-pad, 16px) var(--zh-pad, 16px); display: flex; flex-direction: column; gap: 14px; }
        .ctl { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
        .cb { width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center; color: var(--primary-text-color);
              background: var(--secondary-background-color, rgba(127,127,127,.12)); transition: transform .1s; }
        .cb:active { transform: scale(.94); }
        .cb ha-icon { --mdc-icon-size: 24px; }
        .cb.main { width: 64px; height: 64px; background: ${BMC_TINT(BMC_ACC, 22)}; }
        .cb.main ha-icon { --mdc-icon-size: 34px; color: var(--acc); }
        .vol { display: flex; align-items: center; gap: 10px; }
        .vol .mute { width: var(--zh-touch, 40px); height: var(--zh-touch, 40px); border-radius: 50%; display: grid; place-items: center; color: var(--secondary-text-color); }
        .vol .mute.on { color: ${BMC_C.err}; background: ${BMC_TINT(BMC_C.err, 14)}; }
        .vol .mute ha-icon { --mdc-icon-size: 22px; }
        .vol input { flex: 1; -webkit-appearance: none; appearance: none; height: 28px; background: transparent; margin: 0; }
        .vol input::-webkit-slider-runnable-track { height: 8px; border-radius: 4px;
          background: linear-gradient(to right, var(--acc) var(--v), color-mix(in srgb, var(--acc) 20%, transparent) var(--v)); }
        .vol input::-moz-range-track { height: 8px; border-radius: 4px; background: color-mix(in srgb, var(--acc) 20%, transparent); }
        .vol input::-moz-range-progress { height: 8px; border-radius: 4px; background: var(--acc); }
        .vol input::-webkit-slider-thumb { -webkit-appearance: none; width: 22px; height: 22px; border-radius: 50%; margin-top: -7px;
          background: var(--card-background-color); border: 3px solid var(--acc); box-shadow: 0 1px 4px rgba(0,0,0,.3); }
        .vol input::-moz-range-thumb { width: 16px; height: 16px; border-radius: 50%; background: var(--card-background-color); border: 3px solid var(--acc); }
        .vol .val { width: 34px; text-align: right; font-size: var(--zh-f-meta, 13px); font-weight: 600; font-variant-numeric: tabular-nums; }
        .note { display: flex; align-items: center; gap: 10px; font-size: var(--zh-f-body, 14px); padding: 10px 14px; border-radius: var(--zh-r-in, 12px); background: ${BMC_TINT(BMC_ACC, 10)}; }
        .note ha-icon { --mdc-icon-size: 20px; color: var(--acc); flex: none; }
        .note span { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .note small { color: var(--secondary-text-color); font-size: var(--zh-f-label, 12px); display: block; }
        .h2 { font-size: var(--zh-f-label, 12px); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--secondary-text-color); margin-bottom: -6px; }
        .apps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
        .app { border-radius: var(--zh-r-in, 12px); aspect-ratio: 16 / 9; display: grid; place-items: center; overflow: hidden; position: relative;
               background: var(--secondary-background-color, rgba(127,127,127,.12)); transition: transform .1s, box-shadow .2s; }
        .app:active { transform: scale(.96); }
        .app img { width: 100%; height: 100%; object-fit: cover; }
        .app span { display: none; font-size: var(--zh-f-label, 12px); font-weight: 600; padding: 4px; text-align: center; }
        .app.noimg img { display: none; }
        .app.noimg span { display: block; }
        .app.on { box-shadow: 0 0 0 3px var(--acc); }
        .more { font-size: var(--zh-f-meta, 13px); font-weight: 500; color: var(--secondary-text-color); display: inline-flex; align-items: center; gap: 4px; align-self: flex-start; min-height: 32px; }
        .more ha-icon { --mdc-icon-size: 18px; }
        .chips { display: flex; flex-wrap: wrap; gap: 8px; }
        .chip { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 12px; border-radius: 18px; font-size: var(--zh-f-meta, 13px); font-weight: 500;
                color: var(--secondary-text-color); background: var(--secondary-background-color, rgba(127,127,127,.12)); }
        .chip ha-icon { --mdc-icon-size: 17px; }
        .chip.on { color: var(--primary-text-color); background: ${BMC_TINT(BMC_ACC, 18)}; }
        .chip.on ha-icon { color: var(--acc); }
        .modes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
        .mode { border-radius: var(--zh-r-in, 12px); padding: 10px 4px; text-align: center; font-size: var(--zh-f-meta, 13px); font-weight: 500; color: var(--secondary-text-color);
                background: var(--secondary-background-color, rgba(127,127,127,.12)); }
        .mode.on { color: var(--primary-text-color); background: ${BMC_TINT(BMC_ACC, 18)}; font-weight: 600; }
        .big { width: 100%; border-radius: var(--zh-r-in, 12px); padding: 14px 16px; display: flex; align-items: center; justify-content: center; gap: 10px;
               font-size: var(--zh-f-card, 15px); font-weight: 600; background: ${BMC_TINT(BMC_ACC, 18)}; transition: transform .1s; }
        .big:active { transform: scale(.98); }
        .big ha-icon { --mdc-icon-size: 22px; color: var(--acc); }
      </style>
      <ha-card>
        <div class="hero">
          ${pic && !isLogo ? `<div class="bg" style="background-image:url('${pic}')"></div>` : ""}
          <div class="art${isLogo ? " logo" : ""}">
            ${pic ? `<img src="${pic}" alt="">` : `<ha-icon icon="${S.icon}"></ha-icon>`}
          </div>
          <div class="info">
            <div class="pill"><ha-icon icon="${S.icon}"></ha-icon>${S.label}</div>
            <div class="ttl">${this._esc(title)}</div>
            ${sub ? `<div class="sub">${this._esc(sub)}</div>` : ""}
          </div>
        </div>
        ${p ? `<div class="prog">
          <div class="bar" data-act="seek"><i style="width:${(100 * p.pos) / p.dur}%"></i></div>
          <div class="times"><span class="t-pos">${this._fmt(p.pos)}</span>
            ${end && st === "playing" ? `<span>Endet um <b>${this._hm(end)}</b></span>` : ""}
            <span class="t-rest">−${this._fmt(p.dur - p.pos)}</span></div>
        </div>` : ""}
        <div class="body">
          ${off ? `
            ${has(BMC_F.TURN_ON) ? `<button class="big" data-act="on"><ha-icon icon="mdi:power"></ha-icon>Einschalten</button>` : ""}
          ` : `
            ${media ? `<div class="ctl">
              ${btn("prev", "mdi:skip-previous", "", !has(BMC_F.PREVIOUS))}
              ${btn("back", "mdi:rewind-10", "", !has(BMC_F.SEEK) || !p)}
              ${btn("playpause", st === "playing" ? "mdi:pause" : "mdi:play", "main")}
              ${btn("fwd", "mdi:fast-forward-30", "", !has(BMC_F.SEEK) || !p)}
              ${btn("next", "mdi:skip-next", "", !has(BMC_F.NEXT))}
            </div>` : ""}
            <div class="vol">
              <button class="mute${muted ? " on" : ""}" data-act="mute"><ha-icon icon="${muted ? "mdi:volume-off" : vol < 35 ? "mdi:volume-low" : vol < 70 ? "mdi:volume-medium" : "mdi:volume-high"}"></ha-icon></button>
              <input type="range" min="0" max="100" step="1" value="${vol}" style="--v:${vol}%">
              <span class="val">${vol}</span>
            </div>
            ${this._ok(next) ? `<div class="note"><ha-icon icon="mdi:playlist-play"></ha-icon><span><small>Als Nächstes</small>${this._esc(next)}</span></div>` : ""}
            ${apps.length ? `<div class="h2">Apps</div><div class="apps">${apps.map((x) =>
              `<button class="app${x === curApp ? " on" : ""}" data-act="app" data-app="${this._esc(x)}"><img alt=""><span>${this._esc(x)}</span></button>`).join("")}</div>
              ${more.length ? `<button class="more" data-act="all"><ha-icon icon="${this._allOpen ? "mdi:chevron-up" : "mdi:apps"}"></ha-icon>${this._allOpen ? "Weniger Apps" : `Weitere Apps (${more.length})`}</button>` : ""}
              ${this._allOpen ? `<div class="apps">${more.map((x) =>
                `<button class="app${x === curApp ? " on" : ""}" data-act="app" data-app="${this._esc(x)}"><img alt=""><span>${this._esc(x)}</span></button>`).join("")}</div>` : ""}` : ""}
            <div class="chips">
              ${front ? `<button class="chip" data-act="home"><ha-icon icon="mdi:home-outline"></ha-icon>Startbildschirm</button>` : ""}
              ${has(BMC_F.TURN_OFF) ? `<button class="chip" data-act="off"><ha-icon icon="mdi:power"></ha-icon>Ausschalten</button>` : ""}
              ${this._ok(this._s(c.sleep)) && media ? `<button class="chip${sleepOn ? " on" : ""}" data-act="sleep"><ha-icon icon="mdi:power-sleep"></ha-icon>${sleepOn ? "Aus nach diesem Titel" : "Nach Titel aus"}</button>` : ""}
              ${this._ok(mode) ? `<button class="chip${this._modesOpen ? " on" : ""}" data-act="modes"><ha-icon icon="mdi:palette"></ha-icon>Bild: ${BMC_MODES[mode] || mode}</button>` : ""}
            </div>
            ${this._modesOpen && this._ok(mode) ? `<div class="modes">${Object.entries(BMC_MODES).map(([k, l]) =>
              `<button class="mode${k === mode ? " on" : ""}" data-act="mode" data-mode="${k}">${l}</button>`).join("")}</div>` : ""}
          `}
        </div>
      </ha-card>`;

    const r = this.shadowRoot;
    r.querySelectorAll("[data-act]").forEach((el) => el.addEventListener("click", (ev) => this._click(el, ev)));
    r.querySelectorAll(".app").forEach((el) => this._logo(el.dataset.app, el.querySelector("img")));
    const range = r.querySelector(".vol input");
    if (range) {
      const val = r.querySelector(".vol .val");
      range.addEventListener("pointerdown", () => { this._dragging = true; });
      range.addEventListener("pointerup", () => setTimeout(() => { this._dragging = false; }, 300));
      range.addEventListener("input", () => { range.style.setProperty("--v", `${range.value}%`); val.textContent = range.value; });
      range.addEventListener("change", () => {
        this._dragging = false;
        h.callService("media_player", "volume_set", { entity_id: c.entity, volume_level: range.value / 100 });
      });
    }
  }

  _click(el, ev) {
    if (el.disabled) return;
    const c = this._config;
    const h = this._hass;
    const e = { entity_id: c.entity };
    const call = (svc, data = {}) => h.callService("media_player", svc, { ...e, ...data });
    const p = this._position();
    switch (el.dataset.act) {
      case "playpause": call("media_play_pause"); break;
      case "prev": call("media_previous_track"); break;
      case "next": call("media_next_track"); break;
      case "back": if (p) call("media_seek", { seek_position: Math.max(0, p.pos - 10) }); break;
      case "fwd": if (p) call("media_seek", { seek_position: Math.min(p.dur - 1, p.pos + 30) }); break;
      case "seek": {
        if (!p) break;
        const box = el.getBoundingClientRect();
        call("media_seek", { seek_position: Math.round(p.dur * Math.min(1, Math.max(0, (ev.clientX - box.left) / box.width))) });
        break;
      }
      case "mute": call("volume_mute", { is_volume_muted: !h.states[c.entity].attributes.is_volume_muted }); break;
      case "app": call("select_source", { source: el.dataset.app }); break;
      case "on": call("turn_on"); break;
      case "home": call("select_source", { source: "Home" }); break;
      case "all": this._allOpen = !this._allOpen; this._sig = null; this._render(); break;
      case "off": call("turn_off"); break;
      case "sleep": h.callService("switch", "toggle", { entity_id: c.sleep }); break;
      case "modes": this._modesOpen = !this._modesOpen; this._sig = null; this._render(); break;
      case "mode": h.callService("select", "select_option", { entity_id: c.picture_mode, option: el.dataset.mode }); break;
    }
  }

  static getStubConfig(hass) {
    const e = Object.keys(hass.states).find((k) => k.startsWith("media_player."));
    return { entity: e || "media_player.beamer" };
  }
}

if (!customElements.get("beamer-card")) {
  customElements.define("beamer-card", BeamerCard);
  window.customCards = window.customCards || [];
  window.customCards.push({ type: "beamer-card", name: "Beamer", description: "Media-Bridge-Beamer: Bild/App-Logo, Fortschritt, Steuerung, Lautstärke und Apps" });
}

}

/* ── fridge-status-card.js ── */
{
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

}

/* ── geschirrspueler-card.js ── */
{
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

}

/* ── raum-licht-card.js ── */
{
/* raum-licht-card – Raumlicht mit Raumszenen, Lampen und Reglern direkt auf der Karte */
/* Flach & getönt: Licht = Amber (wie der HA-Lichtzustand); Farbverläufe nur dort, wo sie Licht darstellen (Weißton, Farbe) */
const RLC_TINT = (c, p = 16) => `color-mix(in srgb, ${c} ${p}%, var(--card-background-color))`;
const RLC_LIGHT = "var(--zh-light, var(--amber-color, #ffc107))";
const RLC_GRAD = {
  ct: "linear-gradient(90deg, #ff9329 0%, #ffc58f 22%, #ffe4c4 40%, #fff6ec 58%, #f4f8ff 78%, #d4e6ff 100%)",
  hue: "linear-gradient(90deg, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)",
};
const RLC_COLOR_MODES = ["hs", "xy", "rgb", "rgbw", "rgbww"];
const RLC_ON = "#ffb300"; /* Darstellung einer eingeschalteten Lampe ohne eigene Farbe */

/* relative Helligkeit 0..1 aus "#rrggbb", "var(--x)" oder [r,g,b] */
function rlcLum(c) {
  let r, g, b;
  if (Array.isArray(c)) [r, g, b] = c;
  else {
    const hex = window.ZH && window.ZH.resolveHex ? window.ZH.resolveHex(c, "#808080") : String(c);
    const h = hex.replace("#", "");
    if (h.length !== 6) return 0.5;
    [r, g, b] = [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16));
  }
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/* Liegt eine xy-Farbe nahe am Weißbereich (Planck-Kurve)? Dann Kelvin, sonst null */
function rlcWhiteK(xy) {
  if (!xy) return null;
  const [x, y] = xy;
  const n = (x - 0.332) / (0.1858 - y);
  let T = 449 * n ** 3 + 3525 * n ** 2 + 6823.3 * n + 5520.33;
  if (!isFinite(T)) return null;
  T = Math.min(10000, Math.max(1700, T));
  const lx = T <= 4000
    ? -0.2661239e9 / T ** 3 - 0.2343589e6 / T ** 2 + 0.8776956e3 / T + 0.17991
    : -3.0258469e9 / T ** 3 + 2.1070379e6 / T ** 2 + 0.2226347e3 / T + 0.24039;
  const ly = T <= 2222
    ? -1.1063814 * lx ** 3 - 1.3481102 * lx ** 2 + 2.18555832 * lx - 0.20219683
    : T <= 4000
      ? -0.9549476 * lx ** 3 - 1.37418593 * lx ** 2 + 2.09137015 * lx - 0.16748867
      : 3.081758 * lx ** 3 - 5.8733867 * lx ** 2 + 3.75112997 * lx - 0.37001483;
  return Math.hypot(x - lx, y - ly) < 0.015 ? Math.round(T / 50) * 50 : null;
}

/* Weißton in Worten */
function rlcWhiteWord(k) {
  if (k < 3300) return "Warmweiß";
  if (k <= 4500) return "Neutralweiß";
  return "Kaltweiß";
}

class RaumLichtCard extends HTMLElement {
  setConfig(config) {
    if (!Array.isArray(config.sections) || !config.sections.length) throw new Error("sections fehlt");
    this._config = { title: "Licht", scenes: [], transition: 1.5, lamps_collapsed_from: 3, ...config };
    this._tabs = {};
    this._open = {};
    this._lampsOpen = {};
    this._pending = {};
    this._drag = null;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
  }

  set hass(hass) {
    this._hass = hass;
    if (this._drag) return;
    const sig = this._ids().map((id) => {
      const s = hass.states[id];
      return s ? `${s.state}${s.last_updated}` : "-";
    }).join("|");
    if (sig === this._sig) return;
    this._sig = sig;
    this._render();
  }

  getCardSize() { return 8; }
  getGridOptions() { return { columns: 12, rows: "auto", min_columns: 6 }; }

  _ids() {
    const c = this._config;
    const ids = [];
    const addScene = (s) => {
      ids.push(s.entity);
      const st = this._hass && this._hass.states[s.entity];
      if (st && Array.isArray(st.attributes.entity_id)) ids.push(...st.attributes.entity_id);
    };
    c.scenes.forEach(addScene);
    c.sections.forEach((sec) => {
      ids.push(sec.entity);
      (sec.lights || []).forEach((l) => ids.push(l));
      (sec.scenes || []).forEach(addScene);
    });
    return [...new Set(ids)];
  }

  _pend(key) {
    const p = this._pending[key];
    return p && Date.now() - p.t < 2500 ? p.v : undefined;
  }

  _info(id) {
    const s = this._hass.states[id];
    if (!s || s.state === "unavailable" || s.state === "unknown") return { id, ok: false, on: false, name: s ? s.attributes.friendly_name : id };
    const a = s.attributes;
    if (!id.startsWith("light.")) {
      /* Schalter/Mock (z. B. input_boolean): nur an/aus */
      const on = s.state === "on";
      return { id, ok: true, on, name: a.friendly_name, ct: false, color: false, dim: false, bri: 0, k: null, hue: null, sat: null,
        kMin: 2000, kMax: 6500, col: on ? RLC_ON : "", lum: rlcLum(RLC_ON), inColor: false, approx: false };
    }
    const modes = a.supported_color_modes || [];
    const ct = modes.includes("color_temp");
    const color = modes.some((m) => RLC_COLOR_MODES.includes(m));
    const dim = ct || color || modes.includes("brightness") || modes.includes("white");
    const on = s.state === "on";
    let bri = on && a.brightness != null ? Math.max(1, Math.round(a.brightness / 2.55)) : 0;
    let k = a.color_temp_kelvin || null;
    let hue = a.hs_color ? a.hs_color[0] : null;
    const sat = a.hs_color ? a.hs_color[1] : null;
    const pb = this._pend(`${id}:bri`); if (pb !== undefined) bri = pb;
    const pk = this._pend(`${id}:ct`); if (pk !== undefined) k = pk;
    const ph = this._pend(`${id}:hue`); if (ph !== undefined) hue = ph;
    const kMin = Math.max(2000, a.min_color_temp_kelvin || 2000);
    const kMax = Math.min(6500, a.max_color_temp_kelvin || 6500);
    let col = "";
    let lum = 0.5;
    if (on && a.rgb_color) { col = `rgb(${a.rgb_color.join(",")})`; lum = rlcLum(a.rgb_color); }
    else if (on) { col = RLC_ON; lum = rlcLum(col); }
    let inColor = on && RLC_COLOR_MODES.includes(a.color_mode);
    let approx = false;
    if (inColor && ct) {
      const wk = rlcWhiteK(a.xy_color);
      if (wk) { inColor = false; approx = true; if (pk === undefined) k = Math.min(kMax, Math.max(kMin, wk)); }
    }
    if (ph !== undefined) { inColor = true; approx = false; }
    if (pk !== undefined) { inColor = false; approx = false; }
    return { id, ok: true, on, name: a.friendly_name, ct, color, dim, bri, k, hue, sat, kMin, kMax, col, lum, inColor, approx };
  }

  _sub(i) {
    if (!i.ok) return "Nicht erreichbar";
    if (!i.on) return "Aus";
    const parts = [];
    if (i.dim) parts.push(`${i.bri} %`);
    if (i.inColor) parts.push("Farbe");
    else if (i.k) parts.push(rlcWhiteWord(i.k));
    return parts.join(" · ") || "An";
  }

  _activeScene(list) {
    let best = null;
    let bt = 0;
    list.forEach((s) => {
      const st = this._hass.states[s.entity];
      if (!st) return;
      const t = Date.parse(st.state);
      if (!isNaN(t) && t > bt) { bt = t; best = st; }
    });
    if (!best) return null;
    const ents = best.attributes.entity_id || [];
    const ok = ents.every((id) => {
      const l = this._hass.states[id];
      return !l || Date.parse(l.last_updated) <= bt + 20000;
    });
    return ok ? best.entity_id : null;
  }

  _sceneGrid(list, small) {
    if (!list || !list.length) return "";
    const active = this._activeScene(list);
    return `<div class="scenes${small ? " small" : ""}">${list.map((s) => {
      const st = this._hass.states[s.entity];
      const on = active === s.entity;
      const c = s.color || RLC_LIGHT;
      const icon = s.icon || (st && st.attributes.icon) || "mdi:palette";
      const name = s.name || (st && st.attributes.friendly_name) || s.entity;
      const dk = rlcLum(c) < 0.32 ? " dk" : "";
      return `<button class="sc${on ? " on" : ""}${dk}" data-act="scene" data-e="${s.entity}" style="--c:${c}">
        <span class="si"><ha-icon icon="${icon}"></ha-icon></span><span class="sn">${name}</span>
        ${on ? `<ha-icon class="ck" icon="mdi:check-circle"></ha-icon>` : ""}</button>`;
    }).join("")}</div>`;
  }

  _slider(kind, i, small) {
    if (kind === "bri") {
      const v = i.on ? i.bri : 0;
      return `<div class="sl bri${small ? " small" : ""}${i.on ? "" : " off"}" data-kind="bri" data-e="${i.id}" data-min="1" data-max="100">
        <div class="fill" style="width:${v}%"></div>
        <div class="lab"><ha-icon icon="mdi:brightness-6"></ha-icon><span class="val">${i.on ? `${v} %` : "Helligkeit"}</span></div></div>`;
    }
    if (kind === "ct") {
      const k = i.k || Math.round((i.kMin + i.kMax) / 2);
      const pos = Math.min(98, Math.max(2, ((k - i.kMin) / (i.kMax - i.kMin)) * 100));
      const show = i.on && !i.inColor && i.k;
      return `<div class="sl grad ct${i.on ? "" : " off"}" data-kind="ct" data-e="${i.id}" data-min="${i.kMin}" data-max="${i.kMax}" style="background:${RLC_GRAD.ct}">
        <div class="thumb" style="left:${pos}%${show ? "" : ";opacity:.35"}"></div><div class="lab dark"><ha-icon icon="mdi:thermometer"></ha-icon></div>
        <span class="val" hidden></span></div>`;
    }
    const h = i.hue != null ? i.hue : 30;
    const pos = Math.min(98, Math.max(2, (h / 360) * 100));
    const show = i.on && i.inColor;
    return `<div class="sl grad hue${i.on ? "" : " off"}" data-kind="hue" data-e="${i.id}" data-min="0" data-max="360" data-sat="${i.sat && i.sat > 20 ? i.sat : 85}" style="background:${RLC_GRAD.hue}">
      <div class="thumb" style="left:${pos}%${show ? "" : ";opacity:.35"}"></div><div class="lab light"><ha-icon icon="mdi:palette"></ha-icon></div><span class="val" hidden></span></div>`;
  }

  /* single: der Raum hat nur diese eine Lampe – der Schalter steckt schon im Kartenkopf */
  _section(sec, idx, single) {
    const i = this._info(sec.entity);
    const icon = sec.icon || "mdi:lightbulb";
    const title = sec.title || i.name;
    const bc = i.col || "";
    let body = "";
    if (i.ok) {
      if (i.dim) body += this._slider("bri", i);
      if (!i.on) {
        /* aus: nur Helligkeit – Ziehen schaltet ein */
      } else if (i.ct && i.color) {
        const tab = this._tabs[idx] || (i.inColor ? "color" : "ct");
        body += `<div class="tabs"><button class="tb${tab === "ct" ? " on" : ""}" data-act="tab" data-i="${idx}" data-t="ct">Weiß</button><button class="tb${tab === "color" ? " on" : ""}" data-act="tab" data-i="${idx}" data-t="color">Farbe</button></div>`;
        body += this._slider(tab === "ct" ? "ct" : "hue", i);
      } else if (i.ct) body += this._slider("ct", i);
      else if (i.color) body += this._slider("hue", i);
      const members = sec.lights || [];
      if (members.length > 1) {
        const foldable = members.length >= this._config.lamps_collapsed_from;
        const open = !foldable || !!this._lampsOpen[idx];
        const onCount = members.filter((m) => this._info(m).on).length;
        body += foldable
          ? `<button class="fold" data-act="lamps" data-i="${idx}"><span>Lampen</span><span class="fa">· ${onCount} von ${members.length} an</span><ha-icon icon="${open ? "mdi:chevron-up" : "mdi:chevron-down"}"></ha-icon></button>`
          : `<div class="h3">Lampen</div>`;
        if (open) {
          body += members.map((m) => {
            const mi = this._info(m);
            return `<div class="mem">
              <div class="mrow"><button class="mdot" data-act="toggle" data-e="${m}" style="${mi.col ? `background:${mi.col}` : ""}"></button>
              <span class="mn" data-act="more" data-e="${m}">${mi.name}</span><span class="mv">${this._sub(mi)}</span>
              <button class="sw small${mi.on ? " on" : ""}" data-act="toggle" data-e="${m}"${mi.ok ? "" : " disabled"}><span></span></button></div>
              ${mi.ok && mi.dim ? this._slider("bri", mi, true) : ""}</div>`;
          }).join("");
        }
      }
      if (sec.scenes && sec.scenes.length) {
        const open = this._open[idx] !== undefined ? this._open[idx] : sec.scenes_collapsed === false;
        const act = this._activeScene(sec.scenes);
        const actS = act && sec.scenes.find((s) => s.entity === act);
        const actName = actS ? (actS.name || (this._hass.states[act] && this._hass.states[act].attributes.friendly_name)) : "";
        body += `<button class="fold" data-act="fold" data-i="${idx}"><span>${sec.scenes_title || "Szenen"}</span>
          ${!open && actName ? `<span class="fa">· ${actName}</span>` : ""}<ha-icon icon="${open ? "mdi:chevron-up" : "mdi:chevron-down"}"></ha-icon></button>`;
        if (open) body += this._sceneGrid(sec.scenes, true);
      }
    }
    if (single) return body ? `<div class="sec single">${body}</div>` : "";
    return `<div class="sec${i.on ? " lit" : ""}">
      <div class="row">
        <button class="bulb${i.on ? " on" : ""}${i.on && i.lum > 0.62 ? " lt" : ""}" data-act="toggle" data-e="${sec.entity}" style="${bc ? `--bc:${bc}` : ""}"${i.ok ? "" : " disabled"}><ha-icon icon="${icon}"></ha-icon></button>
        <div class="txt" data-act="more" data-e="${sec.entity}"><div class="n">${title}</div><div class="s">${this._sub(i)}</div></div>
        <button class="sw${i.on ? " on" : ""}" data-act="toggle" data-e="${sec.entity}"${i.ok ? "" : " disabled"}><span></span></button>
      </div>${body}</div>`;
  }

  _render() {
    if (!this._hass || !this._config) return;
    const c = this._config;
    const infos = c.sections.map((s) => this._info(s.entity));
    const onCount = infos.filter((i) => i.on).length;
    const anyOn = onCount > 0;
    const single = c.sections.length === 1;

    this.shadowRoot.innerHTML = `
      <style>
        ha-card { padding: var(--zh-pad, 16px); display: flex; flex-direction: column; gap: var(--zh-gap, 12px); }
        button { all: unset; cursor: pointer; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        button[disabled] { opacity: .4; cursor: default; }
        .head { display: flex; align-items: center; gap: 12px; }
        .hi { width: var(--zh-touch, 40px); height: var(--zh-touch, 40px); border-radius: 50%; display: grid; place-items: center; flex: none; color: ${RLC_LIGHT}; background: ${RLC_TINT(RLC_LIGHT, 20)}; }
        .hi.off { color: var(--secondary-text-color); background: rgba(127,127,127,.15); }
        .hi ha-icon { --mdc-icon-size: 22px; }
        .ht { flex: 1; min-width: 0; }
        .t1 { font-weight: 600; font-size: var(--zh-f-card, 15px); color: var(--primary-text-color); }
        .t2 { font-size: var(--zh-f-meta, 13px); color: var(--secondary-text-color); margin-top: 2px; }
        .h3 { font-size: var(--zh-f-label, 12px); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--secondary-text-color); margin: 2px 0 -4px; }
        .scenes { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
        .sc { position: relative; border-radius: var(--zh-r-in, 12px); padding: 10px 4px 9px; display: flex; flex-direction: column; align-items: center; gap: 6px;
              background: var(--secondary-background-color, rgba(127,127,127,.12)); color: var(--primary-text-color); font-size: var(--zh-f-label, 12px); font-weight: 500;
              transition: transform .1s, background .25s; }
        .sc:active { transform: scale(.96); }
        .si { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; background: var(--c); color: #fff; }
        .si ha-icon { --mdc-icon-size: 20px; }
        .sn { text-align: center; line-height: 1.15; }
        .sc.on { background: ${RLC_TINT("var(--c)", 24)}; color: var(--primary-text-color); }
        .sc.dk:not(.on) .si { box-shadow: 0 0 0 1.5px rgba(255,255,255,.35); }
        .ck { position: absolute; top: 4px; right: 4px; --mdc-icon-size: 16px; color: var(--primary-text-color); }
        .scenes.small .sc { padding: 8px 4px 7px; gap: 4px; font-size: 11.5px; }
        .scenes.small .si { width: 30px; height: 30px; }
        .scenes.small .si ha-icon { --mdc-icon-size: 17px; }
        .sec { border-radius: var(--zh-r-in, 12px); border: 1px solid var(--divider-color, rgba(127,127,127,.25)); padding: 12px; display: flex; flex-direction: column; gap: 10px; transition: border-color .3s; }
        .sec.lit { border-color: color-mix(in srgb, ${RLC_LIGHT} 45%, transparent); }
        .sec.single { border: none; padding: 0; }
        .row { display: flex; align-items: center; gap: 12px; }
        .bulb { width: 42px; height: 42px; border-radius: 50%; display: grid; place-items: center; flex: none; color: var(--secondary-text-color); background: rgba(127,127,127,.15); transition: all .3s; }
        .bulb.on { color: #fff; background: var(--bc, ${RLC_ON}); box-shadow: 0 0 14px color-mix(in srgb, var(--bc, ${RLC_ON}) 60%, transparent); }
        .bulb.on ha-icon { filter: drop-shadow(0 0 2px rgba(0,0,0,.45)); }
        .bulb ha-icon { --mdc-icon-size: 22px; }
        .bulb.on.lt { color: #4a3413; }
        .bulb.on.lt ha-icon { filter: none; }
        .fold { display: flex; align-items: center; gap: 6px; font-size: var(--zh-f-label, 12px); font-weight: 600; text-transform: uppercase; letter-spacing: .04em;
                color: var(--secondary-text-color); padding: 4px 0; margin-bottom: -4px; }
        .fold .fa { text-transform: none; letter-spacing: 0; font-weight: 500; color: var(--primary-text-color); }
        .fold ha-icon { --mdc-icon-size: 18px; margin-left: auto; }
        .txt { flex: 1; min-width: 0; cursor: pointer; }
        .n { font-weight: 600; font-size: var(--zh-f-card, 15px); color: var(--primary-text-color); }
        .s { font-size: var(--zh-f-meta, 13px); color: var(--secondary-text-color); margin-top: 2px; }
        .sw { width: 46px; height: 28px; border-radius: 14px; background: rgba(127,127,127,.3); position: relative; flex: none; transition: background .25s; }
        .sw span { position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.35); transition: left .25s; }
        .sw.on { background: ${RLC_LIGHT}; }
        .sw.on span { left: 21px; }
        .sw.small { width: 38px; height: 24px; }
        .sw.small span { width: 18px; height: 18px; }
        .sw.small.on span { left: 17px; }
        .sl { position: relative; height: 42px; border-radius: var(--zh-r-in, 12px); overflow: hidden; background: rgba(127,127,127,.16); touch-action: pan-y;
              cursor: pointer; user-select: none; -webkit-user-select: none; transition: opacity .25s; }
        .sl.small { height: 30px; border-radius: 9px; }
        .sl.off { opacity: .55; }
        .sl .fill { position: absolute; top: 0; bottom: 0; left: 0; background: ${RLC_TINT(RLC_LIGHT, 55)}; }
        .sl .lab { position: absolute; inset: 0; display: flex; align-items: center; gap: 6px; padding: 0 12px; font-size: var(--zh-f-meta, 13px); font-weight: 600;
                   color: var(--primary-text-color); pointer-events: none; }
        .sl .lab ha-icon { --mdc-icon-size: 18px; }
        .sl.small .lab { font-size: var(--zh-f-label, 12px); }
        .sl.small .lab ha-icon { --mdc-icon-size: 15px; }
        .sl .lab.dark { color: #4a3413; }
        .sl .lab.light { color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.6); }
        .thumb { position: absolute; top: 5px; bottom: 5px; width: 8px; margin-left: -4px; border-radius: 4px; background: #fff;
                 box-shadow: 0 0 0 2px rgba(0,0,0,.35), 0 1px 4px rgba(0,0,0,.4); pointer-events: none; z-index: 1; }
        .tabs { display: inline-flex; align-self: flex-start; gap: 3px; padding: 3px; border-radius: 10px; background: var(--secondary-background-color, rgba(127,127,127,.12)); margin-bottom: -4px; }
        .tb { padding: 4px 12px; border-radius: 8px; font-size: var(--zh-f-label, 12px); font-weight: 500; color: var(--secondary-text-color); }
        .tb.on { color: var(--primary-text-color); background: ${RLC_TINT(RLC_LIGHT, 26)}; }
        .mem { display: flex; flex-direction: column; gap: 6px; }
        .mrow { display: flex; align-items: center; gap: 10px; font-size: var(--zh-f-body, 14px); color: var(--primary-text-color); }
        .mdot { width: 16px; height: 16px; border-radius: 50%; background: rgba(127,127,127,.35); flex: none; }
        .mn { flex: 1; min-width: 0; cursor: pointer; }
        .mv { font-size: var(--zh-f-label, 12px); color: var(--secondary-text-color); }
      </style>
      <ha-card>
        <div class="head">
          <div class="hi${anyOn ? "" : " off"}"><ha-icon icon="${anyOn ? "mdi:lightbulb-group" : "mdi:lightbulb-group-off-outline"}"></ha-icon></div>
          <div class="ht"><div class="t1">${c.title}</div><div class="t2">${single ? this._sub(infos[0]) : anyOn ? `${onCount} von ${infos.length} an` : "Alles aus"}</div></div>
          <button class="sw${anyOn ? " on" : ""}" data-act="all"><span></span></button>
        </div>
        ${c.scenes.length ? `<div class="h3">${c.scenes_title || "Raumszenen"}</div>${this._sceneGrid(c.scenes, false)}` : ""}
        ${c.sections.map((s, idx) => this._section(s, idx, single)).join("")}
      </ha-card>`;

    this.shadowRoot.querySelectorAll("[data-act]").forEach((el) => el.addEventListener("click", (ev) => { ev.stopPropagation(); this._click(el); }));
    this.shadowRoot.querySelectorAll(".sl").forEach((el) => this._bindSlider(el));
  }

  _haptic() { this.dispatchEvent(new CustomEvent("haptic", { detail: "light", bubbles: true, composed: true })); }

  _click(el) {
    if (el.disabled) return;
    const h = this._hass;
    const c = this._config;
    const act = el.dataset.act;
    const e = el.dataset.e;
    if (act === "toggle") { this._haptic(); h.callService("homeassistant", "toggle", { entity_id: e }); }
    else if (act === "all") {
      this._haptic();
      const ents = c.sections.map((s) => s.entity);
      const anyOn = ents.some((id) => h.states[id] && h.states[id].state === "on");
      h.callService("homeassistant", anyOn ? "turn_off" : "turn_on", { entity_id: ents });
    } else if (act === "scene") {
      this._haptic();
      h.callService("scene", "turn_on", { entity_id: e, transition: c.transition });
    } else if (act === "more") {
      this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: e } }));
    } else if (act === "fold") {
      const i = el.dataset.i;
      const sec = c.sections[i];
      const cur = this._open[i] !== undefined ? this._open[i] : sec.scenes_collapsed === false;
      this._open[i] = !cur;
      this._render();
    } else if (act === "lamps") {
      const i = el.dataset.i;
      this._lampsOpen[i] = !this._lampsOpen[i];
      this._render();
    } else if (act === "tab") {
      this._tabs[el.dataset.i] = el.dataset.t;
      this._render();
    }
  }

  _bindSlider(el) {
    const kind = el.dataset.kind;
    const e = el.dataset.e;
    const min = Number(el.dataset.min);
    const max = Number(el.dataset.max);
    const valAt = (x) => {
      const r = el.getBoundingClientRect();
      const f = Math.min(1, Math.max(0, (x - r.left) / r.width));
      let v = min + f * (max - min);
      if (kind === "ct") v = Math.round(v / 50) * 50;
      else v = Math.round(v);
      return Math.min(max, Math.max(min, v));
    };
    const show = (v) => {
      const lab = el.querySelector(".val");
      if (kind === "bri") {
        el.querySelector(".fill").style.width = `${v}%`;
        lab.textContent = `${v} %`;
        el.classList.remove("off");
      } else {
        const th = el.querySelector(".thumb");
        th.style.left = `${Math.min(98, Math.max(2, ((v - min) / (max - min)) * 100))}%`;
        th.style.opacity = "1";
      }
    };
    const send = (v, final) => {
      const data = { entity_id: e, transition: final ? 0.5 : 0.3 };
      if (kind === "bri") data.brightness_pct = v;
      else if (kind === "ct") data.color_temp_kelvin = v;
      else data.hs_color = [v, Number(el.dataset.sat) || 85];
      this._hass.callService("light", "turn_on", data);
      this._pending[`${e}:${kind}`] = { v, t: Date.now() };
      this._lastSend = Date.now();
    };
    el.addEventListener("pointerdown", (ev) => {
      if (ev.button !== undefined && ev.button !== 0) return;
      this._drag = { el, x0: ev.clientX, moved: false, v: valAt(ev.clientX) };
      try { el.setPointerCapture(ev.pointerId); } catch (err) {}
    });
    el.addEventListener("pointermove", (ev) => {
      const d = this._drag;
      if (!d || d.el !== el) return;
      if (!d.moved && Math.abs(ev.clientX - d.x0) < 4) return;
      d.moved = true;
      d.v = valAt(ev.clientX);
      show(d.v);
      if (!this._lastSend || Date.now() - this._lastSend > 350) send(d.v, false);
    });
    const end = (ev, cancel) => {
      const d = this._drag;
      if (!d || d.el !== el) return;
      this._drag = null;
      if (cancel && !d.moved) { this._sig = null; this._render(); return; }
      const v = cancel ? d.v : valAt(ev.clientX);
      show(v);
      send(v, true);
      this._haptic();
      clearTimeout(this._pendTimer);
      this._pendTimer = setTimeout(() => { this._sig = null; this._render(); }, 2600);
    };
    el.addEventListener("pointerup", (ev) => end(ev, false));
    el.addEventListener("pointercancel", (ev) => end(ev, true));
  }

  static getStubConfig() {
    return { sections: [{ title: "Licht", entity: "light.ceiling_light_bedroom", icon: "mdi:ceiling-light" }] };
  }
}

if (!customElements.get("raum-licht-card")) {
  customElements.define("raum-licht-card", RaumLichtCard);
  window.customCards = window.customCards || [];
  window.customCards.push({ type: "raum-licht-card", name: "Raum-Licht", description: "Raumszenen, Lampen und Regler für Helligkeit, Weißton und Farbe" });
}

}

/* ── raum-reinigung-card.js ── */
{
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

}

/* ── saugplan-card.js ── */
{
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

}
