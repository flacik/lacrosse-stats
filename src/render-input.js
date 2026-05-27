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
  const allMatchEvents = DATA.events.filter(e => String(e.match_id) === String(match.id));
  const goalieA = getCurrentGoalieNumber(match.team_A, allMatchEvents);
  const goalieB = getCurrentGoalieNumber(match.team_B, allMatchEvents);
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
    } else if (APP.banner.type === 'period-undo') {
      const orig = APP._periodQueue && APP._periodQueue[0];
      const fromLabel = orig ? periodLabel(orig.prevPeriod) : '?';
      const sidesTxt = APP.banner.sidesChanged ? ', strony zamienione' : '';
      bannerHtml = `
        <div class="match-banner period-undo">
          <span>${escapeHtml(fromLabel)} → ${escapeHtml(periodLabel(APP.banner.newPeriod))}${sidesTxt}</span>
          <button data-action="undo-period">↩ Cofnij</button>
          <button class="cancel" data-action="dismiss-period-undo">OK</button>
        </div>
      `;
    } else if (APP.banner.type === 'period-picker') {
      const periods = ['1', '2', '3', '4', 'OT1', 'OT2'];
      const btns = periods.map(p => {
        const active = APP.match.period === p ? ' btn-active' : '';
        return `<button class="btn${active}" data-action="select-period" data-arg="${p}">${escapeHtml(periodLabel(p))}</button>`;
      }).join('');
      bannerHtml = `
        <div class="match-banner period-picker">
          <span>Kwarta:</span>
          <div class="period-picker-options">${btns}</div>
          <button class="cancel" data-action="cancel-pick-period">✕</button>
        </div>
      `;
    } else if (APP.banner.type === 'delete-undo') {
      const n = APP.banner.count;
      bannerHtml = `
        <div class="match-banner delete-undo">
          <span>🗑 Usunięto ${n} event${n === 1 ? '' : 'ów'}</span>
          <button data-action="undo-delete">↩ Cofnij</button>
          <button class="cancel" data-action="commit-delete">OK</button>
        </div>
      `;
    }
  }

  const pickerBtn = `<button class="btn btn-period-picker" data-action="pick-period" title="Wybierz kwartę">▾</button>`;
  let controlsHtml;
  if (isFinal) {
    controlsHtml = `<div class="period-nav-group"><button class="btn btn-primary" data-action="period-end-prompt">→ ${periodLabel(APP.match.period)} skończona…</button>${pickerBtn}</div>`;
  } else {
    const np = nextPeriod(APP.match.period);
    controlsHtml = `<div class="period-nav-group"><button class="btn btn-primary" data-action="next-period">→ Następny okres (${periodLabel(np)})</button>${pickerBtn}</div>`;
  }

  const historyRowsHtml = events.length === 0
    ? '<div class="history-empty">Brak zarejestrowanych eventów</div>'
    : events.map(e => renderHistoryRow(e, match)).join('');

  root.innerHTML = `
    <div class="app-header app-header-v2">
      <button class="btn btn-back-v2" data-action="back-home">← Wróć</button>
      <div class="header-score-v2">
        <span class="team-A-color hs-team">${escapeHtml(match.team_A)}</span>
        <span class="team-A-color hs-num">${score.A}</span>
        <span class="hs-sep">:</span>
        <span class="team-B-color hs-num">${score.B}</span>
        <span class="team-B-color hs-team">${escapeHtml(match.team_B)}</span>
        <span class="period-pill-v2">${periodLabel(APP.match.period)}</span>
        <span class="tournament-pill-v2">${escapeHtml(match.tournament)}</span>
        ${match.video_url ? `<a class="btn-video-pill-v2" href="${escapeHtml(match.video_url)}" target="_blank" rel="noopener">▶ Nagranie</a>` : ''}
      </div>
      <span class="sides-tag-v2">A: ${A_left ? 'lewej' : 'prawej'}</span>
      <button class="btn" data-action="toggle-dark-mode" id="theme-toggle" title="Przełącz tryb ciemny">🌙</button>
    </div>
    <div class="match-screen match-screen-v2">
      <div class="match-layout-v2">

        <div class="match-field-col-v2">
          ${bannerHtml}
          <div id="field-wrap"></div>
          <div class="match-controls match-controls-v2">
            ${controlsHtml}
            <button class="btn" data-action="swap-sides">↔ Zamień strony</button>
            <button class="btn btn-warning ${APP.match.own_half_mode === 'active' ? 'btn-active' : ''}" data-action="own-half-toggle">⚠ Strzał z połowy</button>
            <span class="sep">|</span>
            <button class="btn ${APP.match.show_zones ? 'btn-active' : ''}" data-action="toggle-zones">👁 Strefy</button>
            <div class="right">
              <button class="btn btn-danger" data-action="end-match">🏁 Koniec meczu</button>
            </div>
          </div>
          <div class="goalie-bar goalie-bar-v2">
            <div class="goalie-field-v2">
              <span class="goalie-label-v2 team-A-color">BRK — ${escapeHtml(match.team_A)}</span>
              <span class="goalie-value-v2">
                ${goalieA !== null ? '#' + goalieA : '—'}
                <button data-action="open-goalie-modal" data-arg="A" class="goalie-edit-btn">✎</button>
              </span>
            </div>
            <div class="goalie-field-v2">
              <span class="goalie-label-v2 team-B-color">BRK — ${escapeHtml(match.team_B)}</span>
              <span class="goalie-value-v2">
                ${goalieB !== null ? '#' + goalieB : '—'}
                <button data-action="open-goalie-modal" data-arg="B" class="goalie-edit-btn">✎</button>
              </span>
            </div>
            <button data-action="open-goalie-retroactive" class="btn-link goalie-retroactive-v2">Edytuj po meczu</button>
          </div>
        </div>

        <div class="match-history-col-v2">
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
    </div>
  `;

  // Inject SVG via DOM (innerHTML strips event handlers)
  const fieldWrap = document.getElementById('field-wrap');
  fieldWrap.appendChild(buildFieldSvg(match));
  fieldWrap.appendChild(buildFieldLegend(match, { includeManUp: true }));
}

function renderHistoryRow(e, match) {
  const slot  = teamSlot(match.id, e.team_event);
  const flags = [];
  if (e.man_up)    flags.push('<span class="flag man-up">man-up</span>');
  if (e.man_down)  flags.push('<span class="flag man-down">man-down</span>');
  if (e.assisted)  flags.push('<span class="flag assisted">A</span>');

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
      <div class="flags">${flags.join('')}${syncBadge}</div>
      <div class="actions">
        ${retryBtn}
        <button class="icon-btn"        title="Edytuj" data-action="edit-event"   data-arg="${e.id}">✎</button>
        <button class="icon-btn delete" title="Usuń"   data-action="delete-event" data-arg="${e.id}">🗑</button>
      </div>
    </div>
  `;
}
