# Lacrosse Stats — Stan po V5 (wizualizacje analityki)

**Ostatnia aktualizacja:** 2026-05-19
**Wdrożony deployment ID:** `AKfycbz3_lNbzPPteOgOIUxSNuPpo_KgXtSI5ws8JWGD6s5Z2a-NXTePsxtghSg3kiiRfHrwdA`
**Wersja GAS:** 29
**Branch:** main (commit `e0c195a`)

Przed pracą w nowej sesji przeczytaj też:
- `CLAUDE.md` — konwencje, build workflow, deploy
- `V4-STATE.md` — architektura ekranu analityki, model danych, pułapki

---

## Co zostało zaimplementowane w V5

Pięć nowych wizualizacji w ekranie analityki (`APP.screen === 'analytics'`). Zero zmian w backendzie (`gas/Code.gs`).

### V5-01: Donut chart wyników strzałów

Funkcja: `_renderShotResultDonut(s)` w `render-analytics.js`

Trzy segmenty SVG: gol (#16a34a) / celny (#3b82f6) / niecelny (#9ca3af). Liczba strzałów w centrum. Legenda z procentami po prawej. Pojawia się pod tabelą rozkładu po strefach, nad kartami sytuacji.

### V5-02: Słupki skuteczności per kwarta

Funkcja: `_renderPeriodBarChart(periods)` w `render-analytics.js`

SVG bar chart — każdy słupek = kwarta, wysokość proporcjonalna do % bramek. Wartość % nad słupkiem, etykieta (Q1…/OT1…) i licznik (bramki/strzały) pod nim. Pojawia się **po** tabeli rozkładu po kwartach (tabela zachowana).

### V5-04: Karty man-up / man-down / wyrównana

Funkcja: `_renderSituationStats(s)` w `render-analytics.js`

Rozszerzone `computeAnalyticsStats` o pole `situations` (obliczenia per kategoria). Trzy karty (▲ Man-up / = Wyrównana / ▼ Man-down) z liczbą bramek, strzałów i % skuteczności. Sekcja **ukryta** gdy brak eventów man-up/man-down (nie ma sensu pokazywać jednej karty "wyrównana").

### V5-05: Skuteczność stref (3. tryb shot charta)

Funkcja: `_buildZoneEfficiencySvg(events)` w `render-analytics.js`

Trzeci przycisk toggle `data-arg="efficiency"`. Boisko podzielone na 6 stref (attack/midfield × left/center/right), każda zakolorowana: szary (0%) → pomarańczowy (<25%) → zielony (25%+). Wyświetla % bramek, licznik gole/strzały. Granice stref zgodne z `algorithms.js` (ATTACK_THRESHOLD=0.4368, 1/3 i 2/3 shot_y).

### Dane testowe (`data.js`)

Generator `makeSampleEvents()` oparty na deterministycznym PRNG (Mulberry32, seed per mecz). Produkuje ~450 eventów dla 15 meczów:
- **Liga PL Wiosna 2026** — 6 meczów (Hawks, Vikings, Hussars, Eagles), daty 2026-02-08 → 2026-02-22
- **Puchar Polski 2026** — 4 mecze, te same drużyny, daty 2026-03-08 → 2026-03-15
- **Sparingi** — 3 mecze (Wolves, Bears), daty 2026-03-22 → 2026-03-29

Rozkład wyników: ~35% gol z attack-center, malejący do ~9% z midfield. Man-up 10%, man-down ~8% eventów.

---

## Zmienione pliki w V5

| Plik | Opis zmian |
|---|---|
| `lacrosse-stats-v2/render-analytics.js` | +289 linii — 5 nowych funkcji, rozszerzenie `computeAnalyticsStats`, modyfikacja `_renderAnalyticsBody` i `_renderAnalyticsHeatmap` |
| `lacrosse-stats-v2/styles.css` | +21 linii — klasy dla donut, sit-card, period-chart, cmp-table |
| `lacrosse-stats-v2/data.js` | Przepisany `makeSampleEvents` — 15 meczów, seeded PRNG |
| `lacrosse-stats-v2/dist.html` | Przebudowany przez `./build.sh` |

### Nowe funkcje w `render-analytics.js`

| Funkcja | Wiersze | Opis |
|---|---|---|
| `_renderShotResultDonut(s)` | ~55 | SVG donut chart wyników |
| `_renderSituationStats(s)` | ~25 | Karty man-up/man-down |
| `_renderPeriodBarChart(periods)` | ~35 | SVG bar chart per kwarta |
| `_buildConcededEvents(...)` | ~10 | Helper strzałów straconych (kod zachowany) |
| `_renderOffenseDefenseComparison(...)` | ~45 | Atak vs obrona (kod zachowany, **nie wywołany**) |
| `_buildZoneEfficiencySvg(events)` | ~70 | SVG choropleth 6 stref |

**Uwaga:** `_renderOffenseDefenseComparison` jest zaimplementowane w pliku ale **nie jest wywoływane** — usunięte z `_renderAnalyticsBody` na prośbę użytkownika (sekcja była mało czytelna przy małej ilości danych). Można przywrócić w V6 jednym wywołaniem.

---

## Architektura po V5 — `_renderAnalyticsBody`

```javascript
function _renderAnalyticsBody(filtered, matches, f) {
  return `
    <div class="analytics-body">
      ${_renderAnalyticsStats(filtered, f)}       // statystyki + donut + karty + słupki
      ${_renderAnalyticsHeatmap(...)}              // shot chart (fired / conceded / efficiency)
      ${_renderAnalyticsMatchHistory(...)}         // historia meczów
    </div>`;
}
```

Kolejność sekcji w `_renderAnalyticsStats`:
1. stats-grid (kafelki)
2. Tabela rozkładu po strefach
3. Tabela rozkładu po kwartach
4. Donut chart (V5-01)
5. Karty sytuacji man-up/down (V5-04, warunkowe)
6. Bar chart skuteczności per kwarta (V5-02)

---

## Znane pułapki i nieoczywistości

Wszystkie pułapki z V4 nadal aktualne (patrz `V4-STATE.md`). Nowe:

| # | Problem | Rozwiązanie |
|---|---|---|
| P-08 | `_buildZoneEfficiencySvg` używa `svg.innerHTML` a nie `createElementNS` per element | Działa bo `innerHTML` na SVG jest dozwolone w nowoczesnych przeglądarkach; nie przepisuj na DOM API |
| P-09 | `situations.manUp.events` zawiera surowe obiekty eventów — nie serializuj ich | `computeAnalyticsStats` trzyma `situations[x].events` (tablicę) w obiekcie `s`; nie przekazuj `s` do JSON.stringify |
| P-10 | Dane testowe w `data.js` są wyłącznie lokalne — PROD korzysta z GAS/Sheets | Nie implementuj logiki opartej na stałych ID meczów (`m3`, `m4`…) z SAMPLE_DATA |

---

## Potencjalne kolejne kroki (V6)

| Pomysł | Uwagi |
|---|---|
| Przywrócić "Atak vs obrona" | Kod gotowy w `_renderOffenseDefenseComparison` — dodać wywołanie w `_renderAnalyticsBody`, może poprawić UI |
| Forma drużyny W/D/L | Sekwencja kółek zielony/szary/czerwony — odrzucone w V5, zaplanowane na V6 |
| Eksport CSV | Prosta iteracja po `filtered` events → CSV string → download |
| Trend skuteczności w czasie | Skuteczność per mecz posortowana chronologicznie — wykres liniowy |
| Filtry w shot charcie "Skuteczność stref" | Aktualnie strefa efficiency zawsze pokazuje `filteredTeamEvents`; można podpiąć toggle fired/conceded |
