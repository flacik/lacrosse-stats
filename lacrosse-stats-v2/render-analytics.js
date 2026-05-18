'use strict';

function renderAnalytics(root) {

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (APP.analyticsLoading) {
    root.innerHTML = `
      <div class="app-header">
        <h1>Lacrosse Stats</h1>
        <button class="btn" data-action="go-home-from-analytics">← Home</button>
      </div>
      <div class="home-content">
        <div class="loading-state">
          <div class="spinner">⏳</div>
          <p>Ładowanie danych…</p>
        </div>
      </div>`;
    return;
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (APP.analyticsError) {
    root.innerHTML = `
      <div class="app-header">
        <h1>Lacrosse Stats</h1>
        <button class="btn" data-action="go-home-from-analytics">← Home</button>
      </div>
      <div class="home-content">
        <div class="error-state">
          <p>⚠ Błąd ładowania: ${escapeHtml(APP.analyticsError)}</p>
          <button class="btn btn-primary" data-action="analytics-retry">↺ Spróbuj ponownie</button>
        </div>
      </div>`;
    return;
  }

  // ── Loaded ───────────────────────────────────────────────────────────────────
  const { events, matches, tournaments } = APP.analyticsData;
  const f = APP.analyticsFilters;

  const filtered  = _analyticsApplyFilters(events, f);
  const allTeams  = _analyticsAllTeams(matches, f.tournament);
  const allPeriods = _analyticsAllPeriods(events);

  root.innerHTML = `
    <div class="app-header">
      <h1>Analityka historyczna</h1>
      <button class="btn" data-action="go-home-from-analytics">← Home</button>
    </div>
    <div class="analytics-content">
      ${_renderAnalyticsFilters(f, tournaments, allTeams, allPeriods)}
      ${filtered.length === 0
        ? '<div class="empty">Brak danych dla wybranych filtrów.</div>'
        : _renderAnalyticsBody(filtered, matches, f)
      }
    </div>`;
}

// ── Filtry ───────────────────────────────────────────────────────────────────

function _renderAnalyticsFilters(f, tournaments, allTeams, allPeriods) {
  const tourOptions = ['<option value="">Wszystkie turnieje</option>',
    ...tournaments.map(t => `<option value="${escapeHtml(t.name)}" ${f.tournament === t.name ? 'selected' : ''}>${escapeHtml(t.name)}</option>`)
  ].join('');

  const teamOptions = ['<option value="">Wszystkie drużyny</option>',
    ...allTeams.map(t => `<option value="${escapeHtml(t)}" ${f.team === t ? 'selected' : ''}>${escapeHtml(t)}</option>`)
  ].join('');

  const periodOptions = ['<option value="">Wszystkie okresy</option>',
    ...allPeriods.map(p => `<option value="${escapeHtml(p)}" ${f.period === p ? 'selected' : ''}>${periodLabel(p)}</option>`)
  ].join('');

  return `
    <div class="analytics-filters">
      <div class="filter-row">
        <label>Turniej
          <select data-action="analytics-filter-change" data-field="tournament">${tourOptions}</select>
        </label>
        <label>Drużyna
          <select data-action="analytics-filter-change" data-field="team">${teamOptions}</select>
        </label>
        <label>Okres (kwarta)
          <select data-action="analytics-filter-change" data-field="period">${periodOptions}</select>
        </label>
        <label>Data od
          <input type="date" data-action="analytics-filter-change" data-field="dateFrom" value="${f.dateFrom}">
        </label>
        <label>Data do
          <input type="date" data-action="analytics-filter-change" data-field="dateTo" value="${f.dateTo}">
        </label>
      </div>
    </div>`;
}

// ── Logika filtrów ────────────────────────────────────────────────────────────

function _analyticsApplyFilters(events, f) {
  return events.filter(e => {
    if (f.tournament && e.tournament !== f.tournament) return false;
    if (f.team      && e.team_event !== f.team)        return false;
    if (f.period    && String(e.period) !== f.period)  return false;
    if (f.dateFrom  && e.match_date < f.dateFrom)      return false;
    if (f.dateTo    && e.match_date > f.dateTo)        return false;
    return true;
  });
}

function _analyticsAllTeams(matches, tournament) {
  const set = new Set();
  matches.forEach(m => {
    if (tournament && m.tournament !== tournament) return;
    if (m.team_A) set.add(m.team_A);
    if (m.team_B) set.add(m.team_B);
  });
  return [...set].sort();
}

function _analyticsAllPeriods(events) {
  const set = new Set();
  events.forEach(e => { if (e.period) set.add(String(e.period)); });
  return [...set].sort((a, b) => {
    const aOT = a.startsWith('OT'), bOT = b.startsWith('OT');
    if (!aOT && !bOT) return Number(a) - Number(b);
    if (!aOT) return -1;
    if (!bOT) return 1;
    return Number(a.slice(2)) - Number(b.slice(2));
  });
}

// ── Sekcje wynikowe ───────────────────────────────────────────────────────────

function _renderAnalyticsBody(filtered, matches, f) {
  return `
    <div class="analytics-body">
      ${_renderAnalyticsStats(filtered, f)}
      ${_renderAnalyticsHeatmap(filtered, APP.analyticsData.events, f)}
      ${_renderAnalyticsMatchHistory(filtered, APP.analyticsData.events, APP.analyticsData.matches, f)}
    </div>`;
}

// ── Statystyki (H-05) ─────────────────────────────────────────────────────────

function computeAnalyticsStats(events) {
  const total     = events.length;
  const goals     = events.filter(e => e.result === 'gol').length;
  const onTarget  = events.filter(e => e.result === 'celny' || e.result === 'gol').length;
  const offTarget = events.filter(e => e.result === 'niecelny').length;
  const manUp     = events.filter(e => e.man_up).length;
  const manDown   = events.filter(e => e.man_down).length;

  const pct   = total > 0 ? Math.round((goals / total) * 100) : 0;
  const onPct = total > 0 ? Math.round((onTarget / total) * 100) : 0;

  const zones = {};
  events.forEach(e => {
    if (!e.zone_name) return;
    zones[e.zone_name] = (zones[e.zone_name] || 0) + 1;
  });

  const periods = {};
  events.forEach(e => {
    if (!e.period) return;
    const p = String(e.period);
    if (!periods[p]) periods[p] = { total: 0, goals: 0 };
    periods[p].total++;
    if (e.result === 'gol') periods[p].goals++;
  });

  return { total, goals, onTarget, offTarget, manUp, manDown, pct, onPct, zones, periods };
}

function _renderAnalyticsStats(filtered, f) {
  if (filtered.length === 0) return '';
  const s = computeAnalyticsStats(filtered);
  const teamLabel = f.team || 'Wszystkie drużyny';

  const zoneOrder = ['attack-center','attack-left','attack-right',
                     'midfield-center','midfield-left','midfield-right','own-half'];
  const zoneLabels = {
    'attack-center':   'Atak środek',
    'attack-left':     'Atak lewo',
    'attack-right':    'Atak prawo',
    'midfield-center': 'Midfield środek',
    'midfield-left':   'Midfield lewo',
    'midfield-right':  'Midfield prawo',
    'own-half':        'Własna połowa',
  };

  const zoneRows = zoneOrder
    .filter(z => s.zones[z])
    .map(z => {
      const cnt = s.zones[z];
      const pct = Math.round((cnt / s.total) * 100);
      return `<tr><td>${zoneLabels[z]}</td><td>${cnt}</td><td>${pct}%</td></tr>`;
    }).join('');

  const periodRows = Object.entries(s.periods)
    .sort(([a],[b]) => {
      const aOT = a.startsWith('OT'), bOT = b.startsWith('OT');
      if (!aOT && !bOT) return Number(a) - Number(b);
      if (!aOT) return -1; if (!bOT) return 1;
      return Number(a.slice(2)) - Number(b.slice(2));
    })
    .map(([p, v]) => `<tr><td>${periodLabel(p)}</td><td>${v.total}</td><td>${v.goals}</td><td>${v.total > 0 ? Math.round(v.goals/v.total*100) : 0}%</td></tr>`)
    .join('');

  return `
    <section class="analytics-section">
      <h2>Statystyki: ${escapeHtml(teamLabel)}</h2>
      <div class="stats-grid">
        <div class="stat-box"><div class="stat-val">${s.total}</div><div class="stat-lbl">Strzałów</div></div>
        <div class="stat-box"><div class="stat-val">${s.goals}</div><div class="stat-lbl">Bramek</div></div>
        <div class="stat-box"><div class="stat-val">${s.onTarget}</div><div class="stat-lbl">Celnych</div></div>
        <div class="stat-box"><div class="stat-val">${s.pct}%</div><div class="stat-lbl">Skuteczność</div></div>
        <div class="stat-box"><div class="stat-val">${s.onPct}%</div><div class="stat-lbl">% celnych</div></div>
        ${s.manUp   ? `<div class="stat-box"><div class="stat-val">${s.manUp}</div><div class="stat-lbl">Man-up</div></div>` : ''}
        ${s.manDown ? `<div class="stat-box"><div class="stat-val">${s.manDown}</div><div class="stat-lbl">Man-down</div></div>` : ''}
      </div>
      ${zoneRows ? `
        <h3>Rozkład po strefach</h3>
        <table class="stats-table">
          <thead><tr><th>Strefa</th><th>Strzałów</th><th>%</th></tr></thead>
          <tbody>${zoneRows}</tbody>
        </table>` : ''}
      ${periodRows ? `
        <h3>Rozkład po kwartach</h3>
        <table class="stats-table">
          <thead><tr><th>Kwarta</th><th>Strzałów</th><th>Bramek</th><th>%</th></tr></thead>
          <tbody>${periodRows}</tbody>
        </table>` : ''}
    </section>`;
}

// ── Heatmapa (H-06) ───────────────────────────────────────────────────────────

function _renderAnalyticsHeatmap(filteredTeamEvents, allMatchEvents, f) {
  if (!f.team) {
    return `<section class="analytics-section">
      <h2>Shot chart</h2>
      <p class="empty">Wybierz drużynę żeby zobaczyć shot chart.</p>
    </section>`;
  }

  const mode = APP.analyticsHeatmapMode || 'fired';
  const matchIds = new Set(filteredTeamEvents.map(e => String(e.match_id)));

  let chartEvents;
  if (mode === 'fired') {
    chartEvents = filteredTeamEvents;
  } else {
    chartEvents = allMatchEvents.filter(e =>
      matchIds.has(String(e.match_id)) && e.team_event !== f.team
    );
    if (f.period)   chartEvents = chartEvents.filter(e => String(e.period) === f.period);
    if (f.dateFrom) chartEvents = chartEvents.filter(e => e.match_date >= f.dateFrom);
    if (f.dateTo)   chartEvents = chartEvents.filter(e => e.match_date <= f.dateTo);
  }

  const svgContent = _buildAnalyticsHalfFieldSvg(chartEvents, f.team);

  return `
    <section class="analytics-section">
      <h2>Shot chart — ${escapeHtml(f.team)}</h2>
      <div class="heatmap-toggle">
        <button class="btn ${mode === 'fired'    ? 'btn-primary' : ''}" data-action="analytics-heatmap-toggle" data-arg="fired">Strzały oddane</button>
        <button class="btn ${mode === 'conceded' ? 'btn-primary' : ''}" data-action="analytics-heatmap-toggle" data-arg="conceded">Strzały stracone</button>
      </div>
      <div class="field-half">${svgContent}</div>
    </section>`;
}

function _buildAnalyticsHalfFieldSvg(events, teamName) {
  // Reużywa drawHalfFieldChart z field-svg.js.
  // Eventy mają attacker-relative coords — drawHalfFieldChart mapuje je bezpośrednio
  // (cx = shot_y * 540, cy = (1 - shot_x) * 600) bez przeliczania team_A_side.
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 540 660');
  svg.setAttribute('class', 'field field-half');
  svg.setAttribute('xmlns', ns);

  const name = teamName || 'Drużyna';
  const mockMatch  = { id: '__analytics__', team_A: name, team_B: '__other__', team_A_side: 'left' };
  const mockEvents = events.map(e => Object.assign({}, e, { team_event: name }));
  const mockViewer = { view_mode: 'half-A', display_mode: 'heatmap' };

  drawHalfFieldChart(svg, mockMatch, mockEvents, mockViewer);
  return svg.outerHTML;
}

// ── Historia meczów (H-07) ────────────────────────────────────────────────────

function _renderAnalyticsMatchHistory(filtered, allEvents, allMatches, f) {
  if (!f.team) return '';

  let relevantMatches = allMatches.filter(m =>
    m.team_A === f.team || m.team_B === f.team
  );
  if (f.tournament) relevantMatches = relevantMatches.filter(m => m.tournament === f.tournament);
  if (f.dateFrom)   relevantMatches = relevantMatches.filter(m => m.match_date >= f.dateFrom);
  if (f.dateTo)     relevantMatches = relevantMatches.filter(m => m.match_date <= f.dateTo);

  relevantMatches = [...relevantMatches].sort((a, b) => String(b.match_date).localeCompare(String(a.match_date)));

  if (relevantMatches.length === 0) return '';

  const rows = relevantMatches.map(m => {
    const mEvents = allEvents.filter(e => String(e.match_id) === String(m.id));
    const goalsA  = mEvents.filter(e => e.team_event === m.team_A && e.result === 'gol').length;
    const goalsB  = mEvents.filter(e => e.team_event === m.team_B && e.result === 'gol').length;
    const hasEvents = mEvents.length > 0;
    const opponent = m.team_A === f.team ? m.team_B : m.team_A;
    const myGoals  = m.team_A === f.team ? goalsA : goalsB;
    const oppGoals = m.team_A === f.team ? goalsB : goalsA;
    const result   = !hasEvents ? '— : —' : `${myGoals} : ${oppGoals}`;
    const won  = hasEvents && myGoals > oppGoals;
    const drew = hasEvents && myGoals === oppGoals;

    return `
      <tr class="match-history-row ${won ? 'won' : drew ? 'drew' : hasEvents ? 'lost' : ''}">
        <td>${escapeHtml(String(m.match_date))}</td>
        <td>${escapeHtml(m.tournament || '—')}</td>
        <td>${escapeHtml(opponent)}</td>
        <td class="match-result">${result}</td>
        <td><button class="btn btn-sm" data-action="open-viewer-from-analytics" data-arg="${escapeHtml(String(m.id))}">Podgląd</button></td>
      </tr>`;
  }).join('');

  return `
    <section class="analytics-section">
      <h2>Historia meczów — ${escapeHtml(f.team)}</h2>
      <table class="stats-table match-history-table">
        <thead><tr><th>Data</th><th>Turniej</th><th>Rywal</th><th>Wynik</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}
