'use strict';

// HANDLERS map (data-action → fn) + global event delegation listeners (click + change).

const HANDLERS = {
  // Routing
  'open-admin':  () => goAdmin(),
  'open-match':  (id) => openMatchInput(id),
  'open-viewer': (id) => openMatchViewer(id),
  'back-home':   () => goHome(),
  'ad-hoc':      () => { APP.modal = { type: 'ad-hoc' }; render(); },

  // Viewer controls
  'viewer-set-mode':          (mode) => { APP.viewer.view_mode    = mode; render(); },
  'viewer-set-display':       (mode) => { APP.viewer.display_mode = mode; render(); },
  'viewer-set-period-filter': () => {
    const sel = document.getElementById('filter-period');
    if (sel) APP.viewer.filter_period = sel.value;
    render();
  },
  'viewer-set-result-filter': () => {
    const sel = document.getElementById('filter-result');
    if (sel) APP.viewer.filter_result = sel.value;
    render();
  },

  // Period transitions
  'next-period': () => {
    const newP = nextPeriod(APP.match.period);
    APP.match.period = newP;
    APP.banner = { type: 'swap-question', newPeriod: newP };
    render();
  },
  'period-end-prompt': () => {
    APP.banner = { type: 'period-end', fromPeriod: APP.match.period };
    render();
  },
  'next-overtime': () => {
    const newP = nextPeriod(APP.banner.fromPeriod);
    APP.match.period = newP;
    APP.banner = { type: 'swap-question', newPeriod: newP };
    render();
  },
  'cancel-banner': () => { APP.banner = null; render(); },

  // Sides
  'swap-sides': () => {
    APP.match.team_A_side = APP.match.team_A_side === 'left' ? 'right' : 'left';
    APP.banner = null;
    render();
  },
  'swap-answer': (yes) => {
    if (yes === 'yes') {
      APP.match.team_A_side = APP.match.team_A_side === 'left' ? 'right' : 'left';
    }
    APP.banner = null;
    render();
  },

  // Own-half mode
  'own-half-toggle': () => {
    APP.match.own_half_mode = APP.match.own_half_mode === 'active' ? null : 'active';
    APP.banner = APP.match.own_half_mode === 'active' ? { type: 'own-half' } : null;
    render();
  },
  'cancel-own-half': () => { APP.match.own_half_mode = null; APP.banner = null; render(); },

  'toggle-zones':   () => { APP.match.show_zones       = !APP.match.show_zones;       render(); },
  'toggle-history': () => { APP.match.history_expanded = !APP.match.history_expanded; render(); },

  // Event creation / edit / delete
  'submit-result': (result) => {
    const pending = APP.modal.pending;
    const manUp   = document.getElementById('flag-man-up').checked;
    const manDown = document.getElementById('flag-man-down').checked;
    recordEvent({
      shot_x: pending.shot_x, shot_y: pending.shot_y,
      zone_name: pending.zone_name, team_event: pending.team_event,
      result, man_up: manUp, man_down: manDown
    });
    APP.modal = null;
    render();
  },

  'edit-event': (id) => {
    const e = DATA.events.find(x => String(x.id) === String(id));
    if (!e) return;
    APP.modal = { type: 'edit-event', event: e };
    render();
  },
  'submit-edit': (id) => {
    const team    = document.getElementById('edit-team').value;
    const period  = document.getElementById('edit-period').value;
    const result  = document.getElementById('edit-result').value;
    const manUp   = document.getElementById('edit-man-up').checked;
    const manDown = document.getElementById('edit-man-down').checked;
    updateEvent(id, { team_event: team, period, result, man_up: manUp, man_down: manDown });
    APP.modal = null;
    render();
  },
  'delete-event': (id) => {
    if (!confirm('Usunąć ten event?')) return;
    deleteEvent(id);
    render();
  },

  // End match
  'end-match': () => { APP.modal = { type: 'confirm-end' }; APP.banner = null; render(); },
  'confirm-end-match': () => {
    const match = DATA.scheduledMatches.find(m => m.id === APP.matchId);
    if (match) { match.status = 'finished'; saveData(); }
    goHome();
  },

  // Modal
  'cancel-modal': () => closeModal(),

  // Ad-hoc match
  'create-ad-hoc': () => {
    const tournament = document.getElementById('adhoc-tournament').value.trim();
    const teamA      = document.getElementById('adhoc-team-a').value.trim();
    const teamB      = document.getElementById('adhoc-team-b').value.trim();
    const date       = document.getElementById('adhoc-date').value;
    if (!teamA || !teamB || !date) { alert('Wypełnij drużyny i datę.'); return; }
    const newMatch = {
      id: 'adhoc_' + Date.now(),
      tournament, team_A: teamA, team_B: teamB, match_date: date, status: 'live'
    };
    DATA.scheduledMatches.push(newMatch);
    saveData();
    APP.modal = null;
    openMatchInput(newMatch.id);
  },

  // Mutex flags
  'mutex-flag': (which) => {
    const up = document.getElementById('flag-man-up');
    const dn = document.getElementById('flag-man-down');
    if (!up || !dn) return;
    if (which === 'man-up'   && up.checked) dn.checked = false;
    if (which === 'man-down' && dn.checked) up.checked = false;
  },
  'mutex-edit-flag': (which) => {
    const up = document.getElementById('edit-man-up');
    const dn = document.getElementById('edit-man-down');
    if (!up || !dn) return;
    if (which === 'man-up'   && up.checked) dn.checked = false;
    if (which === 'man-down' && dn.checked) up.checked = false;
  },

  'modal-bg-click': () => { /* handled in click listener */ }
};

// ===== Event delegation =====

document.addEventListener('click', (e) => {
  if (e.target.classList && e.target.classList.contains('modal-bg')) { closeModal(); return; }
  const target = e.target.closest('[data-action]');
  if (!target) return;
  if (target.tagName === 'SELECT') return;
  const action = target.dataset.action;
  if (action === 'modal-bg-click') return;
  const handler = HANDLERS[action];
  if (handler) handler(target.dataset.arg);
});

document.addEventListener('change', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  if (target.tagName !== 'SELECT' && target.type !== 'checkbox') return;
  const handler = HANDLERS[target.dataset.action];
  if (handler) handler(target.dataset.arg);
});
