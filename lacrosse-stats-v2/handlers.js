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

// ===== Admin handlers — localStorage CRUD (dodane w etapie C) =====

Object.assign(HANDLERS, {
  'admin-set-range':      (range) => { APP.adminFilter.range = range; render(); },
  'admin-set-tournament': () => {
    const sel = document.getElementById('admin-filter-tournament');
    if (sel) APP.adminFilter.tournament = sel.value;
    render();
  },
  'admin-set-status': () => {
    const sel = document.getElementById('admin-filter-status');
    if (sel) APP.adminFilter.status = sel.value;
    render();
  },

  'tournament-new':    () => { APP.modal = { type: 'tournament-form', tournament: null }; render(); },
  'tournament-edit': (id) => {
    const t = DATA.tournaments.find(x => x.id === id);
    if (!t) return;
    APP.modal = { type: 'tournament-form', tournament: t };
    render();
  },
  'tournament-delete': (id) => {
    const t = DATA.tournaments.find(x => x.id === id);
    if (!t) return;
    const matchCount = DATA.scheduledMatches.filter(m => m.tournament === t.name).length;
    const msg = matchCount > 0
      ? `Usunąć turniej „${t.name}"? ${matchCount} meczów zostanie bez turnieju.`
      : `Usunąć turniej „${t.name}"?`;
    if (!confirm(msg)) return;
    DATA.tournaments = DATA.tournaments.filter(x => x.id !== id);
    saveData();
    render();
  },
  'submit-tournament': (id) => {
    const input = document.getElementById('tournament-name');
    if (!input) return;
    const name = input.value.trim();
    if (!name) { alert('Nazwa turnieju nie może być pusta.'); return; }
    if (id) {
      const t = DATA.tournaments.find(x => x.id === id);
      if (t) t.name = name;
    } else {
      DATA.tournaments.push({ id: 'tid_' + Date.now(), name });
    }
    saveData();
    APP.modal = null;
    render();
  },

  'match-new':  () => { APP.modal = { type: 'match-form', match: null }; render(); },
  'match-edit': (id) => {
    const m = DATA.scheduledMatches.find(x => x.id === id);
    if (!m) return;
    APP.modal = { type: 'match-form', match: m };
    render();
  },
  'match-delete': (id) => {
    const m = DATA.scheduledMatches.find(x => x.id === id);
    if (!m) return;
    if (!confirm(`Usunąć mecz „${m.team_A} vs ${m.team_B}"?`)) return;
    DATA.scheduledMatches = DATA.scheduledMatches.filter(x => x.id !== id);
    DATA.events           = DATA.events.filter(e => e.match_id !== id);
    saveData();
    render();
  },
  'submit-match': (id) => {
    const tournament = (document.getElementById('match-tournament').value || '').trim();
    const teamA      = document.getElementById('match-team-a').value.trim();
    const teamB      = document.getElementById('match-team-b').value.trim();
    const matchDate  = document.getElementById('match-date').value;
    const status     = document.getElementById('match-status').value;
    if (!teamA || !teamB || !matchDate) { alert('Wypełnij obie drużyny i datę.'); return; }
    if (id) {
      const m = DATA.scheduledMatches.find(x => x.id === id);
      if (m) Object.assign(m, { tournament, team_A: teamA, team_B: teamB, match_date: matchDate, status });
    } else {
      DATA.scheduledMatches.push({
        id: 'mid_' + Date.now(),
        tournament, team_A: teamA, team_B: teamB, match_date: matchDate, status: status || 'scheduled'
      });
    }
    saveData();
    APP.modal = null;
    render();
  },
});
