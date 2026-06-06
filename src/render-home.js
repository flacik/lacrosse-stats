'use strict';

// Home screen: lista meczy dzisiejszego dnia + przeszłe + przycisk ad-hoc.
// Dane ładowane async przez loadHomeData() w state.js.

function renderHome(root) {
  const today = todayISO();

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (APP.homeLoading) {
    root.innerHTML = `
      <div class="app-header">
        <h1>Lacrosse Stats</h1>
        <span class="meta">${today}</span>
        ${IS_EDITOR ? '<button class="btn" data-action="open-admin">⚙️ Admin</button>' : ''}
        <button class="btn" data-action="open-analytics">📊 Analityka</button>
        <button class="btn" data-action="open-standings">🏆 Tabela</button>
        <button class="btn" data-action="toggle-dark-mode" id="theme-toggle" title="Przełącz tryb ciemny">🌙</button>
      </div>
      <div class="home-content">
        <div class="loading-state">
          <div class="spinner">⏳</div>
          <p>Ładowanie meczy…</p>
        </div>
      </div>
    `;
    return;
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (APP.homeError) {
    root.innerHTML = `
      <div class="app-header">
        <h1>Lacrosse Stats</h1>
        <span class="meta">${today}</span>
        ${IS_EDITOR ? '<button class="btn" data-action="open-admin">⚙️ Admin</button>' : ''}
        <button class="btn" data-action="open-analytics">📊 Analityka</button>
        <button class="btn" data-action="open-standings">🏆 Tabela</button>
        <button class="btn" data-action="toggle-dark-mode" id="theme-toggle" title="Przełącz tryb ciemny">🌙</button>
      </div>
      <div class="home-content">
        <div class="error-state">
          <p>⚠ Błąd ładowania: ${escapeHtml(APP.homeError)}</p>
          <button class="btn btn-primary" data-action="home-retry">↺ Spróbuj ponownie</button>
        </div>
      </div>
    `;
    return;
  }

  // ── Loaded ───────────────────────────────────────────────────────────────────
  const todayMatches = DATA.scheduledMatches.filter(m => m.match_date === today);
  const pastMatches  = DATA.scheduledMatches
    .filter(m => m.match_date < today)
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
          ${escapeHtml(m.tournament || '— brak turnieju —')}
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
          ${eventCount > 0 ? ` · ${eventCount} eventów` : ''}
        </div>
        <div class="match-actions">
          ${IS_EDITOR ? `<button class="btn btn-primary" data-action="open-match" data-arg="${m.id}">${isFinished ? 'Otwórz' : 'Wpisuj statystyki'}</button>` : ''}
          <button class="btn btn-secondary" data-action="open-viewer" data-arg="${m.id}">Tylko podgląd</button>
        </div>
      </div>
    `;
  }

  const infoBannerHtml = (APP.banner && APP.banner.type === 'info')
    ? `<div class="home-info-banner">${escapeHtml(APP.banner.msg)}</div>`
    : '';

  const offlineBannerHtml = APP.offlineBanner
    ? `<div class="offline-recovery-banner">
        ⚠ ${APP.offlineBanner} event${APP.offlineBanner === 1 ? '' : 'ów'} czeka na synchronizację (brak internetu przy ostatnim użyciu).
        <div class="offline-recovery-actions">
          <button class="btn btn-sm" data-action="export-offline-backup" title="Pobierz kopię zapasową jako plik JSON">Pobierz kopię</button>
          <button class="btn btn-sm" data-action="import-offline-backup" title="Importuj kopię zapasową z pliku JSON">Importuj z pliku</button>
        </div>
      </div>`
    : '';

  let html = `
    <div class="app-header">
      <h1>Lacrosse Stats</h1>
      <span class="meta">${today}</span>
      ${IS_EDITOR ? '<button class="btn" data-action="open-admin">⚙️ Admin</button>' : ''}
      <button class="btn" data-action="open-analytics">📊 Analityka</button>
      <button class="btn" data-action="open-standings">🏆 Tabela</button>
      <button class="btn" data-action="toggle-dark-mode" id="theme-toggle" title="Przełącz tryb ciemny">🌙</button>
    </div>
    ${offlineBannerHtml}
    ${infoBannerHtml}
    <div class="home-content">
      <h2>Mecze dzisiaj</h2>
  `;

  if (todayMatches.length === 0) {
    html += '<div class="empty">Brak meczy zaplanowanych na dziś.' +
      (IS_EDITOR ? '<br>Dodaj mecze w panelu Turniejów lub utwórz mecz ad-hoc.' : '') +
      '</div>';
  } else {
    html += '<div class="match-list">';
    todayMatches.forEach(m => { html += renderMatchCard(m); });
    html += '</div>';
  }

  if (pastMatches.length > 0) {
    html += '<h2 style="margin-top:1.5rem">Mecze z przeszłości</h2>';
    html += '<div class="match-list">';
    pastMatches.forEach(m => { html += renderMatchCard(m); });
    html += '</div>';
  }

  html += (IS_EDITOR ? '<button class="add-match" data-action="ad-hoc">+ Nowy mecz ad-hoc</button>' : '') + '</div>';
  root.innerHTML = html;
}
