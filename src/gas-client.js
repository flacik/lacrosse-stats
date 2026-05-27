'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
// GAS Client — wrapper nad google.script.run zwracający Promise'y.
// Ładowany jako PIERWSZY skrypt (przed helpers.js), nie może używać uuid/todayISO.
//
// Gdy brak środowiska GAS (lokalny dev / Cowork artifact), odrzuca z kodem
// 'DEV_MODE' — state.js wtedy korzysta z SAMPLE_DATA.
// ═══════════════════════════════════════════════════════════════════════════════

// true gdy działamy wewnątrz GAS HTML Service (i google.script.run jest dostępny)
const IS_GAS = (function () {
  try {
    return typeof google !== 'undefined' &&
           google !== null &&
           typeof google.script !== 'undefined' &&
           typeof google.script.run !== 'undefined';
  } catch (e) {
    return false;
  }
})();

// true gdy zalogowany jako edytor (wstrzykiwane przez doGet w Code.gs)
// false domyślnie — GitHub Pages i lokalne podglądy działają jako viewer
const IS_EDITOR = (
  typeof window !== 'undefined' &&
  window.APP_CONFIG &&
  window.APP_CONFIG.isEditor === true
);

// Unikalny identyfikator tej karty przeglądarki (per-tab, wygasa po zamknięciu).
const SESSION_ID = (function () {
  try {
    var stored = sessionStorage.getItem('lax_session_id');
    if (stored) return stored;
    var id = 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    sessionStorage.setItem('lax_session_id', id);
    return id;
  } catch (e) {
    return 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }
})();

// ── Generyczny wrapper ─────────────────────────────────────────────────────────

/**
 * Wywołuje funkcję GAS `fnName` z argumentami `args`.
 * Zwraca Promise<data> (gdzie data to result.data z { ok: true, data }).
 * Odrzuca z Error (err.code: 'DEV_MODE' | 'RATE_LIMITED' | 'NOT_FOUND' | 'SCHEMA_INVALID' | 'GAS_FAILURE' | 'GAS_ERROR').
 */
function gasCall(fnName, ...args) {
  return new Promise(function (resolve, reject) {
    if (!IS_GAS) {
      var devErr = new Error('DEV_MODE: google.script.run niedostępny (lokalny dev)');
      devErr.code = 'DEV_MODE';
      reject(devErr);
      return;
    }

    var runner = google.script.run
      .withSuccessHandler(function (result) {
        if (result && result.ok) {
          resolve(result.data);
        } else {
          var msg  = (result && result.error && result.error.message) || 'Nieznany błąd GAS';
          var code = (result && result.error && result.error.code)    || 'GAS_ERROR';
          var e    = new Error(msg);
          e.code   = code;
          reject(e);
        }
      })
      .withFailureHandler(function (error) {
        var e  = new Error(error ? (error.message || String(error)) : 'Błąd połączenia GAS');
        e.code = 'GAS_FAILURE';
        reject(e);
      });

    // Dynamiczne wywołanie funkcji GAS po nazwie
    if (typeof runner[fnName] !== 'function') {
      var notFound  = new Error('Brak funkcji GAS: ' + fnName);
      notFound.code = 'GAS_MISSING_FN';
      reject(notFound);
      return;
    }
    runner[fnName].apply(runner, args);
  });
}

// ── API — Eventy ───────────────────────────────────────────────────────────────

/** Zapisuje nowy event do Sheets. Zwraca { id, client_event_id }. */
function gasSaveEvent(eventObj) {
  return gasCall('saveEvent', eventObj);
}

/** Aktualizuje istniejący event. */
function gasUpdateEvent(id, eventObj) {
  return gasCall('updateEvent', id, eventObj);
}

/** Usuwa event po numerycznym ID. */
function gasDeleteEvent(id) {
  return gasCall('deleteEventById', id);
}

/** Zwraca wszystkie eventy danego meczu. */
function gasListEventsForMatch(matchId) {
  return gasCall('listEventsForMatch', matchId);
}

// ── API — Mecze ────────────────────────────────────────────────────────────────

/** Zwraca mecze na dany dzień (YYYY-MM-DD). */
function gasListMatchesForDate(date) {
  return gasCall('listScheduledMatchesForDate', date);
}

/** Tworzy nowy zaplanowany mecz. Zwraca { id }. */
function gasCreateMatch(matchObj) {
  return gasCall('createScheduledMatch', matchObj);
}

/** Aktualizuje istniejący mecz (partial update OK). */
function gasUpdateMatch(id, matchObj) {
  return gasCall('updateScheduledMatch', id, matchObj);
}

/** Usuwa zaplanowany mecz. */
function gasDeleteMatch(id) {
  return gasCall('deleteScheduledMatch', id);
}

// ── API — Turnieje ─────────────────────────────────────────────────────────────

/** Zwraca listę wszystkich turniejów. */
function gasListTournaments() {
  return gasCall('listTournaments');
}

/** Tworzy nowy turniej. Zwraca { id }. */
function gasCreateTournament(name) {
  return gasCall('createTournament', name);
}

/** Aktualizuje nazwę turnieju. */
function gasUpdateTournament(id, name) {
  return gasCall('updateTournament', id, name);
}

/** Usuwa turniej po ID. */
function gasDeleteTournament(id) {
  return gasCall('deleteTournament', id);
}

/** Zwraca wszystkie mecze (do panelu admin — pełna lista). */
function gasListAllMatches() {
  return gasCall('listAllScheduledMatches');
}

/** Zwraca wszystkie eventy ze wszystkich meczów (analityka historyczna). */
function gasListAllEvents() {
  return gasCall('listAllEvents');
}

/** Tworzy wiele meczów naraz (bulk import z CSV). Zwraca { ids, count }. */
function gasBulkCreateMatches(matchesArray) {
  return gasCall('bulkCreateMatches', matchesArray);
}

/** Rejestruje heartbeat obecności w meczu (tylko tryb edycji). */
function gasPresenceHeartbeat(matchId) {
  return gasCall('presenceHeartbeat', matchId, SESSION_ID);
}

/** Informuje backend o opuszczeniu meczu. */
function gasPresenceLeave(matchId) {
  return gasCall('presenceLeave', matchId, SESSION_ID);
}

/** Zwraca liczby obecnych użytkowników per mecz. matchIds = string[]. */
function gasPresenceGetCounts(matchIds) {
  return gasCall('presenceGetCounts', matchIds);
}

