'use strict';

// Home screen: lista meczy dzisiejszego dnia + przycisk ad-hoc.
// Dane ładowane async przez loadHomeData() w state.js.

function renderHome(root) {
  const today = todayISO();

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (APP.homeLoading) {
    root.innerHTML = `
      <div class="app-header">
        <h1>Lacrosse Stats</h1>
        <span class="meta">${today}</span>
        <button class="btn" data-action="open-admin">📋 Turnieje</button>
        <button class="btn" data-action="open-analytics">📊 Analityka</button>
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
        <button class="btn" data-action="open-admin">📋 Turnieje</button>
        <button class="btn" data-action="open-analytics">📊 Analityka</button>
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

  let html = `
    <div class="app-header">
      <h1>Lacrosse Stats</h1>
      <span class="meta">${today}</span>
      <button class="btn" data-action="open-admin">📋 Turnieje</button>
      <button class="btn" data-action="open-analytics">📊 Analityka</button>
    </div>
    <div class="home-content">
      <h2>Mecze dzisiaj</h2>
  `;

  if (todayMatches.length === 0) {
    html += '<div class="empty">Brak meczy zaplanowanych na dziś.<br>Dodaj mecze w panelu Turniejów lub utwórz mecz ad-hoc.</div>';
  } else {
    html += '<div class="match-list">';
    todayMatches.forEach(m => {
      const score      = computeScore(m.id);
      const eventCount = DATA.events.filter(e => e.match_id === m.id).length;
      const isFinished = m.status === 'finished';
      const isLive = m.status === 'live';
      html += `
        <div class="match-card ${isFinished ? 'finished' : ''}">
          <div class="match-tournament">
            ${escapeHtml(m.tournament || '— brak turnieju —')}
            ${isLive ? ' <span class="badge-live">LIVE</span>' : ''}
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
            <button class="btn btn-primary"   data-action="open-match"  data-arg="${m.id}">${isFinished ? 'Otwórz' : 'Wpisuj statystyki'}</button>
            <button class="btn btn-secondary" data-action="open-viewer" data-arg="${m.id}">Tylko podgląd</button>
          </div>
        </div>
      `;
    });
    html += '</div>';
  }

  html += `<button class="add-match" data-action="ad-hoc">+ Nowy mecz ad-hoc</button></div>`;
  root.innerHTML = html;
}
