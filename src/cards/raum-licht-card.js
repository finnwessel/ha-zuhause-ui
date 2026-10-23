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
