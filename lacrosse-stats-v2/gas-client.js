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

