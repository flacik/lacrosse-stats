'use strict';

// APP runtime state, routing, match/viewer session init, event CRUD.
// Krok 5: event CRUD przez GAS (optimistic updates + async sync).

let APP = {
  screen: 'home',
  matchId: null,
  match: null,
  viewer: null,
  modal: null,
  banner: null,
  refreshInterval: null,
  refreshFlash: false,

  // Stany async ładowania
  homeLoading: false,
  homeError: null,
  matchLoading: false,   // true podczas fetchu eventów przy otwieraniu meczu

  // Stany async viewera
  viewerLoading: false,  // true podczas pierwszego fetchu eventów viewera
  viewerError: null,     // string | null — błąd pierwszego fetchu
  lastViewerRefresh: null, // Date | null — czas ostatniego udanego odświeżenia

  // Panel admin
  adminFilter: null,
  adminLoading: false,
  adminError: null,

  // Viewer: split-bary w tabelach statystyk (F-02)
  splitBars: true,

  // Analytics (V4)
  analyticsLoading:     false,
  analyticsError:       null,
  analyticsData:        null,   // { events: [], matches: [], tournaments: [] }
  analyticsFilters:     {
    tournament: '',
    team:       '',
    dateFrom:   '',
    dateTo:     '',
    period:     '',
  },
  analyticsHeatmapMode: 'fired',  // 'fired' | 'conceded'

  // CSV bulk import (panel admin)
  csvImport: null,  // null | { rows: [], importing: bool }

  // Offline buffer recovery
  offlineBanner: null,  // number | null — liczba eventów w offline bufferze przy starcie

  // Undo queue dla usuwania eventów (delete-event handler)
  _deleteQueue: [],     // Event[] — usunięte z UI, czekają na GAS
  _deleteTimer: null,   // setTimeout ID — commit po 5s braku aktywności

  // Undo queue dla zmiany kwarty (next-period handler)
  _periodQueue: [],     // { prevPeriod, prevSide }[] — historia zmian kwarty

  // Standings (tabela ligowa)
  standingsLoading:    false,
  standingsError:      null,
  standingsData:       null,   // { events: [], matches: [], tournaments: [] }
  standingsTournament: '',     // nazwa wybranego turnieju; '' = pierwszy dostępny
  standingsSort:       { col: 'goals', dir: 'desc' },

  // Analytics — sortowanie tabeli bramkarzy (v7.0.1)
  analyticsGoalieSort: { col: 'savePct', dir: 'desc' },
};

// ── Routing ────────────────────────────────────────────────────────────────────

function go(screen, opts) {
  opts = opts || {};
  if (!IS_EDITOR && (screen === 'match-input' || screen === 'admin')) {
    screen = 'home';
    opts = {};
  }
  if (APP.refreshInterval) {
    clearInterval(APP.refreshInterval);
    APP.refreshInterval = null;
  }
  // Flush pending event deletions before leaving current screen
  if (APP._deleteQueue && APP._deleteQueue.length > 0) {
    _commitDeleteQueue();
  }
  APP.screen      = screen;
  APP.matchId     = opts.matchId || null;
  APP.modal       = null;
  APP.banner      = null;
  APP.match       = null;
  APP.viewer      = null;
  APP.homeLoading = false;
  APP.homeError   = null;
  APP.matchLoading = false;
  APP.viewerLoading = false;
  APP.viewerError   = null;
  APP.lastViewerRefresh = null;
  APP.adminLoading     = false;
  APP.adminError       = null;
  APP.analyticsLoading  = false;
  APP.analyticsError    = null;
  APP.standingsLoading  = false;
  APP.standingsError    = null;

  if (screen === 'home') {
    loadHomeData();                              // async — renderuje sam gdy gotowe
  } else if (screen === 'match-input' && opts.matchId) {
    APP.match = _initMatchState();
    loadMatchEvents(opts.matchId);               // async — renderuje sam gdy gotowe
  } else if (screen === 'match-viewer' && opts.matchId) {
    APP.viewer = initViewerSession();
    startViewerRefresh();
  } else if (screen === 'admin') {
    loadAdminData();                             // pełna lista meczów + turnieje
  } else if (screen === 'analytics') {
    loadAnalyticsData();
  } else if (screen === 'standings') {
    loadStandingsData();
  }
  render();
}

function goHome()                 { go('home'); }
function goAdmin()                { go('admin'); }
function goAnalytics()            { go('analytics'); }
function goStandings()            { go('standings'); }
function openMatchInput(matchId)  { go('match-input',  { matchId }); }
function openMatchViewer(matchId) { go('match-viewer', { matchId }); }

// ── Ładowanie danych — ekran główny i admin ────────────────────────────────────

async function loadHomeData() {
  APP.homeLoading = true;
  APP.homeError   = null;
  render();

  try {
    const [matches, tournaments, events] = await Promise.all([
      gasListAllMatches(),
      gasListTournaments(),
      gasListAllEvents(),
    ]);
    DATA.scheduledMatches = matches      || [];
    DATA.tournaments      = tournaments  || [];
    DATA.events           = events       || [];
  } catch (e) {
    if (e.code === 'DEV_MODE') {
      // Lokalny dev — użyj SAMPLE_DATA
      DATA.scheduledMatches = JSON.parse(JSON.stringify(SAMPLE_DATA.scheduledMatches));
      DATA.tournaments      = JSON.parse(JSON.stringify(SAMPLE_DATA.tournaments));
      DATA.events           = SAMPLE_DATA.events; // pełne sample events na home
    } else {
      APP.homeError = e.message || 'Błąd ładowania danych';
    }
  }

  APP.homeLoading = false;
  render();
}

// ── Ładowanie danych — panel admin ────────────────────────────────────────────

async function loadAdminData() {
  APP.adminLoading = true;
  APP.adminError   = null;
  render();

  try {
    const [matches, tournaments] = await Promise.all([
      gasListAllMatches(),
      gasListTournaments()
    ]);
    DATA.scheduledMatches = matches      || [];
    DATA.tournaments      = tournaments  || [];
  } catch (e) {
    if (e.code === 'DEV_MODE') {
      DATA.scheduledMatches = JSON.parse(JSON.stringify(SAMPLE_DATA.scheduledMatches));
      DATA.tournaments      = JSON.parse(JSON.stringify(SAMPLE_DATA.tournaments));
    } else {
      APP.adminError = e.message || 'Błąd ładowania danych admina';
    }
  }

  APP.adminLoading = false;
  render();
}

// ── Ładowanie danych — tryb analityki historycznej ───────────────────────────

async function loadAnalyticsData() {
  APP.analyticsLoading = true;
  APP.analyticsError   = null;
  render();

  try {
    const [events, matches, tournaments] = await Promise.all([
      gasListAllEvents(),
      gasListAllMatches(),
      gasListTournaments(),
    ]);
    APP.analyticsData = {
      events:      events      || [],
      matches:     matches     || [],
      tournaments: tournaments || [],
    };
  } catch (e) {
    if (e.code === 'DEV_MODE') {
      APP.analyticsData = {
        events:      SAMPLE_DATA.events,
        matches:     JSON.parse(JSON.stringify(SAMPLE_DATA.scheduledMatches)),
        tournaments: JSON.parse(JSON.stringify(SAMPLE_DATA.tournaments)),
      };
    } else {
      APP.analyticsError = e.message || 'Błąd ładowania danych analityki';
    }
  }

  APP.analyticsLoading = false;
  render();
}

// ── Ładowanie danych — tabela ligowa ─────────────────────────────────────────

async function loadStandingsData() {
  APP.standingsLoading = true;
  APP.standingsError   = null;
  render();
  try {
    const [events, matches, tournaments] = await Promise.all([
      gasListAllEvents(),
      gasListAllMatches(),
      gasListTournaments(),
    ]);

    APP.standingsData = {
      events:      events      || [],
      matches:     matches     || [],
      tournaments: tournaments || [],
    };

    if (!APP.standingsTournament && tournaments && tournaments.length > 0) {
      APP.standingsTournament = tournaments[0].name;
    }
  } catch (e) {
    if (e.code === 'DEV_MODE') {
      APP.standingsData = {
        events:      SAMPLE_DATA.events,
        matches:     JSON.parse(JSON.stringify(SAMPLE_DATA.scheduledMatches)),
        tournaments: JSON.parse(JSON.stringify(SAMPLE_DATA.tournaments)),
      };
      if (!APP.standingsTournament && APP.standingsData.tournaments.length > 0) {
        APP.standingsTournament = APP.standingsData.tournaments[0].name;
      }
    } else {
      APP.standingsError = e.message || 'Błąd ładowania danych tabeli';
    }
  }
  APP.standingsLoading = false;
  render();
}

// ── Offline buffer recovery ────────────────────────────────────────────────────

// Scal eventy z offline buffera dla danego meczu z powrotem do DATA.events.
// Wywoływana po każdym loadMatchEvents — eventy przetrwały restart przeglądarki,
// ale GAS ich nie ma (nigdy nie zostały zapisane), więc trzeba je scalić ręcznie.
function _mergeOfflineBufferForMatch(matchId) {
  const buffered = loadOfflineBuffer().filter(b => String(b.match_id) === String(matchId));
  buffered.forEach(function(ev) {
    if (!DATA.events.some(e => e.client_event_id === ev.client_event_id)) {
      DATA.events.push(Object.assign({}, ev, { _syncing: false, _syncError: 'Niezsynchronizowany' }));
      _scheduleRetry(ev.client_event_id, ev, 1);
    }
  });
}

// ── Ładowanie eventów — tryb wpisu i podglądu ──────────────────────────────────

async function loadMatchEvents(matchId) {
  APP.matchLoading = true;
  render();

  try {
    const events = await gasListEventsForMatch(matchId);
    // Zachowaj eventy innych meczów (dla wyników na home), zastąp bieżącego meczu
    DATA.events = DATA.events.filter(e => String(e.match_id) !== String(matchId));
    DATA.events = DATA.events.concat(events || []);

    // Przywróć niezsynchronizowane eventy z offline buffera (przetrwały restart)
    _mergeOfflineBufferForMatch(matchId);

    // Zmień status 'scheduled' → 'live' przy pierwszym otwarciu
    const match = DATA.scheduledMatches.find(m => String(m.id) === String(matchId));
    if (match && match.status === 'scheduled') {
      match.status = 'live';
      gasUpdateMatch(matchId, { status: 'live' }).catch(function () {});
    }
  } catch (e) {
    if (e.code === 'DEV_MODE') {
      // Lokalny dev — wczytaj SAMPLE_DATA dla tego meczu
      var sampleForMatch = SAMPLE_DATA.events.filter(
        ev => String(ev.match_id) === String(matchId)
      );
      DATA.events = DATA.events.filter(ev => String(ev.match_id) !== String(matchId));
      DATA.events = DATA.events.concat(sampleForMatch);

      // Przywróć niezsynchronizowane eventy z offline buffera
      _mergeOfflineBufferForMatch(matchId);

      // Zmień status w SAMPLE_DATA (tylko lokalnie)
      const match = DATA.scheduledMatches.find(m => String(m.id) === String(matchId));
      if (match && match.status === 'scheduled') match.status = 'live';
    } else {
      APP.banner = { type: 'error', msg: 'Błąd ładowania eventów: ' + (e.message || e) };
    }
  }

  APP.matchLoading = false;
  render();
}

// ── Session init helpers ───────────────────────────────────────────────────────

function _initMatchState() {
  return {
    period: '1',
    team_A_side: 'left',
    periodSides: { '1': 'left' },  // period → team_A_side at entry (for picker restore)
    own_half_mode: null,
    history_expanded: true,
    show_zones: false
  };
}

function initViewerSession() {
  return {
    view_mode: 'full',
    display_mode: 'markers',
    filter_period: 'all',
    filter_result: 'all'
  };
}

// ── Viewer refresh ─────────────────────────────────────────────────────────────

function startViewerRefresh() {
  // Wyczyść poprzedni interval (np. przy retry)
  if (APP.refreshInterval) {
    clearInterval(APP.refreshInterval);
    APP.refreshInterval = null;
  }
  const matchId = APP.matchId;

  // Pomocnicza — jeden cykl odświeżenia eventów
  async function doRefresh(isFirst) {
    if (APP.screen !== 'match-viewer') return;
    try {
      const events = await gasListEventsForMatch(matchId);
      DATA.events = DATA.events.filter(e => String(e.match_id) !== String(matchId));
      DATA.events = DATA.events.concat(events || []);
      APP.lastViewerRefresh = new Date();
      if (isFirst) {
        APP.viewerLoading = false;
        APP.viewerError   = null;
      }
      APP.refreshFlash = true;
      render();
      setTimeout(function () {
        APP.refreshFlash = false;
        if (APP.screen === 'match-viewer') render();
      }, 600);
    } catch (e) {
      if (e.code === 'DEV_MODE') {
        // Lokalny dev — SAMPLE_DATA już załadowane, viewer działa normalnie
        APP.viewerLoading = false;
        APP.viewerError   = null;
        APP.lastViewerRefresh = new Date();
      } else {
        if (isFirst) {
          APP.viewerLoading = false;
          APP.viewerError = e.message || 'Błąd ładowania danych meczu';
        } else {
          // Milcząca awaria kolejnych odświeżeń — nie nadpisuj wyświetlonych danych
          console.warn('viewer refresh error:', e.message);
        }
      }
      if (isFirst) render();
    }
  }

  // Natychmiastowy pierwszy fetch (viewer od razu pokazuje loader)
  APP.viewerLoading = true;
  APP.viewerError   = null;
  doRefresh(true);

  // Cykliczne odświeżanie co 10s (zmniejsza zużycie limitów GAS o ~50% vs poprzednie 5s)
  APP.refreshInterval = setInterval(function () { doRefresh(false); }, 10000);
}

// ── Retry queue (krok 8) ──────────────────────────────────────────────────────

const RETRY_DELAYS = [1000, 3000, 9000]; // ms: próba 1, 2, 3

/**
 * Planuje ponowną próbę wysłania eventu do GAS z exponential backoff.
 * @param {string} clientEventId — identyfikator eventu w DATA.events
 * @param {object} evPayload     — oryginalny payload do wysłania (bez _syncing/_syncError)
 * @param {number} attempt       — 1-indexed (1 = pierwsza ponowna próba)
 */
function _scheduleRetry(clientEventId, evPayload, attempt) {
  if (attempt > RETRY_DELAYS.length) return;
  const delay = RETRY_DELAYS[attempt - 1];

  setTimeout(async function () {
    const idx = DATA.events.findIndex(e => e.client_event_id === clientEventId);
    if (idx < 0) return;  // event usunięty przez usera

    DATA.events[idx] = Object.assign({}, DATA.events[idx], {
      _syncing:   true,
      _syncError: null,
    });
    render();

    try {
      const result = await gasSaveEvent(evPayload);
      const i = DATA.events.findIndex(e => e.client_event_id === clientEventId);
      if (i >= 0) {
        DATA.events[i] = Object.assign({}, DATA.events[i], {
          id:         result.id,
          _syncing:   false,
          _syncError: null,
        });
        removeFromOfflineBuffer(clientEventId);
      }
      render();
    } catch (err) {
      if (err.code === 'DEV_MODE') {
        const i = DATA.events.findIndex(e => e.client_event_id === clientEventId);
        if (i >= 0) DATA.events[i] = Object.assign({}, DATA.events[i], { _syncing: false });
        render();
        return;
      }
      const i = DATA.events.findIndex(e => e.client_event_id === clientEventId);
      if (i >= 0) {
        if (attempt < RETRY_DELAYS.length) {
          DATA.events[i] = Object.assign({}, DATA.events[i], {
            _syncing:   false,
            _syncError: 'Ponawianie ' + (attempt + 1) + '/' + RETRY_DELAYS.length + '…',
          });
          _scheduleRetry(clientEventId, evPayload, attempt + 1);
        } else {
          // Wszystkie próby wyczerpane — czeka na ręczny retry
          DATA.events[i] = Object.assign({}, DATA.events[i], {
            _syncing:   false,
            _syncError: err.message || 'Błąd zapisu — wyślij ponownie',
          });
        }
      }
      render();
    }
  }, delay);
}

// ── Event CRUD — optimistic updates + async GAS ────────────────────────────────

/**
 * Zapisuje nowy event.
 * Sync: dodaje do DATA.events z _syncing:true.
 * Async: wysyła do GAS, aktualizuje id na numeryczny (lub oznacza _syncError).
 * NIE wywołuje render() — robi to handler po powrocie tej funkcji.
 */
async function recordEvent(eventData) {
  const match = DATA.scheduledMatches.find(m => String(m.id) === String(APP.matchId));
  if (!match) return;

  const clientEventId = uuid();
  const ev = Object.assign({
    id:              clientEventId,    // tymczasowy UUID; GAS nadaje numeryczny
    client_event_id: clientEventId,
    match_id:        match.id,
    tournament:      match.tournament,
    team_A:          match.team_A,
    team_B:          match.team_B,
    match_date:      match.match_date,
    period:          APP.match.period,
    created_at:      Date.now(),
    _syncing:        true,
    _syncError:      null,
  }, eventData);

  // Optimistic add (synchroniczny)
  DATA.events.push(ev);
  // Handler wywoła render() zaraz po recordEvent()

  // Walidacja kliencka przed GAS (synchroniczna — brak await, działa przed yield)
  const validationError = validateEventPayload(ev);
  if (validationError) {
    const vi = DATA.events.findIndex(ex => ex.client_event_id === clientEventId);
    if (vi >= 0) {
      DATA.events[vi] = Object.assign({}, DATA.events[vi], {
        _syncing:   false,
        _syncError: 'Błąd walidacji: ' + validationError,
      });
    }
    // render() wywoła handler — zwracamy bez retry
    return;
  }

  // Async GAS call
  try {
    const result = await gasSaveEvent(ev);
    // Zaktualizuj numeryczne ID nadane przez GAS
    const idx = DATA.events.findIndex(e => e.client_event_id === clientEventId);
    if (idx >= 0) {
      DATA.events[idx] = Object.assign({}, DATA.events[idx], {
        id:         result.id,
        _syncing:   false,
        _syncError: null,
      });
    }
  } catch (e) {
    if (e.code !== 'DEV_MODE') {
      // Dodaj do offline buffer natychmiast (bezpieczne — dedup po client_event_id)
      addToOfflineBuffer(ev);
      // Oznacz jako "ponawianie" i zaplanuj retry z backoff
      const idx = DATA.events.findIndex(ex => ex.client_event_id === clientEventId);
      if (idx >= 0) {
        DATA.events[idx] = Object.assign({}, DATA.events[idx], {
          _syncing:   false,
          _syncError: 'Ponawianie 1/' + RETRY_DELAYS.length + '…',
        });
      }
      _scheduleRetry(clientEventId, ev, 1);
    } else {
      // DEV_MODE: potraktuj jak sukces (id pozostaje UUID)
      const idx = DATA.events.findIndex(ex => ex.client_event_id === clientEventId);
      if (idx >= 0) DATA.events[idx] = Object.assign({}, DATA.events[idx], { _syncing: false });
    }
  }
  render();  // re-render po GAS response (aktualizacja stanu sync)
}

// Natychmiast commituje wszystkie zdarzenia w kolejce usunięć do GAS.
// Wywoływana przy timeout, "OK" i nawigacji do innego ekranu.
function _commitDeleteQueue() {
  clearTimeout(APP._deleteTimer);
  APP._deleteTimer = null;
  const queue = APP._deleteQueue || [];
  APP._deleteQueue = [];
  APP.banner = null;

  queue.forEach(function(ev) {
    removeFromOfflineBuffer(ev.client_event_id);

    const hasGasId = !ev._syncing && !ev._syncError &&
                     String(ev.id) !== ev.client_event_id &&
                     !isNaN(Number(ev.id));
    if (!hasGasId) return;

    gasDeleteEvent(ev.id).catch(function(e) {
      if (e.code !== 'DEV_MODE') {
        APP.banner = { type: 'error', msg: 'Błąd usunięcia eventu: ' + (e.message || e) };
        render();
      }
    });
  });
}

function deleteTournamentConfirmed(id) {
  DATA.tournaments = DATA.tournaments.filter(x => x.id !== id);
  render();
  gasDeleteTournament(id).catch(function(e) {
    if (e.code !== 'DEV_MODE') {
      APP.banner = { type: 'error', msg: 'Błąd usunięcia turnieju: ' + (e.message || e) };
      render();
    }
  });
}

function deleteMatchConfirmed(id) {
  DATA.scheduledMatches = DATA.scheduledMatches.filter(x => x.id !== id);
  DATA.events           = DATA.events.filter(e => e.match_id !== id);
  render();
  gasDeleteMatch(id).catch(function(e) {
    if (e.code !== 'DEV_MODE') {
      APP.banner = { type: 'error', msg: 'Błąd usunięcia meczu: ' + (e.message || e) };
      render();
    }
  });
}

/**
 * Usuwa event po id (UUID tymczasowy lub numeryczny GAS).
 * Optimistic: natychmiast usuwa z DATA.events.
 * Async: wywołuje gasDeleteEvent gdy event był już potwierdzony przez GAS.
 * NIE wywołuje render() — robi to handler.
 */
async function deleteEvent(id) {
  const ev = DATA.events.find(e => String(e.id) === String(id));
  if (!ev) return;

  // Optimistic remove (synchroniczny)
  DATA.events = DATA.events.filter(e => String(e.id) !== String(id));

  // Jeśli event jeszcze nie potwierdził GAS (UUID tymczasowe) — koniec
  const hasGasId = !ev._syncing && !ev._syncError &&
                   String(ev.id) !== ev.client_event_id &&
                   !isNaN(Number(ev.id));
  if (!hasGasId) return;

  try {
    await gasDeleteEvent(ev.id);
  } catch (e) {
    if (e.code !== 'DEV_MODE') {
      APP.banner = { type: 'error', msg: 'Błąd usunięcia eventu: ' + (e.message || e) };
      render();
    }
  }
}

/**
 * Aktualizuje pola eventu po id.
 * Optimistic: aktualizuje DATA.events natychmiast.
 * Async: wysyła pełny obiekt do GAS.
 * NIE wywołuje render() — robi to handler.
 */
async function updateEvent(id, updates) {
  const idx = DATA.events.findIndex(e => String(e.id) === String(id));
  if (idx < 0) return;

  const oldEv = DATA.events[idx];
  const newEv = Object.assign({}, oldEv, updates, { _syncing: true, _syncError: null });
  DATA.events[idx] = newEv;

  // Walidacja kliencka przed GAS
  const updateValidationError = validateEventPayload(newEv);
  if (updateValidationError) {
    DATA.events[idx] = Object.assign({}, DATA.events[idx], {
      _syncing:   false,
      _syncError: 'Błąd walidacji: ' + updateValidationError,
    });
    render();
    return;
  }

  // Jeśli event jeszcze nie potwierdził GAS — zaktualizuj tylko lokalnie
  const hasGasId = !oldEv._syncError &&
                   String(oldEv.id) !== oldEv.client_event_id &&
                   !isNaN(Number(oldEv.id));
  if (!hasGasId) {
    DATA.events[idx] = Object.assign({}, DATA.events[idx], { _syncing: false });
    return;
  }

  try {
    await gasUpdateEvent(oldEv.id, newEv);
    DATA.events[idx] = Object.assign({}, DATA.events[idx], { _syncing: false, _syncError: null });
  } catch (e) {
    if (e.code !== 'DEV_MODE') {
      DATA.events[idx] = Object.assign({}, DATA.events[idx], {
        _syncing:   false,
        _syncError: e.message || 'Błąd aktualizacji'
      });
    } else {
      DATA.events[idx] = Object.assign({}, DATA.events[idx], { _syncing: false });
    }
  }
  render();
}

