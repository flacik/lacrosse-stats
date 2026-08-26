'use strict';

// Modal dispatcher + modal templates.

function renderModal() {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.dataset.action = 'modal-bg-click';

  if      (APP.modal.type === 'result')              bg.innerHTML = renderResultModal(APP.modal.pending);
  else if (APP.modal.type === 'edit-event')          bg.innerHTML = renderEditEventModal(APP.modal.event);
  else if (APP.modal.type === 'confirm-end')         bg.innerHTML = renderConfirmEnd();
  else if (APP.modal.type === 'ad-hoc')              bg.innerHTML = renderAdHocModal();
  else if (APP.modal.type === 'tournament-form')     bg.innerHTML = renderTournamentModal(APP.modal.tournament);
  else if (APP.modal.type === 'match-form')          bg.innerHTML = renderMatchModal(APP.modal.match);
  else if (APP.modal.type === 'goalie-form')         bg.innerHTML = renderGoalieFormModal();
  else if (APP.modal.type === 'goalie-retroactive')  bg.innerHTML = renderGoalieRetroactiveModal();
  else if (APP.modal.type === 'confirm')             bg.innerHTML = renderConfirmModal();

  document.body.appendChild(bg);
}

function closeModal() { APP.modal = null; render(); }

function renderResultModal(pending) {
  const match = DATA.scheduledMatches.find(m => m.id === APP.matchId);
  return `
    <div class="modal" data-stop-propagation="true">
      <h2>${T('modal.shot.title')}</h2>
      <div class="modal-subtitle">${T('modal.shot.subtitle')}</div>
      <div class="modal-context">
        <div class="row">
          <span class="label">${T('field.team')}</span>
          <span class="value team-${pending.team_slot}">${escapeHtml(pending.team_event)} (${pending.team_slot})</span>
        </div>
        <div class="row">
          <span class="label">${T('field.zone')}</span>
          <span class="value zone">${pending.zone_name}</span>
        </div>
        <div class="row">
          <span class="label">${T('field.period')}</span>
          <span class="value">${periodLabel(APP.match.period)}</span>
        </div>
      </div>
      <div class="flag-row">
        <label><input type="checkbox" id="flag-man-up"   data-action="mutex-flag" data-arg="man-up"> ${T('flag.man_up')}</label>
        <label><input type="checkbox" id="flag-man-down" data-action="mutex-flag" data-arg="man-down"> ${T('flag.man_down')}</label>
        <label><input type="checkbox" id="flag-assisted"> ${T('flag.assisted')}</label>
        <label><input type="checkbox" id="flag-fast-break"> ${T('flag.fast_break')}</label>
        <label><input type="checkbox" id="flag-free-position"> ${T('flag.free_position')}</label>
        <label><input type="checkbox" id="flag-penalty-shot"> ${T('flag.penalty_shot')}</label>
      </div>
      <div class="result-buttons">
        <button class="result-btn niecelny" data-action="submit-result" data-arg="niecelny">${T('result.miss')}</button>
        <button class="result-btn celny"    data-action="submit-result" data-arg="celny">${T('result.save')}</button>
        <button class="result-btn gol"      data-action="submit-result" data-arg="gol">${T('result.goal')}</button>
      </div>
      ${pending.zone_name === 'own-half' ? '' : `
      <div class="counter-action-row"><span>${T('modal.shot.or_counter')}</span></div>
      <div class="counter-action-buttons">
        <button class="counter-action-btn team-A" data-action="submit-groundball" data-arg="A">GB — ${escapeHtml(match.team_A)}</button>
        <button class="counter-action-btn team-B" data-action="submit-groundball" data-arg="B">GB — ${escapeHtml(match.team_B)}</button>
        <button class="counter-action-btn team-A" data-action="submit-draw" data-arg="A">Draw — ${escapeHtml(match.team_A)}</button>
        <button class="counter-action-btn team-B" data-action="submit-draw" data-arg="B">Draw — ${escapeHtml(match.team_B)}</button>
      </div>`}
      <div class="modal-actions">
        <button class="btn" data-action="cancel-modal">${T('btn.cancel')}</button>
      </div>
    </div>`;
}

function renderEditEventModal(e) {
  const match = DATA.scheduledMatches.find(m => m.id === APP.matchId);
  const isCounterEvent = e.event_type === 'groundball' || e.event_type === 'draw';
  return `
    <div class="modal" data-stop-propagation="true">
      <h2>${T('modal.edit.title')}</h2>
      <div class="modal-subtitle">${T('modal.edit.subtitle')}</div>
      <div class="modal-context">
        <div class="row"><span class="label">${T('field.position')}</span><span class="value zone">${e.shot_x.toFixed(2)}, ${e.shot_y.toFixed(2)} → ${e.zone_name}</span></div>
      </div>
      <label class="field">
        <span class="field-label">${T('field.team')}</span>
        <select id="edit-team">
          <option value="${escapeHtml(match.team_A)}" ${e.team_event === match.team_A ? 'selected' : ''}>${escapeHtml(match.team_A)} (A)</option>
          <option value="${escapeHtml(match.team_B)}" ${e.team_event === match.team_B ? 'selected' : ''}>${escapeHtml(match.team_B)} (B)</option>
        </select>
      </label>
      <label class="field">
        <span class="field-label">${T('field.period')}</span>
        <select id="edit-period">
          ${['1','2','3','4','OT1','OT2','OT3'].map(p =>
            `<option value="${p}" ${e.period === p ? 'selected' : ''}>${periodLabel(p)}</option>`
          ).join('')}
        </select>
      </label>
      ${isCounterEvent ? '' : `
      <label class="field">
        <span class="field-label">${T('field.result')}</span>
        <select id="edit-result">
          <option value="niecelny" ${e.result === 'niecelny' ? 'selected' : ''}>${T('result.miss')}</option>
          <option value="celny"    ${e.result === 'celny'    ? 'selected' : ''}>${T('result.save')}</option>
          <option value="gol"      ${e.result === 'gol'      ? 'selected' : ''}>${APP.lang === 'pl' ? 'Gol' : 'Goal'}</option>
        </select>
      </label>`}
      <div class="flag-row">
        <label><input type="checkbox" id="edit-man-up"   data-action="mutex-edit-flag" data-arg="man-up"   ${e.man_up   ? 'checked' : ''}> ${T('flag.man_up_short')}</label>
        <label><input type="checkbox" id="edit-man-down" data-action="mutex-edit-flag" data-arg="man-down" ${e.man_down ? 'checked' : ''}> ${T('flag.man_down_short')}</label>
        <label><input type="checkbox" id="edit-assisted" ${e.assisted ? 'checked' : ''}> ${T('flag.assisted')}</label>
        <label><input type="checkbox" id="edit-fast-break" ${e.fast_break ? 'checked' : ''}> ${T('flag.fast_break')}</label>
        <label><input type="checkbox" id="edit-free-position" ${e.free_position ? 'checked' : ''}> ${T('flag.free_position')}</label>
        <label><input type="checkbox" id="edit-penalty-shot" ${e.penalty_shot ? 'checked' : ''}> ${T('flag.penalty_shot')}</label>
      </div>
      <div class="modal-actions">
        <button class="btn" data-action="cancel-modal">${T('btn.cancel')}</button>
        <button class="btn btn-primary" data-action="submit-edit" data-arg="${e.id}">${T('btn.save_changes')}</button>
      </div>
    </div>`;
}

function renderConfirmEnd() {
  const score = computeScore(APP.matchId);
  const match = DATA.scheduledMatches.find(m => m.id === APP.matchId);
  return `
    <div class="modal" data-stop-propagation="true">
      <h2>${T('modal.end.title')}</h2>
      <div class="modal-subtitle">${T('modal.end.subtitle')}</div>
      <div class="modal-context">
        <div class="row"><span class="label">${T('field.score')}</span><span class="value">${escapeHtml(match.team_A)} ${score.A} : ${score.B} ${escapeHtml(match.team_B)}</span></div>
        <div class="row"><span class="label">${T('field.period')}</span><span class="value">${periodLabel(APP.match.period)}</span></div>
      </div>
      <div class="modal-actions">
        <button class="btn" data-action="cancel-modal">${T('btn.cancel')}</button>
        <button class="btn btn-danger" data-action="confirm-end-match">${T('btn.end_match_confirm')}</button>
      </div>
    </div>`;
}

function renderConfirmModal() {
  const m = APP.modal;
  return `
    <div class="modal" data-stop-propagation="true" style="max-width:360px">
      <h2>${escapeHtml(m.title || T('modal.confirm.default'))}</h2>
      ${m.message ? `<div class="modal-subtitle" style="font-size:14px;color:inherit;opacity:0.8">${escapeHtml(m.message)}</div>` : ''}
      <div class="modal-actions">
        <button class="btn" data-action="cancel-modal">${T('btn.cancel')}</button>
        <button class="btn btn-danger" data-action="confirm-dialog-ok">${T('btn.delete')}</button>
      </div>
    </div>`;
}

function renderAdHocModal() {
  const tournaments = DATA.tournaments;
  return `
    <div class="modal" data-stop-propagation="true">
      <h2>${T('modal.adhoc.title')}</h2>
      <div class="modal-subtitle">${T('modal.adhoc.subtitle')}</div>
      <label class="field">
        <span class="field-label">${T('field.tournament')}</span>
        <select id="adhoc-tournament">
          ${tournaments.map(t => `<option value="${escapeHtml(t.name)}">${escapeHtml(t.name)}</option>`).join('')}
        </select>
      </label>
      <label class="field">
        <span class="field-label">${T('field.team_a')}</span>
        <input id="adhoc-team-a" list="teams-datalist-adhoc" placeholder="np. Hawks">
      </label>
      <label class="field">
        <span class="field-label">${T('field.team_b')}</span>
        <input id="adhoc-team-b" list="teams-datalist-adhoc" placeholder="np. Vikings">
      </label>
      <datalist id="teams-datalist-adhoc">
        ${uniqueTeamNames().map(n => `<option value="${escapeHtml(n)}">`).join('')}
      </datalist>
      <label class="field">
        <span class="field-label">${T('field.date')}</span>
        <input id="adhoc-date" type="date" value="${todayISO()}">
      </label>
      <div class="modal-actions">
        <button class="btn" data-action="cancel-modal">${T('btn.cancel')}</button>
        <button class="btn btn-primary" data-action="create-ad-hoc">${T('btn.create_adhoc')}</button>
      </div>
    </div>`;
}

function renderGoalieFormModal() {
  const match     = DATA.scheduledMatches.find(m => String(m.id) === String(APP.matchId));
  const slot      = APP.modal.team_slot;
  const teamName  = slot === 'A' ? match.team_A : match.team_B;
  const allEvents = DATA.events.filter(e => String(e.match_id) === String(match.id));
  const current   = getCurrentGoalieNumber(teamName, allEvents);
  return `
    <div class="modal" data-stop-propagation="true">
      <h2>${T('modal.goalie.title')} — ${escapeHtml(teamName)}</h2>
      <label class="field">
        <span class="field-label">${T('field.goalie_number')}</span>
        <input type="number" id="goalie-number-input" min="0" max="99" inputmode="numeric"
               value="${current !== null ? escapeHtml(String(current)) : ''}" style="width:100px;">
      </label>
      <p class="modal-hint">${T('modal.goalie.since')}${periodLabel(APP.match.period)}</p>
      <div class="modal-actions">
        <button class="btn" data-action="cancel-modal">${T('btn.cancel')}</button>
        <button class="btn btn-primary" data-action="save-goalie" data-arg="${slot}">${T('btn.save')}</button>
      </div>
    </div>`;
}

function renderGoalieRetroactiveModal() {
  const match     = DATA.scheduledMatches.find(m => String(m.id) === String(APP.matchId));
  const allEvents = DATA.events.filter(e => String(e.match_id) === String(match.id));
  const shotEvents = allEvents.filter(e => e.event_type !== 'goalie_set');
  const goalieEvents = allEvents.filter(e => e.event_type === 'goalie_set');

  const periodSet = new Set();
  shotEvents.forEach(e => { if (e.period !== undefined && e.period !== '') periodSet.add(String(e.period)); });
  const periods = Array.from(periodSet).sort((a, b) => getPeriodOrder(a) - getPeriodOrder(b));
  if (periods.length === 0) periods.push(APP.match.period);

  function currentFor(period, teamName) {
    const ev = goalieEvents
      .filter(e => e.team_event === teamName && String(e.period) === String(period))
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))[0];
    return ev ? ev.goalie_number : '';
  }

  const rows = periods.map(p => `
    <tr>
      <td style="padding:4px 8px;">${periodLabel(p)}</td>
      <td style="padding:4px 8px;"><input type="number" min="0" max="99" inputmode="numeric"
        data-period="${escapeHtml(p)}" data-team="A"
        value="${escapeHtml(String(currentFor(p, match.team_A)))}" style="width:70px;"></td>
      <td style="padding:4px 8px;"><input type="number" min="0" max="99" inputmode="numeric"
        data-period="${escapeHtml(p)}" data-team="B"
        value="${escapeHtml(String(currentFor(p, match.team_B)))}" style="width:70px;"></td>
    </tr>`).join('');

  return `
    <div class="modal" data-stop-propagation="true">
      <h2>${T('modal.goalie_retro.title')}</h2>
      <table style="border-collapse:collapse;width:100%;">
        <thead>
          <tr>
            <th style="text-align:left;padding:4px 8px;">${T('period.quarter')}</th>
            <th style="text-align:left;padding:4px 8px;">${escapeHtml(match.team_A)}</th>
            <th style="text-align:left;padding:4px 8px;">${escapeHtml(match.team_B)}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="modal-actions">
        <button class="btn" data-action="cancel-modal">${T('btn.cancel')}</button>
        <button class="btn btn-primary" data-action="save-goalie-retroactive">${T('btn.save_all')}</button>
      </div>
    </div>`;
}
