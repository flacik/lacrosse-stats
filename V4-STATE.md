# Lacrosse Stats — Stan po V4 (analityka historyczna)

**Ostatnia aktualizacja:** 2026-05-19  
**Wdrożony deployment ID:** `AKfycbz3_lNbzPPteOgOIUxSNuPpo_KgXtSI5ws8JWGD6s5Z2a-NXTePsxtghSg3kiiRfHrwdA`  
**Branch/tag:** scalony do `main` z `v4-analytics`

Przed pracą w nowej sesji przeczytaj też:
- `CLAUDE.md` — konwencje, build workflow, deploy
- `CLASP-HANDOFF.md` — procedura deploy przez clasp krok po kroku

---

## Co zostało zaimplementowane w V4

Czwarty ekran aplikacji: **Analityka historyczna** (`APP.screen === 'analytics'`).

Wejście: przycisk `📊 Analityka` na ekranie Home (obecny w stanach loading, error i loaded).  
Wyjście: przycisk `← Home` w nagłówku ekranu.

### Filtry (5 kontrolek)

| Pole | Typ | Wartość domyślna | Uwagi |
|---|---|---|---|
| `tournament` | `<select>` | `''` (wszystkie) | Lista z `APP.analyticsData.tournaments` |
| `team` | `<select>` | `''` (wszystkie) | **Filtrowany do drużyn z wybranego turnieju**; resetuje się przy zmianie turnieju |
| `period` | `<select>` | `''` (wszystkie) | Dynamiczna lista z eventów, sortowanie: 1,2,3,4 → OT1,OT2,... |
| `dateFrom` | `<input type=date>` | `''` | Format YYYY-MM-DD |
| `dateTo` | `<input type=date>` | `''` | Format YYYY-MM-DD |

### Sekcje wynikowe

1. **Statystyki** (`_renderAnalyticsStats`) — siatka: strzały / bramki / celne / skuteczność% / %celnych / man-up / man-down; tabele rozkładu po strefach i kwartach
2. **Shot chart** (`_renderAnalyticsHeatmap`) — wymaga wybranej drużyny; toggle `fired` / `conceded`; reużywa `drawHalfFieldChart` z trick-mock-match
3. **Historia meczów** (`_renderAnalyticsMatchHistory`) — wymaga wybranej drużyny; wynik liczony z eventów; kolory W/D/L; przycisk Podgląd → viewer

---

## Zmienione pliki i kluczowe decyzje

### `gas/Code.gs`

Dodane dwie nowe funkcje:

**`listAllEvents()`** — zwraca wszystkie wiersze z zakładki `CONFIG.SHEET_EVENTS` przez `sheetToArray` (ta sama ścieżka co pozostałe funkcje). Uwaga: handoff V4 używał `CONFIG.SHEETS.EVENTS` (błąd) — prawidłowy klucz to `CONFIG.SHEET_EVENTS`.

**`seedDummyData()`** — jednorazowe zasiewanie testowe: 3 turnieje, 14 meczów, ~563 eventy. Uruchamiana ręcznie z edytora GAS (nie przez clasp run — wymaga API deployment którego nie mamy).

### `lacrosse-stats-v2/gas-client.js`

Dodana na końcu:
```javascript
function gasListAllEvents() {
  return gasCall('listAllEvents');
}
```

**Konwencja gasCall:** `gasCall()` zwraca `result.data` bezpośrednio (nie `{ok, data}`). Jeśli backend zwróci `{ok: false}` — gasCall rzuca wyjątek. Dlatego `loadAnalyticsData` używa `events || []`, nie `evRes.data`.

### `lacrosse-stats-v2/state.js`

Nowe pola w `APP`:
```javascript
analyticsLoading:     false,
analyticsError:       null,
analyticsData:        null,   // { events: [], matches: [], tournaments: [] }
analyticsFilters:     { tournament: '', team: '', dateFrom: '', dateTo: '', period: '' },
analyticsHeatmapMode: 'fired',  // 'fired' | 'conceded'
```

Reset w `go()` przy każdej zmianie ekranu:
```javascript
APP.analyticsLoading = false;
APP.analyticsError   = null;
```

Nowa gałąź w `go()`:
```javascript
} else if (screen === 'analytics') {
  loadAnalyticsData();
}
```

Nowa funkcja `loadAnalyticsData()` — ładuje równolegle eventy + mecze + turnieje. W trybie DEV (`e.code === 'DEV_MODE'`) używa `SAMPLE_DATA`.

Nowy alias: `function goAnalytics() { go('analytics'); }`

### `lacrosse-stats-v2/app.js`

Nowa gałąź renderowania (dodana po `match-viewer`):
```javascript
else if (APP.screen === 'analytics') renderAnalytics(app);
```

### `lacrosse-stats-v2/render-home.js`

Przycisk `📊 Analityka` dodany we **wszystkich trzech stanach** (loading, error, loaded):
```html
<button class="btn" data-action="open-analytics">📊 Analityka</button>
```

Pułapka: stany loading/error mają 8-spacyjne wcięcie, stan loaded — 6-spacyjne. `replace_all` pominął loaded stan. Sprawdź wszystkie trzy sekcje jeśli edytujesz ten plik.

### `lacrosse-stats-v2/handlers.js`

Nowe handlery:
```javascript
'open-analytics':             () => goAnalytics(),
'analytics-retry':            () => loadAnalyticsData(),
'go-home-from-analytics':     () => goHome(),
'analytics-heatmap-toggle':   (mode) => { APP.analyticsHeatmapMode = mode; render(); },
'analytics-filter-change':    (val, el) => {
  const field = el.dataset.field;
  if (field && field in APP.analyticsFilters) {
    APP.analyticsFilters[field] = val;
    if (field === 'tournament') APP.analyticsFilters.team = '';  // reset drużyny
    render();
  }
},
'open-viewer-from-analytics': (matchId) => {
  // Mecze z analyticsData mogą nie być w DATA.scheduledMatches — synchronizuj
  const am = APP.analyticsData && APP.analyticsData.matches;
  if (am) {
    am.forEach(m => {
      if (!DATA.scheduledMatches.find(x => String(x.id) === String(m.id)))
        DATA.scheduledMatches.push(m);
    });
  }
  openMatchViewer(matchId);
},
```

Listener `change` rozszerzony o `input[type=date]` i specjalną ścieżkę dla `analytics-filter-change` (przekazuje `(target.value, target)` zamiast `(target.dataset.arg)`).

### `lacrosse-stats-v2/render-analytics.js` (nowy plik)

~338 linii. Funkcje publiczne i prywatne:

| Funkcja | Opis |
|---|---|
| `renderAnalytics(root)` | Główna — 3 stany: loading / error / loaded |
| `_renderAnalyticsFilters(f, tournaments, allTeams, allPeriods)` | HTML 5 kontrolek filtrów |
| `_analyticsApplyFilters(events, f)` | Filtrowanie eventów wg filtrów |
| `_analyticsAllTeams(matches, tournament)` | Unikalne drużyny, opcjonalnie filtrowane do turnieju |
| `_analyticsAllPeriods(events)` | Unikalne okresy, posortowane (1,2,3,4,OT1,...) |
| `_renderAnalyticsBody(filtered, matches, f)` | Kontener 3 sekcji |
| `computeAnalyticsStats(events)` | Oblicza total/goals/onTarget/zones/periods |
| `_renderAnalyticsStats(filtered, f)` | Siatka statystyk + tabele rozkładu |
| `_renderAnalyticsHeatmap(filteredTeamEvents, allMatchEvents, f)` | Shot chart z togglem |
| `_buildAnalyticsHalfFieldSvg(events, teamName)` | SVG przez trick-mock-match |
| `_renderAnalyticsMatchHistory(filtered, allEvents, allMatches, f)` | Tabela historia meczów |

**Trick-mock-match dla shot chart:**
```javascript
const mockMatch  = { id: '__analytics__', team_A: name, team_B: '__other__', team_A_side: 'left' };
const mockEvents = events.map(e => Object.assign({}, e, { team_event: name }));
const mockViewer = { view_mode: 'half-A', display_mode: 'heatmap' };
drawHalfFieldChart(svg, mockMatch, mockEvents, mockViewer);
```
Działa bo `drawHalfFieldChart` przyjmuje `(svg, match, events, viewer)` — eventy mają już attacker-relative coords i nie wymagają przeliczenia.

### `lacrosse-stats-v2/build.sh` i `index.html`

`render-analytics.js` dodany po `render-viewer.js`, przed `render-admin.js`.

### `lacrosse-stats-v2/styles.css`

Nowe klasy na końcu pliku:
`.analytics-content`, `.analytics-filters`, `.filter-row`, `.analytics-section`, `.stats-grid`, `.stat-box`, `.stat-val`, `.stat-lbl`, `.heatmap-toggle`, `.match-history-table`, `.match-result`, `.match-history-row.won/lost/drew`, `.btn-sm`

---

## Model danych analityki

`APP.analyticsData` (załadowane przez `loadAnalyticsData()`):
```
{
  events:      [...],   // wszystkie eventy ze wszystkich meczów
  matches:     [...],   // wszystkie mecze (scheduled_matches)
  tournaments: [...],   // wszystkie turnieje
}
```

`APP.analyticsFilters` (stan filtrów, persystuje podczas sesji analityki):
```
{ tournament: '', team: '', dateFrom: '', dateTo: '', period: '' }
```

Filtrowanie odbywa się w całości po stronie JS (`_analyticsApplyFilters`). Backend zwraca dane bez filtrów.

---

## Znane pułapki i nieoczywistości

| # | Problem | Rozwiązanie |
|---|---|---|
| P-01 | `gasCall()` zwraca `data` bezpośrednio, nie `{ok, data}` | Używaj `events \|\| []`, nie `evRes.data` |
| P-02 | `CONFIG.SHEET_EVENTS` (nie `CONFIG.SHEETS.EVENTS`) | Grep po `CONFIG.SHEET_` w Code.gs żeby sprawdzić nazwy kluczy |
| P-03 | Przycisk analityki znikał po załadowaniu Home | Render-home.js ma 3 osobne bloki HTML dla stanów — każdy musi mieć przycisk |
| P-04 | `String(e.period) !== f.period` — period bywa number w danych GAS | Zawsze `String()` przy porównaniu period |
| P-05 | `drawHalfFieldChart` — prawdziwy podpis to `(svg, match, events, viewer)` | Handoff V4 miał błędny podpis; zawsze czytaj aktualny `field-svg.js` |
| P-06 | `open-viewer-from-analytics` musi synchronizować `DATA.scheduledMatches` | Viewer szuka meczu w `DATA`, nie w `APP.analyticsData` |
| P-07 | `clasp run seedDummyData` nie działa bez API-executable deployment | Uruchom ręcznie z edytora GAS |

---

## Dane testowe w bazie

Zasiane przez `seedDummyData()` (2026-05-19):
- **Liga Polska Kobiet 2025** — 6 meczów, 4 drużyny (Orłice Warszawa, Amazonki Kraków, Lwy Gdańsk, Sokoły Wrocław)
- **Puchar Polski 2025** — 4 mecze, te same drużyny
- **Turniej Europejski Katowice** — 4 mecze, drużyny Polska, Czechy, Austria, Słowacja

Razem: ~563 eventy. Mecze mają status `finished`, daty 2025-09-06 do 2025-11-22.

---

## Potencjalne kolejne kroki (V5)

| Pomysł | Uwagi |
|---|---|
| Porównanie drużyn side-by-side | Celowo odrzucone w V4, zbyt złożone UI |
| Eksport CSV / PDF | Poza zakresem V4 |
| Statystyki indywidualne zawodniczek | Wymaga pola `player` w modelu eventów |
| Paginacja / lazy loading | Zbędne przy skali turnieju (~2000 eventów max) |
| Filtr po statusie meczu (finished / live) | Proste rozszerzenie `_analyticsApplyFilters` |
