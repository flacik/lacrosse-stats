'use strict';

// Match-input screen: header bar, banners, field SVG host, controls, history.

function renderMatchInput(root) {
  // Ładowanie eventów z backendu
  if (APP.matchLoading) {
    root.innerHTML = `
      <div class="app-header">
        <button class="btn" data-action="back-home">← Wróć</button>
        <h1>Ładowanie meczu…</h1>
        <button class="btn" data-action="toggle-dark-mode" id="theme-toggle" title="Przełącz tryb ciemny">🌙</button>
      </div>
      <div class="home-content">
        <div class="loading-state">
          <div class="spinner">⏳</div>
          <p>Pobieranie eventów z bazy…</p>
        </div>
      </div>
    `;
    return;
  }

  const match = DATA.scheduledMatches.find(m => m.id === APP.matchId);
  if (!match || !APP.match) {
    root.innerHTML = '<div class="empty">Mecz nie znaleziony</div>';
    return;
  }
  const score = computeScore(match.id);
  const A_left = APP.match.team_A_side === 'left';
  const events = eventsForMatch(match.id);
  const isFinal = APP.match.period === '4' || (APP.match.period && APP.match.period.startsWith('OT'));

  let bannerHtml = '';
  if (APP.banner) {
    if (APP.banner.type === 'own-half') {
      bannerHtml = `
        <div class="match-banner">
          <span>⚠ Tryb „strzał z połowy" — kliknij w połowę drużyny, która oddała strzał (auto-detekcja po połowie boiska).</span>
          <button class="cancel" data-action="cancel-own-half">anuluj</button>
        </div>
      `;
    } else if (APP.banner.type === 'swap-question') {
      bannerHtml = `
        <div class="match-banner swap-question">
          <span>↔ ${escapeHtml(periodLabel(APP.banner.newPeriod))} — zamienić strony drużyn?</span>
          <button data-action="swap-answer" data-arg="yes">Tak, zamień</button>
          <button data-action="swap-answer" data-arg="no">Nie, zostaw</button>
        </div>
      `;
    } else if (APP.banner.type === 'period-end') {
      bannerHtml = `
        <div class="match-banner period-end">
          <span>${periodLabel(APP.banner.fromPeriod)} zakończona. Co dalej?</span>
          <button data-action="next-overtime">Dogrywka ${nextPeriod(APP.banner.fromPeriod)}</button>
          <button class="danger" data-action="end-match">🏁 Koniec meczu</button>
          <button class="cancel" data-action="cancel-banner">anuluj</button>
        </div>
      `;
    }
  }

  let controlsHtml;
  if (isFinal) {
    controlsHtml = `<button class="btn btn-primary" data-action="period-end-prompt">→ ${periodLabel(APP.match.period)} skończona…</button>`;
  } else {
    const np = nextPeriod(APP.match.period);
    controlsHtml = `<button class="btn btn-primary" data-action="next-period">→ Następny okres (${periodLabel(np)})</button>`;
  }

  const historyRowsHtml = events.length === 0
    ? '<div class="history-empty">Brak zarejestrowanych eventów</div>'
    : events.map(e => renderHistoryRow(e, match)).join('');

  root.innerHTML = `
    <div class="app-header">
      <button class="btn" data-action="back-home">← Wróć</button>
      <h1>${escapeHtml(match.team_A)} vs ${escapeHtml(match.team_B)}</h1>
      <button class="btn" data-action="toggle-dark-mode" id="theme-toggle" title="Przełącz tryb ciemny">🌙</button>
    </div>
    <div class="match-info-bar">
      <div class="score">
        <span class="team-A-color">${escapeHtml(match.team_A)} ${score.A}</span>
        <span class="sep">:</span>
        <span class="team-B-color">${score.B} ${escapeHtml(match.team_B)}</span>
      </div>
      <div class="period">${periodLabel(APP.match.period)}</div>
      <div class="tournament">${escapeHtml(match.tournament)}</div>
      <div class="sides-indicator">A po stronie: <strong>${A_left ? 'lewej' : 'prawej'}</strong></div>
      ${match.video_url ? `<a class="btn btn-video" href="${escapeHtml(match.video_url)}" target="_blank" rel="noopener">▶ Nagranie</a>` : ''}
    </div>
    <div class="match-screen">
      <div class="match-section">
        ${bannerHtml}
        <div id="field-wrap"></div>
        <div class="match-controls">
          ${controlsHtml}
          <button class="btn" data-action="swap-sides">↔ Zamień strony</button>
          <button class="btn btn-warning ${APP.match.own_half_mode === 'active' ? 'btn-active' : ''}" data-action="own-half-toggle">⚠ Strzał z połowy</button>
          <span class="sep">|</span>
          <button class="btn ${APP.match.show_zones ? 'btn-active' : ''}" data-action="toggle-zones">👁 Strefy</button>
          <div class="right">
            <button class="btn btn-danger" data-action="end-match">🏁 Koniec meczu</button>
          </div>
        </div>
        <div class="history-section">
          <div class="history-header ${APP.match.history_expanded ? '' : 'collapsed no-border'}" data-action="toggle-history">
            <span class="toggle-icon">▾</span>
            <span>Historia</span>
            <span class="count">(${events.length})</span>
          </div>
          ${APP.match.history_expanded ? `<div class="history-list">${historyRowsHtml}</div>` : ''}
        </div>
      </div>
    </div>
  `;

  // Inject SVG via DOM (innerHTML strips event handlers)
  document.getElementById('field-wrap').appendChild(buildFieldSvg(match));
}

function renderHistoryRow(e, match) {
  const slot  = teamSlot(match.id, e.team_event);
  const flags = [];
  if (e.man_up)                          flags.push('<span class="flag man-up">man-up</span>');
  if (e.man_down)                        flags.push('<span class="flag man-down">man-down</span>');
  if (e.assisted && e.result === 'gol') flags.push('<span class="flag assisted">asysta</span>');

  // Wskaźnik synchronizacji z GAS
  let syncBadge = '';
  let retryBtn  = '';
  if (e._syncing) {
    syncBadge = '<span class="sync-badge syncing" title="Zapisywanie…">⟳</span>';
  } else if (e._syncError) {
    syncBadge = `<span class="sync-badge error" title="${escapeHtml(e._syncError)}">⚠ ${escapeHtml(e._syncError)}</span>`;
    retryBtn  = `<button class="icon-btn retry" data-action="retry-event" data-arg="${escapeHtml(e.client_event_id)}" title="Wyślij ponownie">↻</button>`;
  }

  const rowClass = e._syncError ? 'history-row sync-error' : 'history-row';

  return `
    <div class="${rowClass}">
      <div class="period">${periodLabel(e.period)}</div>
      <div class="team-tag ${slot}">${slot}</div>
      <div class="result ${e.result}">${e.result}</div>
      <div class="zone${e.zone_name === 'own-half' ? ' own-half' : ''}">${e.zone_name}</div>
      <div class="flags">${flags.join('')}${syncBadge}</div>
      <div class="actions">
        ${retryBtn}
        <button class="icon-btn"        title="Edytuj" data-action="edit-event"   data-arg="${e.id}">✎</button>
        <button class="icon-btn delete" title="Usuń"   data-action="delete-event" data-arg="${e.id}">🗑</button>
      </div>
    </div>
  `;
}
