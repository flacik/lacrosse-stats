# Lacrosse Stats

A web application for recording shot statistics during lacrosse matches, with a real-time viewer mode for coaches.

**Live demo:** https://script.google.com/macros/s/AKfycbz3_lNbzPPteOgOIUxSNuPpo_KgXtSI5ws8JWGD6s5Z2a-NXTePsxtghSg3kiiRfHrwdA/exec

---

## What it does

During a lacrosse match, one person (scorer) records every shot by tapping the position on an interactive field map directly in the browser. At the same time, the coach can open the same match on a tablet and see live statistics updating every 5 seconds — no page refresh needed.

All data is stored in Google Sheets, so the club always has a permanent record of every shot from every match.

---

## Features

**Shot recording (input mode)**
- Tap the SVG field map to place a shot; a modal confirms result (goal / missed / saved / post) and other details (man-up, man-down, period)
- Full shot history with inline edit and delete
- Sync badge on each event shows whether it's been saved to the backend (✓ synced / ⚠ error / retrying)
- Offline buffer — if the network drops, shots are queued locally and auto-retried with exponential backoff (1 s → 3 s → 9 s)

**Live viewer mode (coach)**
- Score, team stats, goalie stats, and per-period breakdown
- Shot chart: full-field overview + half-field zoom with heatmap overlay
- All coordinates stored in attacker-relative space (shot_x/shot_y ∈ [-1,1] / [0,1]) and converted to display coordinates on the fly
- Refreshes every 5 seconds; header shows exact time of last update

**Admin panel**
- Create and manage tournaments
- Schedule matches (date, teams, venue); filter by tournament, date range, and status
- Matches flow automatically into the home screen for scorers to pick up

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS (ES6), HTML5, CSS3 |
| Backend | Google Apps Script (GAS) |
| Database | Google Sheets (3 tabs: events, scheduled_matches, tournaments) |
| Hosting | Google Apps Script Web App (no server costs) |
| Build | Shell script → single self-contained `dist.html` |

---

## Architecture

The frontend is split into 15 focused modules (each under 300 lines), loaded in dependency order:

```
gas-client → helpers → data → algorithms → stats → state
→ field-svg → render-* → handlers → app
```

Key design decisions:

- **Modular JS without a framework** — each module has a single responsibility; the entire app bundles into one HTML file via `build.sh`
- **Optimistic UI** — events appear in the history immediately; GAS sync happens in the background with status feedback
- **GAS response contract** — the backend always returns `{ ok: true, data }` or `{ ok: false, error: { code, message } }`; it never throws to the client
- **Attacker-relative coordinates** — shot positions are stored relative to the attacking direction, not the physical field orientation, so stats are comparable regardless of which half each team attacked
- **Rate limiting** — the backend enforces max 50 writes per minute per session via `CacheService`
- **CSP-safe event handling** — no inline `onclick`; all actions use `data-action` attributes and a single delegated listener

---

## Data storage

Three Google Sheets tabs:

| Tab | What's stored |
|---|---|
| `events` | Every shot: match_id, team, period, result, coordinates, timestamps |
| `scheduled_matches` | Match schedule: date, teams, tournament, status |
| `tournaments` | Tournament registry |

Backend spreadsheet: https://docs.google.com/spreadsheets/d/1nrNDjbIFX6Ac-eMXmUe7mlh8RC1bkXWWcq_gaUULvio

---

## Project structure

```
lacrosse-stats-v2/   ← frontend source (15 JS modules + CSS + index.html)
  build.sh           ← bundles everything into dist.html
  dist.html          ← production build (deployed to GAS)
gas/
  Code.gs            ← all backend functions
  appsscript.json    ← GAS manifest
  DEPLOY.md          ← deployment instructions
```

---

## How to run locally

Open `lacrosse-stats-v2/index.html` in a browser. The app starts in dev mode (`IS_GAS: false`) with sample data — no backend connection needed for UI development.

To build the production bundle:

```bash
cd lacrosse-stats-v2/
./build.sh
# → generates dist.html
```

---

## Status

**Current: V4 — deployed 2026-05-19**

**v4 (2026-05-19)** — historical analytics screen:

- New **Analityka** screen (4th screen) with tournament / team / date / period filters
- Team dropdown scoped to selected tournament
- Stats grid: shots, goals, accuracy %, man-up/down, zone breakdown, per-period breakdown
- Shot chart heatmap — fired vs. conceded toggle, reuses the half-field SVG renderer
- Match history table with W/D/L colouring and viewer shortcut
- Backend: `listAllEvents()` + `seedDummyData()` (3 tournaments, 14 matches, ~563 events)

**v3 MVP (2026-05-18)** — 8 UI/UX improvements, frontend-only:

- LIVE badge redesign — red pulsing header bar when match is live, grey when finished
- Split bars in stats tables — proportional A vs B gradient under each row, toggleable
- Field map legend — goal / saved / missed markers with team colours (viewer mode)
- Zone labels A1–B6 on the field map (both input and viewer mode)
- Shot modal colour semantics — saved=blue, missed=grey, goal=green; larger man-up/down checkboxes
- Match card CTA hierarchy — "Input stats" primary, "View only" secondary; dominant score display
- Last-updated timestamp replacing "auto-refresh every 5s"
- Tablet responsive layout — two-column grid at ≥768px, fat-finger safe buttons (48px min)

**v2 (2026-05-15)** — production-ready baseline. Smoke tested against all 8 core scenarios: shot recording, real-time viewer, admin CRUD, offline buffer recovery, edit/delete flows.
