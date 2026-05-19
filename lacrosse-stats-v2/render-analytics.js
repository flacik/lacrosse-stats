'use strict';

function renderAnalytics(root) {

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (APP.analyticsLoading) {
    root.innerHTML = `
      <div class="app-header">
        <h1>Lacrosse Stats</h1>
        <button class="btn" data-action="go-home-from-analytics">← Home</button>
        <button class="btn" data-action="toggle-dark-mode" id="theme-toggle" title="Przełącz tryb ciemny">🌙</button>
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
        <button class="btn" data-action="toggle-dark-mode" id="theme-toggle" title="Przełącz tryb ciemny">🌙</button>
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
      <button class="btn" data-action="toggle-dark-mode" id="theme-toggle" title="Przełącz tryb ciemny">🌙</button>
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

// ── V5-03: Porównanie ofensywa vs defensywa ───────────────────────────────────

function _buildConcededEvents(filteredTeamEvents, allEvents, f) {
  const matchIds = new Set(filteredTeamEvents.map(e => String(e.match_id)));
  let conceded = allEvents.filter(e =>
    matchIds.has(String(e.match_id)) && e.team_event !== f.team
  );
  if (f.period)   conceded = conceded.filter(e => String(e.period) === f.period);
  if (f.dateFrom) conceded = conceded.filter(e => e.match_date >= f.dateFrom);
  if (f.dateTo)   conceded = conceded.filter(e => e.match_date <= f.dateTo);
  return conceded;
}

function _renderOffenseDefenseComparison(filteredTeamEvents, allEvents, f) {
  if (!f.team) return '';

  const conceded = _buildConcededEvents(filteredTeamEvents, allEvents, f);
  const off = computeAnalyticsStats(filteredTeamEvents);
  const def = computeAnalyticsStats(conceded);

  function statRow(label, offVal, defVal, lowerIsBetter) {
    const offBetter = lowerIsBetter ? offVal <= defVal : offVal >= defVal;
    const defBetter = lowerIsBetter ? defVal <= offVal : defVal >= offVal;
    const offCls = offBetter && offVal !== defVal ? 'cmp-better' : '';
    const defCls = defBetter && offVal !== defVal ? 'cmp-better' : '';
    return `<tr>
      <td class="cmp-label">${label}</td>
      <td class="cmp-val ${offCls}">${offVal}</td>
      <td class="cmp-val ${defCls}">${defVal}</td>
    </tr>`;
  }

  const rows = [
    statRow('Strzałów',      off.total,        def.total,        false),
    statRow('Bramek',        off.goals,         def.goals,        true),
    statRow('Celnych',       off.onTarget,      def.onTarget,     false),
    statRow('Skuteczność %', `${off.pct}%`,     `${def.pct}%`,   false),
    statRow('% celnych',     `${off.onPct}%`,   `${def.onPct}%`, false),
  ].join('');

  return `
    <section class="analytics-section">
      <h2>Atak vs obrona — ${escapeHtml(f.team)}</h2>
      <table class="stats-table cmp-table">
        <thead>
          <tr>
            <th></th>
            <th>⚔ Atak (oddane)</th>
            <th>🛡 Obrona (stracone)</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${def.total === 0
        ? '<p class="empty" style="font-size:13px">Brak danych o strzałach straconych dla wybranych filtrów.</p>'
        : ''}
    </section>`;
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

  const situations = {
    manUp:    { events: events.filter(e => e.man_up),
                label: 'Man-up (przewaga)', icon: '▲' },
    manDown:  { events: events.filter(e => e.man_down),
                label: 'Man-down (osłabienie)', icon: '▼' },
    even:     { events: events.filter(e => !e.man_up && !e.man_down),
                label: 'Wyrównana', icon: '=' },
  };
  Object.values(situations).forEach(sit => {
    const t = sit.events.length;
    const g = sit.events.filter(e => e.result === 'gol').length;
    sit.total = t;
    sit.goals = g;
    sit.pct   = t > 0 ? Math.round((g / t) * 100) : 0;
  });

  return { total, goals, onTarget, offTarget, manUp, manDown, pct, onPct, zones, periods, situations };
}

// ── V5-01: Donut chart wyników strzałów ──────────────────────────────────────

function _renderShotResultDonut(s) {
  if (s.total === 0) return '';

  const segments = [
    { count: s.goals,                 color: '#16a34a', label: 'Gole' },
    { count: s.onTarget - s.goals,    color: '#3b82f6', label: 'Celne' },
    { count: s.offTarget,             color: '#9ca3af', label: 'Niecelne' },
  ].filter(seg => seg.count > 0);

  const cx = 80, cy = 80, r = 60, innerR = 38;
  let arcs = '';
  let angle = -Math.PI / 2;

  segments.forEach(seg => {
    const sweep = (seg.count / s.total) * 2 * Math.PI;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(angle + sweep);
    const y2 = cy + r * Math.sin(angle + sweep);
    const xi1 = cx + innerR * Math.cos(angle);
    const yi1 = cy + innerR * Math.sin(angle);
    const xi2 = cx + innerR * Math.cos(angle + sweep);
    const yi2 = cy + innerR * Math.sin(angle + sweep);
    const large = sweep > Math.PI ? 1 : 0;

    arcs += `<path d="
      M ${x1} ${y1}
      A ${r} ${r} 0 ${large} 1 ${x2} ${y2}
      L ${xi2} ${yi2}
      A ${innerR} ${innerR} 0 ${large} 0 ${xi1} ${yi1}
      Z" fill="${seg.color}" opacity="0.9"/>`;
    angle += sweep;
  });

  const legendItems = segments.map(seg => {
    const pct = Math.round((seg.count / s.total) * 100);
    return `<div class="donut-legend-item">
      <span class="donut-dot" style="background:${seg.color}"></span>
      <span>${seg.label}: ${seg.count} (${pct}%)</span>
    </div>`;
  }).join('');

  return `
    <div class="donut-wrapper">
      <svg width="160" height="160" viewBox="0 0 160 160">
        ${arcs}
        <text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="18" font-weight="700" fill="#111">${s.total}</text>
        <text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="10" fill="#6b7280">strzałów</text>
      </svg>
      <div class="donut-legend">${legendItems}</div>
    </div>`;
}

// ── V5-04: Sytuacje man-up / man-down ────────────────────────────────────────

function _renderSituationStats(s) {
  const { situations } = s;
  const hasSpecial = situations.manUp.total > 0 || situations.manDown.total > 0;
  if (!hasSpecial) return '';

  const cards = [situations.manUp, situations.even, situations.manDown].map(sit => `
    <div class="stat-box sit-card">
      <div class="sit-icon">${sit.icon}</div>
      <div class="stat-lbl">${sit.label}</div>
      <div class="sit-numbers">
        <span class="sit-goals">${sit.goals} bramek</span>
        <span class="sit-total">/ ${sit.total} strzałów</span>
      </div>
      <div class="stat-val sit-pct">${sit.pct}%</div>
    </div>`).join('');

  return `
    <div style="margin-bottom: 16px;">
      <h3 style="font-size:14px;color:#6b7280;margin:0 0 8px">Skuteczność per sytuacja</h3>
      <div class="stats-grid">${cards}</div>
    </div>`;
}

// ── V5-02: Słupki skuteczności per kwarta ────────────────────────────────────

function _renderPeriodBarChart(periods) {
  const entries = Object.entries(periods)
    .sort(([a], [b]) => {
      const aOT = a.startsWith('OT'), bOT = b.startsWith('OT');
      if (!aOT && !bOT) return Number(a) - Number(b);
      if (!aOT) return -1; if (!bOT) return 1;
      return Number(a.slice(2)) - Number(b.slice(2));
    });

  if (entries.length === 0) return '';

  const maxPct = Math.max(...entries.map(([, v]) => v.total > 0 ? Math.round(v.goals / v.total * 100) : 0), 1);
  const barW = 40, gap = 14, chartH = 120, labelH = 20, valH = 18;
  const totalW = entries.length * (barW + gap) + gap;

  const bars = entries.map(([p, v], i) => {
    const pct = v.total > 0 ? Math.round(v.goals / v.total * 100) : 0;
    const barH = Math.max(Math.round((pct / maxPct) * chartH), pct > 0 ? 4 : 2);
    const x = gap + i * (barW + gap);
    const barY = valH + chartH - barH;
    return `
      <rect x="${x}" y="${barY}" width="${barW}" height="${barH}" rx="3" fill="#3b82f6" opacity="0.85"/>
      <text x="${x + barW / 2}" y="${valH + chartH - barH - 4}" text-anchor="middle" font-size="11" fill="#1d4ed8" font-weight="600">${pct > 0 ? pct + '%' : ''}</text>
      <text x="${x + barW / 2}" y="${valH + chartH + labelH - 4}" text-anchor="middle" font-size="11" fill="#6b7280">${periodLabel(p)}</text>
      <text x="${x + barW / 2}" y="${valH + chartH + labelH + 12}" text-anchor="middle" font-size="10" fill="#9ca3af">${v.goals}/${v.total}</text>`;
  }).join('');

  return `
    <div class="period-chart-wrapper">
      <svg width="${totalW}" height="${valH + chartH + labelH + 20}" viewBox="0 0 ${totalW} ${valH + chartH + labelH + 20}">
        ${bars}
        <line x1="0" y1="${valH + chartH}" x2="${totalW}" y2="${valH + chartH}" stroke="#e5e7eb" stroke-width="1"/>
      </svg>
    </div>`;
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
      ${_renderShotResultDonut(s)}
      ${_renderSituationStats(s)}
      ${Object.keys(s.periods).length > 0 ? `
        <h3>Skuteczność per kwarta</h3>
        ${_renderPeriodBarChart(s.periods)}` : ''}
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

  let svgContent;
  if (mode === 'efficiency') {
    svgContent = _buildZoneEfficiencySvg(filteredTeamEvents);
  } else {
    svgContent = _buildAnalyticsHalfFieldSvg(chartEvents, f.team);
  }

  return `
    <section class="analytics-section">
      <h2>Shot chart — ${escapeHtml(f.team)}</h2>
      <div class="heatmap-toggle">
        <button class="btn ${mode === 'fired'      ? 'btn-primary' : ''}" data-action="analytics-heatmap-toggle" data-arg="fired">Strzały oddane</button>
        <button class="btn ${mode === 'conceded'   ? 'btn-primary' : ''}" data-action="analytics-heatmap-toggle" data-arg="conceded">Strzały stracone</button>
        <button class="btn ${mode === 'efficiency' ? 'btn-primary' : ''}" data-action="analytics-heatmap-toggle" data-arg="efficiency">Skuteczność stref</button>
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

// ── V5-05: Zone efficiency overlay ───────────────────────────────────────────

function _buildZoneEfficiencySvg(events) {
  // SVG attacker-relative: cx = shot_y * 540, cy = (1 - shot_x) * 600
  // Boundaries match algorithms.js: ATTACK_THRESHOLD=0.4368, left/center/right at 1/3 and 2/3
  const ZONE_RECTS = {
    'attack-left':     { x: 0,   y: 0,      w: 180, h: 337.92 },
    'attack-center':   { x: 180, y: 0,      w: 180, h: 337.92 },
    'attack-right':    { x: 360, y: 0,      w: 180, h: 337.92 },
    'midfield-left':   { x: 0,   y: 337.92, w: 180, h: 262.08 },
    'midfield-center': { x: 180, y: 337.92, w: 180, h: 262.08 },
    'midfield-right':  { x: 360, y: 337.92, w: 180, h: 262.08 },
  };
  const ZONE_LABELS = {
    'attack-left':     'Atak L',   'attack-center':   'Atak Ś',  'attack-right':    'Atak P',
    'midfield-left':   'Mid L',    'midfield-center': 'Mid Ś',   'midfield-right':  'Mid P',
  };

  const stats = {};
  Object.keys(ZONE_RECTS).forEach(z => { stats[z] = { total: 0, goals: 0 }; });
  events.forEach(e => {
    if (!e.zone_name || !stats[e.zone_name]) return;
    stats[e.zone_name].total++;
    if (e.result === 'gol') stats[e.zone_name].goals++;
  });

  function effColor(pct) {
    if (pct === 0) return 'rgba(209,213,219,0.5)';
    if (pct < 25)  return `rgba(249,115,22,${0.25 + pct / 100})`;
    return `rgba(22,163,74,${0.3 + pct / 100 * 0.6})`;
  }

  const zoneOverlays = Object.entries(ZONE_RECTS).map(([zone, rect]) => {
    const s = stats[zone];
    const pct = s.total > 0 ? Math.round((s.goals / s.total) * 100) : 0;
    const color = effColor(pct);
    const lx = rect.x + rect.w / 2;
    const ly = rect.y + rect.h / 2;
    return `
      <rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" fill="${color}"/>
      <text x="${lx}" y="${ly - 8}" text-anchor="middle" dominant-baseline="middle" font-size="11" fill="white" font-weight="600" opacity="0.9">${ZONE_LABELS[zone]}</text>
      <text x="${lx}" y="${ly + 10}" text-anchor="middle" dominant-baseline="middle" font-size="18" fill="white" font-weight="700">${pct}%</text>
      <text x="${lx}" y="${ly + 26}" text-anchor="middle" dominant-baseline="middle" font-size="10" fill="white" opacity="0.8">${s.goals}g / ${s.total}s</text>`;
  }).join('');

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 540 660');
  svg.setAttribute('class', 'field field-half');
  svg.setAttribute('xmlns', ns);
  svg.innerHTML = `
    <text x="270" y="28" text-anchor="middle" font-size="16" font-weight="700" fill="#6b7280">Skuteczność per strefa</text>
    <g transform="translate(0, 50)">
      <rect x="0" y="0" width="540" height="600" fill="#9bbf85"/>
      <line x1="0" y1="600" x2="540" y2="600" stroke="white" stroke-width="3"/>
      <line x1="0" y1="337.92" x2="540" y2="337.92" stroke="white" stroke-width="1.5" stroke-dasharray="6,4" opacity="0.85"/>
      <line x1="0" y1="163.64" x2="540" y2="163.64" stroke="white" stroke-width="1.5" opacity="0.7"/>
      <line x1="0" y1="0" x2="540" y2="0" stroke="white" stroke-width="3"/>
      <line x1="0" y1="0" x2="0" y2="600" stroke="white" stroke-width="3"/>
      <line x1="540" y1="0" x2="540" y2="600" stroke="white" stroke-width="3"/>
      <line x1="180" y1="0" x2="180" y2="600" stroke="white" stroke-width="1" opacity="0.5"/>
      <line x1="360" y1="0" x2="360" y2="600" stroke="white" stroke-width="1" opacity="0.5"/>
      <circle cx="270" cy="163.64" r="27" fill="#9bbf85" stroke="white" stroke-width="2"/>
      <line x1="258" y1="163.64" x2="282" y2="163.64" stroke="white" stroke-width="5"/>
      ${zoneOverlays}
    </g>
    <g transform="translate(4, 618)">
      <rect x="0" y="0" width="14" height="10" rx="2" fill="rgba(209,213,219,0.5)" stroke="#ccc" stroke-width="0.5"/>
      <text x="18" y="9" font-size="9" fill="#6b7280">0%</text>
      <rect x="40" y="0" width="14" height="10" rx="2" fill="rgba(249,115,22,0.5)"/>
      <text x="58" y="9" font-size="9" fill="#6b7280">&lt;25%</text>
      <rect x="90" y="0" width="14" height="10" rx="2" fill="rgba(22,163,74,0.7)"/>
      <text x="108" y="9" font-size="9" fill="#6b7280">25%+</text>
    </g>`;
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
