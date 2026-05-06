// ═══════════════════════════════════════════════════════════════════════════════
// Lacrosse Stats v2 — Google Apps Script backend
// ═══════════════════════════════════════════════════════════════════════════════
//
// Kontrakt zgodny z architektura-v2.md sekcja 11–13.
// Wszystkie funkcje publiczne zwracają { ok: true, data: ... }
// lub { ok: false, error: { code, message } } — nigdy nie rzucają wyjątków
// do klienta (obsługa przez withSuccessHandler po stronie frontendu).
//
// Setup: przed pierwszym użyciem uruchom setupSheets() raz z edytora GAS.
// Deploy: jako Web App (Execute as: Me, Who has access: Anyone).
// ═══════════════════════════════════════════════════════════════════════════════

'use strict';

// ── KONFIGURACJA ──────────────────────────────────────────────────────────────

var CONFIG = {
  // Uzupełnij przed deployem — ID arkuszy z URL Google Sheets
  PROD_SPREADSHEET_ID: '1nrNDjbIFX6Ac-eMXmUe7mlh8RC1bkXWWcq_gaUULvio',
  DEV_SPREADSHEET_ID:  '1TmZplN36S9siV11BkiaZ3NelMa2YVkXC3AUyi1PUBj0',

  // Ustaw IS_DEV: false przed deployem produkcyjnym
  IS_DEV: true,

  SHEET_EVENTS:      'events',
  SHEET_MATCHES:     'scheduled_matches',
  SHEET_TOURNAMENTS: 'tournaments',

  // Rate limiting: max N zapisów eventów na minutę (per session key)
  RATE_LIMIT_MAX:       50,
  RATE_LIMIT_WINDOW_MS: 60 * 1000,

  TEXT_MAX_LEN: 100,
};

// ── STAŁE ─────────────────────────────────────────────────────────────────────

var VALID_RESULTS = ['celny', 'niecelny', 'gol'];

var VALID_ZONES = [
  'attack-left', 'attack-center', 'attack-right',
  'midfield-left', 'midfield-center', 'midfield-right',
  'own-half',
];

var PERIOD_REGEX = /^([1-4]|OT\d+)$/;

// Kolumny zakładek (kolejność = kolejność kolumn w arkuszu)
var EVENT_COLS = [
  'id', 'client_event_id', 'match_id',
  'tournament', 'team_A', 'team_B', 'match_date',
  'period', 'team_event',
  'shot_x', 'shot_y', 'zone_name',
  'result', 'man_up', 'man_down',
  'created_at',
];

var MATCH_COLS = [
  'id', 'tournament', 'match_date', 'team_A', 'team_B', 'created_at', 'status',
];

var TOURNAMENT_COLS = ['id', 'name', 'created_at'];

// ── ENTRY POINT ───────────────────────────────────────────────────────────────

/**
 * Serwuje aplikację webową (single-file HTML).
 * Plik `index.html` musi być dodany do projektu GAS (zawiera dist.html z build.sh).
 */
function doGet(e) {
  return HtmlService
    .createHtmlOutputFromFile('index')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .setSandboxMode(HtmlService.SandboxMode.IFRAME)
    .setTitle('Lacrosse Stats');
}

// ── HELPERS — SPREADSHEET ─────────────────────────────────────────────────────

function getSpreadsheet() {
  var id = CONFIG.IS_DEV ? CONFIG.DEV_SPREADSHEET_ID : CONFIG.PROD_SPREADSHEET_ID;
  if (!id) throw new Error('Brak SPREADSHEET_ID w CONFIG. Uzupełnij przed uruchomieniem.');
  return SpreadsheetApp.openById(id);
}

function getSheet(name) {
  var sheet = getSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Brak zakładki: ' + name + '. Uruchom setupSheets().');
  return sheet;
}

// ── HELPERS — WYNIKI ──────────────────────────────────────────────────────────

function ok(data) {
  return { ok: true, data: data !== undefined ? data : null };
}

function err(code, message) {
  return { ok: false, error: { code: code, message: message } };
}

// ── HELPERS — TEKST ───────────────────────────────────────────────────────────

/**
 * Sanityzuje pole tekstowe przed zapisem do Sheets:
 * - Usuwa znaki kontrolne (newline, tab itp.)
 * - Obcina do TEXT_MAX_LEN znaków
 * - Prefix apostrof dla ochrony przed formula injection (=, +, -, @)
 */
function sanitizeText(str) {
  if (typeof str !== 'string') return String(str);
  // Usuń znaki kontrolne (CR, LF, NUL, itd.)
  str = str.replace(/[\r\n\x0B\x0C\x0E-\x1F\x7F]/g, '');
  str = str.trim();
  if (str.length > CONFIG.TEXT_MAX_LEN) str = str.substring(0, CONFIG.TEXT_MAX_LEN);
  // Formula injection prevention (arkusz Google Sheets)
  if (/^[=+\-@|]/.test(str)) str = "'" + str;
  return str;
}

/**
 * Formatuje datę jako YYYY-MM-DD niezależnie od obiektu wejściowego
 * (string, Date z Sheets, timestamp ms).
 */
function formatDate(val) {
  if (!val) return '';
  if (typeof val === 'string') return val.substring(0, 10);
  if (val instanceof Date) {
    // Używamy Utilities.formatDate z timezone skryptu (Europe/Warsaw),
    // aby uniknąć błędu o 1 dzień gdy GAS server działa w UTC
    // a arkusz/skrypt jest w strefie UTC+2 (CEST).
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(val);
}

// ── HELPERS — ID ──────────────────────────────────────────────────────────────

/**
 * Generuje unikalne ID dla meczów i turniejów.
 * Format: prefix_timestampMs_rand4cyfry
 */
function generateId(prefix) {
  return (prefix || 'id') + '_' + Date.now() + '_' + Math.floor(Math.random() * 9000 + 1000);
}

/**
 * Zwraca true jeśli match_id to mecz ad-hoc (pure-numeric timestamp ze strony klienta).
 */
function isAdHocMatchId(matchId) {
  return /^\d{10,}$/.test(String(matchId));
}

// ── HELPERS — WIERSZE ─────────────────────────────────────────────────────────

/**
 * Zamienia tablicę wartości z getValues() na obiekt wg listy kolumn.
 * Konwertuje wartości booleanowe (Sheets zapisuje je jako TRUE/FALSE string).
 */
function rowToObj(cols, row) {
  var obj = {};
  cols.forEach(function(col, i) {
    var val = row[i];
    // Sheets może zwrócić '' dla pustych komórek
    if (val === 'TRUE' || val === true)   val = true;
    else if (val === 'FALSE' || val === false) val = false;
    // Daty — konwertuj na YYYY-MM-DD string
    else if (val instanceof Date) val = formatDate(val);
    obj[col] = val;
  });
  return obj;
}

/**
 * Zwraca wszystkie wiersze danych (bez nagłówka) jako tablicę obiektów.
 * Pomija wiersze z pustym ID.
 */
function sheetToArray(sheet, cols) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var data = sheet.getRange(2, 1, lastRow - 1, cols.length).getValues();
  return data
    .filter(function(row) { return row[0] !== '' && row[0] !== null && row[0] !== undefined; })
    .map(function(row) { return rowToObj(cols, row); });
}

/**
 * Szuka wiersza po ID (kolumna 1). Zwraca numer wiersza (1-based) lub -1.
 */
function findRowById(sheet, id) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

// ── WALIDACJA EVENTÓW ─────────────────────────────────────────────────────────

/**
 * Pełna walidacja eventu per architektura-v2.md sekcja 13.
 * Zwraca null jeśli OK, lub string z opisem błędu.
 */
function validateEvent(ev) {
  // 1. Required fields
  var required = [
    'client_event_id', 'match_id',
    'tournament', 'team_A', 'team_B', 'match_date',
    'period', 'team_event',
    'shot_x', 'shot_y', 'zone_name',
    'result',
  ];
  for (var i = 0; i < required.length; i++) {
    var f = required[i];
    if (ev[f] === undefined || ev[f] === null || ev[f] === '') {
      return 'Brakujące pole: ' + f;
    }
  }

  // 2. result
  if (VALID_RESULTS.indexOf(ev.result) === -1) {
    return 'Niepoprawny wynik: ' + ev.result + '. Oczekiwane: ' + VALID_RESULTS.join(', ');
  }

  // 3. period
  if (!PERIOD_REGEX.test(String(ev.period))) {
    return 'Niepoprawna kwarta: ' + ev.period + '. Format: 1–4 lub OT1, OT2, ...';
  }

  // 4. shot_x ∈ [-1, 1]
  var x = parseFloat(ev.shot_x);
  if (isNaN(x) || x < -1 || x > 1) {
    return 'shot_x poza zakresem [-1, 1]: ' + ev.shot_x;
  }

  // 5. shot_y ∈ [0, 1]
  var y = parseFloat(ev.shot_y);
  if (isNaN(y) || y < 0 || y > 1) {
    return 'shot_y poza zakresem [0, 1]: ' + ev.shot_y;
  }

  // 6. zone_name
  if (VALID_ZONES.indexOf(ev.zone_name) === -1) {
    return 'Niepoprawna strefa: ' + ev.zone_name;
  }

  // 7. Spójność zone_name / shot_x: own-half ⟺ shot_x < 0
  var isOwnHalf = ev.zone_name === 'own-half';
  var xNegative = x < 0;
  if (isOwnHalf !== xNegative) {
    return 'Niespójność: zone_name="own-half" wymaga shot_x < 0 (i odwrotnie). ' +
           'Aktualnie zone_name=' + ev.zone_name + ', shot_x=' + x;
  }

  // 8. man_up/man_down wzajemna wyłączność
  if (ev.man_up && ev.man_down) {
    return 'Sprzeczność: man_up i man_down nie mogą być jednocześnie true';
  }

  // 9. team_event musi być team_A lub team_B
  if (ev.team_event !== ev.team_A && ev.team_event !== ev.team_B) {
    return 'team_event ("' + ev.team_event + '") musi być równy team_A lub team_B';
  }

  // 10. match_date format YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ev.match_date))) {
    return 'match_date musi być w formacie YYYY-MM-DD: ' + ev.match_date;
  }

  return null; // OK
}

// ── RATE LIMITING ─────────────────────────────────────────────────────────────

/**
 * Prosta ochrona przed pętlami klienta.
 * sessionKey: pierwsze 16 znaków client_event_id (UUID prefix jest unikalny per sesja).
 * Zwraca false jeśli przekroczono limit, true w przeciwnym razie.
 */
function checkRateLimit(sessionKey) {
  try {
    var cache = CacheService.getScriptCache();
    var key = 'rl_' + String(sessionKey).substring(0, 16);
    var raw = cache.get(key);
    var now = Date.now();
    var data = raw ? JSON.parse(raw) : { count: 0, window_start: now };

    if (now - data.window_start > CONFIG.RATE_LIMIT_WINDOW_MS) {
      data = { count: 0, window_start: now };
    }

    data.count++;
    // TTL cache 2 minuty (GAS max 6h, ale okno 1min wystarczy)
    cache.put(key, JSON.stringify(data), 120);

    return data.count <= CONFIG.RATE_LIMIT_MAX;
  } catch (e) {
    // Jeśli cache nie działa — nie blokuj zapisu
    return true;
  }
}

// ── SETUP ─────────────────────────────────────────────────────────────────────

/**
 * Inicjalizuje zakładki w arkuszu (nagłówki, formatowanie).
 * Uruchom raz z edytora GAS po stworzeniu nowego arkusza.
 */
function setupSheets() {
  try {
    var ss = getSpreadsheet();

    function ensureSheet(name, cols) {
      var sheet = ss.getSheetByName(name);
      if (!sheet) {
        sheet = ss.insertSheet(name);
        Logger.log('Stworzono zakładkę: ' + name);
      }
      // Sprawdź/ustaw nagłówek
      var firstCell = sheet.getLastRow() === 0 ? '' : sheet.getRange(1, 1).getValue();
      if (String(firstCell) !== cols[0]) {
        sheet.getRange(1, 1, 1, cols.length).setValues([cols]);
        sheet.getRange(1, 1, 1, cols.length).setFontWeight('bold');
        sheet.setFrozenRows(1);
        // Ustaw szerokość kolumn dla czytelności
        sheet.autoResizeColumns(1, cols.length);
        Logger.log('Ustawiono nagłówki w zakładce: ' + name);
      }
      return sheet;
    }

    ensureSheet(CONFIG.SHEET_EVENTS, EVENT_COLS);
    ensureSheet(CONFIG.SHEET_MATCHES, MATCH_COLS);
    ensureSheet(CONFIG.SHEET_TOURNAMENTS, TOURNAMENT_COLS);

    return ok({ message: 'Zakładki gotowe: events, scheduled_matches, tournaments' });
  } catch (e) {
    return err('SETUP_ERROR', e.message);
  }
}

// ── EVENTY ────────────────────────────────────────────────────────────────────

/**
 * Zapisuje nowy event (strzał) do arkusza.
 * Przed zapisem: walidacja schematu, dedup po client_event_id, rate limiting.
 *
 * @param {Object} eventObj - Pola eventu (patrz model danych sekcja 11)
 * @returns {{ ok, data: { id, client_event_id } }}
 */
function saveEvent(eventObj) {
  try {
    // Rate limiting — klucz = match_id (stabilny per mecz), nie client_event_id (UUID per event)
    var sessionKey = String(eventObj.match_id || '');
    if (!checkRateLimit(sessionKey)) {
      return err('RATE_LIMITED', 'Zbyt wiele zapisów z tej sesji. Spróbuj ponownie za chwilę.');
    }

    // Walidacja
    var validErr = validateEvent(eventObj);
    if (validErr) return err('SCHEMA_INVALID', validErr);

    var sheet = getSheet(CONFIG.SHEET_EVENTS);
    var lastRow = sheet.getLastRow();

    // Dedup po client_event_id — jeśli już istnieje, zwróć obecne id
    if (lastRow >= 2) {
      var cidIdx = EVENT_COLS.indexOf('client_event_id'); // 0-based
      var allData = sheet.getRange(2, 1, lastRow - 1, EVENT_COLS.length).getValues();
      for (var i = 0; i < allData.length; i++) {
        if (String(allData[i][cidIdx]) === String(eventObj.client_event_id)) {
          return ok({ id: allData[i][0], client_event_id: eventObj.client_event_id });
        }
      }
    }

    // Nowe auto-increment ID = numer wiersza danych (lastRow - 1 + 1, gdzie -1 za nagłówek)
    var newId = Math.max(1, lastRow); // row 1 = nagłówek → id=1 idzie do row 2
    var createdAt = new Date().toISOString();

    var row = EVENT_COLS.map(function(col) {
      if (col === 'id')         return newId;
      if (col === 'created_at') return createdAt;
      if (col === 'man_up')     return eventObj.man_up  ? true : false;
      if (col === 'man_down')   return eventObj.man_down ? true : false;
      if (col === 'shot_x')     return parseFloat(eventObj.shot_x);
      if (col === 'shot_y')     return parseFloat(eventObj.shot_y);
      var val = eventObj[col];
      if (typeof val === 'string') return sanitizeText(val);
      return val !== undefined ? val : '';
    });

    sheet.appendRow(row);

    return ok({ id: newId, client_event_id: eventObj.client_event_id });
  } catch (e) {
    return err('INTERNAL_ERROR', e.message);
  }
}

/**
 * Aktualizuje istniejący event (edycja rezultatu, pozycji, flag przewagi).
 *
 * @param {number|string} id - Numeryczne ID eventu
 * @param {Object} eventObj  - Kompletny obiekt eventu z nowymi wartościami
 * @returns {{ ok, data: null }}
 */
function updateEvent(id, eventObj) {
  try {
    var validErr = validateEvent(eventObj);
    if (validErr) return err('SCHEMA_INVALID', validErr);

    var sheet = getSheet(CONFIG.SHEET_EVENTS);
    var rowNum = findRowById(sheet, id);
    if (rowNum < 0) return err('NOT_FOUND', 'Event nie istnieje: ' + id);

    // Zachowaj oryginalne created_at
    var createdAtCol = EVENT_COLS.indexOf('created_at') + 1; // 1-based
    var origCreatedAt = sheet.getRange(rowNum, createdAtCol).getValue();

    var row = EVENT_COLS.map(function(col) {
      if (col === 'id')         return id;
      if (col === 'created_at') return origCreatedAt;
      if (col === 'man_up')     return eventObj.man_up  ? true : false;
      if (col === 'man_down')   return eventObj.man_down ? true : false;
      if (col === 'shot_x')     return parseFloat(eventObj.shot_x);
      if (col === 'shot_y')     return parseFloat(eventObj.shot_y);
      var val = eventObj[col];
      if (typeof val === 'string') return sanitizeText(val);
      return val !== undefined ? val : '';
    });

    sheet.getRange(rowNum, 1, 1, EVENT_COLS.length).setValues([row]);
    return ok(null);
  } catch (e) {
    return err('INTERNAL_ERROR', e.message);
  }
}

/**
 * Usuwa event po numerycznym ID.
 *
 * @param {number|string} id - Numeryczne ID eventu
 * @returns {{ ok, data: null }}
 */
function deleteEventById(id) {
  try {
    var sheet = getSheet(CONFIG.SHEET_EVENTS);
    var rowNum = findRowById(sheet, id);
    if (rowNum < 0) return err('NOT_FOUND', 'Event nie istnieje: ' + id);
    sheet.deleteRow(rowNum);
    return ok(null);
  } catch (e) {
    return err('INTERNAL_ERROR', e.message);
  }
}

/**
 * Zwraca wszystkie eventy danego meczu.
 * Używane przez tryb podgląd (polling co 5s) oraz przy wznowieniu sesji.
 *
 * @param {string} matchId - ID meczu (z scheduled_matches lub timestamp ad-hoc)
 * @returns {{ ok, data: events[] }}
 */
function listEventsForMatch(matchId) {
  try {
    var sheet = getSheet(CONFIG.SHEET_EVENTS);
    var all = sheetToArray(sheet, EVENT_COLS);
    var filtered = all.filter(function(e) {
      return String(e.match_id) === String(matchId);
    });
    return ok(filtered);
  } catch (e) {
    return err('INTERNAL_ERROR', e.message);
  }
}

// ── ZAPLANOWANE MECZE ─────────────────────────────────────────────────────────

/**
 * Zwraca listę meczów na dany dzień (format YYYY-MM-DD).
 * Ekran startowy filtruje po dzisiejszej dacie.
 *
 * @param {string} date - YYYY-MM-DD
 * @returns {{ ok, data: matches[] }}
 */
function listScheduledMatchesForDate(date) {
  try {
    var sheet = getSheet(CONFIG.SHEET_MATCHES);
    var all = sheetToArray(sheet, MATCH_COLS);
    var filtered = all.filter(function(m) {
      return formatDate(m.match_date) === String(date).substring(0, 10);
    });
    return ok(filtered);
  } catch (e) {
    return err('INTERNAL_ERROR', e.message);
  }
}

/**
 * Tworzy nowy zaplanowany mecz (panel admin).
 *
 * @param {Object} matchObj - { tournament, match_date, team_A, team_B, status? }
 * @returns {{ ok, data: { id } }}
 */
function createScheduledMatch(matchObj) {
  try {
    if (!matchObj.tournament || !matchObj.match_date || !matchObj.team_A || !matchObj.team_B) {
      return err('SCHEMA_INVALID', 'Wymagane pola: tournament, match_date, team_A, team_B');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(matchObj.match_date))) {
      return err('SCHEMA_INVALID', 'match_date musi być w formacie YYYY-MM-DD');
    }

    var sheet = getSheet(CONFIG.SHEET_MATCHES);
    var id = generateId('m');
    var createdAt = new Date().toISOString();

    var row = MATCH_COLS.map(function(col) {
      if (col === 'id')         return id;
      if (col === 'created_at') return createdAt;
      if (col === 'status')     return matchObj.status || 'scheduled';
      var val = matchObj[col];
      return typeof val === 'string' ? sanitizeText(val) : (val !== undefined ? val : '');
    });

    sheet.appendRow(row);
    return ok({ id: id });
  } catch (e) {
    return err('INTERNAL_ERROR', e.message);
  }
}

/**
 * Aktualizuje mecz (edycja danych lub zmiana statusu: scheduled→live→finished).
 *
 * @param {string} id        - ID meczu
 * @param {Object} matchObj  - Pola do zaktualizowania (partial update OK)
 * @returns {{ ok, data: null }}
 */
function updateScheduledMatch(id, matchObj) {
  try {
    var sheet = getSheet(CONFIG.SHEET_MATCHES);
    var rowNum = findRowById(sheet, id);
    if (rowNum < 0) return err('NOT_FOUND', 'Mecz nie istnieje: ' + id);

    var existingRow = sheet.getRange(rowNum, 1, 1, MATCH_COLS.length).getValues()[0];
    var existing = rowToObj(MATCH_COLS, existingRow);

    // Walidacja statusu jeśli podany
    var validStatuses = ['scheduled', 'live', 'finished'];
    if (matchObj.status !== undefined && validStatuses.indexOf(matchObj.status) === -1) {
      return err('SCHEMA_INVALID', 'Niepoprawny status: ' + matchObj.status);
    }

    var row = MATCH_COLS.map(function(col) {
      if (col === 'id')         return id;
      if (col === 'created_at') return existing.created_at;
      // Partial update: jeśli pole podane → użyj nowego, w p.p. stare
      var val = matchObj[col] !== undefined ? matchObj[col] : existing[col];
      return typeof val === 'string' ? sanitizeText(val) : (val !== undefined ? val : '');
    });

    sheet.getRange(rowNum, 1, 1, MATCH_COLS.length).setValues([row]);
    return ok(null);
  } catch (e) {
    return err('INTERNAL_ERROR', e.message);
  }
}

/**
 * Usuwa zaplanowany mecz (panel admin).
 * Uwaga: nie usuwa kaskadowo eventów powiązanych z tym meczem.
 *
 * @param {string} id - ID meczu
 * @returns {{ ok, data: null }}
 */
function deleteScheduledMatch(id) {
  try {
    var sheet = getSheet(CONFIG.SHEET_MATCHES);
    var rowNum = findRowById(sheet, id);
    if (rowNum < 0) return err('NOT_FOUND', 'Mecz nie istnieje: ' + id);
    sheet.deleteRow(rowNum);
    return ok(null);
  } catch (e) {
    return err('INTERNAL_ERROR', e.message);
  }
}

// ── TURNIEJE ──────────────────────────────────────────────────────────────────

/**
 * Zwraca globalną listę turniejów (do dropdown'a w formularzu meczu).
 *
 * @returns {{ ok, data: tournaments[] }}
 */
function listTournaments() {
  try {
    var sheet = getSheet(CONFIG.SHEET_TOURNAMENTS);
    var all = sheetToArray(sheet, TOURNAMENT_COLS);
    return ok(all);
  } catch (e) {
    return err('INTERNAL_ERROR', e.message);
  }
}

/**
 * Tworzy nowy turniej.
 *
 * @param {string} name - Nazwa turnieju
 * @returns {{ ok, data: { id } }}
 */
function createTournament(name) {
  try {
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return err('SCHEMA_INVALID', 'Nazwa turnieju jest wymagana');
    }
    var safeName = sanitizeText(name.trim());
    var sheet = getSheet(CONFIG.SHEET_TOURNAMENTS);
    var id = generateId('t');
    var createdAt = new Date().toISOString();
    sheet.appendRow([id, safeName, createdAt]);
    return ok({ id: id });
  } catch (e) {
    return err('INTERNAL_ERROR', e.message);
  }
}

/**
 * Aktualizuje nazwę turnieju.
 *
 * @param {string} id   - ID turnieju
 * @param {string} name - Nowa nazwa
 * @returns {{ ok, data: null }}
 */
function updateTournament(id, name) {
  try {
    if (!id) return err('SCHEMA_INVALID', 'Brak id turnieju');
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return err('SCHEMA_INVALID', 'Nazwa turnieju jest wymagana');
    }
    var safeName = sanitizeText(name.trim());
    var sheet = getSheet(CONFIG.SHEET_TOURNAMENTS);
    var rowNum = findRowById(sheet, id);
    if (rowNum === -1) return err('NOT_FOUND', 'Turniej nie istnieje: ' + id);
    // Kolumna 2 = name (TOURNAMENT_COLS: id, name, created_at)
    sheet.getRange(rowNum, 2).setValue(safeName);
    return ok(null);
  } catch (e) {
    return err('INTERNAL_ERROR', e.message);
  }
}

/**
 * Usuwa turniej po ID.
 *
 * @param {string} id - ID turnieju
 * @returns {{ ok, data: null }}
 */
function deleteTournament(id) {
  try {
    if (!id) return err('SCHEMA_INVALID', 'Brak id turnieju');
    var sheet = getSheet(CONFIG.SHEET_TOURNAMENTS);
    var rowNum = findRowById(sheet, id);
    if (rowNum === -1) return err('NOT_FOUND', 'Turniej nie istnieje: ' + id);
    sheet.deleteRow(rowNum);
    return ok(null);
  } catch (e) {
    return err('INTERNAL_ERROR', e.message);
  }
}

/**
 * Zwraca wszystkie zaplanowane mecze (panel admin — pełna lista).
 *
 * @returns {{ ok, data: match[] }}
 */
function listAllScheduledMatches() {
  try {
    var sheet = getSheet(CONFIG.SHEET_MATCHES);
    var all = sheetToArray(sheet, MATCH_COLS);
    // Sortuj wg daty rosnąco
    all.sort(function(a, b) {
      if (a.match_date < b.match_date) return -1;
      if (a.match_date > b.match_date) return 1;
      return 0;
    });
    return ok(all);
  } catch (e) {
    return err('INTERNAL_ERROR', e.message);
  }
}

// ── DIAGNOSTYKA ───────────────────────────────────────────────────────────────

/**
 * Pomocnicza funkcja do testowania połączenia z arkuszem z edytora GAS.
 * Nie wystawiona na frontend.
 */
function testConnection() {
  var result = setupSheets();
  Logger.log(JSON.stringify(result));

  // Testowy round-trip: zapis + odczyt + usunięcie
  var testEvent = {
    client_event_id: 'test_' + Date.now(),
    match_id: 'test_match',
    tournament: 'Test Turniej',
    team_A: 'Drużyna A',
    team_B: 'Drużyna B',
    match_date: '2026-01-01',
    period: '1',
    team_event: 'Drużyna A',
    shot_x: 0.75,
    shot_y: 0.50,
    zone_name: 'attack-center',
    result: 'celny',
    man_up: false,
    man_down: false,
  };

  var saved = saveEvent(testEvent);
  Logger.log('saveEvent: ' + JSON.stringify(saved));

  if (saved.ok) {
    var listed = listEventsForMatch('test_match');
    Logger.log('listEventsForMatch: ' + listed.data.length + ' eventów');

    var deleted = deleteEventById(saved.data.id);
    Logger.log('deleteEventById: ' + JSON.stringify(deleted));
  }

  Logger.log('Test zakończony.');
}
