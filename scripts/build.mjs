// Baut dist/zuhause-ui.js: Kern zuerst, dann jede Karte in eigenem Block-Scope.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
const root = new URL("..", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const cards = readdirSync(new URL("src/cards", root)).filter((f) => f.endsWith(".js")).sort();
let out = `/*! Zuhause UI ${pkg.version} – eigene Lovelace-Karten & Styleguide-Tokens · MIT */\n`;
out += read("src/core.js").replaceAll("__VERSION__", pkg.version) + "\n";
for (const f of cards) out += `\n/* ── ${f} ── */\n{\n${read(`src/cards/${f}`)}\n}\n`;
writeFileSync(new URL("dist/zuhause-ui.js", root), out);
console.log(`dist/zuhause-ui.js  ${(out.length / 1024).toFixed(1)} KB  (${cards.length} Karten)`);
