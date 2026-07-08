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
  PROD_SPREADSHEET_ID: '1UzIkHcaF-Msae84cbzIlEQtLRb3zmiFcshRxcgGgScM',
  DEV_SPREADSHEET_ID:  '1zwEOombZhVVhQIsSKD23aa4LHwhm-65bOxsqFrdO-NQ',

  // Ustaw IS_DEV: false przed deployem produkcyjnym
  IS_DEV: false,

  // Wariant lacrosse — wstrzykiwany do APP_CONFIG w przeglądarce
  VARIANT: 'field',

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
  'created_at', 'assisted', 'fast_break',
  'event_type', 'goalie_number',
  'free_position', 'penalty_shot',
];

var MATCH_COLS = [
  'id', 'tournament', 'match_date', 'team_A', 'team_B', 'created_at', 'status', 'video_url',
];

var TOURNAMENT_COLS = ['id', 'name', 'created_at'];

// ── ENTRY POINT ───────────────────────────────────────────────────────────────

/**
 * Serwuje aplikację webową (single-file HTML).
 * Plik `index.html` musi być dodany do projektu GAS (zawiera dist.html z build.sh).
 */
function doGet(e) {
  var urlToken = (e && e.parameter && e.parameter.token) ? e.parameter.token : '';
  var editorToken = '';
  try {
    editorToken = PropertiesService.getScriptProperties().getProperty('EDITOR_TOKEN') || '';
  } catch (ex) {}

  // Jeśli EDITOR_TOKEN nie ustawiony w Script Properties → pełny dostęp dla wszystkich
  // Jeśli ustawiony → wymagany token w URL (?token=...)
  var isEditor = (editorToken === '') ? true : (urlToken === editorToken);
  var configScript = '<script>window.APP_CONFIG={isEditor:' + isEditor + ',variant:"' + CONFIG.VARIANT + '"};</script>';

  var html = HtmlService.createHtmlOutputFromFile('index').getContent();
  html = html.replace('</head>', configScript + '</head>');

  return HtmlService
    .createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .setSandboxMode(HtmlService.SandboxMode.IFRAME)
    .setTitle('Lacrosse Stats — Mistrzostwa Świata');
}

/**
 * HTTP POST entry point — JSON REST-like API dla Postmana i integracji zewnętrznych.
 *
 * Body (application/json): { "action": "<nazwa>", ...parametry }
 *
 * Dostępne akcje:
 *   listTournaments
 *   createTournament          { name }
 *   updateTournament          { id, name }
 *   deleteTournament          { id }
 *   listAllScheduledMatches
 *   listScheduledMatchesForDate { date }          — YYYY-MM-DD
 *   createScheduledMatch      { match: { tournament, match_date, team_A, team_B, status?, video_url? } }
 *   updateScheduledMatch      { id, match: {...} }
 *   deleteScheduledMatch      { id }
 *   bulkCreateMatches         { matches: [...] }
 *   saveEvent                 { event: {...} }
 *   updateEvent               { id, event: {...} }
 *   deleteEvent               { id }
 *   listEventsForMatch        { matchId }
 *   listAllEvents
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse(err('BAD_REQUEST', 'Brak body w żądaniu POST'));
    }

    var body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return jsonResponse(err('BAD_REQUEST', 'Niepoprawny JSON: ' + parseErr.message));
    }

    var action = body.action;
    if (!action) {
      return jsonResponse(err('BAD_REQUEST', 'Brak pola "action" w body'));
    }

    if (action === 'listTournaments')           return jsonResponse(listTournaments());
    if (action === 'createTournament')          return jsonResponse(createTournament(body.name));
    if (action === 'updateTournament')          return jsonResponse(updateTournament(body.id, body.name));
    if (action === 'deleteTournament')          return jsonResponse(deleteTournament(body.id));

    if (action === 'listAllScheduledMatches')   return jsonResponse(listAllScheduledMatches());
    if (action === 'listScheduledMatchesForDate') return jsonResponse(listScheduledMatchesForDate(body.date));
    if (action === 'createScheduledMatch')      return jsonResponse(createScheduledMatch(body.match));
    if (action === 'updateScheduledMatch')      return jsonResponse(updateScheduledMatch(body.id, body.match));
    if (action === 'deleteScheduledMatch')      return jsonResponse(deleteScheduledMatch(body.id));
    if (action === 'bulkCreateMatches')         return jsonResponse(bulkCreateMatches(body.matches));

    if (action === 'saveEvent')                 return jsonResponse(saveEvent(body.event));
    if (action === 'updateEvent')               return jsonResponse(updateEvent(body.id, body.event));
    if (action === 'deleteEvent')               return jsonResponse(deleteEventById(body.id));
    if (action === 'listEventsForMatch')        return jsonResponse(listEventsForMatch(body.matchId));
    if (action === 'listAllEvents')             return jsonResponse(listAllEvents());

    if (action === 'presenceHeartbeat')         return jsonResponse(presenceHeartbeat(body.matchId, body.sessionId));
    if (action === 'presenceLeave')             return jsonResponse(presenceLeave(body.matchId, body.sessionId));
    if (action === 'presenceGetCounts')         return jsonResponse(presenceGetCounts(body.matchIds));

    return jsonResponse(err('UNKNOWN_ACTION', 'Nieznana akcja: ' + action));
  } catch (ex) {
    return jsonResponse(err('INTERNAL_ERROR', ex.message));
  }
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

function jsonResponse(result) {
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── HELPERS — TEKST ───────────────────────────────────────────────────────────

/**
 * Sanityzuje URL przed zapisem — przepuszcza tylko http(s), max 500 znaków.
 */
function sanitizeUrl(str) {
  if (typeof str !== 'string') return '';
  str = str.replace(/[\r\n\x00-\x1F\x7F]/g, '').trim();
  if (!str) return '';
  if (!/^https?:\/\//i.test(str)) return '';
  if (str.length > 500) str = str.substring(0, 500);
  return str;
}

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
  var isGoalieSet      = ev.event_type === 'goalie_set';
  var isSimpleCounter  = ev.event_type === 'groundball' || ev.event_type === 'draw';

  // 1. Required fields (all event types)
  var required = [
    'client_event_id', 'match_id',
    'team_A', 'team_B', 'match_date',
    'period', 'team_event',
  ];
  if (!isGoalieSet && !isSimpleCounter) {
    required = required.concat(['shot_x', 'shot_y', 'zone_name', 'result']);
  }
  for (var i = 0; i < required.length; i++) {
    var f = required[i];
    if (ev[f] === undefined || ev[f] === null || ev[f] === '') {
      return 'Brakujące pole: ' + f;
    }
  }

  // goalie_set: waliduj numer, pomiń resztę
  if (isGoalieSet) {
    var gn = String(ev.goalie_number !== undefined && ev.goalie_number !== null ? ev.goalie_number : '');
    if (!/^\d{1,2}$/.test(gn)) return 'goalie_number musi być liczbą 0–99: ' + gn;
    return null;
  }

  // groundball / draw: tylko kwarta i drużyna
  if (isSimpleCounter) {
    if (!PERIOD_REGEX.test(String(ev.period)))
      return 'Niepoprawna kwarta: ' + ev.period;
    if (ev.team_event !== ev.team_A && ev.team_event !== ev.team_B)
      return 'team_event musi być równy team_A lub team_B';
    return null;
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

  // 8b. free_position/penalty_shot wzajemna wyłączność
  if (ev.free_position && ev.penalty_shot) {
    return 'Sprzeczność: free_position i penalty_shot nie mogą być jednocześnie true';
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

// ── PRESENCE ──────────────────────────────────────────────────────────────────

function presenceHeartbeat(matchId, sessionId, mode) {
  try {
    if (!matchId || !sessionId || typeof matchId !== 'string' || typeof sessionId !== 'string') {
      return err('BAD_REQUEST', 'matchId i sessionId muszą być niepustymi stringami');
    }
    var mId = matchId.substring(0, 64);
    var sId = sessionId.substring(0, 64);
    var entryMode = (mode === 'viewer') ? 'viewer' : 'input';
    var cache = CacheService.getScriptCache();
    var key = 'pm_' + mId;
    var raw = cache.get(key);
    var data = {};
    if (raw) { try { data = JSON.parse(raw); } catch (e) { data = {}; } }
    var now = Date.now();
    Object.keys(data).forEach(function (k) {
      var entry = data[k];
      var ts = (typeof entry === 'object') ? entry.ts : entry;
      if (now - ts > 120000) delete data[k];
    });
    data[sId] = { ts: now, mode: entryMode };
    cache.put(key, JSON.stringify(data), 300);
    var counts = _presenceCounts(data);
    return ok(counts);
  } catch (e) {
    return ok({ input: 0, viewer: 0 });
  }
}

function presenceLeave(matchId, sessionId) {
  try {
    if (!matchId || !sessionId || typeof matchId !== 'string' || typeof sessionId !== 'string') {
      return ok(null);
    }
    var mId = matchId.substring(0, 64);
    var sId = sessionId.substring(0, 64);
    var cache = CacheService.getScriptCache();
    var key = 'pm_' + mId;
    var raw = cache.get(key);
    var data = {};
    if (raw) { try { data = JSON.parse(raw); } catch (e) { data = {}; } }
    delete data[sId];
    if (Object.keys(data).length === 0) {
      cache.remove(key);
    } else {
      cache.put(key, JSON.stringify(data), 300);
    }
    return ok(null);
  } catch (e) {
    return ok(null);
  }
}

function _presenceCounts(data) {
  var now = Date.now();
  var input = 0; var viewer = 0;
  Object.keys(data).forEach(function (k) {
    var entry = data[k];
    var ts = (typeof entry === 'object') ? entry.ts : entry;
    if (now - ts > 120000) return;
    if (typeof entry === 'object' && entry.mode === 'viewer') { viewer++; } else { input++; }
  });
  return { input: input, viewer: viewer };
}

function presenceGetCounts(matchIds) {
  try {
    if (!Array.isArray(matchIds)) return ok({});
    var ids = matchIds.slice(0, 50);
    var cache = CacheService.getScriptCache();
    var keys = ids.map(function (id) { return 'pm_' + String(id).substring(0, 64); });
    var all = cache.getAll(keys);
    var result = {};
    ids.forEach(function (matchId) {
      var raw = all['pm_' + String(matchId).substring(0, 64)];
      if (!raw) { result[String(matchId)] = { input: 0, viewer: 0 }; return; }
      var data = {};
      try { data = JSON.parse(raw); } catch (e) { data = {}; }
      result[String(matchId)] = _presenceCounts(data);
    });
    return ok(result);
  } catch (e) {
    return ok({});
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
      var lastRow = sheet.getLastRow();
      var lastCol = sheet.getLastColumn();
      var firstCell = (lastRow === 0 || lastCol === 0) ? '' : sheet.getRange(1, 1).getValue();
      var needsUpdate = String(firstCell) !== cols[0] || lastCol < cols.length;
      if (needsUpdate) {
        sheet.getRange(1, 1, 1, cols.length).setValues([cols]);
        sheet.getRange(1, 1, 1, cols.length).setFontWeight('bold');
        sheet.setFrozenRows(1);
        sheet.autoResizeColumns(1, cols.length);
        Logger.log('Zaktualizowano nagłówki w zakładce: ' + name);
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

/**
 * Jednorazowa migracja: wstawia kolumnę fast_break po assisted w arkuszu events.
 * Bezpieczna dla pustego i niepustego arkusza — przesuwa istniejące dane.
 * Uruchom raz z edytora GAS po deploymencie v2.0.0.
 */
function migrateAddFastBreak() {
  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEET_EVENTS);
    if (!sheet) throw new Error('Brak zakładki events');

    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var assistedIdx = headers.indexOf('assisted'); // 0-based
    if (assistedIdx === -1) throw new Error('Nie znaleziono kolumny "assisted"');

    if (headers.indexOf('fast_break') !== -1) {
      Logger.log('Kolumna fast_break już istnieje — migracja nie jest potrzebna.');
      return;
    }

    // Wstaw kolumnę PO assisted (1-based: assistedIdx + 2)
    var insertAt = assistedIdx + 2; // 1-based position
    sheet.insertColumnBefore(insertAt);
    sheet.getRange(1, insertAt).setValue('fast_break').setFontWeight('bold');
    Logger.log('Dodano kolumnę fast_break na pozycji ' + insertAt);
  } catch (e) {
    Logger.log('BŁĄD migrateAddFastBreak: ' + e.message);
    throw e;
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
      if (col === 'man_up')        return eventObj.man_up        ? true : false;
      if (col === 'man_down')      return eventObj.man_down      ? true : false;
      if (col === 'assisted')      return eventObj.assisted      ? true : false;
      if (col === 'fast_break')    return eventObj.fast_break    ? true : false;
      if (col === 'free_position') return eventObj.free_position ? true : false;
      if (col === 'penalty_shot')  return eventObj.penalty_shot  ? true : false;
      var _nonShot = ['goalie_set', 'groundball', 'draw'];
      if (col === 'shot_x') return _nonShot.indexOf(eventObj.event_type) >= 0 ? '' : parseFloat(eventObj.shot_x);
      if (col === 'shot_y') return _nonShot.indexOf(eventObj.event_type) >= 0 ? '' : parseFloat(eventObj.shot_y);
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
      if (col === 'man_up')        return eventObj.man_up        ? true : false;
      if (col === 'man_down')      return eventObj.man_down      ? true : false;
      if (col === 'assisted')      return eventObj.assisted      ? true : false;
      if (col === 'fast_break')    return eventObj.fast_break    ? true : false;
      if (col === 'free_position') return eventObj.free_position ? true : false;
      if (col === 'penalty_shot')  return eventObj.penalty_shot  ? true : false;
      var _nonShot = ['goalie_set', 'groundball', 'draw'];
      if (col === 'shot_x') return _nonShot.indexOf(eventObj.event_type) >= 0 ? '' : parseFloat(eventObj.shot_x);
      if (col === 'shot_y') return _nonShot.indexOf(eventObj.event_type) >= 0 ? '' : parseFloat(eventObj.shot_y);
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
    if (!matchObj.match_date || !matchObj.team_A || !matchObj.team_B) {
      return err('SCHEMA_INVALID', 'Wymagane pola: match_date, team_A, team_B');
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
      if (col === 'video_url')  return sanitizeUrl(matchObj.video_url || '');
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
      if (col === 'video_url') {
        var urlVal = matchObj.video_url !== undefined ? matchObj.video_url : existing.video_url;
        return sanitizeUrl(urlVal || '');
      }
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
 * Tworzy wiele zaplanowanych meczów naraz (bulk import z CSV).
 *
 * @param {Array} matchesArray - Tablica obiektów { tournament, match_date, team_A, team_B, video_url?, status? }
 * @returns {{ ok, data: { ids: string[], count: number } }}
 */
function bulkCreateMatches(matchesArray) {
  try {
    if (!Array.isArray(matchesArray) || matchesArray.length === 0) {
      return err('SCHEMA_INVALID', 'Pusta lista meczów');
    }
    if (matchesArray.length > 200) {
      return err('SCHEMA_INVALID', 'Za dużo meczów naraz (max 200)');
    }

    var sheet = getSheet(CONFIG.SHEET_MATCHES);
    var createdAt = new Date().toISOString();
    var rows = [];
    var ids = [];

    for (var i = 0; i < matchesArray.length; i++) {
      var m = matchesArray[i];
      if (!m.match_date || !m.team_A || !m.team_B) {
        return err('SCHEMA_INVALID', 'Mecz ' + (i + 1) + ': wymagane pola: match_date, team_A, team_B');
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(m.match_date))) {
        return err('SCHEMA_INVALID', 'Mecz ' + (i + 1) + ': match_date musi być w formacie YYYY-MM-DD');
      }
      var id = generateId('m');
      ids.push(id);
      var row = MATCH_COLS.map(function(col) {
        if (col === 'id')         return id;
        if (col === 'created_at') return createdAt;
        if (col === 'status')     return m.status || 'scheduled';
        if (col === 'video_url')  return sanitizeUrl(m.video_url || '');
        var val = m[col];
        return typeof val === 'string' ? sanitizeText(val) : (val !== undefined ? val : '');
      });
      rows.push(row);
    }

    // Batch write — jeden setValues zamiast pętli appendRow
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, MATCH_COLS.length).setValues(rows);
    return ok({ ids: ids, count: rows.length });
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

// ── ANALITYKA ─────────────────────────────────────────────────────────────────

/**
 * Zwraca wszystkie eventy ze wszystkich meczów (tryb analityki historycznej).
 * Filtrowanie po stronie klienta.
 *
 * @returns {{ ok, data: events[] }}
 */
function listAllEvents() {
  try {
    var sheet = getSheet(CONFIG.SHEET_EVENTS);
    var events = sheetToArray(sheet, EVENT_COLS);
    return ok(events);
  } catch (e) {
    return err('INTERNAL', e.message);
  }
}

// ── SEED — dane testowe ───────────────────────────────────────────────────────

/**
 * Wypełnia arkusz fałszywymi danymi historycznymi do testowania analityki.
 * Uruchom JEDEN RAZ z edytora GAS (nie deploy, tylko Run → seedDummyData).
 * Aby wyczyścić: usuń ręcznie wiersze z prefixem 'tseed_', 'mseed_', id >= 1000.
 */
function seedDummyData() {
  try {
    var ss = SpreadsheetApp.openById(CONFIG.DEV_SPREADSHEET_ID);
    var tourSheet  = ss.getSheetByName(CONFIG.SHEET_TOURNAMENTS);
    var matchSheet = ss.getSheetByName(CONFIG.SHEET_MATCHES);
    var eventSheet = ss.getSheetByName(CONFIG.SHEET_EVENTS);

    if (!tourSheet || !matchSheet || !eventSheet) {
      Logger.log('Brak zakładek. Uruchom najpierw setupSheets().');
      return err('SETUP_REQUIRED', 'Uruchom najpierw setupSheets()');
    }

    // Wyczyść istniejące dane (zachowaj wiersz nagłówka)
    function clearData(sheet) {
      var last = sheet.getLastRow();
      if (last > 1) sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).clearContent();
    }
    clearData(tourSheet);
    clearData(matchSheet);
    clearData(eventSheet);

    var now   = new Date().toISOString();
    var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

    // ── Turnieje ──────────────────────────────────────────────────────────────
    var tours = [
      ['t1', 'MŚ 2026 — grupa A',          now],
      ['t2', 'MŚ 2026 — faza pucharowa',   now],
      ['t3', 'Sparingi przedturniejowe',   now],
    ];
    tours.forEach(function(t) { tourSheet.appendRow(t); });

    // ── Mecze ─────────────────────────────────────────────────────────────────
    // [id, tournament, date, teamA, teamB, created_at, status]
    var matchDefs = [
      ['m1',  'MŚ 2026 — grupa A',        today,        'Polska', 'USA',      now, 'live'     ],
      ['m2',  'MŚ 2026 — grupa A',        today,        'Niemcy', 'Czechy',   now, 'scheduled'],
      ['m3',  'MŚ 2026 — grupa A',        '2026-02-08', 'Polska', 'USA',      now, 'finished' ],
      ['m4',  'MŚ 2026 — grupa A',        '2026-02-08', 'Niemcy', 'Czechy',   now, 'finished' ],
      ['m5',  'MŚ 2026 — grupa A',        '2026-02-15', 'Polska', 'Niemcy',   now, 'finished' ],
      ['m6',  'MŚ 2026 — grupa A',        '2026-02-15', 'USA',    'Czechy',   now, 'finished' ],
      ['m7',  'MŚ 2026 — grupa A',        '2026-02-22', 'Polska', 'Czechy',   now, 'finished' ],
      ['m8',  'MŚ 2026 — grupa A',        '2026-02-22', 'USA',    'Niemcy',   now, 'finished' ],
      ['m9',  'MŚ 2026 — faza pucharowa', '2026-03-08', 'Polska', 'Niemcy',   now, 'finished' ],
      ['m10', 'MŚ 2026 — faza pucharowa', '2026-03-08', 'Czechy', 'USA',      now, 'finished' ],
      ['m11', 'MŚ 2026 — faza pucharowa', '2026-03-15', 'Polska', 'USA',      now, 'finished' ],
      ['m12', 'MŚ 2026 — faza pucharowa', '2026-03-15', 'Niemcy', 'Czechy',   now, 'finished' ],
      ['m13', 'Sparingi przedturniejowe', '2026-03-22', 'Kanada', 'Anglia',   now, 'finished' ],
      ['m14', 'Sparingi przedturniejowe', '2026-03-22', 'Polska', 'Kanada',   now, 'finished' ],
      ['m15', 'Sparingi przedturniejowe', '2026-03-29', 'USA',    'Anglia',   now, 'finished' ],
    ];
    matchDefs.forEach(function(m) { matchSheet.appendRow(m); });

    // ── Eventy ────────────────────────────────────────────────────────────────
    // Goalie assignments per mecz: gA/gB = numer startowy, changeA/changeB = zmiana w trakcie
    var matchMeta = {
      'm1':  { gA: '33', gB: '7'  },
      'm3':  { gA: '33', gB: '7'  },
      'm4':  { gA: '11', gB: '44' },
      'm5':  { gA: '33', gB: '11', changeA: { period: '3', num: '22' } },
      'm6':  { gA: '7',  gB: '44' },
      'm7':  { gA: '33', gB: '44', ot: true },
      'm8':  { gA: '7',  gB: '11' },
      'm9':  { gA: '33', gB: '11', ot: true },
      'm10': { gA: '44', gB: '7'  },
      'm11': { gA: '22', gB: '7',  changeB: { period: '2', num: '21' } },
      'm12': { gA: '11', gB: '44' },
      'm13': { gA: '5',  gB: '15' },
      'm14': { gA: '33', gB: '5'  },
      'm15': { gA: '7',  gB: '15' },
    };

    function rnd(min, max) {
      return Math.round((min + Math.random() * (max - min)) * 1000) / 1000;
    }
    var ZONE_COORDS = {
      'attack-center':   function() { return [rnd(0.65,0.99), rnd(0.28,0.72)]; },
      'attack-left':     function() { return [rnd(0.65,0.99), rnd(0.01,0.33)]; },
      'attack-right':    function() { return [rnd(0.65,0.99), rnd(0.67,0.99)]; },
      'midfield-center': function() { return [rnd(0.25,0.60), rnd(0.28,0.72)]; },
      'midfield-left':   function() { return [rnd(0.25,0.60), rnd(0.01,0.33)]; },
      'midfield-right':  function() { return [rnd(0.25,0.60), rnd(0.67,0.99)]; },
      'own-half':        function() { return [rnd(-0.80,-0.05), rnd(0.05,0.95)]; },
    };
    function randomZone() {
      var r = Math.random();
      if (r < 0.32) return 'attack-center';
      if (r < 0.49) return 'attack-left';
      if (r < 0.66) return 'attack-right';
      if (r < 0.79) return 'midfield-center';
      if (r < 0.87) return 'midfield-left';
      if (r < 0.95) return 'midfield-right';
      return 'own-half';
    }
    function randomResult(zone) {
      var r = Math.random();
      if (zone === 'attack-center')       return r < 0.38 ? 'gol' : r < 0.68 ? 'celny' : 'niecelny';
      if (zone.indexOf('attack')   === 0) return r < 0.28 ? 'gol' : r < 0.60 ? 'celny' : 'niecelny';
      if (zone.indexOf('midfield') === 0) return r < 0.12 ? 'gol' : r < 0.40 ? 'celny' : 'niecelny';
      return r < 0.02 ? 'gol' : r < 0.12 ? 'celny' : 'niecelny'; // own-half
    }

    var eventRows = [];
    var eid = 0;

    // EVENT_COLS: id, client_event_id, match_id, tournament, team_A, team_B, match_date,
    //             period, team_event, shot_x, shot_y, zone_name, result, man_up, man_down,
    //             created_at, assisted, fast_break, event_type, goalie_number, free_position, penalty_shot

    function pushGoalie(matchId, tour, teamA, teamB, date, team, num, period) {
      var gid = 'gs_' + matchId + '_' + team.substring(0,3) + '_' + period;
      eventRows.push([
        gid, gid + '_c', matchId, tour, teamA, teamB, date,
        period, team,
        '', '', '', '', '', '',
        now, '', '', 'goalie_set', num,
        false, false
      ]);
    }

    matchDefs.forEach(function(mRow) {
      var matchId = mRow[0], tour = mRow[1], date = mRow[2];
      var teamA = mRow[3], teamB = mRow[4];
      if (matchId === 'm2') return; // scheduled — brak eventów

      var meta = matchMeta[matchId] || {};

      // Goalie set (Q1) i ewentualne zmiany
      if (meta.gA) pushGoalie(matchId, tour, teamA, teamB, date, teamA, meta.gA, '1');
      if (meta.gB) pushGoalie(matchId, tour, teamA, teamB, date, teamB, meta.gB, '1');
      if (meta.changeA) pushGoalie(matchId, tour, teamA, teamB, date, teamA, meta.changeA.num, meta.changeA.period);
      if (meta.changeB) pushGoalie(matchId, tour, teamA, teamB, date, teamB, meta.changeB.num, meta.changeB.period);

      // Strzały
      var periods = ['1','2','3','4'];
      if (meta.ot) periods.push('OT1');

      periods.forEach(function(period) {
        var isOT  = period.indexOf('OT') === 0;
        var total = isOT ? (2 + Math.floor(Math.random() * 3)) : (8 + Math.floor(Math.random() * 3));
        for (var i = 0; i < total; i++) {
          eid++;
          var team   = Math.random() < 0.5 ? teamA : teamB;
          var zone   = randomZone();
          var coords = ZONE_COORDS[zone]();
          var result = randomResult(zone);
          var manUp   = Math.random() < 0.10;
          var manDown = !manUp && Math.random() > 0.88;
          eventRows.push([
            eid, 'seed_' + eid, matchId,
            tour, teamA, teamB, date,
            period, team,
            coords[0], coords[1], zone,
            result, manUp, manDown,
            now, '', '', '', '',
            false, false
          ]);
        }
      });
    });

    // Batch write
    if (eventRows.length > 0) {
      eventSheet.getRange(
        eventSheet.getLastRow() + 1, 1, eventRows.length, EVENT_COLS.length
      ).setValues(eventRows);
    }

    var summary = 'seedDummyData OK — turnieje: ' + tours.length +
                  ', mecze: ' + matchDefs.length +
                  ', eventy: ' + eventRows.length;
    Logger.log(summary);
    return ok({ tournaments: tours.length, matches: matchDefs.length, events: eventRows.length });
  } catch (e) {
    Logger.log('seedDummyData error: ' + e.message);
    return err('SEED_ERROR', e.message);
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

// ── SEED PROD — jednorazowe zasilenie danych na PROD ─────────────────────────

/**
 * Zasilenie PROD spreadsheet danymi testowymi — identyczne z seedDummyData(),
 * ale zawsze celuje w PROD_SPREADSHEET_ID, niezależnie od IS_DEV.
 * Uruchom JEDEN RAZ z edytora GAS: Run → seedProdData.
 */
function seedProdData() {
  try {
    var ss = SpreadsheetApp.openById(CONFIG.PROD_SPREADSHEET_ID);
    var tourSheet  = ss.getSheetByName(CONFIG.SHEET_TOURNAMENTS);
    var matchSheet = ss.getSheetByName(CONFIG.SHEET_MATCHES);
    var eventSheet = ss.getSheetByName(CONFIG.SHEET_EVENTS);

    if (!tourSheet || !matchSheet || !eventSheet) {
      Logger.log('Brak zakładek w PROD. Uruchom najpierw setupSheets() z IS_DEV=false.');
      return;
    }

    var now = new Date().toISOString();

    // ── Turnieje ────────────────────────────────────────────────────────────────
    var tours = [
      ['tseed_1', 'Liga PL Wiosna 2026',  now],
      ['tseed_2', 'Puchar Polski 2026',   now],
      ['tseed_3', 'Sparingi Wiosna 2026', now],
    ];
    tours.forEach(function(t) { tourSheet.appendRow(t); });

    // ── Mecze ───────────────────────────────────────────────────────────────────
    // MATCH_COLS: id, tournament, match_date, team_A, team_B, created_at, status, video_url
    var matches = [
      ['mseed_01','Liga PL Wiosna 2026',  '2026-04-05','Hawks',  'Vikings', now,'finished',''],
      ['mseed_02','Liga PL Wiosna 2026',  '2026-04-05','Hussars','Eagles',  now,'finished',''],
      ['mseed_03','Liga PL Wiosna 2026',  '2026-04-12','Wolves', 'Bears',   now,'finished',''],
      ['mseed_04','Liga PL Wiosna 2026',  '2026-04-12','Hawks',  'Hussars', now,'finished',''],
      ['mseed_05','Liga PL Wiosna 2026',  '2026-04-19','Vikings','Eagles',  now,'finished',''],
      ['mseed_06','Liga PL Wiosna 2026',  '2026-04-19','Bears',  'Hawks',   now,'finished',''],
      ['mseed_07','Liga PL Wiosna 2026',  '2026-04-26','Hussars','Wolves',  now,'finished',''],
      ['mseed_08','Liga PL Wiosna 2026',  '2026-05-03','Eagles', 'Vikings', now,'finished',''],
      ['mseed_09','Liga PL Wiosna 2026',  '2026-05-10','Hawks',  'Bears',   now,'finished',''],
      ['mseed_10','Puchar Polski 2026',   '2026-04-26','Hawks',  'Eagles',  now,'finished',''],
      ['mseed_11','Puchar Polski 2026',   '2026-05-10','Vikings','Hussars', now,'finished',''],
      ['mseed_12','Puchar Polski 2026',   '2026-05-17','Bears',  'Wolves',  now,'finished',''],
      ['mseed_13','Sparingi Wiosna 2026', '2026-04-15','Hawks',  'Bears',   now,'finished',''],
      ['mseed_14','Sparingi Wiosna 2026', '2026-04-22','Vikings','Hussars', now,'finished',''],
    ];
    matches.forEach(function(m) { matchSheet.appendRow(m); });

    // ── Eventy ───────────────────────────────────────────────────────────────────
    function rnd(min, max) {
      return Math.round((min + Math.random() * (max - min)) * 1000) / 1000;
    }
    var zoneCoords = {
      'attack-center':   function() { return [rnd(0.65,0.95), rnd(0.35,0.65)]; },
      'attack-left':     function() { return [rnd(0.50,0.85), rnd(0.05,0.34)]; },
      'attack-right':    function() { return [rnd(0.50,0.85), rnd(0.66,0.95)]; },
      'midfield-center': function() { return [rnd(0.25,0.49), rnd(0.35,0.65)]; },
      'midfield-left':   function() { return [rnd(0.20,0.45), rnd(0.05,0.34)]; },
      'midfield-right':  function() { return [rnd(0.20,0.45), rnd(0.66,0.95)]; },
      'own-half':        function() { return [rnd(-0.80,-0.10), rnd(0.10,0.90)]; },
    };
    function randomZone() {
      var r = Math.random();
      if (r < 0.33) return 'attack-center';
      if (r < 0.48) return 'attack-left';
      if (r < 0.63) return 'attack-right';
      if (r < 0.73) return 'midfield-center';
      if (r < 0.81) return 'midfield-left';
      if (r < 0.89) return 'midfield-right';
      return 'own-half';
    }
    function randomResult(zone) {
      var r = Math.random();
      if (zone === 'attack-center')       { return r < 0.22 ? 'gol' : r < 0.55 ? 'celny' : 'niecelny'; }
      if (zone.indexOf('attack') === 0)   { return r < 0.13 ? 'gol' : r < 0.43 ? 'celny' : 'niecelny'; }
      if (zone.indexOf('midfield') === 0) { return r < 0.05 ? 'gol' : r < 0.28 ? 'celny' : 'niecelny'; }
      return r < 0.02 ? 'gol' : r < 0.20 ? 'celny' : 'niecelny';
    }

    var eventRows = [];
    var eid = 1000;
    var periods = ['1','2','3','4'];

    matches.forEach(function(m) {
      var matchId = m[0], tournament = m[1], date = m[2], teamA = m[3], teamB = m[4];
      periods.forEach(function(period) {
        var shotsA = 3 + Math.floor(Math.random() * 5);
        var shotsB = 3 + Math.floor(Math.random() * 5);
        [[teamA, shotsA],[teamB, shotsB]].forEach(function(pair) {
          var team = pair[0], count = pair[1];
          for (var i = 0; i < count; i++) {
            eid++;
            var zone   = randomZone();
            var coords = zoneCoords[zone]();
            var result = randomResult(zone);
            var manUp   = Math.random() < 0.08;
            var manDown = !manUp && Math.random() < 0.08;
            // EVENT_COLS: id, client_event_id, match_id, tournament, team_A, team_B,
            //             match_date, period, team_event, shot_x, shot_y, zone_name,
            //             result, man_up, man_down, created_at
            eventRows.push([
              eid, 'seed_'+eid, matchId,
              tournament, teamA, teamB, date,
              period, team,
              coords[0], coords[1], zone,
              result, manUp, manDown,
              now
            ]);
          }
        });
      });
    });

    if (eventRows.length > 0) {
      eventSheet.getRange(
        eventSheet.getLastRow() + 1, 1, eventRows.length, EVENT_COLS.length
      ).setValues(eventRows);
    }

    var summary = 'seedProdData OK — turnieje: ' + tours.length +
                  ', mecze: ' + matches.length +
                  ', eventy: ' + eventRows.length;
    Logger.log(summary);
  } catch (e) {
    Logger.log('seedProdData error: ' + e.message);
  }
}

/**
 * Dodaje ręcznie brakującego gola — jednorazowe użycie.
 */
function addMissingGoal() {
  var sheet = getSheet(CONFIG.SHEET_EVENTS);
  var matchSheet = getSheet(CONFIG.SHEET_MATCHES);

  // Pobierz dane meczu z scheduled_matches
  var matchData = matchSheet.getDataRange().getValues();
  var matchRow = matchData.find(function(r) { return String(r[0]).indexOf('m_') === 0; });
  if (!matchRow) { Logger.log('Brak meczu w scheduled_matches'); return; }

  var matchIdIdx  = MATCH_COLS.indexOf('id');
  var teamAIdx    = MATCH_COLS.indexOf('team_A');
  var teamBIdx    = MATCH_COLS.indexOf('team_B');
  var dateIdx     = MATCH_COLS.indexOf('match_date');

  var matchId  = matchRow[matchIdIdx];
  var teamA    = matchRow[teamAIdx];
  var teamB    = matchRow[teamBIdx];
  var matchDate = matchRow[dateIdx];

  var newId     = Math.max(1, sheet.getLastRow());
  var clientId  = 'manual_' + Date.now();
  var createdAt = new Date().toISOString();

  var row = EVENT_COLS.map(function(col) {
    if (col === 'id')            return newId;
    if (col === 'client_event_id') return clientId;
    if (col === 'match_id')      return matchId;
    if (col === 'tournament')    return '';
    if (col === 'team_A')        return teamA;
    if (col === 'team_B')        return teamB;
    if (col === 'match_date')    return matchDate;
    if (col === 'period')        return 4;
    if (col === 'team_event')    return teamB; // Nowa Zelandia strzela
    if (col === 'shot_x')        return 0;
    if (col === 'shot_y')        return 0.5;
    if (col === 'zone_name')     return 'attack-center';
    if (col === 'result')        return 'gol';
    if (col === 'man_up')        return false;
    if (col === 'man_down')      return false;
    if (col === 'assisted')      return false;
    if (col === 'fast_break')    return false;
    if (col === 'free_position') return false;
    if (col === 'penalty_shot')  return false;
    if (col === 'event_type')    return 'shot';
    if (col === 'created_at')    return createdAt;
    return '';
  });

  sheet.appendRow(row);
  Logger.log('Dodano gola dla ' + teamB + ' w Q4, match_id=' + matchId);
}

/**
 * Policz gole per drużyna i wylistuj wszystkie gol-eventy.
 */
function checkGoals() {
  var sheet = getSheet(CONFIG.SHEET_EVENTS);
  var last = sheet.getLastRow();
  if (last < 2) { Logger.log('Brak eventów'); return; }
  var data = sheet.getRange(2, 1, last - 1, EVENT_COLS.length).getValues();
  var resultIdx   = EVENT_COLS.indexOf('result');
  var teamEvIdx   = EVENT_COLS.indexOf('team_event');
  var periodIdx   = EVENT_COLS.indexOf('period');
  var idIdx       = EVENT_COLS.indexOf('id');

  var hk = 0, nz = 0;
  var details = [];
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][resultIdx]) === 'gol') {
      var team = String(data[i][teamEvIdx]);
      var period = data[i][periodIdx];
      var id = data[i][idIdx];
      details.push('row ' + (i+2) + ' id=' + id + ' Q' + period + ' ' + team);
      if (team.toLowerCase().indexOf('hong') >= 0) hk++;
      else nz++;
    }
  }
  Logger.log('HK: ' + hk + ' goli, NZ: ' + nz + ' goli');
  details.forEach(function(d) { Logger.log(d); });
}

/**
 * JEDNORAZOWA FUNKCJA NAPRAWCZA — uruchom raz z edytora GAS.
 * Scala wszystkie eventy adhoc_* w jeden mecz i tworzy wpis w scheduled_matches.
 */
function fixUnifyMatchIds() {
  try {
    var evSheet = getSheet(CONFIG.SHEET_EVENTS);
    var matchSheet = getSheet(CONFIG.SHEET_MATCHES);

    var lastRow = evSheet.getLastRow();
    if (lastRow < 2) { Logger.log('Brak eventów'); return; }

    var data = evSheet.getRange(2, 1, lastRow - 1, EVENT_COLS.length).getValues();

    // Zbierz unikalne adhoc match_ids i dane meczu z pierwszego eventu
    var matchIdCol = EVENT_COLS.indexOf('match_id');
    var teamACol   = EVENT_COLS.indexOf('team_A');
    var teamBCol   = EVENT_COLS.indexOf('team_B');
    var dateCol    = EVENT_COLS.indexOf('match_date');
    var tournCol   = EVENT_COLS.indexOf('tournament');

    var firstRow = data[0];
    var teamA    = firstRow[teamACol];
    var teamB    = firstRow[teamBCol];
    var date     = firstRow[dateCol];
    var tourn    = firstRow[tournCol] || '';

    // Stwórz jeden spójny mecz w scheduled_matches
    var matchId  = generateId('m');
    var createdAt = new Date().toISOString();
    // MATCH_COLS: id, tournament, match_date, team_A, team_B, created_at, status, video_url
    var matchRow = MATCH_COLS.map(function(col) {
      if (col === 'id')         return matchId;
      if (col === 'tournament') return tourn;
      if (col === 'match_date') return date;
      if (col === 'team_A')     return teamA;
      if (col === 'team_B')     return teamB;
      if (col === 'created_at') return createdAt;
      if (col === 'status')     return 'live';
      return '';
    });
    matchSheet.appendRow(matchRow);

    // Zaktualizuj match_id we wszystkich eventach adhoc na nowe ID
    var updated = 0;
    for (var i = 0; i < data.length; i++) {
      var mid = String(data[i][matchIdCol]);
      if (mid.indexOf('adhoc_') === 0) {
        evSheet.getRange(i + 2, matchIdCol + 1).setValue(matchId);
        updated++;
      }
    }

    var msg = 'fixUnifyMatchIds OK — nowe match_id: ' + matchId +
              ', zaktualizowano eventów: ' + updated +
              ', drużyny: ' + teamA + ' vs ' + teamB;
    Logger.log(msg);
    return msg;
  } catch (e) {
    Logger.log('fixUnifyMatchIds error: ' + e.message);
    return 'ERROR: ' + e.message;
  }
}
