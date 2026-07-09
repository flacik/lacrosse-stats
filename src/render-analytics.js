'use strict';

function renderAnalytics(root) {

  if (APP.analyticsLoading) {
    root.innerHTML = `
      <div class="app-header">
        <h1>Lacrosse Stats</h1>
        <button class="btn" data-action="go-home-from-analytics">${T('nav.home')}</button>
        ${_langToggleBtn()}
        <button class="btn" data-action="toggle-dark-mode" id="theme-toggle" title="${T('nav.theme')}">🌙</button>
      </div>
      <div class="home-content">
        <div class="loading-state">
          <div class="spinner">⏳</div>
          <p>${T('loading.data')}</p>
        </div>
      </div>`;
    return;
  }

  if (APP.analyticsError) {
    root.innerHTML = `
      <div class="app-header">
        <h1>Lacrosse Stats</h1>
        <button class="btn" data-action="go-home-from-analytics">${T('nav.home')}</button>
        ${_langToggleBtn()}
        <button class="btn" data-action="toggle-dark-mode" id="theme-toggle" title="${T('nav.theme')}">🌙</button>
      </div>
      <div class="home-content">
        <div class="error-state">
          <p>⚠ ${T('error.loading')}: ${escapeHtml(APP.analyticsError)}</p>
          <button class="btn btn-primary" data-action="analytics-retry">${T('btn.retry')}</button>
        </div>
      </div>`;
    return;
  }

  const { events, matches, tournaments } = APP.analyticsData;
  const f    = APP.analyticsFilters;
  const mode = APP.analyticsMode || 'single';

  const allTeams   = _analyticsAllTeams(matches, f.tournament);
  const allPeriods = _analyticsAllPeriods(events);

  const modeTabs = `
    <div class="analytics-mode-tabs">
      <button class="btn ${mode === 'single'  ? 'btn-primary' : ''}" data-action="analytics-mode-toggle" data-arg="single">${T('analytics.mode.single')}</button>
      <button class="btn ${mode === 'compare' ? 'btn-primary' : ''}" data-action="analytics-mode-toggle" data-arg="compare">${T('analytics.mode.compare')}</button>
    </div>`;

  if (mode === 'compare') {
    root.innerHTML = `
      <div class="app-header">
        <h1>${T('analytics.title')}</h1>
        <button class="btn" data-action="go-home-from-analytics">${T('nav.home')}</button>
        ${_langToggleBtn()}
        <button class="btn" data-action="toggle-dark-mode" id="theme-toggle" title="${T('nav.theme')}">🌙</button>
        ${(f.team && f.team2) ? `<button class="btn" data-action="open-compare-report" title="${T('nav.pdf')}">${T('nav.pdf')}</button>` : ''}
      </div>
      <div class="analytics-content">
        ${modeTabs}
        ${_renderAnalyticsFilters(f, tournaments, allTeams, allPeriods, 'compare')}
        ${_renderAnalyticsCompareBody(f, events, matches)}
      </div>`;
    return;
  }

  const filtered = _analyticsApplyFilters(events, f);
  root.innerHTML = `
    <div class="app-header">
      <h1>${T('analytics.title')}</h1>
      <button class="btn" data-action="go-home-from-analytics">${T('nav.home')}</button>
      ${_langToggleBtn()}
      <button class="btn" data-action="toggle-dark-mode" id="theme-toggle" title="${T('nav.theme')}">🌙</button>
      <button class="btn" data-action="open-analytics-report" title="${T('nav.pdf')}">${T('nav.pdf')}</button>
    </div>
    <div class="analytics-content">
      ${modeTabs}
      ${_renderAnalyticsFilters(f, tournaments, allTeams, allPeriods, 'single')}
      ${filtered.length === 0
        ? `<div class="empty">${T('analytics.empty')}</div>`
        : _renderAnalyticsBody(filtered, matches, f)
      }
    </div>`;
}

// ── Filters ──────────────────────────────────────────────────────────────────

function _renderAnalyticsFilters(f, tournaments, allTeams, allPeriods, mode) {
  const tourOptions = [`<option value="">${T('select.all_tournaments')}</option>`,
    ...tournaments.map(t => `<option value="${escapeHtml(t.name)}" ${f.tournament === t.name ? 'selected' : ''}>${escapeHtml(t.name)}</option>`)
  ].join('');

  const teamOptions = [`<option value="">${T('select.all_teams')}</option>`,
    ...allTeams.map(t => `<option value="${escapeHtml(t)}" ${f.team === t ? 'selected' : ''}>${escapeHtml(t)}</option>`)
  ].join('');

  const team1Options = [`<option value="">${T('analytics.team1_ph')}</option>`,
    ...allTeams.map(t => `<option value="${escapeHtml(t)}" ${f.team === t ? 'selected' : ''}>${escapeHtml(t)}</option>`)
  ].join('');

  const team2Options = [`<option value="">${T('analytics.team2_ph')}</option>`,
    ...allTeams.map(t => `<option value="${escapeHtml(t)}" ${f.team2 === t ? 'selected' : ''}>${escapeHtml(t)}</option>`)
  ].join('');

  const periodOptions = [`<option value="">${T('select.all_periods')}</option>`,
    ...allPeriods.map(p => `<option value="${escapeHtml(p)}" ${f.period === p ? 'selected' : ''}>${periodLabel(p)}</option>`)
  ].join('');

  const teamSelectors = mode === 'compare' ? `
    <label>${T('analytics.team1')}
      <select data-action="analytics-filter-change" data-field="team">${team1Options}</select>
    </label>
    <label>${T('analytics.team2')}
      <select data-action="analytics-filter-change" data-field="team2">${team2Options}</select>
    </label>` : `
    <label>${T('field.team')}
      <select data-action="analytics-filter-change" data-field="team">${teamOptions}</select>
    </label>`;

  return `
    <div class="analytics-filters">
      <div class="filter-row">
        <label>${T('field.tournament')}
          <select data-action="analytics-filter-change" data-field="tournament">${tourOptions}</select>
        </label>
        ${teamSelectors}
        <label>${T('analytics.period_filter')}
          <select data-action="analytics-filter-change" data-field="period">${periodOptions}</select>
        </label>
        <label>${T('field.date_from')}
          <input type="date" data-action="analytics-filter-change" data-field="dateFrom" value="${f.dateFrom}">
        </label>
        <label>${T('field.date_to')}
          <input type="date" data-action="analytics-filter-change" data-field="dateTo" value="${f.dateTo}">
        </label>
      </div>
    </div>`;
}

// ── Filter logic ─────────────────────────────────────────────────────────────

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

// ── Result sections ───────────────────────────────────────────────────────────

function _renderAnalyticsBody(filtered, matches, f) {
  return `
    <div class="analytics-body">
      ${_renderAnalyticsStats(filtered, f)}
      ${_renderAnalyticsGoalies(filtered, APP.analyticsData.events, APP.analyticsData.matches, f)}
      ${_renderAnalyticsHeatmap(filtered, APP.analyticsData.events, f)}
      ${_renderAnalyticsMatchHistory(filtered, APP.analyticsData.events, APP.analyticsData.matches, f)}
    </div>`;
}

// ── Goalkeepers ───────────────────────────────────────────────────────────────

function _computeGoalieAnalytics(filteredShots, allEvents, allMatches, f, sort) {
  const matchIds = new Set(filteredShots.map(e => String(e.match_id)));

  const matchMap = {};
  allMatches.forEach(m => { matchMap[String(m.id)] = m; });

  let shotsOnGoal = allEvents.filter(e =>
    isShotEvent(e) &&
    matchIds.has(String(e.match_id)) &&
    (e.result === 'gol' || e.result === 'celny')
  );
  if (f.period)   shotsOnGoal = shotsOnGoal.filter(e => String(e.period) === f.period);
  if (f.dateFrom) shotsOnGoal = shotsOnGoal.filter(e => e.match_date >= f.dateFrom);
  if (f.dateTo)   shotsOnGoal = shotsOnGoal.filter(e => e.match_date <= f.dateTo);

  const goalieSets = allEvents.filter(e =>
    e.event_type === 'goalie_set' &&
    matchIds.has(String(e.match_id))
  );

  function getDefendingTeam(shot) {
    const m = matchMap[String(shot.match_id)];
    if (!m) return null;
    if (shot.team_event === m.team_A) return m.team_B;
    if (shot.team_event === m.team_B) return m.team_A;
    return null;
  }

  function getActiveGoalie(teamName, matchId, period) {
    const sets = goalieSets
      .filter(e => e.team_event === teamName && String(e.match_id) === matchId)
      .sort((a, b) => getPeriodOrder(a.period) - getPeriodOrder(b.period));
    let number = null;
    for (const s of sets) {
      if (getPeriodOrder(s.period) <= getPeriodOrder(period)) number = s.goalie_number;
    }
    return number;
  }

  const byKey = {};
  const matchesPerKey = {};

  for (const shot of shotsOnGoal) {
    const defTeam = getDefendingTeam(shot);
    if (!defTeam) continue;
    if (f.team && defTeam !== f.team) continue;

    const num = getActiveGoalie(defTeam, String(shot.match_id), shot.period) || '__none__';
    const key = `${defTeam}::${num}`;

    if (!byKey[key]) {
      byKey[key] = { team: defTeam, number: num, saves: 0, goalsAgainst: 0, shotsOnGoal: 0, byPeriod: {} };
      matchesPerKey[key] = new Set();
    }
    const g = byKey[key];
    if (shot.result === 'celny') g.saves++;
    if (shot.result === 'gol')   g.goalsAgainst++;
    g.shotsOnGoal++;
    matchesPerKey[key].add(String(shot.match_id));

    const p = String(shot.period);
    if (!g.byPeriod[p]) g.byPeriod[p] = { saves: 0, goalsAgainst: 0, shotsOnGoal: 0 };
    if (shot.result === 'celny') g.byPeriod[p].saves++;
    if (shot.result === 'gol')   g.byPeriod[p].goalsAgainst++;
    g.byPeriod[p].shotsOnGoal++;
  }

  const list = Object.entries(byKey).map(([key, g]) => ({
    team:         g.team,
    number:       g.number === '__none__' ? null : g.number,
    saves:        g.saves,
    goalsAgainst: g.goalsAgainst,
    shotsOnGoal:  g.shotsOnGoal,
    savePct:      g.shotsOnGoal > 0 ? Math.round(g.saves / g.shotsOnGoal * 100) : null,
    matchCount:   matchesPerKey[key].size,
    byPeriod:     g.byPeriod,
  })).sort((a, b) => {
    const s = sort || { col: 'savePct', dir: 'desc' };
    let aVal, bVal;
    if (s.col.startsWith('p:')) {
      const p = s.col.slice(2);
      const ap = a.byPeriod[p], bp = b.byPeriod[p];
      aVal = ap && ap.shotsOnGoal > 0 ? ap.saves / ap.shotsOnGoal : -1;
      bVal = bp && bp.shotsOnGoal > 0 ? bp.saves / bp.shotsOnGoal : -1;
    } else if (s.col === 'number') {
      aVal = a.number !== null ? (isNaN(Number(a.number)) ? a.number : Number(a.number)) : (s.dir === 'asc' ? Infinity : -Infinity);
      bVal = b.number !== null ? (isNaN(Number(b.number)) ? b.number : Number(b.number)) : (s.dir === 'asc' ? Infinity : -Infinity);
      if (typeof aVal === 'string' || typeof bVal === 'string') {
        const sa = String(aVal), sb = String(bVal);
        return s.dir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa);
      }
    } else {
      aVal = a[s.col] !== null ? a[s.col] : -1;
      bVal = b[s.col] !== null ? b[s.col] : -1;
    }
    if (aVal === bVal) return 0;
    return s.dir === 'desc' ? bVal - aVal : aVal - bVal;
  });

  const totalSaves       = list.reduce((s, g) => s + g.saves, 0);
  const totalGoals       = list.reduce((s, g) => s + g.goalsAgainst, 0);
  const totalShotsOnGoal = list.reduce((s, g) => s + g.shotsOnGoal, 0);
  const avgSavePct       = totalShotsOnGoal > 0
    ? Math.round(totalSaves / totalShotsOnGoal * 100)
    : null;

  return { list, totalSaves, totalGoals, totalShotsOnGoal, avgSavePct, matchCount: matchIds.size };
}

function _renderAnalyticsGoalies(filtered, allEvents, allMatches, f) {
  if (filtered.length === 0) return '';

  const sort = APP.analyticsGoalieSort;
  const data = _computeGoalieAnalytics(filtered, allEvents, allMatches, f, sort);
  if (data.totalShotsOnGoal === 0) return '';

  const teamLabel = f.team ? escapeHtml(f.team) : null;

  function sortTh(label, col, style) {
    const active = sort.col === col;
    const arrow  = active ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : '';
    const base   = 'cursor:pointer;user-select:none;white-space:nowrap;';
    const hlCss  = active ? 'text-decoration:underline;' : '';
    const extra  = style ? style + ';' : '';
    return `<th style="${base}${hlCss}${extra}" data-action="analytics-goalie-sort" data-arg="${col}">${label}${arrow}</th>`;
  }

  function savePctAttr(pct) {
    if (pct === null) return '';
    if (pct >= 70) return 'style="color:#15803d;font-weight:700"';
    if (pct >= 55) return 'style="color:#1d4ed8;font-weight:700"';
    return 'style="color:#b91c1c;font-weight:700"';
  }

  function savePctBar(pct) {
    if (pct === null) return '';
    const color = pct >= 70 ? '#16a34a' : pct >= 55 ? '#3b82f6' : '#dc2626';
    const w = Math.round(pct * 0.6);
    return `<span style="display:inline-block;width:60px;height:5px;background:#e5e7eb;border-radius:3px;vertical-align:middle;margin-left:6px;"><span style="display:block;width:${w}px;height:5px;border-radius:3px;background:${color};"></span></span>`;
  }

  const rankStyles = [
    'background:#fde68a;color:#92400e',
    'background:#d1d5db;color:#374151',
    'background:#fed7aa;color:#9a3412',
  ];

  const mainRows = data.list.map((g, i) => {
    const rankStyle  = i < 3 ? rankStyles[i] : 'background:#e5e7eb;color:#4b5563';
    const numLabel   = g.number !== null ? `#${escapeHtml(g.number)}` : '—';
    const pctLabel   = g.savePct !== null ? `${g.savePct}%` : '—';
    const subLabel   = escapeHtml(g.team);
    return `
      <tr>
        <td><span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;font-size:11px;font-weight:600;${rankStyle}">${i + 1}</span></td>
        <td style="line-height:1.3">
          <span style="font-weight:600;font-size:14px">${numLabel}</span>
          <span style="font-size:11px;color:#6b7280;display:block;margin-top:1px">${subLabel}</span>
        </td>
        <td class="num">${g.matchCount}</td>
        <td class="num">${g.shotsOnGoal}</td>
        <td class="num">${g.saves}</td>
        <td class="num">${g.goalsAgainst}</td>
        <td class="num"><span ${savePctAttr(g.savePct)}>${pctLabel}</span>${savePctBar(g.savePct)}</td>
      </tr>`;
  }).join('');

  let periodTable = '';
  if (!f.period && data.list.length >= 1 && data.list.length <= 5) {
    const periodSet = new Set();
    data.list.forEach(g => Object.keys(g.byPeriod).forEach(p => periodSet.add(p)));
    const periods = [...periodSet].sort((a, b) => getPeriodOrder(a) - getPeriodOrder(b));
    if (periods.length > 1) {
      const periodHeaders = periods.map(p => sortTh(escapeHtml(periodLabel(p)), 'p:' + p)).join('');
      const periodRows = data.list.map(g => {
        const numLabel = g.number !== null ? `#${escapeHtml(g.number)}` : '—';
        const cells = periods.map(p => {
          const pd = g.byPeriod[p];
          if (!pd || pd.shotsOnGoal === 0) return `<td class="num" style="color:#9ca3af">—</td>`;
          const pct = Math.round(pd.saves / pd.shotsOnGoal * 100);
          return `<td class="num" ${savePctAttr(pct)}>${pct}%</td>`;
        }).join('');
        return `<tr><td style="line-height:1.3"><span style="font-weight:600">${numLabel}</span><span style="font-size:11px;color:#6b7280;display:block;margin-top:1px">${escapeHtml(g.team)}</span></td>${cells}</tr>`;
      }).join('');
      periodTable = `
        <h3>${T('analytics.save_pct_period')}</h3>
        <table class="stats-table">
          <thead><tr>${sortTh(T('analytics.goalies.goalie'), 'number')}${periodHeaders}</tr></thead>
          <tbody>${periodRows}</tbody>
        </table>`;
    }
  }

  const avgLabel   = data.avgSavePct !== null ? `${data.avgSavePct}%` : '—';
  const matchBadge = `<span style="display:inline-block;font-size:11px;font-weight:600;background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:4px;margin-left:8px;vertical-align:middle">${data.matchCount} ${T('analytics.goalies.matches_badge')}</span>`;
  const heading    = teamLabel
    ? `${T('analytics.goalies.title')}: ${teamLabel}`
    : T('analytics.goalies.title');

  return `
    <section class="analytics-section">
      <h2>${heading}${matchBadge}</h2>
      <div class="stats-grid">
        <div class="stat-box"><div class="stat-val">${data.list.length}</div><div class="stat-lbl">${T('analytics.goalies.count')}</div></div>
        <div class="stat-box"><div class="stat-val">${data.totalShotsOnGoal}</div><div class="stat-lbl">${T('analytics.goalies.shots_on')}</div></div>
        <div class="stat-box"><div class="stat-val">${data.totalSaves}</div><div class="stat-lbl">${T('analytics.goalies.saves')}</div></div>
        <div class="stat-box"><div class="stat-val">${data.totalGoals}</div><div class="stat-lbl">${T('analytics.goalies.goals_ag')}</div></div>
        <div class="stat-box"><div class="stat-val">${avgLabel}</div><div class="stat-lbl">${T('analytics.goalies.avg_save')}</div></div>
      </div>
      <h3>${T('analytics.goalies.per')}</h3>
      <table class="stats-table">
        <thead>
          <tr>
            <th style="width:28px">#</th>
            ${sortTh(T('analytics.goalies.goalie'), 'number')}
            ${sortTh(T('analytics.goalies.matches'), 'matchCount')}
            ${sortTh(T('analytics.goalies.shots_th'), 'shotsOnGoal')}
            ${sortTh(T('analytics.goalies.saves_th'), 'saves')}
            ${sortTh(T('analytics.goalies.goals_th'), 'goalsAgainst')}
            ${sortTh(T('analytics.goalies.save_pct'), 'savePct')}
          </tr>
        </thead>
        <tbody>${mainRows}</tbody>
      </table>
      ${periodTable}
    </section>`;
}

// ── Offense vs Defense ────────────────────────────────────────────────────────

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
    statRow(T('analytics.stats.shots'),    off.total,        def.total,        false),
    statRow(T('analytics.stats.goals'),    off.goals,        def.goals,        true),
    statRow(T('analytics.stats.on_target'),off.onTarget,     def.onTarget,     false),
    statRow(T('analytics.stats.rate') + ' %', `${off.pct}%`, `${def.pct}%`,   false),
    statRow(T('analytics.stats.on_pct'),   `${off.onPct}%`,  `${def.onPct}%`, false),
  ].join('');

  return `
    <section class="analytics-section">
      <h2>${T('analytics.atk_def.title')} — ${escapeHtml(f.team)}</h2>
      <table class="stats-table cmp-table">
        <thead>
          <tr>
            <th></th>
            <th>${T('analytics.atk')}</th>
            <th>${T('analytics.def')}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${def.total === 0
        ? `<p class="empty" style="font-size:13px">${T('analytics.def_no_data')}</p>`
        : ''}
    </section>`;
}

// ── Stats computation ─────────────────────────────────────────────────────────

function computeAnalyticsStats(allEvents) {
  const events = allEvents.filter(isShotEvent);
  const total     = events.length;
  const goals     = events.filter(e => e.result === 'gol').length;
  const onTarget  = events.filter(e => e.result === 'celny' || e.result === 'gol').length;
  const offTarget = events.filter(e => e.result === 'niecelny').length;
  const manUp     = events.filter(e => e.man_up).length;
  const manDown   = events.filter(e => e.man_down).length;
  const fastBreak = events.filter(e => e.fast_break).length;

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
    manUp:     { events: events.filter(e => e.man_up),
                 label: T('analytics.sit.man_up'), icon: '▲' },
    manDown:   { events: events.filter(e => e.man_down),
                 label: T('analytics.sit.man_down'), icon: '▼' },
    even:      { events: events.filter(e => !e.man_up && !e.man_down),
                 label: T('analytics.sit.even'), icon: '=' },
    fastBreak: { events: events.filter(e => e.fast_break),
                 label: T('analytics.sit.fast_break'), icon: '→' },
  };
  Object.values(situations).forEach(sit => {
    const t = sit.events.length;
    const g = sit.events.filter(e => e.result === 'gol').length;
    sit.total = t;
    sit.goals = g;
    sit.pct   = t > 0 ? Math.round((g / t) * 100) : 0;
  });

  return { total, goals, onTarget, offTarget, manUp, manDown, fastBreak, pct, onPct, zones, periods, situations };
}

// ── Shot result donut ─────────────────────────────────────────────────────────

function _renderShotResultDonut(s) {
  if (s.total === 0) return '';

  const segments = [
    { count: s.goals,                 color: '#16a34a', label: T('analytics.donut.goals') },
    { count: s.onTarget - s.goals,    color: '#3b82f6', label: T('analytics.donut.on_target') },
    { count: s.offTarget,             color: '#9ca3af', label: T('analytics.donut.off_target') },
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
        <text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="10" fill="#6b7280">${T('analytics.donut.shots')}</text>
      </svg>
      <div class="donut-legend">${legendItems}</div>
    </div>`;
}

// ── Situation stats ───────────────────────────────────────────────────────────

function _renderSituationStats(s) {
  const { situations } = s;
  const hasSpecial = situations.manUp.total > 0 || situations.manDown.total > 0 || situations.fastBreak.total > 0;
  if (!hasSpecial) return '';

  const cards = [situations.manUp, situations.even, situations.manDown, situations.fastBreak].filter(s => s.total > 0 || s === situations.even).map(sit => `
    <div class="stat-box sit-card">
      <div class="sit-icon">${sit.icon}</div>
      <div class="stat-lbl">${sit.label}</div>
      <div class="sit-numbers">
        <span class="sit-goals">${sit.goals} ${T('analytics.sit.goals')}</span>
        <span class="sit-total">/ ${sit.total} ${T('analytics.donut.shots')}</span>
      </div>
      <div class="stat-val sit-pct">${sit.pct}%</div>
    </div>`).join('');

  return `
    <div style="margin-bottom: 16px;">
      <h3 style="font-size:14px;color:#6b7280;margin:0 0 8px">${T('analytics.sit.title')}</h3>
      <div class="stats-grid">${cards}</div>
    </div>`;
}

// ── Period bar chart ──────────────────────────────────────────────────────────

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
  const teamLabel = f.team || T('select.all_teams');
  const matchCount = new Set(filtered.map(e => String(e.match_id))).size;
  const drawsWon    = filtered.filter(e => e.event_type === 'draw').length;
  const groundballs = filtered.filter(e => e.event_type === 'groundball').length;

  const zoneOrder = ['attack-center','attack-left','attack-right',
                     'midfield-center','midfield-left','midfield-right','own-half'];
  const zoneLabels = {
    'attack-center':   T('zone.attack_center'),
    'attack-left':     T('zone.attack_left'),
    'attack-right':    T('zone.attack_right'),
    'midfield-center': T('zone.midfield_center'),
    'midfield-left':   T('zone.midfield_left'),
    'midfield-right':  T('zone.midfield_right'),
    'own-half':        T('zone.own_half'),
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
      <h2>${T('analytics.stats.title')}: ${escapeHtml(teamLabel)}</h2>
      <div class="stats-grid">
        <div class="stat-box"><div class="stat-val">${matchCount}</div><div class="stat-lbl">${T('analytics.stats.matches')}</div></div>
        <div class="stat-box"><div class="stat-val">${s.total}</div><div class="stat-lbl">${T('analytics.stats.shots')}</div></div>
        <div class="stat-box"><div class="stat-val">${s.goals}</div><div class="stat-lbl">${T('analytics.stats.goals')}</div></div>
        <div class="stat-box"><div class="stat-val">${s.onTarget}</div><div class="stat-lbl">${T('analytics.stats.on_target')}</div></div>
        <div class="stat-box"><div class="stat-val">${s.pct}%</div><div class="stat-lbl">${T('analytics.stats.rate')}</div></div>
        <div class="stat-box"><div class="stat-val">${s.onPct}%</div><div class="stat-lbl">${T('analytics.stats.on_pct')}</div></div>
        ${s.manUp     ? `<div class="stat-box"><div class="stat-val">${s.manUp}</div><div class="stat-lbl">Man-up</div></div>` : ''}
        ${s.manDown   ? `<div class="stat-box"><div class="stat-val">${s.manDown}</div><div class="stat-lbl">Man-down</div></div>` : ''}
        ${s.fastBreak ? `<div class="stat-box"><div class="stat-val">${s.fastBreak}</div><div class="stat-lbl">Fast break</div></div>` : ''}
        ${drawsWon    ? `<div class="stat-box"><div class="stat-val">${drawsWon}</div><div class="stat-lbl">${T('analytics.stats.draws')}</div></div>` : ''}
        ${groundballs ? `<div class="stat-box"><div class="stat-val">${groundballs}</div><div class="stat-lbl">${T('analytics.stats.groundballs')}</div></div>` : ''}
      </div>
      ${zoneRows ? `
        <h3>${T('analytics.zones.title')}</h3>
        <table class="stats-table">
          <thead><tr><th>${T('analytics.zones.zone')}</th><th>${T('analytics.stats.shots')}</th><th>%</th></tr></thead>
          <tbody>${zoneRows}</tbody>
        </table>` : ''}
      ${periodRows ? `
        <h3>${T('analytics.periods.title')}</h3>
        <table class="stats-table">
          <thead><tr><th>${T('analytics.periods.quarter')}</th><th>${T('analytics.stats.shots')}</th><th>${T('analytics.stats.goals')}</th><th>%</th></tr></thead>
          <tbody>${periodRows}</tbody>
        </table>` : ''}
      ${_renderShotResultDonut(s)}
      ${_renderSituationStats(s)}
      ${Object.keys(s.periods).length > 0 ? `
        <h3>${T('analytics.eff_period')}</h3>
        ${_renderPeriodBarChart(s.periods)}` : ''}
      ${_renderAnalyticsProgressionChart(filtered, f)}
    </section>`;
}

function _renderAnalyticsProgressionChart(filtered, f) {
  if (!f.team) {
    return `<h3>${T('analytics.progression.title')}</h3><p class="empty">${T('analytics.progression.select_team')}</p>`;
  }
  const metrics        = APP.analyticsProgressionMetrics;
  const conceded        = _buildConcededEvents(filtered, APP.analyticsData.events, f);
  const periodsScored   = computePeriodMetricStats(filtered);
  const periodsConceded = computePeriodMetricStats(conceded);
  const cum = buildCumulativeMetricSeries(periodsScored, periodsConceded, metrics);
  const toggle = progressionMetricToggle('analytics-set-progression-metric', metrics);
  if (cum.labels.length <= 1) return `<h3>${T('analytics.progression.title')}</h3>${toggle}`;
  const svg = buildMultiProgressionChartSvg(cum.labels,
    { label: T('analytics.progression.scored'),   color: '#1d4ed8' },
    { label: T('analytics.progression.conceded'), color: '#b91c1c' },
    cum.series);
  return `<h3>${T('analytics.progression.title')}</h3>${toggle}<div class="progression-chart-wrapper">${svg}</div>`;
}

// ── Heatmap ───────────────────────────────────────────────────────────────────

function _renderAnalyticsHeatmap(filteredTeamEvents, allMatchEvents, f) {
  if (!f.team) {
    return `<section class="analytics-section">
      <h2>Shot chart</h2>
      <p class="empty">${T('analytics.no_heatmap')}</p>
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
        <button class="btn ${mode === 'fired'      ? 'btn-primary' : ''}" data-action="analytics-heatmap-toggle" data-arg="fired">${T('heatmap.fired')}</button>
        <button class="btn ${mode === 'conceded'   ? 'btn-primary' : ''}" data-action="analytics-heatmap-toggle" data-arg="conceded">${T('heatmap.conceded')}</button>
        <button class="btn ${mode === 'efficiency' ? 'btn-primary' : ''}" data-action="analytics-heatmap-toggle" data-arg="efficiency">${T('heatmap.efficiency')}</button>
      </div>
      <div class="field-half">${svgContent}</div>
    </section>`;
}

function _buildAnalyticsHalfFieldSvg(events, teamName) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 540 660');
  svg.setAttribute('class', 'field field-half');
  svg.setAttribute('xmlns', ns);

  const name = teamName || T('field.team');
  const mockMatch  = { id: '__analytics__', team_A: name, team_B: '__other__', team_A_side: 'left' };
  const mockEvents = events.map(e => Object.assign({}, e, { team_event: name }));
  const mockViewer = { view_mode: 'half-A', display_mode: 'heatmap' };

  drawHalfFieldChart(svg, mockMatch, mockEvents, mockViewer);
  return svg.outerHTML;
}

// ── Zone efficiency overlay ───────────────────────────────────────────────────

function _buildZoneEfficiencySvg(events) {
  const ZONE_RECTS = {
    'attack-left':     { x: 0,   y: 0,      w: 180, h: 337.92 },
    'attack-center':   { x: 180, y: 0,      w: 180, h: 337.92 },
    'attack-right':    { x: 360, y: 0,      w: 180, h: 337.92 },
    'midfield-left':   { x: 0,   y: 337.92, w: 180, h: 262.08 },
    'midfield-center': { x: 180, y: 337.92, w: 180, h: 262.08 },
    'midfield-right':  { x: 360, y: 337.92, w: 180, h: 262.08 },
  };
  const ZONE_LABELS = {
    'attack-left':     T('zone.attack_left_short'),
    'attack-center':   T('zone.attack_center_short'),
    'attack-right':    T('zone.attack_right_short'),
    'midfield-left':   T('zone.midfield_left_short'),
    'midfield-center': T('zone.midfield_center_short'),
    'midfield-right':  T('zone.midfield_right_short'),
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
    <text x="270" y="28" text-anchor="middle" font-size="16" font-weight="700" fill="#6b7280">${T('zone.eff_title')}</text>
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

// ── Match history ─────────────────────────────────────────────────────────────

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
        <td><button class="btn btn-sm" data-action="open-viewer-from-analytics" data-arg="${escapeHtml(String(m.id))}">${T('btn.view')}</button></td>
      </tr>`;
  }).join('');

  return `
    <section class="analytics-section">
      <h2>${T('analytics.history.title')} — ${escapeHtml(f.team)}</h2>
      <table class="stats-table match-history-table">
        <thead><tr><th>${T('analytics.history.date')}</th><th>${T('analytics.history.tournament')}</th><th>${T('analytics.history.opponent')}</th><th>${T('analytics.history.result')}</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

// ── Team comparison ───────────────────────────────────────────────────────────

function _computeCompareData(f, events, matches) {
  const f2 = Object.assign({}, f, { team: f.team2 });
  const e1 = _analyticsApplyFilters(events, f);
  const e2 = _analyticsApplyFilters(events, f2);

  const m1count = new Set(e1.map(e => String(e.match_id))).size;
  const m2count = new Set(e2.map(e => String(e.match_id))).size;

  const h2hMatches = matches.filter(m => {
    if (f.tournament && m.tournament !== f.tournament) return false;
    if (f.dateFrom   && m.match_date < f.dateFrom)     return false;
    if (f.dateTo     && m.match_date > f.dateTo)       return false;
    return (m.team_A === f.team && m.team_B === f.team2) ||
           (m.team_A === f.team2 && m.team_B === f.team);
  });
  const h2hIds = new Set(h2hMatches.map(m => String(m.id)));

  let h2hE1 = events.filter(e => h2hIds.has(String(e.match_id)) && e.team_event === f.team);
  let h2hE2 = events.filter(e => h2hIds.has(String(e.match_id)) && e.team_event === f.team2);
  if (f.period)   { h2hE1 = h2hE1.filter(e => String(e.period) === f.period);  h2hE2 = h2hE2.filter(e => String(e.period) === f.period); }
  if (f.dateFrom) { h2hE1 = h2hE1.filter(e => e.match_date >= f.dateFrom);     h2hE2 = h2hE2.filter(e => e.match_date >= f.dateFrom); }
  if (f.dateTo)   { h2hE1 = h2hE1.filter(e => e.match_date <= f.dateTo);       h2hE2 = h2hE2.filter(e => e.match_date <= f.dateTo); }

  const t1MatchIds = new Set(e1.map(e => String(e.match_id)));
  const t2MatchIds = new Set(e2.map(e => String(e.match_id)));
  let conc1 = events.filter(e => t1MatchIds.has(String(e.match_id)) && e.team_event !== f.team);
  let conc2 = events.filter(e => t2MatchIds.has(String(e.match_id)) && e.team_event !== f.team2);
  if (f.period)   { conc1 = conc1.filter(e => String(e.period) === f.period);  conc2 = conc2.filter(e => String(e.period) === f.period); }
  if (f.dateFrom) { conc1 = conc1.filter(e => e.match_date >= f.dateFrom);     conc2 = conc2.filter(e => e.match_date >= f.dateFrom); }
  if (f.dateTo)   { conc1 = conc1.filter(e => e.match_date <= f.dateTo);       conc2 = conc2.filter(e => e.match_date <= f.dateTo); }

  const s1   = computeAnalyticsStats(e1);
  const s2   = computeAnalyticsStats(e2);
  const def1 = computeAnalyticsStats(conc1);
  const def2 = computeAnalyticsStats(conc2);

  return { e1, e2, conc1, conc2, s1, s2, def1, def2, h2hMatches, h2hE1, h2hE2, m1count, m2count };
}

function _renderAnalyticsCompareBody(f, events, matches) {
  if (!f.team || !f.team2) {
    return `<div class="empty" style="padding:32px;text-align:center">
      ${!f.team ? T('compare.choose_t1') : T('compare.choose_t2')}
    </div>`;
  }
  if (f.team === f.team2) {
    return `<div class="empty" style="padding:32px;text-align:center">${T('compare.different_teams')}</div>`;
  }

  const d = _computeCompareData(f, events, matches);

  return `
    ${_renderCmpStatsSection(d.s1, d.s2, d.def1, d.def2, d.m1count, d.m2count, f)}
    ${_renderCmpHeatmaps(d.e1, d.e2, d.conc1, d.conc2, f)}
    ${d.h2hMatches.length > 0 ? _renderCmpH2H(d.h2hMatches, d.h2hE1, d.h2hE2, f, events) : _renderCmpH2HEmpty(f)}
    ${_renderCmpGoalies(d.e1, d.e2, f, events, matches)}
    ${_renderCmpPeriods(d, f)}`;
}

function _cmpRow(label, v1, v2, lowerIsBetter) {
  const n1 = parseFloat(String(v1).replace('%', ''));
  const n2 = parseFloat(String(v2).replace('%', ''));
  const eq   = isNaN(n1) || isNaN(n2) || n1 === n2;
  const win1 = !eq && (lowerIsBetter ? n1 < n2 : n1 > n2);
  const win2 = !eq && (lowerIsBetter ? n2 < n1 : n2 > n1);
  return `<tr>
    <td class="cmp-val ${win1 ? 'cmp-better' : ''}" style="text-align:right;padding-right:14px">${v1}</td>
    <td class="cmp-label" style="text-align:center;min-width:140px">${label}</td>
    <td class="cmp-val ${win2 ? 'cmp-better' : ''}" style="padding-left:14px">${v2}</td>
  </tr>`;
}

function _cmpThead(t1, t2, label) {
  return `<thead><tr>
    <th style="text-align:right;padding-right:14px;font-size:14px">${t1}</th>
    <th style="text-align:center;color:#6b7280;font-size:12px;font-weight:500;min-width:140px">${label || T('analytics.stats.title')}</th>
    <th style="padding-left:14px;font-size:14px">${t2}</th>
  </tr></thead>`;
}

function _renderCmpStatsSection(s1, s2, def1, def2, m1count, m2count, f) {
  const t1 = escapeHtml(f.team);
  const t2 = escapeHtml(f.team2);
  return `
    <section class="analytics-section">
      <h2>${T('compare.general.title')}</h2>
      <table class="cmp-table" style="width:100%;max-width:580px">
        ${_cmpThead(t1, t2, T('compare.atk'))}
        <tbody>
          ${_cmpRow(T('analytics.stats.matches'),  m1count, m2count, false)}
          ${_cmpRow(T('analytics.stats.shots'),    s1.total, s2.total, false)}
          ${_cmpRow(T('analytics.stats.goals'),    s1.goals, s2.goals, false)}
          ${_cmpRow(T('analytics.stats.on_target'),s1.onTarget, s2.onTarget, false)}
          ${_cmpRow(T('analytics.stats.rate'),     s1.pct + '%', s2.pct + '%', false)}
          ${_cmpRow(T('analytics.stats.on_pct'),   s1.onPct + '%', s2.onPct + '%', false)}
          ${(s1.manUp > 0 || s2.manUp > 0) ? _cmpRow('Man-up', s1.manUp, s2.manUp, false) : ''}
          ${(s1.manDown > 0 || s2.manDown > 0) ? _cmpRow('Man-down', s1.manDown, s2.manDown, false) : ''}
          ${(s1.fastBreak > 0 || s2.fastBreak > 0) ? _cmpRow('Fast break', s1.fastBreak, s2.fastBreak, false) : ''}
        </tbody>
      </table>
      <h3 style="margin-top:20px">${T('compare.def.title')}</h3>
      <table class="cmp-table" style="width:100%;max-width:580px">
        ${_cmpThead(t1, t2, T('compare.def'))}
        <tbody>
          ${_cmpRow(T('compare.shots_conceded'),   def1.total, def2.total, true)}
          ${_cmpRow(T('compare.goals_conceded'),   def1.goals, def2.goals, true)}
          ${_cmpRow(T('compare.on_target_conceded'),def1.onTarget, def2.onTarget, true)}
          ${_cmpRow(T('compare.rival_rate'),       def1.pct + '%', def2.pct + '%', true)}
        </tbody>
      </table>
    </section>`;
}

function _renderCmpHeatmaps(e1, e2, conc1, conc2, f) {
  const t1   = escapeHtml(f.team);
  const t2   = escapeHtml(f.team2);
  const mode = APP.analyticsHeatmapMode || 'fired';

  let svg1, svg2;
  if (mode === 'efficiency') {
    svg1 = _buildZoneEfficiencySvg(e1);
    svg2 = _buildZoneEfficiencySvg(e2);
  } else if (mode === 'conceded') {
    svg1 = _buildAnalyticsHalfFieldSvg(conc1, f.team);
    svg2 = _buildAnalyticsHalfFieldSvg(conc2, f.team2);
  } else {
    svg1 = _buildAnalyticsHalfFieldSvg(e1, f.team);
    svg2 = _buildAnalyticsHalfFieldSvg(e2, f.team2);
  }

  return `
    <section class="analytics-section">
      <h2>Shot chart</h2>
      <div class="heatmap-toggle">
        <button class="btn ${mode === 'fired'      ? 'btn-primary' : ''}" data-action="analytics-heatmap-toggle" data-arg="fired">${T('heatmap.fired')}</button>
        <button class="btn ${mode === 'conceded'   ? 'btn-primary' : ''}" data-action="analytics-heatmap-toggle" data-arg="conceded">${T('heatmap.conceded')}</button>
        <button class="btn ${mode === 'efficiency' ? 'btn-primary' : ''}" data-action="analytics-heatmap-toggle" data-arg="efficiency">${T('heatmap.efficiency')}</button>
      </div>
      <div class="compare-heatmaps">
        <div class="compare-heatmap-col">
          <div class="compare-col-header">${t1}</div>
          <div class="field-half">${svg1}</div>
        </div>
        <div class="compare-heatmap-col">
          <div class="compare-col-header">${t2}</div>
          <div class="field-half">${svg2}</div>
        </div>
      </div>
    </section>`;
}

function _renderCmpH2HEmpty(f) {
  return `
    <section class="analytics-section">
      <h2>${T('compare.h2h.title')}</h2>
      <p class="empty">${T('compare.h2h.empty_pre')} ${escapeHtml(f.team)} ${T('compare.h2h.empty_and')} ${escapeHtml(f.team2)} ${T('compare.h2h.empty_suf')}</p>
    </section>`;
}

function _renderCmpH2H(h2hMatches, h2hE1, h2hE2, f, allEvents) {
  const t1 = escapeHtml(f.team);
  const t2 = escapeHtml(f.team2);

  let t1wins = 0, t2wins = 0, draws = 0, t1totalG = 0, t2totalG = 0;

  const rows = [...h2hMatches]
    .sort((a, b) => String(b.match_date).localeCompare(String(a.match_date)))
    .map(m => {
      const mE    = allEvents.filter(e => String(e.match_id) === String(m.id));
      const gA    = mE.filter(e => e.team_event === m.team_A && e.result === 'gol').length;
      const gB    = mE.filter(e => e.team_event === m.team_B && e.result === 'gol').length;
      const t1g   = m.team_A === f.team ? gA : gB;
      const t2g   = m.team_A === f.team ? gB : gA;
      const hasEv = mE.length > 0;
      if (hasEv) { t1totalG += t1g; t2totalG += t2g; }
      if (hasEv && t1g > t2g) t1wins++;
      else if (hasEv && t2g > t1g) t2wins++;
      else if (hasEv) draws++;
      const result = hasEv ? `${t1g} : ${t2g}` : '— : —';
      const won    = hasEv && t1g > t2g;
      const drew   = hasEv && t1g === t2g;
      return `<tr class="match-history-row ${won ? 'won' : drew ? 'drew' : hasEv ? 'lost' : ''}">
        <td>${escapeHtml(String(m.match_date))}</td>
        <td>${escapeHtml(m.tournament || '—')}</td>
        <td class="match-result">${result}</td>
        <td><button class="btn btn-sm" data-action="open-viewer-from-analytics" data-arg="${escapeHtml(String(m.id))}">${T('btn.view')}</button></td>
      </tr>`;
    }).join('');

  const s1    = computeAnalyticsStats(h2hE1);
  const s2    = computeAnalyticsStats(h2hE2);
  const total = t1wins + t2wins + draws;
  const c1    = t1wins >= t2wins && total > 0 ? '#16a34a' : '#374151';
  const c2    = t2wins >= t1wins && total > 0 ? '#16a34a' : '#374151';

  return `
    <section class="analytics-section">
      <h2>${T('compare.h2h.title')} (${h2hMatches.length})</h2>
      <div class="cmp-h2h-summary">
        <div class="cmp-h2h-team">
          <div style="font-size:12px;color:#6b7280;margin-bottom:4px">${t1}</div>
          <div style="font-size:32px;font-weight:700;color:${c1}">${t1wins}</div>
          <div class="cmp-h2h-label">${T('compare.h2h.wins')}</div>
        </div>
        <div class="cmp-h2h-mid">
          <div style="font-size:22px;font-weight:700;color:#6b7280">${draws}</div>
          <div class="cmp-h2h-label">${T('compare.h2h.draws')}</div>
        </div>
        <div class="cmp-h2h-team">
          <div style="font-size:12px;color:#6b7280;margin-bottom:4px">${t2}</div>
          <div style="font-size:32px;font-weight:700;color:${c2}">${t2wins}</div>
          <div class="cmp-h2h-label">${T('compare.h2h.wins')}</div>
        </div>
      </div>
      <table class="stats-table match-history-table" style="margin:16px 0">
        <thead><tr><th>${T('analytics.history.date')}</th><th>${T('analytics.history.tournament')}</th><th>${t1} : ${t2}</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${(h2hE1.length > 0 || h2hE2.length > 0) ? `
      <h3>${T('compare.h2h.stats')}</h3>
      <table class="cmp-table" style="width:100%;max-width:580px">
        ${_cmpThead(t1, t2, 'H2H')}
        <tbody>
          ${_cmpRow(T('compare.h2h.goals_scored'),  t1totalG, t2totalG, false)}
          ${_cmpRow(T('analytics.stats.shots'),     s1.total, s2.total, false)}
          ${_cmpRow(T('analytics.stats.rate'),      s1.pct + '%', s2.pct + '%', false)}
          ${_cmpRow(T('analytics.stats.on_pct'),    s1.onPct + '%', s2.onPct + '%', false)}
        </tbody>
      </table>` : ''}
    </section>`;
}

function _renderCmpGoalies(e1, e2, f, allEvents, allMatches) {
  const t1   = escapeHtml(f.team);
  const t2   = escapeHtml(f.team2);
  const f2   = Object.assign({}, f, { team: f.team2 });
  const data1 = _computeGoalieAnalytics(e1, allEvents, allMatches, f,  { col: 'savePct', dir: 'desc' });
  const data2 = _computeGoalieAnalytics(e2, allEvents, allMatches, f2, { col: 'savePct', dir: 'desc' });

  if (data1.totalShotsOnGoal === 0 && data2.totalShotsOnGoal === 0) return '';

  function goalieCol(data, teamLabel) {
    if (data.totalShotsOnGoal === 0) {
      return `<div class="compare-heatmap-col">
        <div class="compare-col-header">${teamLabel}</div>
        <p class="empty">${T('compare.goalies.no_data')}</p>
      </div>`;
    }
    const pctColor = data.avgSavePct >= 70 ? '#15803d' : data.avgSavePct >= 55 ? '#1d4ed8' : '#b91c1c';
    const goalieRows = data.list.slice(0, 4).map(g => {
      const nl  = g.number !== null ? `#${escapeHtml(g.number)}` : '—';
      const pct = g.savePct !== null ? g.savePct + '%' : '—';
      const col = g.savePct >= 70 ? '#15803d' : g.savePct >= 55 ? '#1d4ed8' : '#b91c1c';
      return `<tr>
        <td style="font-weight:600">${nl}</td>
        <td class="num">${g.matchCount}</td>
        <td class="num">${g.shotsOnGoal}</td>
        <td class="num">${g.saves}</td>
        <td class="num" style="font-weight:700;color:${col}">${pct}</td>
      </tr>`;
    }).join('');
    return `<div class="compare-heatmap-col">
      <div class="compare-col-header">${teamLabel}</div>
      <div class="stat-box" style="display:inline-block;margin-bottom:12px;min-width:180px;text-align:center">
        <div style="font-size:28px;font-weight:700;color:${pctColor}">${data.avgSavePct !== null ? data.avgSavePct + '%' : '—'}</div>
        <div style="font-size:12px;color:#6b7280">${T('analytics.goalies.avg_save')}</div>
        <div style="font-size:12px;color:#6b7280">${data.totalShotsOnGoal} ${T('compare.goalies.shots_st')} · ${data.matchCount} ${T('compare.goalies.matches_st')}</div>
      </div>
      <table class="stats-table" style="width:100%;font-size:13px">
        <thead><tr><th>${T('compare.goalies.nr')}</th><th>${T('analytics.goalies.matches')}</th><th>${T('compare.goalies.shots_on')}</th><th>${T('compare.goalies.saves')}</th><th>${T('analytics.goalies.save_pct')}</th></tr></thead>
        <tbody>${goalieRows}</tbody>
      </table>
    </div>`;
  }

  return `
    <section class="analytics-section">
      <h2>${T('analytics.goalies.title')}</h2>
      <div class="compare-heatmaps">
        ${goalieCol(data1, t1)}
        ${goalieCol(data2, t2)}
      </div>
    </section>`;
}

function _renderCmpPeriods(d, f) {
  const s1 = d.s1, s2 = d.s2;
  const t1 = escapeHtml(f.team);
  const t2 = escapeHtml(f.team2);

  const allPeriodKeys = new Set([...Object.keys(s1.periods), ...Object.keys(s2.periods)]);
  if (allPeriodKeys.size === 0) return '';

  const chart1 = _renderPeriodBarChart(s1.periods);
  const chart2 = _renderPeriodBarChart(s2.periods);
  if (!chart1 && !chart2) return '';

  const metrics = APP.compareProgressionMetrics;
  const toggle = progressionMetricToggle('compare-set-progression-metric', metrics);
  const progressionSvg = _buildCmpProgressionSvg(d.e1, d.e2, f, metrics);

  return `
    <section class="analytics-section">
      <h2>${T('compare.periods.title')}</h2>
      <div class="compare-heatmaps">
        <div class="compare-heatmap-col">
          <div class="compare-col-header">${t1}</div>
          ${chart1 || `<p class="empty" style="font-size:13px">${T('compare.no_data')}</p>`}
        </div>
        <div class="compare-heatmap-col">
          <div class="compare-col-header">${t2}</div>
          ${chart2 || `<p class="empty" style="font-size:13px">${T('compare.no_data')}</p>`}
        </div>
      </div>
      <h3>${T('compare.progression.title')}</h3>
      ${toggle}
      ${progressionSvg || `<p class="empty" style="font-size:13px">${T('compare.no_data')}</p>`}
    </section>`;
}

function _buildCmpProgressionSvg(e1, e2, f, metrics) {
  const periods1 = computePeriodMetricStats(e1);
  const periods2 = computePeriodMetricStats(e2);
  const cum = buildCumulativeMetricSeries(periods1, periods2, metrics);
  if (cum.labels.length <= 1) return '';
  const svg = buildMultiProgressionChartSvg(cum.labels,
    { label: f.team,  color: '#1d4ed8' },
    { label: f.team2, color: '#b91c1c' },
    cum.series);
  return `<div class="progression-chart-wrapper">${svg}</div>`;
}
