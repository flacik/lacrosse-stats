# Lacrosse Stats

A web application for recording shot statistics during lacrosse matches, with a real-time viewer mode for coaches.

**Live demo (sample data):** https://flacik.github.io/lacrosse-stats/

> The demo runs entirely in the browser with built-in sample data — no login or Google account needed.
> The production app (connected to a real Google Sheets database) is used by the club internally.

---

## What it does

During a lacrosse match, one person (scorer) records every shot by tapping the position on an interactive field map directly in the browser. At the same time, the coach can open the same match on a tablet and see live statistics updating every 5 seconds — no page refresh needed.

All data is stored in Google Sheets, so the club always has a permanent record of every shot from every match.

---

## Features

**Dark mode**
- Toggle button in every screen header switches between light and Night Blue dark theme
- Preference persisted in `localStorage` — survives page reload and navigation between screens

**Shot recording (input mode)**
- Tap the SVG field map to place a shot; a modal confirms result (goal / missed / saved / post) and other details (man-up, man-down, period, assist)
- Full shot history with inline edit and delete; newest events at the top
- Sync badge on each event shows whether it's been saved to the backend (✓ synced / ⚠ error / retrying)
- Offline buffer — if the network drops, shots are queued locally and auto-retried with exponential backoff (1 s → 3 s → 9 s)
- **Offline recovery** — pending events survive page refresh/close and are restored from `localStorage` on next load
- **Undo delete** — 5-second undo toast after deleting a shot; event re-syncs if undo is not used

**Live viewer mode (coach)**
- Score, team stats, goalie stats, and per-period breakdown
- Shot chart: full-field overview + half-field zoom with heatmap overlay
- All coordinates stored in attacker-relative space (shot_x/shot_y ∈ [-1,1] / [0,1]) and converted to display coordinates on the fly
- Refreshes every 5 seconds; header shows exact time of last update
- "▶ Nagranie" button in the match bar when a recording URL is set

**Analytics screen**
- Tournament / team / date / period filters; team dropdown scoped to selected tournament
- Stats grid: **match count**, shots, goals, accuracy %, man-up/down, zone breakdown, per-period breakdown; all values update with active filters
- Donut chart of shot results; bar chart of accuracy per period
- Man-up / man-down / even-strength situation cards (hidden when no relevant events)
- Shot chart with three modes: fired shots, conceded shots, zone efficiency heatmap
- **Goalie ranking** — cross-match save% per goalkeeper, with per-quarter breakdown; visible for all teams (no filter) or scoped to a selected team

**Admin panel**
- Create and manage tournaments
- Schedule matches (date, teams, venue, optional recording/stream URL); filter by tournament, date range, and status
- CSV bulk import — upload a file (up to 200 rows), preview table, one-click import; auto-detects `,` or `;` separator and header row
- Matches flow automatically into the home screen for scorers to pick up

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS (ES6), HTML5, CSS3 |
| Backend | Google Apps Script (GAS) |
| Database | Google Sheets (3 tabs: events, scheduled_matches, tournaments) |
| Hosting | Google Apps Script Web App (prod) + GitHub Pages (demo) |
| Build | Shell script → single self-contained `dist.html` |

---

## Architecture

The frontend is split into 16 focused modules (each under 300 lines), loaded in dependency order:

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
| `scheduled_matches` | Match schedule: date, teams, tournament, status, video_url |
| `tournaments` | Tournament registry |

Backend spreadsheet: https://docs.google.com/spreadsheets/d/1nrNDjbIFX6Ac-eMXmUe7mlh8RC1bkXWWcq_gaUULvio

---

## Project structure

```
lacrosse-stats-v2/   ← frontend source (16 JS modules + CSS + index.html)
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

**Current: v8.0.2 — deployed 2026-05-24**

**v8.0.2 (2026-05-24)** — analytics match count tile, assist in legend and viewer badge:

- **Meczy tile in analytics** — new stat box to the left of Strzałów showing the number of distinct matches included in the current filter selection; updates live with tournament / team / date / period filters
- **Assist badge in viewer mode** — yellow "A" badge on shot markers in the coach viewer shot chart (was already present in input mode)
- **Assist in shot map legend** — legend in both input and viewer modes includes the "A" (assist) marker

**v8.0.0 (2026-05-24)** — offline recovery, undo delete:

- **Offline event recovery** — if the app is closed or refreshed while events are pending in the offline buffer, they are restored from `localStorage` on next load and retried automatically; no shots are silently lost
- **Undo delete** — after deleting a shot, a toast notification appears with an "Cofnij" (undo) button; the event is restored locally and re-synced to the backend within 5 seconds
- **Shot ID sorting** — events in the viewer match list are sorted by numeric row ID, ensuring correct chronological order regardless of insertion timing
- Source sync with v7.0.0 / v7.0.1 (goalie analytics, assist badge, UI polish carried into the new branch baseline)

**v7.0.1 (2026-05-22)** — sortable goalie tables:

- All columns in the **Per bramkarz** table are now sortable by clicking the header: Bramkarz (number), Mecze, Strzały na br., Obrony, Bramki str., Save%
- Quarter columns in the **Save% per kwarta** table are also sortable — click Q1/Q2/Q3/Q4 to rank goalies by that quarter's save%
- Both tables share the same sort key so goalie order is consistent between them
- Clicking the active column header toggles ascending ↑ / descending ↓; default is Save% descending

**v7.0.0 (2026-05-22)** — goalie analytics, UI polish, assist badge:

- **Goalie ranking in analytics** — new section below stats grid showing cross-match save% per goalkeeper; grouped by goalie number per team; includes saves, goals against, shots on goal, match count, and a colour-coded save% bar; per-quarter breakdown table when multiple quarters exist; visible without team filter (all goalies) or scoped to a selected team
- **Assist badge** — yellow "A" badge on shot markers in the field map (input mode and viewer mode) and in the shot history list; legend updated
- **Scrollable shot history** — history panel scrolls vertically; newest events at the top (sorted by row ID descending); no horizontal scroll required
- **Zone column removed** from history rows — edit and delete buttons now always visible without scrolling
- **Dark mode field colors** — field SVG in dark mode uses dark green tones (`#1e2a1e` background, `#4a7a4a` lines)
- **In-app confirm modals** — delete confirmations no longer use the browser's native `confirm()` dialog; replaced with a styled modal matching the light/dark theme

**v6.3.0 (2026-05-20)** — assist flag + past matches on home screen:

- New **Asysta** checkbox in the shot modal (alongside man-up/man-down) — marks whether a goal was assisted; shown as a blue badge in shot history
- Home screen now shows a **Mecze z przeszłości** section below today's matches — past matches load and can be opened for stat entry
- GitHub Pages demo at https://flacik.github.io/lacrosse-stats/ — runs with sample data, no login needed

**v6.2.0 (2026-05-20)** — standings: tournament leaderboard:

- New **🏆 Tabela** button on the home screen opens a per-tournament standings table
- Columns: Drużyna / Mecze / Gole+ / Gole− / Celne / Niecelne / % skuteczności / % celności / Man-up gole
- **% skuteczności** = goals / total shots; **% celności** = (goals + on-target saves) / total shots
- Tournament dropdown — switch between all tournaments without leaving the screen
- Click any column header to sort ascending / descending (default: Gole+ descending)
- First-place row highlighted in green; Gole+ in green, Gole− in red
- `seedProdData()` helper in Code.gs — seeds PROD spreadsheet with 3 tournaments, 14 matches, ~480 events in one click from the GAS editor
- `mecze-template.xlsx` — Excel template for CSV bulk import (columns: turniej, data, druzyna_a, druzyna_b, link)

**v6.1.0 (2026-05-19)** — dark mode:

- Toggle button (🌙 / ☀) in every screen header (home, input, viewer, admin, analytics)
- Night Blue theme: `#0d1117` background, `#e6edf3` text, `#1c2128` cards — full coverage including analytics filters, stat boxes, donut/bar chart SVG labels, match history borders
- Preference stored in `localStorage` (`lax_theme`) and restored on every page load

**v6.0.0 (2026-05-19)** — CSV bulk import + video URLs:

- Admin panel: new **Import CSV** card — upload file, preview table, one-click import (up to 200 matches)
- CSV format: `turniej,data,druzyna_a,druzyna_b,link`; separator auto-detected (`,` or `;`), header row auto-detected
- GAS: `bulkCreateMatches()` batch-writes all rows in one `setValues` call
- New `video_url` field on every match — editable in the match modal, shown as "▶ nagranie" in the admin list
- Input screen: "▶ Nagranie" button in the match-info bar when a recording link is set
- `setupSheets()` now detects and adds missing columns (migration-safe, no manual sheet editing needed)
- `sanitizeUrl()` helper: only allows `http(s)`, strips control chars, max 500 chars

**v5.0.0 (2026-05-19)** — analytics visualizations:

- Donut chart of shot results (goal / saved / missed) with percentage breakdown
- Bar chart of goal accuracy per period (Q1…/OT1…) rendered alongside the period table
- Man-up / man-down / even-strength situation cards with goals, shots, and accuracy %; hidden when no relevant events exist
- Zone efficiency heatmap (3rd shot-chart mode): 6 zones coloured by goal % (grey → orange → green)

**v4.0.0 (2026-05-19)** — historical analytics screen:

- New **Analityka** screen (4th screen) with tournament / team / date / period filters
- Team dropdown scoped to selected tournament; resets on tournament change
- Stats grid: shots, goals, accuracy %, man-up/down, zone breakdown, per-period breakdown
- Shot chart heatmap — fired vs. conceded toggle, reuses the half-field SVG renderer
- Match history table with W/D/L colouring and viewer shortcut
- Backend: `listAllEvents()` + `seedDummyData()` (3 tournaments, 14 matches, ~563 events)

**v3.0.0 (2026-05-18)** — UI/UX redesign, frontend-only:

- LIVE badge redesign — red pulsing header bar when match is live, grey when finished
- Split bars in stats tables — proportional A vs B gradient under each row, toggleable
- Field map legend — goal / saved / missed markers with team colours (viewer mode)
- Zone labels A1–B6 on the field map (both input and viewer mode)
- Shot modal colour semantics — saved=blue, missed=grey, goal=green; larger man-up/down checkboxes
- Match card CTA hierarchy — "Input stats" primary, "View only" secondary; dominant score display
- Last-updated timestamp replacing "auto-refresh every 5s"
- Tablet responsive layout — two-column grid at ≥768px, fat-finger safe buttons (48px min)

**v2.0.0 (2026-05-15)** — production-ready baseline. Smoke tested against all 8 core scenarios: shot recording, real-time viewer, admin CRUD, offline buffer recovery, edit/delete flows.
