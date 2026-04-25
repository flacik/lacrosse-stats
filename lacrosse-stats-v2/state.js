'use strict';

// APP runtime state, routing, match/viewer session init, synchronous event CRUD.
// Storage: localStorage via data.js (saveData / loadData).

let APP = {
  screen:          'home',
  matchId:         null,
  match:           null,
  viewer:          null,
  modal:           null,
  banner:          null,
  refreshInterval: null,
  refreshFlash:    false,
  adminFilter:     null,
};

// ── Routing ───────────────────────────────────────────────────────────────────

function go(screen, opts) {
  opts = opts || {};
  if (APP.refreshInterval) {
    clearInterval(APP.refreshInterval);
    APP.refreshInterval = null;
  }
  APP.screen  = screen;
  APP.matchId = opts.matchId || null;
  APP.modal   = null;
  APP.banner  = null;
  APP.match   = null;
  APP.viewer  = null;

  if (screen === 'home') {
    if (!loadData()) resetData();
  } else if (screen === 'match-input' && opts.matchId) {
    APP.match = _initMatchState();
    // Zmień status 'scheduled' → 'live' przy pierwszym wejściu
    const match = DATA.scheduledMatches.find(m => String(m.id) === String(opts.matchId));
    if (match && match.status === 'scheduled') {
      match.status = 'live';
      saveData();
    }
  } else if (screen === 'match-viewer' && opts.matchId) {
    APP.viewer = initViewerSession();
    startViewerRefresh();
  } else if (screen === 'admin') {
    if (!loadData()) resetData();
    APP.adminFilter = { range: 'all', tournament: 'all', status: 'all' };
  }
  render();
}

function goHome()                 { go('home'); }
function goAdmin()                { go('admin'); }
function openMatchInput(matchId)  { go('match-input',  { matchId }); }
function openMatchViewer(matchId) { go('match-viewer', { matchId }); }

// ── Session init ──────────────────────────────────────────────────────────────

function _initMatchState() {
  return {
    period:           '1',
    team_A_side:      'left',
    own_half_mode:    null,
    history_expanded: true,
    show_zones:       false,
  };
}

function initViewerSession() {
  return {
    view_mode:     'full',
    display_mode:  'markers',
    filter_period: 'all',
    filter_result: 'all',
  };
}

// ── Viewer refresh ─────────────────────────────────────────────────────────────
// In this version: data comes from localStorage, refresh just re-renders.

function startViewerRefresh() {
  if (APP.refreshInterval) { clearInterval(APP.refreshInterval); APP.refreshInterval = null; }
  APP.refreshInterval = setInterval(function () {
    loadData();
    APP.refreshFlash = true;
    render();
    setTimeout(function () { APP.refreshFlash = false; render(); }, 600);
  }, 5000);
}

// ── Event CRUD — synchronous localStorage ─────────────────────────────────────

function recordEvent(eventData) {
  const match = DATA.scheduledMatches.find(m => String(m.id) === String(APP.matchId));
  if (!match) return;

  const ev = Object.assign({
    id:         uuid(),
    match_id:   match.id,
    tournament: match.tournament,
    team_A:     match.team_A,
    team_B:     match.team_B,
    match_date: match.match_date,
    period:     APP.match.period,
    created_at: Date.now(),
  }, eventData);

  DATA.events.push(ev);
  saveData();
}

function deleteEvent(id) {
  DATA.events = DATA.events.filter(e => String(e.id) !== String(id));
  saveData();
}

function updateEvent(id, updates) {
  const idx = DATA.events.findIndex(e => String(e.id) === String(id));
  if (idx < 0) return;
  DATA.events[idx] = Object.assign({}, DATA.events[idx], updates);
  saveData();
}
