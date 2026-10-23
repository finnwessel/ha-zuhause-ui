# Zuhause UI

Eigene Lovelace-Karten und gemeinsame Styleguide-Tokens für ein mobiles Home-Assistant-Dashboard (optimiert für ~412 px Breite, z. B. Pixel 7). Alles steckt in **einer** Datei: `dist/zuhause-ui.js`.

## Installation

**HACS** → ⋮ → *Benutzerdefinierte Repositories* → dieses Repo, Kategorie **Dashboard** → *Zuhause UI* herunterladen. HACS legt die Ressource `/hacsfiles/ha-zuhause-ui/zuhause-ui.js` an.

### Theme (optional)

`themes/zuhause.yaml` nach `/config/themes/` kopieren (in `configuration.yaml` muss `frontend: themes: !include_dir_merge_named themes` stehen), dann *Entwicklerwerkzeuge → Aktionen → `frontend.reload_themes`* und im Profil bzw. als Server-Standard **Zuhause** wählen. Ohne Theme greifen die Fallback-Tokens aus dem Modul.

## Tokens

| Token | Wert | Zweck |
|---|---|---|
| `--zh-pad` / `--zh-gap` | 16 / 12 px | Karten-Innenabstand / Abstand zwischen Elementen |
| `--zh-r-in` | 12 px | Radius innerer Flächen (Knöpfe, Kacheln) |
| `--zh-row` / `--zh-touch` | 56 / 40 px | Zeilenhöhe / Mindest-Touchfläche |
| `--zh-f-title … --zh-f-label` | 18 / 15 / 14 / 13 / 12 px | Schriftgrößen Titel, Karte, Text, Meta, Label |
| `--zh-light` | amber | Licht |
| `--zh-warm` | deep-orange | Heizung, Temperatur |
| `--zh-water` | cyan | Wasser, Luftfeuchte, Wischen |
| `--zh-appliance` | blue | Geräte (Waschmaschine, Geschirrspüler, Beamer …) |
| `--zh-robot` | deep-purple | Saugroboter |
| `--zh-night` | indigo | Nacht, Schlaf |
| `--zh-personal` | pink | Personen |
| `--zh-hint` / `--zh-error` / `--zh-ok` | warning / error / success | Status |
| `--zh-neutral` | secondary-text | aus / inaktiv |

Flächen werden nie mit Verläufen gefüllt, sondern getönt: `color-mix(in srgb, <Rolle> 16%, var(--card-background-color))`.

## Bausteine

| Element | Zweck |
|---|---|
| `custom:zh-button` | Knopf/Kachel (Varianten `plain`, `tint`, `nav`, `ghost`; Layouts `row`, `vertical`, `image`) |
| `custom:zh-tabs` | Reiter innerhalb einer Ansicht (Auswahl per `#hash`) |
| `custom:raum-kachel-card` | Raum-Kachel mit Temperatur/Luftfeuchte – Antippen öffnet den Verlauf |
| `custom:raum-licht-card` | Raumlicht mit Szenen, Lampen und Reglern |
| `custom:raum-reinigung-card` | Raum saugen/wischen |
| `custom:saugplan-card` | Saugplan pro Raum und Warteschlange |
| `custom:appliance-status-card` | Status/Fortschritt für Haushaltsgeräte |
| `custom:fridge-status-card` | Kühlschrank (Tür, Temperatur, Zonen, Modi) |
| `custom:geschirrspueler-card` | Home-Connect-Geschirrspüler |
| `custom:beamer-card` | Beamer über Media Bridge |
| `custom:automation-status-card` | Automation an/aus mit Schlummern |

Außerdem passt das Modul die Balkenfarben der [Flower Card](https://github.com/Olen/lovelace-flower-card) an die Status-Tokens an.

## Verlauf (Bottom-Sheet)

Temperatur und Luftfeuchte öffnen ein Verlaufsblatt (24 Std. / 7 Tage / 30 Tage, Min/Ø/Max, Wischen zum Ablesen). Aus jeder Karte, die `fire-dom-event` kann (z. B. Heading-Badges):

```yaml
tap_action:
  action: fire-dom-event
  zh_history:
    title: Wohnzimmer
    active: 0
    series:
      - entity: sensor.wohnzimmer_temperatur
        name: Temperatur
        color: var(--zh-warm)
        icon: mdi:thermometer
      - entity: sensor.wohnzimmer_luftfeuchtigkeit
        name: Luftfeuchte
        color: var(--zh-water)
        icon: mdi:water-percent
```

Oder per JavaScript: `ZH.openHistory(hass, { title, series, active, range })`.

## Entwickeln

```sh
npm run build   # baut dist/zuhause-ui.js aus src/core.js und src/cards/*.js
```

## Lizenz

MIT. Das Theme `themes/zuhause.yaml` basiert auf [Graphite](https://github.com/TilmanGriesel/graphite) von Tilman Griesel (MIT, siehe `themes/LICENSE-GRAPHITE`).
