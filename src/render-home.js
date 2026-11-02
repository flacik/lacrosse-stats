'use strict';

// Home screen: lista meczy dzisiejszego dnia + przeszłe + przycisk ad-hoc.

function _langToggleBtn() {
  return `<button class="btn" data-action="toggle-lang" title="Switch language">${APP.lang === 'pl' ? '🇬🇧' : '🇵🇱'}</button>`;
}

const HOME_STATUS_ORDER = { live: 0, scheduled: 1, finished: 2 };

function _homeStatus(m) {
  return m.status === 'live' || m.status === 'finished' ? m.status : 'scheduled';
}

function _homeTeamMatch(m, f) {
  if (f.team && m.team_A !== f.team && m.team_B !== f.team) return false;
  const q = (f.q || '').trim().toLowerCase();
  if (!q) return true;
  return [m.team_A, m.team_B, m.tournament].some(v => String(v || '').toLowerCase().includes(q));
}

function _renderHomeFilters(f, listed, filterActive) {
  const teams = Array.from(new Set(
    DATA.scheduledMatches.flatMap(m => [m.team_A, m.team_B]).filter(Boolean)
  )).sort((a, b) => a.localeCompare(b));
  if (f.team && !teams.includes(f.team)) teams.unshift(f.team);

  // Liczniki = mecze widoczne na liście (dziś + przeszłe, albo tylko dziś przy „Today”) po filtrze drużyny/tekstu.
  const count = st => listed.filter(m => !st || _homeStatus(m) === st).length;
  const chip = (st, label) => `
    <button class="home-chip ${f.status === st ? 'active' : ''} ${st ? 'chip-' + st : ''}"
            data-action="home-set-status" data-arg="${st}">${label} <span class="home-chip-n">${count(st)}</span></button>`;

  return `
    <div class="home-filters">
      <input type="search" id="home-search" class="home-search" data-action="home-search"
             placeholder="${T('home.search_ph')}" value="${escapeHtml(f.q)}" autocomplete="off">
      <select class="home-team-select" data-action="home-set-team">
        <option value="">${T('home.all_teams')}</option>
        ${teams.map(t => `<option value="${escapeHtml(t)}" ${t === f.team ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
      </select>
      <div class="home-chips">
        <button class="home-chip home-chip-today ${f.today ? 'active' : ''}" data-action="home-toggle-today" aria-pressed="${f.today}">📅 ${T('home.today')}</button>
        <span class="home-chip-sep"></span>
        ${chip('', T('home.status_all'))}
        ${chip('live', 'LIVE')}
        ${chip('scheduled', T('home.status_scheduled'))}
        ${chip('finished', T('home.status_finished'))}
        ${filterActive ? `<button class="home-chip home-chip-clear" data-action="home-clear-filters">✕ ${T('home.clear_filters')}</button>` : ''}
      </div>
    </div>`;
}

function renderHome(root) {
  const today = todayISO();

  const headerHtml = `
    <div class="app-header">
      <h1>Lacrosse Stats</h1>
      <span class="meta">${today}</span>
      ${IS_EDITOR ? `<button class="btn" data-action="open-admin">${T('nav.admin')}</button>` : ''}
      <button class="btn" data-action="open-analytics">${T('nav.analytics')}</button>
      <button class="btn" data-action="open-standings">${T('nav.standings')}</button>
      ${_langToggleBtn()}
      <button class="btn" data-action="toggle-dark-mode" id="theme-toggle" title="${T('nav.theme')}">🌙</button>
    </div>`;

  if (APP.homeLoading) {
    root.innerHTML = headerHtml + `
      <div class="home-content">
        <div class="loading-state">
          <div class="spinner">⏳</div>
          <p>${T('loading.matches')}</p>
        </div>
      </div>`;
    return;
  }

  if (APP.homeError) {
    root.innerHTML = headerHtml + `
      <div class="home-content">
        <div class="error-state">
          <p>⚠ ${T('error.loading')}: ${escapeHtml(APP.homeError)}</p>
          <button class="btn btn-primary" data-action="home-retry">${T('btn.retry')}</button>
        </div>
      </div>`;
    return;
  }

  const f = APP.homeFilter;
  const filterActive = !!(f.q || f.team || f.status || f.today);
  // Filtr drużyny + tekst (bez statusu) — liczniki na przyciskach statusu liczą się z tego zbioru.
  const byTeam = DATA.scheduledMatches.filter(m => _homeTeamMatch(m, f));
  const passes = m => !f.status || _homeStatus(m) === f.status;

  // Dzisiejsze: LIVE → zaplanowane → zakończone; w grupie kolejność z arkusza (sort stabilny).
  const todayAll     = byTeam.filter(m => m.match_date === today);
  const todayMatches = todayAll.filter(passes)
    .map((m, i) => ({ m, i }))
    .sort((a, b) => (HOME_STATUS_ORDER[_homeStatus(a.m)] - HOME_STATUS_ORDER[_homeStatus(b.m)]) || (a.i - b.i))
    .map(x => x.m);
  const pastMatches  = f.today ? [] : byTeam
    .filter(m => m.match_date < today)
    .filter(passes)
    .sort((a, b) => b.match_date.localeCompare(a.match_date));

  function renderMatchCard(m) {
    const score      = computeScore(m.id);
    const eventCount = DATA.events.filter(e => e.match_id === m.id).length;
    const isFinished = m.status === 'finished';
    const isLive     = m.status === 'live';
    const presence = APP.presenceCounts[String(m.id)] || { input: 0, viewer: 0 };
    const presenceBadgeHtml = _renderPresenceBadge(presence.input, presence.viewer, null);
    return `
      <div class="match-card ${isFinished ? 'finished' : ''}">
        <div class="match-tournament">
          ${escapeHtml(m.tournament || T('match.no_tournament'))}
          ${isLive ? ' <span class="badge-live">LIVE</span>' : ''}
          ${presenceBadgeHtml}
        </div>
        <div class="match-teams">
          <span>${escapeHtml(m.team_A)}</span>
          ${eventCount > 0 || isFinished
            ? `<span class="match-score">${score.A} : ${score.B}</span>`
            : '<span class="vs">vs</span>'}
          <span>${escapeHtml(m.team_B)}</span>
        </div>
        <div class="match-meta">
          ${m.match_date}
          ${eventCount > 0 ? ` · ${eventCount} ${T_n(eventCount, 'offline.event', 'offline.events')}` : ''}
        </div>
        <div class="match-actions">
          ${IS_EDITOR ? `<button class="btn btn-primary" data-action="open-match" data-arg="${m.id}">${isFinished ? T('btn.open') : T('btn.input_stats')}</button>` : ''}
          <button class="btn btn-secondary" data-action="open-viewer" data-arg="${m.id}">${T('btn.view_only')}</button>
        </div>
      </div>`;
  }

  const infoBannerHtml = (APP.banner && APP.banner.type === 'info')
    ? `<div class="home-info-banner">${escapeHtml(APP.banner.msg)}</div>`
    : '';

  const offlineBannerHtml = APP.offlineBanner
    ? `<div class="offline-recovery-banner">
        ⚠ ${APP.offlineBanner} ${T_n(APP.offlineBanner, 'offline.event', 'offline.events')} ${T('offline.pending')}
        <div class="offline-recovery-actions">
          <button class="btn btn-sm btn-primary" data-action="retry-all-offline">${T('btn.retry_all') || 'Ponów wszystkie'}</button>
          <button class="btn btn-sm" data-action="export-offline-backup" title="${T('btn.download_backup')}">${T('btn.download_backup')}</button>
          <button class="btn btn-sm" data-action="import-offline-backup" title="${T('btn.import_backup')}">${T('btn.import_backup')}</button>
        </div>
      </div>`
    : '';

  let html = headerHtml + offlineBannerHtml + infoBannerHtml + `
    <div class="home-content">
      ${_renderHomeFilters(f, byTeam.filter(m => f.today ? m.match_date === today : m.match_date <= today), filterActive)}
      <h2>${T('home.today_matches')}</h2>`;

  if (todayMatches.length === 0 && filterActive && DATA.scheduledMatches.some(m => m.match_date === today)) {
    html += `<div class="empty">${T('home.filter_no_results')}</div>`;
  } else if (todayMatches.length === 0) {
    html += `<div class="empty">${T('home.no_today')}` +
      (IS_EDITOR ? `<br>${T('home.no_today_hint')}` : '') +
      '</div>';
  } else {
    html += '<div class="match-list">';
    todayMatches.forEach(m => { html += renderMatchCard(m); });
    html += '</div>';
  }

  if (pastMatches.length > 0) {
    html += `<h2 style="margin-top:1.5rem">${T('home.past_matches')}</h2>`;
    html += '<div class="match-list">';
    pastMatches.forEach(m => { html += renderMatchCard(m); });
    html += '</div>';
  }

  html += (IS_EDITOR ? `<button class="add-match" data-action="ad-hoc">${T('btn.new_adhoc')}</button>` : '') + '</div>';
  root.innerHTML = html;
}
