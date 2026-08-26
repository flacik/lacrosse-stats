'use strict';

// Match-input screen: header bar, banners, field SVG host, controls, history.

function renderMatchInput(root) {
  if (APP.matchLoading) {
    root.innerHTML = `
      <div class="app-header">
        <button class="btn" data-action="back-home">${T('nav.back')}</button>
        <h1>${T('loading.match')}</h1>
        ${_langToggleBtn()}
        <button class="btn" data-action="toggle-dark-mode" id="theme-toggle" title="${T('nav.theme')}">🌙</button>
      </div>
      <div class="home-content">
        <div class="loading-state">
          <div class="spinner">⏳</div>
          <p>${T('loading.events')}</p>
        </div>
      </div>`;
    return;
  }

  const match = DATA.scheduledMatches.find(m => m.id === APP.matchId);
  if (!match || !APP.match) {
    root.innerHTML = `<div class="empty">${T('error.match_not_found')}</div>`;
    return;
  }
  const score = computeScore(match.id);
  const A_left = APP.match.team_A_side === 'left';
  const events = eventsForMatch(match.id);
  const allMatchEvents = DATA.events.filter(e => String(e.match_id) === String(match.id));
  const goalieA = getCurrentGoalieNumber(match.team_A, allMatchEvents);
  const goalieB = getCurrentGoalieNumber(match.team_B, allMatchEvents);
  const counters = computeCounterStats(match.id, match, null);
  const isFinal = APP.match.period === '4' || (APP.match.period && APP.match.period.startsWith('OT'));

  let bannerHtml = '';
  if (APP.banner) {
    if (APP.banner.type === 'own-half') {
      bannerHtml = `
        <div class="match-banner">
          <span>${T('banner.own_half')}</span>
          <button class="cancel" data-action="cancel-own-half">${T('btn.cancel_lower')}</button>
        </div>`;
    } else if (APP.banner.type === 'swap-question') {
      bannerHtml = `
        <div class="match-banner swap-question">
          <span>↔ ${escapeHtml(periodLabel(APP.banner.newPeriod))} — ${T('banner.swap_question')}</span>
          <button data-action="swap-answer" data-arg="yes">${T('btn.swap_yes')}</button>
          <button data-action="swap-answer" data-arg="no">${T('btn.swap_no')}</button>
        </div>`;
    } else if (APP.banner.type === 'period-end') {
      bannerHtml = `
        <div class="match-banner period-end">
          <span>${periodLabel(APP.banner.fromPeriod)} ${T('banner.period_end')}</span>
          <button data-action="next-overtime">${T('period.ot')} ${nextPeriod(APP.banner.fromPeriod)}</button>
          <button class="danger" data-action="end-match">${T('btn.end_match')}</button>
          <button class="cancel" data-action="cancel-banner">${T('btn.cancel_lower')}</button>
        </div>`;
    } else if (APP.banner.type === 'period-undo') {
      const orig = APP._periodQueue && APP._periodQueue[0];
      const fromLabel = orig ? periodLabel(orig.prevPeriod) : '?';
      const sidesTxt = APP.banner.sidesChanged ? T('banner.sides_changed') : '';
      bannerHtml = `
        <div class="match-banner period-undo">
          <span>${escapeHtml(fromLabel)} → ${escapeHtml(periodLabel(APP.banner.newPeriod))}${sidesTxt}</span>
          <button data-action="undo-period">${T('btn.undo')}</button>
          <button class="cancel" data-action="dismiss-period-undo">${T('btn.ok')}</button>
        </div>`;
    } else if (APP.banner.type === 'period-picker') {
      const periods = ['1', '2', '3', '4', 'OT1', 'OT2'];
      const btns = periods.map(p => {
        const active = APP.match.period === p ? ' btn-active' : '';
        return `<button class="btn${active}" data-action="select-period" data-arg="${p}">${escapeHtml(periodLabel(p))}</button>`;
      }).join('');
      bannerHtml = `
        <div class="match-banner period-picker">
          <span>${T('banner.period_label')}</span>
          <div class="period-picker-options">${btns}</div>
          <button class="cancel" data-action="cancel-pick-period">✕</button>
        </div>`;
    } else if (APP.banner.type === 'video-ts-duplicate') {
      bannerHtml = `
        <div class="match-banner video-ts-duplicate">
          <span>⚠ ${T('banner.video_ts_duplicate')}</span>
          <button class="cancel" data-action="cancel-banner">${T('btn.ok')}</button>
        </div>`;
    } else if (APP.banner.type === 'delete-undo') {
      const n = APP.banner.count;
      bannerHtml = `
        <div class="match-banner delete-undo">
          <span>🗑 ${T('banner.deleted')} ${n} ${T_n(n, 'banner.event', 'banner.events')}</span>
          <button data-action="undo-delete">${T('btn.undo')}</button>
          <button class="cancel" data-action="commit-delete">${T('btn.ok')}</button>
        </div>`;
    }
  }

  const pickerBtn = `<button class="btn btn-period-picker" data-action="pick-period" title="${T('period.quarter')}">▾</button>`;
  let controlsHtml;
  if (isFinal) {
    controlsHtml = `<div class="period-nav-group"><button class="btn btn-primary" data-action="period-end-prompt">→ ${periodLabel(APP.match.period)} ${T('banner.period_end')}</button>${pickerBtn}</div>`;
  } else {
    const np = nextPeriod(APP.match.period);
    controlsHtml = `<div class="period-nav-group"><button class="btn btn-primary" data-action="next-period">${T('btn.next_period')} (${periodLabel(np)})</button>${pickerBtn}</div>`;
  }

  const historyRowsHtml = events.length === 0
    ? `<div class="history-empty">${T('history.empty')}</div>`
    : events.map(e => renderHistoryRow(e, match)).join('');

  const _presence = APP.presenceCounts[String(match.id)] || { input: 0, viewer: 0 };
  const presenceBadgeHtml = _renderPresenceBadge(_presence.input, _presence.viewer, 'input');
  const errorCount = allMatchEvents.filter(e => e._syncError).length;
  const retryAllBtn = errorCount > 0
    ? `<button class="btn btn-retry-all" data-action="retry-all-errors" title="${APP.lang === 'pl' ? 'Ponów wszystkie błędy' : 'Retry all errors'}">↻ ${errorCount}</button>`
    : `<button class="btn btn-retry-all btn-retry-all-disabled" disabled title="${APP.lang === 'pl' ? 'Brak błędów synchronizacji' : 'No sync errors'}">↻ 0</button>`;

  root.innerHTML = `
    <div class="app-header app-header-v2">
      <button class="btn btn-back-v2" data-action="back-home">${T('nav.back')}</button>
      <div class="header-score-v2">
        <span class="team-A-color hs-team">${escapeHtml(match.team_A)}</span>
        <span class="team-A-color hs-num">${score.A}</span>
        <span class="hs-sep">:</span>
        <span class="team-B-color hs-num">${score.B}</span>
        <span class="team-B-color hs-team">${escapeHtml(match.team_B)}</span>
        <span class="period-pill-v2">${periodLabel(APP.match.period)}</span>
        <span class="tournament-pill-v2">${escapeHtml(match.tournament)}</span>
        ${match.video_url ? `<a class="btn-video-pill-v2" href="${escapeHtml(match.video_url)}" target="_blank" rel="noopener">▶ ${APP.lang === 'pl' ? 'Nagranie' : 'Recording'}</a>` : ''}
        ${match.video_url ? `<button class="btn" data-action="open-video-review" data-arg="${escapeHtml(match.video_url)}" title="${T('btn.video_review_hint')}">🎬 ${T('btn.video_review')}</button>` : ''}
      </div>
      <span class="sides-tag-v2">A: ${A_left ? T('sides.left') : T('sides.right')}</span>
      ${retryAllBtn}
      ${presenceBadgeHtml}
      ${_langToggleBtn()}
      <button class="btn" data-action="toggle-dark-mode" id="theme-toggle" title="${T('nav.theme')}">🌙</button>
    </div>
    <div class="match-screen match-screen-v2">
      <div class="match-layout-v2">

        <div class="match-field-col-v2">
          ${bannerHtml}
          <div id="field-wrap"></div>
          <div class="match-controls match-controls-v2">
            ${controlsHtml}
            <button class="btn" data-action="swap-sides">${T('btn.swap_sides')}</button>
            <button class="btn btn-warning ${APP.match.own_half_mode === 'active' ? 'btn-active' : ''}" data-action="own-half-toggle">${T('btn.own_half')}</button>
            <span class="sep">|</span>
            <button class="btn ${APP.match.show_zones ? 'btn-active' : ''}" data-action="toggle-zones">${T('btn.zones')}</button>
            <div class="right">
              <button class="btn btn-danger" data-action="end-match">${T('btn.end_match')}</button>
            </div>
          </div>
          <div class="goalie-bar goalie-bar-v2">
            <div class="goalie-field-v2">
              <span class="goalie-label-v2 team-A-color">${T('goalie.brk')} ${escapeHtml(match.team_A)}</span>
              <span class="goalie-value-v2">
                ${goalieA !== null ? '#' + goalieA : '—'}
                <button data-action="open-goalie-modal" data-arg="A" class="goalie-edit-btn">✎</button>
              </span>
            </div>
            <div class="goalie-field-v2">
              <span class="goalie-label-v2 team-B-color">${T('goalie.brk')} ${escapeHtml(match.team_B)}</span>
              <span class="goalie-value-v2">
                ${goalieB !== null ? '#' + goalieB : '—'}
                <button data-action="open-goalie-modal" data-arg="B" class="goalie-edit-btn">✎</button>
              </span>
            </div>
            <button data-action="open-goalie-retroactive" class="btn-link goalie-retroactive-v2">${T('goalie.edit_retro')}</button>
          </div>
          <div class="counter-bar counter-bar-v2 counter-bar-summary">
            <span class="counter-team-v2 team-A-color" title="${escapeHtml(match.team_A)}">${escapeHtml(match.team_A)}</span>
            <div class="counter-cell-v2">
              <span class="counter-label-v2">GB</span>
              <span class="counter-val-v2 team-A-color">${counters.gbA}</span>
              <span class="counter-sep-v2">:</span>
              <span class="counter-val-v2 team-B-color">${counters.gbB}</span>
            </div>
            <span class="counter-divider-v2">|</span>
            <div class="counter-cell-v2">
              <span class="counter-label-v2">Draw</span>
              <span class="counter-val-v2 team-A-color">${counters.drawA}</span>
              <span class="counter-sep-v2">:</span>
              <span class="counter-val-v2 team-B-color">${counters.drawB}</span>
            </div>
            <span class="counter-team-v2 team-B-color" title="${escapeHtml(match.team_B)}">${escapeHtml(match.team_B)}</span>
          </div>
        </div>

        <div class="match-history-col-v2">
          <div class="history-section">
            <div class="history-header ${APP.match.history_expanded ? '' : 'collapsed no-border'}" data-action="toggle-history">
              <span class="toggle-icon">▾</span>
              <span>${T('history.title')}</span>
              <span class="count">(${events.length})</span>
            </div>
            ${APP.match.history_expanded ? `<div class="history-list">${historyRowsHtml}</div>` : ''}
          </div>
        </div>

      </div>
    </div>`;

  const fieldWrap = document.getElementById('field-wrap');
  fieldWrap.appendChild(buildFieldSvg(match));
  fieldWrap.appendChild(buildFieldLegend(match, { includeManUp: true }));
}

function renderHistoryRow(e, match) {
  const slot  = teamSlot(match.id, e.team_event);

  let syncBadge = '';
  let retryBtn  = '';
  if (e._syncing) {
    syncBadge = `<span class="sync-badge syncing" title="${T('sync.saving')}">⟳</span>`;
  } else if (e._syncError) {
    syncBadge = `<span class="sync-badge error" title="${escapeHtml(e._syncError)}">⚠ ${escapeHtml(e._syncError)}</span>`;
    retryBtn  = `<button class="icon-btn retry" data-action="retry-event" data-arg="${escapeHtml(e.client_event_id)}" title="${T('btn.retry_send')}">↻</button>`;
  }

  const rowClass = e._syncError ? 'history-row sync-error' : 'history-row';
  const isCounterEvent = e.event_type === 'groundball' || e.event_type === 'draw';
  const resultLabel = isCounterEvent
    ? (e.event_type === 'groundball' ? 'GB' : 'Draw')
    : e.result;

  const flags = [];
  if (e.man_up)        flags.push('<span class="flag man-up">man-up</span>');
  if (e.man_down)      flags.push('<span class="flag man-down">man-down</span>');
  if (e.assisted)      flags.push('<span class="flag assisted">A</span>');
  if (e.fast_break)    flags.push('<span class="flag fast-break">FB</span>');
  if (e.free_position) flags.push('<span class="flag free-position">FP</span>');
  if (e.penalty_shot)  flags.push('<span class="flag penalty-shot">PEN</span>');

  return `
    <div class="${rowClass}">
      <div class="period">${periodLabel(e.period)}</div>
      <div class="team-tag ${slot}">${slot}</div>
      <div class="result ${isCounterEvent ? '' : e.result}">${resultLabel}</div>
      <div class="flags">${flags.join('')}${syncBadge}</div>
      <div class="actions">
        ${retryBtn}
        ${(match.video_url && e.video_ts !== undefined && e.video_ts !== '' && e.video_ts !== null)
          ? `<a class="icon-btn" href="${escapeHtml(appendYtTimestamp(match.video_url, e.video_ts))}" target="_blank" rel="noopener" title="${T('btn.watch_moment')}">▶</a>`
          : ''}
        <button class="icon-btn"        title="${APP.lang === 'pl' ? 'Edytuj' : 'Edit'}" data-action="edit-event"   data-arg="${e.id}">✎</button>
        <button class="icon-btn delete" title="${APP.lang === 'pl' ? 'Usuń' : 'Delete'}" data-action="delete-event" data-arg="${e.id}">🗑</button>
      </div>
    </div>`;
}
