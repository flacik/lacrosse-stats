'use strict';

// Match-viewer screen (read-only).

function renderMatchViewer(root) {
  const match = DATA.scheduledMatches.find(m => String(m.id) === String(APP.matchId));
  if (!match) {
    root.innerHTML = `<div class="empty">${T('error.match_not_found')}</div>`;
    return;
  }

  if (APP.viewerLoading) {
    root.innerHTML = `
      <div class="app-header">
        <button class="btn" data-action="back-home">${T('nav.back')}</button>
        <h1>${escapeHtml(match.team_A)} vs ${escapeHtml(match.team_B)} <span style="font-size:13px;color:#888;font-weight:normal">${T('viewer.readonly')}</span></h1>
        ${_langToggleBtn()}
        <button class="btn" data-action="toggle-dark-mode" id="theme-toggle" title="${T('nav.theme')}">🌙</button>
      </div>
      <div class="loading-state">
        <div class="spinner">⏳</div>
        ${T('loading.match_data')}
      </div>`;
    return;
  }

  if (APP.viewerError) {
    root.innerHTML = `
      <div class="app-header">
        <button class="btn" data-action="back-home">${T('nav.back')}</button>
        <h1>${escapeHtml(match.team_A)} vs ${escapeHtml(match.team_B)}</h1>
        ${_langToggleBtn()}
        <button class="btn" data-action="toggle-dark-mode" id="theme-toggle" title="${T('nav.theme')}">🌙</button>
      </div>
      <div class="error-state">
        <p>⚠ ${T('error.loading_data')}: ${escapeHtml(APP.viewerError)}</p>
        <button class="btn btn-primary" data-action="viewer-retry">${T('btn.retry_short')}</button>
      </div>`;
    return;
  }

  const allEvents  = DATA.events.filter(e => String(e.match_id) === String(match.id));
  const shotEvents = allEvents.filter(e => isShotEvent(e));
  const filtered   = applyViewerFilters(shotEvents, APP.viewer);
  const score      = computeScore(match.id);
  const statsA     = computeTeamStats(match.id, match.team_A, shotEvents);
  const statsB     = computeTeamStats(match.id, match.team_B, shotEvents);
  const goalies    = computeGoalieStats(match, allEvents);
  const perPeriod  = computePerPeriodStats(match.id, match);
  const situation  = computeSituationStats(match.id, match, shotEvents);

  const periodSet = new Set();
  allEvents.forEach(e => { if (e.period !== undefined && e.period !== '') periodSet.add(String(e.period)); });
  const periodOptions = Array.from(periodSet).sort((a, b) => getPeriodOrder(a) - getPeriodOrder(b));

  const tagClass  = APP.refreshFlash ? 'refresh-tag refreshing' : 'refresh-tag';
  const tagLabel  = APP.refreshFlash ? T('viewer.refreshing') : _viewerRefreshLabel();
  const _presence = APP.presenceCounts[String(match.id)] || { input: 0, viewer: 0 };
  const presenceBadgeHtml = _renderPresenceBadge(_presence.input, _presence.viewer, 'viewer');

  const statusLabel = match.status === 'live' ? T('viewer.status_live')
    : match.status === 'finished' ? T('viewer.status_finished')
    : T('viewer.status_planned');

  root.innerHTML = `
    <div class="app-header">
      <button class="btn" data-action="back-home">${T('nav.back')}</button>
      <h1>${escapeHtml(match.team_A)} vs ${escapeHtml(match.team_B)} <span style="font-size:13px;color:#888;font-weight:normal">${T('viewer.readonly')}</span></h1>
      ${_langToggleBtn()}
      <button class="btn" data-action="toggle-dark-mode" id="theme-toggle" title="${T('nav.theme')}">🌙</button>
      <button class="btn" data-action="open-match-report" data-arg="${escapeHtml(String(match.id))}" title="${T('nav.pdf')}">${T('nav.pdf')}</button>
    </div>
    <div class="match-info-bar ${match.status === 'live' ? 'header-live' : (match.status === 'finished' ? 'header-archived' : '')}">
      <div class="score">
        <span class="team-A-color">${escapeHtml(match.team_A)} ${score.A}</span>
        <span class="sep">:</span>
        <span class="team-B-color">${score.B} ${escapeHtml(match.team_B)}</span>
      </div>
      <div class="period">${statusLabel}</div>
      <div class="tournament">${escapeHtml(match.tournament)}</div>
      <div class="sides-indicator">${presenceBadgeHtml}<span class="${tagClass}"><span class="dot"></span>${tagLabel}</span></div>
    </div>
    <div class="viewer-screen">
      <div class="viewer-section">
        ${renderViewerStatsCard(statsA, statsB, match)}
        ${renderViewerSituationCard(situation, match)}
        ${renderViewerGoalieCard(goalies, match)}
        ${renderViewerPerPeriodCard(perPeriod, match)}
        ${renderViewerShotChartCard(match, filtered, periodOptions)}
      </div>
    </div>`;

  const chartHost = document.getElementById('viewer-chart-host');
  if (chartHost) {
    chartHost.appendChild(buildViewerChart(match, filtered));
    if (APP.viewer.view_mode === 'full') chartHost.appendChild(buildFieldLegend(match, { includeManUp: true }));
  }
}

function _viewerRefreshLabel() {
  if (!APP.lastViewerRefresh) return T('viewer.last_update') + '—';
  const h = APP.lastViewerRefresh.getHours().toString().padStart(2, '0');
  const m = APP.lastViewerRefresh.getMinutes().toString().padStart(2, '0');
  const s = APP.lastViewerRefresh.getSeconds().toString().padStart(2, '0');
  return T('viewer.last_update') + h + ':' + m + ':' + s;
}

function _splitBar(va, vb) {
  const na = typeof va === 'number' ? va : (parseFloat(va) || 0);
  const nb = typeof vb === 'number' ? vb : (parseFloat(vb) || 0);
  const total = na + nb;
  const pct = total > 0 ? Math.round(na / total * 100) : 50;
  return APP.splitBars
    ? `<tr class="split-bar-row"><td colspan="3"><div class="split-bar" style="--pct:${pct}%"></div></td></tr>`
    : '';
}

function renderViewerStatsCard(statsA, statsB, match) {
  const fmt = (val, isRate) => val === '—' ? '—' : (isRate ? `${val}%` : val);
  const toggleLabel = APP.splitBars ? T('btn.hide_bars') : T('btn.show_bars');
  return `
    <div class="viewer-card">
      <h3 style="display:flex;align-items:center;">
        ${T('viewer.shots.title')}
        <button class="btn" data-action="toggle-split-bars" style="margin-left:auto;font-size:11px;padding:3px 8px;">${toggleLabel}</button>
      </h3>
      <table class="stats-table">
        <thead>
          <tr class="header-row">
            <th class="team-A">${escapeHtml(match.team_A)}</th>
            <th class="label" style="text-align:center;">&nbsp;</th>
            <th class="team-B">${escapeHtml(match.team_B)}</th>
          </tr>
        </thead>
        <tbody>
          <tr><td class="num team-A">${statsA.total}</td><td class="label" style="text-align:center;">${T('viewer.shots.total')}</td><td class="num team-B">${statsB.total}</td></tr>
          ${_splitBar(statsA.total, statsB.total)}
          <tr><td class="num team-A">${statsA.goals}</td><td class="label" style="text-align:center;">${T('viewer.shots.goals')}</td><td class="num team-B">${statsB.goals}</td></tr>
          ${_splitBar(statsA.goals, statsB.goals)}
          <tr><td class="num team-A">${statsA.onTarget}</td><td class="label" style="text-align:center;">${T('viewer.shots.on_target')}</td><td class="num team-B">${statsB.onTarget}</td></tr>
          ${_splitBar(statsA.onTarget, statsB.onTarget)}
          <tr><td class="num team-A">${statsA.offTarget}</td><td class="label" style="text-align:center;">${T('viewer.shots.off_target')}</td><td class="num team-B">${statsB.offTarget}</td></tr>
          ${_splitBar(statsA.offTarget, statsB.offTarget)}
          <tr class="summary-row"><td class="num team-A">${fmt(statsA.goalRate, true)}</td><td class="label" style="text-align:center;">${T('viewer.shots.goal_rate')}</td><td class="num team-B">${fmt(statsB.goalRate, true)}</td></tr>
          ${_splitBar(statsA.goalRate, statsB.goalRate)}
          <tr class="summary-row"><td class="num team-A">${fmt(statsA.onTargetRate, true)}</td><td class="label" style="text-align:center;">${T('viewer.shots.on_rate')}</td><td class="num team-B">${fmt(statsB.onTargetRate, true)}</td></tr>
          ${_splitBar(statsA.onTargetRate, statsB.onTargetRate)}
        </tbody>
      </table>
    </div>`;
}

function renderViewerSituationCard(situation, match) {
  function sitBlock(labelKey, badgeClass, badgeText, dataA, dataB) {
    const fmtRate = r => r === '—' ? '—' : r + '%';
    return `
      <div class="sit-col">
        <div class="sit-badge ${badgeClass}">${badgeText}</div>
        <div class="sit-subtitle">${T(labelKey)}</div>
        <div class="sit-row">
          <span class="sit-val-a">${dataA.shots}/${dataA.goals}</span>
          <span class="sit-lbl">${T('viewer.sit.shots_goals')}</span>
          <span class="sit-val-b">${dataB.shots}/${dataB.goals}</span>
        </div>
        <div class="sit-row">
          <span class="sit-val-a">${fmtRate(dataA.rate)}</span>
          <span class="sit-lbl">${T('viewer.sit.rate')}</span>
          <span class="sit-val-b">${fmtRate(dataB.rate)}</span>
        </div>
      </div>`;
  }

  return `
    <div class="viewer-card">
      <div class="sit-card-header">
        <h3 style="margin:0;">${T('viewer.sit.title')}</h3>
        <div class="sit-teams">
          <span class="team-A-label">${escapeHtml(match.team_A)}</span>
          <span class="sit-teams-sep">·</span>
          <span class="team-B-label">${escapeHtml(match.team_B)}</span>
        </div>
      </div>
      <div class="sit-grid">
        ${sitBlock('viewer.sit.man_up',    'sit-badge-up', 'man-up ↑',   situation.manUp.A,   situation.manUp.B)}
        ${sitBlock('viewer.sit.equal',     'sit-badge-eq', '5v5 ·',      situation.equal.A,   situation.equal.B)}
        ${sitBlock('viewer.sit.man_down',  'sit-badge-dn', 'man-down ↓', situation.manDown.A, situation.manDown.B)}
        ${(situation.fastBreak.A.shots > 0 || situation.fastBreak.B.shots > 0) ? sitBlock('viewer.sit.fast_break', 'sit-badge-fb', 'fast break →', situation.fastBreak.A, situation.fastBreak.B) : ''}
      </div>
    </div>`;
}

function renderViewerGoalieCard(goalies, match) {
  const fmt = (val) => val === '—' ? '—' : val + '%';

  function goalieLabel(teamName, goalieList) {
    if (!goalieList || goalieList.length === 0) return `${APP.lang === 'pl' ? 'Bramkarz' : 'Goalie'} ${escapeHtml(teamName)} ${T('viewer.goalie.no_number')}`;
    if (goalieList.length === 1 && goalieList[0].number !== null) return `${APP.lang === 'pl' ? 'Bramkarz' : 'Goalie'} ${escapeHtml(teamName)} #${goalieList[0].number}`;
    return `${APP.lang === 'pl' ? 'Bramkarz' : 'Goalie'} ${escapeHtml(teamName)}`;
  }

  const hasMultipleA = goalies.A.goalies && goalies.A.goalies.length > 1;
  const hasMultipleB = goalies.B.goalies && goalies.B.goalies.length > 1;
  const hasMultiple  = hasMultipleA || hasMultipleB;

  return `
    <div class="viewer-card">
      <h3>${T('viewer.goalie.title')}</h3>
      <table class="stats-table">
        <thead>
          <tr class="header-row">
            <th class="team-A">${goalieLabel(match.team_A, goalies.A.goalies)}</th>
            <th class="label" style="text-align:center;">&nbsp;</th>
            <th class="team-B">${goalieLabel(match.team_B, goalies.B.goalies)}</th>
          </tr>
        </thead>
        <tbody>
          ${hasMultiple ? _renderGoalieMultiRows(goalies, match) : `
          <tr><td class="num team-A">${goalies.A.saves}</td><td class="label" style="text-align:center;">${T('viewer.goalie.saves')}</td><td class="num team-B">${goalies.B.saves}</td></tr>
          <tr><td class="num team-A">${goalies.A.goalsAgainst}</td><td class="label" style="text-align:center;">${T('viewer.goalie.goals_ag')}</td><td class="num team-B">${goalies.B.goalsAgainst}</td></tr>
          <tr><td class="num team-A">${goalies.A.shotsOnGoal}</td><td class="label" style="text-align:center;">${T('viewer.goalie.shots_on')}</td><td class="num team-B">${goalies.B.shotsOnGoal}</td></tr>
          <tr class="summary-row"><td class="num team-A">${fmt(goalies.A.savePct)}</td><td class="label" style="text-align:center;">${T('viewer.goalie.save_pct')}</td><td class="num team-B">${fmt(goalies.B.savePct)}</td></tr>
          `}
        </tbody>
      </table>
      <div style="margin-top:8px;font-size:11px;color:#888;">${T('viewer.goalie.note')}</div>
    </div>`;
}

function _renderGoalieMultiRows(goalies, match) {
  const fmt = (val) => val === '—' ? '—' : val + '%';
  const listA = goalies.A.goalies || [];
  const listB = goalies.B.goalies || [];
  const maxLen = Math.max(listA.length, listB.length);
  let html = '';
  for (let i = 0; i < maxLen; i++) {
    const gA = listA[i];
    const gB = listB[i];
    const labelA = gA ? (gA.number !== null ? `#${gA.number}` : T('goalie.no_nr')) : '';
    const labelB = gB ? (gB.number !== null ? `#${gB.number}` : T('goalie.no_nr')) : '';
    html += `<tr><td class="goalie-name team-A">${labelA}</td><td></td><td class="goalie-name team-B">${labelB}</td></tr>`;
    html += `<tr><td class="num team-A">${gA ? gA.saves : ''}</td><td class="label" style="text-align:center;">${T('viewer.goalie.saves')}</td><td class="num team-B">${gB ? gB.saves : ''}</td></tr>`;
    html += `<tr><td class="num team-A">${gA ? gA.goalsAgainst : ''}</td><td class="label" style="text-align:center;">${T('viewer.goalie.goals_ag')}</td><td class="num team-B">${gB ? gB.goalsAgainst : ''}</td></tr>`;
    html += `<tr><td class="num team-A">${gA ? gA.shotsOnGoal : ''}</td><td class="label" style="text-align:center;">${T('viewer.goalie.shots_on')}</td><td class="num team-B">${gB ? gB.shotsOnGoal : ''}</td></tr>`;
    html += `<tr class="summary-row"><td class="num team-A">${gA ? fmt(gA.savePct) : ''}</td><td class="label" style="text-align:center;">${T('viewer.goalie.save_pct')}</td><td class="num team-B">${gB ? fmt(gB.savePct) : ''}</td></tr>`;
  }
  return html;
}

function renderViewerPerPeriodCard(perPeriod, match) {
  return `
    <div class="viewer-card per-period">
      <h3>${T('viewer.period.title')}</h3>
      <table class="stats-table">
        <thead>
          <tr class="header-row">
            <th class="label">${T('viewer.period.period')}</th>
            <th class="team-A">${escapeHtml(match.team_A)}</th>
            <th class="team-B">${escapeHtml(match.team_B)}</th>
          </tr>
        </thead>
        <tbody>
          ${perPeriod.map(p => `
            <tr>
              <td class="label">${periodLabel(p.period)}</td>
              <td class="num team-A">${p.A_shots} <span style="color:#888">(${p.A_goals} ${T_n(p.A_goals, 'viewer.period.goal', 'viewer.period.goals')})</span></td>
              <td class="num team-B">${p.B_shots} <span style="color:#888">(${p.B_goals} ${T_n(p.B_goals, 'viewer.period.goal', 'viewer.period.goals')})</span></td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div style="margin-top:8px;font-size:11px;color:#888;">${T('viewer.period.format')}</div>
    </div>`;
}

function renderViewerShotChartCard(match, filtered, periodOptions) {
  const ownHalfA = filtered.filter(e => e.zone_name === 'own-half' && e.team_event === match.team_A).length;
  const ownHalfB = filtered.filter(e => e.zone_name === 'own-half' && e.team_event === match.team_B).length;
  const v = APP.viewer;

  return `
    <div class="viewer-card shot-chart">
      <h3>${T('viewer.chart.title')}</h3>
      <div class="viewer-controls">
        <span class="ctrl-label">${T('viewer.chart.view')}</span>
        <div class="toggle-group">
          <button class="btn ${v.view_mode === 'full'   ? 'btn-active' : ''}" data-action="viewer-set-mode" data-arg="full">${T('viewer.chart.full')}</button>
          <button class="btn ${v.view_mode === 'half-A' ? 'btn-active' : ''}" data-action="viewer-set-mode" data-arg="half-A">${T('viewer.chart.half')} ${escapeHtml(match.team_A)}</button>
          <button class="btn ${v.view_mode === 'half-B' ? 'btn-active' : ''}" data-action="viewer-set-mode" data-arg="half-B">${T('viewer.chart.half')} ${escapeHtml(match.team_B)}</button>
        </div>
        <span class="ctrl-label" style="margin-left:8px;">${T('viewer.chart.mode')}</span>
        <div class="toggle-group">
          <button class="btn ${v.display_mode === 'markers' ? 'btn-active' : ''}" data-action="viewer-set-display" data-arg="markers">${T('viewer.chart.markers')}</button>
          <button class="btn ${v.display_mode === 'heatmap' ? 'btn-active' : ''}" data-action="viewer-set-display" data-arg="heatmap">${T('viewer.chart.heatmap')}</button>
        </div>
        <span class="ctrl-label" style="margin-left:8px;">${T('viewer.chart.period')}</span>
        <select id="filter-period" data-action="viewer-set-period-filter">
          <option value="all" ${v.filter_period === 'all' ? 'selected' : ''}>${T('viewer.chart.all')}</option>
          ${periodOptions.map(p => `<option value="${p}" ${v.filter_period === p ? 'selected' : ''}>${periodLabel(p)}</option>`).join('')}
        </select>
        <span class="ctrl-label" style="margin-left:8px;">${T('viewer.chart.result')}</span>
        <select id="filter-result" data-action="viewer-set-result-filter">
          <option value="all"      ${v.filter_result === 'all'      ? 'selected' : ''}>${T('viewer.chart.all')}</option>
          <option value="gol"      ${v.filter_result === 'gol'      ? 'selected' : ''}>${T('viewer.chart.goals_only')}</option>
          <option value="celny"    ${v.filter_result === 'celny'    ? 'selected' : ''}>${T('viewer.chart.on_target')}</option>
          <option value="niecelny" ${v.filter_result === 'niecelny' ? 'selected' : ''}>${T('viewer.chart.off_target')}</option>
        </select>
      </div>
      <div id="viewer-chart-host"></div>
      <div class="shot-chart-stats">
        <span><strong>${filtered.length}</strong> ${T('viewer.chart.shots_on_view')}${(v.filter_period !== 'all' || v.filter_result !== 'all') ? T('viewer.chart.after_filters') : ''}</span>
        <span>•</span>
        <span>${T('viewer.chart.from_half')}<strong style="color:#1d4ed8">${escapeHtml(match.team_A)}: ${ownHalfA}</strong>, <strong style="color:#b91c1c">${escapeHtml(match.team_B)}: ${ownHalfB}</strong></span>
      </div>
    </div>`;
}
