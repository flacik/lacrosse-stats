'use strict';

// Match-viewer screen (read-only, trener): score banner, stats tables, shot chart with filters.

function renderMatchViewer(root) {
  const match = DATA.scheduledMatches.find(m => String(m.id) === String(APP.matchId));
  if (!match) {
    root.innerHTML = '<div class="empty">Mecz nie znaleziony</div>';
    return;
  }

  // ── Stan ładowania pierwszego fetchu ──────────────────────────────────────────
  if (APP.viewerLoading) {
    root.innerHTML = `
      <div class="app-header">
        <button class="btn" data-action="back-home">← Wróć</button>
        <h1>${escapeHtml(match.team_A)} vs ${escapeHtml(match.team_B)} <span style="font-size:13px;color:#888;font-weight:normal">— tryb podgląd (read-only)</span></h1>
        <button class="btn" data-action="toggle-dark-mode" id="theme-toggle" title="Przełącz tryb ciemny">🌙</button>
      </div>
      <div class="loading-state">
        <div class="spinner">⏳</div>
        Ładowanie danych meczu…
      </div>
    `;
    return;
  }

  // ── Błąd pierwszego fetchu ────────────────────────────────────────────────────
  if (APP.viewerError) {
    root.innerHTML = `
      <div class="app-header">
        <button class="btn" data-action="back-home">← Wróć</button>
        <h1>${escapeHtml(match.team_A)} vs ${escapeHtml(match.team_B)}</h1>
        <button class="btn" data-action="toggle-dark-mode" id="theme-toggle" title="Przełącz tryb ciemny">🌙</button>
      </div>
      <div class="error-state">
        <p>⚠ Błąd ładowania danych: ${escapeHtml(APP.viewerError)}</p>
        <button class="btn btn-primary" data-action="viewer-retry">Spróbuj ponownie</button>
      </div>
    `;
    return;
  }

  // Fix type mismatch: match_id z GAS może być liczbą lub stringiem
  const allEvents  = DATA.events.filter(e => String(e.match_id) === String(match.id));
  const shotEvents = allEvents.filter(e => e.event_type !== 'goalie_set');
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
  const tagLabel  = APP.refreshFlash ? 'Odświeżanie…' : _viewerRefreshLabel();
  const _presence = APP.presenceCounts[String(match.id)] || { input: 0, viewer: 0 };
  const presenceBadgeHtml = _renderPresenceBadge(_presence.input, _presence.viewer, 'viewer');

  root.innerHTML = `
    <div class="app-header">
      <button class="btn" data-action="back-home">← Wróć</button>
      <h1>${escapeHtml(match.team_A)} vs ${escapeHtml(match.team_B)} <span style="font-size:13px;color:#888;font-weight:normal">— tryb podgląd (read-only)</span></h1>
      <button class="btn" data-action="toggle-dark-mode" id="theme-toggle" title="Przełącz tryb ciemny">🌙</button>
    </div>
    <div class="match-info-bar ${match.status === 'live' ? 'header-live' : (match.status === 'finished' ? 'header-archived' : '')}">
      <div class="score">
        <span class="team-A-color">${escapeHtml(match.team_A)} ${score.A}</span>
        <span class="sep">:</span>
        <span class="team-B-color">${score.B} ${escapeHtml(match.team_B)}</span>
      </div>
      <div class="period">${match.status === 'live' ? '🔴 LIVE' : (match.status === 'finished' ? 'KONIEC' : 'PLANOWANY')}</div>
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
    </div>
  `;

  const chartHost = document.getElementById('viewer-chart-host');
  if (chartHost) {
    chartHost.appendChild(buildViewerChart(match, filtered));
    if (APP.viewer.view_mode === 'full') chartHost.appendChild(buildFieldLegend(match, { includeManUp: true }));
  }
}

/** Formatuje etykietę refresh-tag z czasem ostatniego odświeżenia. */
function _viewerRefreshLabel() {
  if (!APP.lastViewerRefresh) return 'Ostatnia aktualizacja: —';
  const h = APP.lastViewerRefresh.getHours().toString().padStart(2, '0');
  const m = APP.lastViewerRefresh.getMinutes().toString().padStart(2, '0');
  const s = APP.lastViewerRefresh.getSeconds().toString().padStart(2, '0');
  return 'Ostatnia aktualizacja: ' + h + ':' + m + ':' + s;
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
  const toggleLabel = APP.splitBars ? 'Ukryj bary' : 'Pokaż bary';
  return `
    <div class="viewer-card">
      <h3 style="display:flex;align-items:center;">
        Statystyki strzałów
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
          <tr><td class="num team-A">${statsA.total}</td><td class="label" style="text-align:center;">strzały (łącznie)</td><td class="num team-B">${statsB.total}</td></tr>
          ${_splitBar(statsA.total, statsB.total)}
          <tr><td class="num team-A">${statsA.goals}</td><td class="label" style="text-align:center;">bramki</td><td class="num team-B">${statsB.goals}</td></tr>
          ${_splitBar(statsA.goals, statsB.goals)}
          <tr><td class="num team-A">${statsA.onTarget}</td><td class="label" style="text-align:center;">strzały celne (z bramkami)</td><td class="num team-B">${statsB.onTarget}</td></tr>
          ${_splitBar(statsA.onTarget, statsB.onTarget)}
          <tr><td class="num team-A">${statsA.offTarget}</td><td class="label" style="text-align:center;">strzały niecelne</td><td class="num team-B">${statsB.offTarget}</td></tr>
          ${_splitBar(statsA.offTarget, statsB.offTarget)}
          <tr class="summary-row"><td class="num team-A">${fmt(statsA.goalRate, true)}</td><td class="label" style="text-align:center;">% skuteczność (gole/strzały)</td><td class="num team-B">${fmt(statsB.goalRate, true)}</td></tr>
          ${_splitBar(statsA.goalRate, statsB.goalRate)}
          <tr class="summary-row"><td class="num team-A">${fmt(statsA.onTargetRate, true)}</td><td class="label" style="text-align:center;">% strzałów celnych</td><td class="num team-B">${fmt(statsB.onTargetRate, true)}</td></tr>
          ${_splitBar(statsA.onTargetRate, statsB.onTargetRate)}
        </tbody>
      </table>
    </div>
  `;
}

function renderViewerSituationCard(situation, match) {
  function sitBlock(label, badgeClass, badgeText, dataA, dataB) {
    const fmtRate = r => r === '—' ? '—' : r + '%';
    return `
      <div class="sit-col">
        <div class="sit-badge ${badgeClass}">${badgeText}</div>
        <div class="sit-subtitle">${label}</div>
        <div class="sit-row">
          <span class="sit-val-a">${dataA.shots}/${dataA.goals}</span>
          <span class="sit-lbl">strzały/bramki</span>
          <span class="sit-val-b">${dataB.shots}/${dataB.goals}</span>
        </div>
        <div class="sit-row">
          <span class="sit-val-a">${fmtRate(dataA.rate)}</span>
          <span class="sit-lbl">skuteczność</span>
          <span class="sit-val-b">${fmtRate(dataB.rate)}</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="viewer-card">
      <div class="sit-card-header">
        <h3 style="margin:0;">Sytuacje specjalne</h3>
        <div class="sit-teams">
          <span class="team-A-label">${escapeHtml(match.team_A)}</span>
          <span class="sit-teams-sep">·</span>
          <span class="team-B-label">${escapeHtml(match.team_B)}</span>
        </div>
      </div>
      <div class="sit-grid">
        ${sitBlock('przewaga',     'sit-badge-up', 'man-up ↑',   situation.manUp.A,   situation.manUp.B)}
        ${sitBlock('równa liczba', 'sit-badge-eq', '5v5 ·',      situation.equal.A,   situation.equal.B)}
        ${sitBlock('osłabienie',   'sit-badge-dn', 'man-down ↓', situation.manDown.A, situation.manDown.B)}
      </div>
    </div>
  `;
}

function renderViewerGoalieCard(goalies, match) {
  const fmt = (val) => val === '—' ? '—' : val + '%';

  function goalieLabel(teamName, goalieList) {
    if (!goalieList || goalieList.length === 0) return `Bramkarz ${escapeHtml(teamName)} — numer nie wpisany`;
    if (goalieList.length === 1 && goalieList[0].number !== null) return `Bramkarz ${escapeHtml(teamName)} #${goalieList[0].number}`;
    return `Bramkarz ${escapeHtml(teamName)}`;
  }

  function goalieRows(teamSlot, goalieList, otherGoalieList) {
    if (!goalieList || goalieList.length === 0) return '';
    return goalieList.map((g, i) => {
      const label = g.number !== null ? `#${g.number}` : '(brak numeru)';
      const multipleGoalies = goalieList.length > 1;
      return `
        ${multipleGoalies ? `<tr><td class="goalie-name ${teamSlot}" colspan="3">${label}</td></tr>` : ''}
        <tr><td class="num ${teamSlot}">${g.saves}</td><td class="label" style="text-align:center;">obrony</td><td class="num ${otherGoalieList[i] ? otherGoalieList[i].saves : ''}">${otherGoalieList[i] ? otherGoalieList[i].saves : ''}</td></tr>
      `;
    }).join('');
  }

  const hasMultipleA = goalies.A.goalies && goalies.A.goalies.length > 1;
  const hasMultipleB = goalies.B.goalies && goalies.B.goalies.length > 1;
  const hasMultiple  = hasMultipleA || hasMultipleB;

  return `
    <div class="viewer-card">
      <h3>Statystyki bramkarzy</h3>
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
          <tr><td class="num team-A">${goalies.A.saves}</td><td class="label" style="text-align:center;">obrony</td><td class="num team-B">${goalies.B.saves}</td></tr>
          <tr><td class="num team-A">${goalies.A.goalsAgainst}</td><td class="label" style="text-align:center;">bramki stracone</td><td class="num team-B">${goalies.B.goalsAgainst}</td></tr>
          <tr><td class="num team-A">${goalies.A.shotsOnGoal}</td><td class="label" style="text-align:center;">strzały na bramkę (faced)</td><td class="num team-B">${goalies.B.shotsOnGoal}</td></tr>
          <tr class="summary-row"><td class="num team-A">${fmt(goalies.A.savePct)}</td><td class="label" style="text-align:center;">% obron</td><td class="num team-B">${fmt(goalies.B.savePct)}</td></tr>
          `}
        </tbody>
      </table>
      <div style="margin-top:8px;font-size:11px;color:#888;">obrona = strzał celny przeciwnika (zgodnie z konwencją: obrona bramkarza lub trafienie w słupek księgowane razem)</div>
    </div>
  `;
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
    const labelA = gA ? (gA.number !== null ? `#${gA.number}` : '(brak nr)') : '';
    const labelB = gB ? (gB.number !== null ? `#${gB.number}` : '(brak nr)') : '';
    html += `<tr><td class="goalie-name team-A">${labelA}</td><td></td><td class="goalie-name team-B">${labelB}</td></tr>`;
    html += `<tr><td class="num team-A">${gA ? gA.saves : ''}</td><td class="label" style="text-align:center;">obrony</td><td class="num team-B">${gB ? gB.saves : ''}</td></tr>`;
    html += `<tr><td class="num team-A">${gA ? gA.goalsAgainst : ''}</td><td class="label" style="text-align:center;">bramki stracone</td><td class="num team-B">${gB ? gB.goalsAgainst : ''}</td></tr>`;
    html += `<tr><td class="num team-A">${gA ? gA.shotsOnGoal : ''}</td><td class="label" style="text-align:center;">strzały na bramkę</td><td class="num team-B">${gB ? gB.shotsOnGoal : ''}</td></tr>`;
    html += `<tr class="summary-row"><td class="num team-A">${gA ? fmt(gA.savePct) : ''}</td><td class="label" style="text-align:center;">% obron</td><td class="num team-B">${gB ? fmt(gB.savePct) : ''}</td></tr>`;
  }
  return html;
}

function renderViewerPerPeriodCard(perPeriod, match) {
  return `
    <div class="viewer-card per-period">
      <h3>Podział per okres</h3>
      <table class="stats-table">
        <thead>
          <tr class="header-row">
            <th class="label">Okres</th>
            <th class="team-A">${escapeHtml(match.team_A)}</th>
            <th class="team-B">${escapeHtml(match.team_B)}</th>
          </tr>
        </thead>
        <tbody>
          ${perPeriod.map(p => `
            <tr>
              <td class="label">${periodLabel(p.period)}</td>
              <td class="num team-A">${p.A_shots} <span style="color:#888">(${p.A_goals} ${p.A_goals === 1 ? 'gol' : 'goli'})</span></td>
              <td class="num team-B">${p.B_shots} <span style="color:#888">(${p.B_goals} ${p.B_goals === 1 ? 'gol' : 'goli'})</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div style="margin-top:8px;font-size:11px;color:#888;">format: liczba strzałów (liczba goli)</div>
    </div>
  `;
}

function renderViewerShotChartCard(match, filtered, periodOptions) {
  const ownHalfA = filtered.filter(e => e.zone_name === 'own-half' && e.team_event === match.team_A).length;
  const ownHalfB = filtered.filter(e => e.zone_name === 'own-half' && e.team_event === match.team_B).length;
  const v = APP.viewer;

  return `
    <div class="viewer-card shot-chart">
      <h3>Shot chart</h3>
      <div class="viewer-controls">
        <span class="ctrl-label">Widok:</span>
        <div class="toggle-group">
          <button class="btn ${v.view_mode === 'full'   ? 'btn-active' : ''}" data-action="viewer-set-mode" data-arg="full">Pełne boisko</button>
          <button class="btn ${v.view_mode === 'half-A' ? 'btn-active' : ''}" data-action="viewer-set-mode" data-arg="half-A">Połowa ${escapeHtml(match.team_A)}</button>
          <button class="btn ${v.view_mode === 'half-B' ? 'btn-active' : ''}" data-action="viewer-set-mode" data-arg="half-B">Połowa ${escapeHtml(match.team_B)}</button>
        </div>
        <span class="ctrl-label" style="margin-left:8px;">Tryb:</span>
        <div class="toggle-group">
          <button class="btn ${v.display_mode === 'markers' ? 'btn-active' : ''}" data-action="viewer-set-display" data-arg="markers">Markery</button>
          <button class="btn ${v.display_mode === 'heatmap' ? 'btn-active' : ''}" data-action="viewer-set-display" data-arg="heatmap">Heatmap</button>
        </div>
        <span class="ctrl-label" style="margin-left:8px;">Okres:</span>
        <select id="filter-period" data-action="viewer-set-period-filter">
          <option value="all" ${v.filter_period === 'all' ? 'selected' : ''}>wszystkie</option>
          ${periodOptions.map(p => `<option value="${p}" ${v.filter_period === p ? 'selected' : ''}>${periodLabel(p)}</option>`).join('')}
        </select>
        <span class="ctrl-label" style="margin-left:8px;">Rezultat:</span>
        <select id="filter-result" data-action="viewer-set-result-filter">
          <option value="all"      ${v.filter_result === 'all'      ? 'selected' : ''}>wszystkie</option>
          <option value="gol"      ${v.filter_result === 'gol'      ? 'selected' : ''}>tylko gole</option>
          <option value="celny"    ${v.filter_result === 'celny'    ? 'selected' : ''}>tylko celne</option>
          <option value="niecelny" ${v.filter_result === 'niecelny' ? 'selected' : ''}>tylko niecelne</option>
        </select>
      </div>
      <div id="viewer-chart-host"></div>
      <div class="shot-chart-stats">
        <span><strong>${filtered.length}</strong> strzałów na widoku${(v.filter_period !== 'all' || v.filter_result !== 'all') ? ' (po filtrach)' : ''}</span>
        <span>•</span>
        <span>Zza połowy: <strong style="color:#1d4ed8">${escapeHtml(match.team_A)}: ${ownHalfA}</strong>, <strong style="color:#b91c1c">${escapeHtml(match.team_B)}: ${ownHalfB}</strong></span>
      </div>
    </div>
  `;
}
