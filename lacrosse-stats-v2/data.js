'use strict';

// Data layer — DATA shape, SAMPLE_DATA, offline buffer.
// Główny storage to GAS (przez gas-client.js).
// localStorage używany WYŁĄCZNIE jako bufor eventów oczekujących na sync.

const OFFLINE_BUFFER_KEY = 'lacrosse-v2-offline-buffer';

let DATA = {
  tournaments:      [],
  scheduledMatches: [],
  events:           [],
};

// ── Bufor offline ─────────────────────────────────────────────────────────────

function loadOfflineBuffer() {
  try { var raw = localStorage.getItem(OFFLINE_BUFFER_KEY); if (raw) return JSON.parse(raw); } catch (e) {}
  return [];
}
function saveOfflineBuffer(buffer) {
  try { localStorage.setItem(OFFLINE_BUFFER_KEY, JSON.stringify(buffer)); } catch (e) {}
}
function addToOfflineBuffer(ev) {
  var buffer = loadOfflineBuffer();
  if (!buffer.some(function(b) { return b.client_event_id === ev.client_event_id; })) {
    buffer.push(ev); saveOfflineBuffer(buffer);
  }
}
function removeFromOfflineBuffer(clientEventId) {
  saveOfflineBuffer(loadOfflineBuffer().filter(function(b) { return b.client_event_id !== clientEventId; }));
}

// ── SAMPLE_DATA — fallback dla trybu dev ──────────────────────────────────────

function makeSampleEvents() {
  const now = Date.now();
  const t = (m) => now - m * 60000;
  const m1 = [
    { id:'se_01', match_id:'m1', tournament:'Liga PL Wiosna 2026', team_A:'Hawks', team_B:'Vikings', period:'1', team_event:'Hawks',  shot_x:0.82, shot_y:0.52, zone_name:'attack-center', result:'gol',      man_up:false, man_down:false, created_at:t(68) },
    { id:'se_02', match_id:'m1', tournament:'Liga PL Wiosna 2026', team_A:'Hawks', team_B:'Vikings', period:'1', team_event:'Vikings', shot_x:0.75, shot_y:0.35, zone_name:'attack-left',   result:'celny',    man_up:false, man_down:false, created_at:t(65) },
    { id:'se_08', match_id:'m1', tournament:'Liga PL Wiosna 2026', team_A:'Hawks', team_B:'Vikings', period:'2', team_event:'Hawks',  shot_x:0.93, shot_y:0.45, zone_name:'attack-center', result:'gol',      man_up:true,  man_down:false, created_at:t(38) },
    { id:'se_12', match_id:'m1', tournament:'Liga PL Wiosna 2026', team_A:'Hawks', team_B:'Vikings', period:'2', team_event:'Hawks',  shot_x:0.77, shot_y:0.33, zone_name:'attack-left',   result:'gol',      man_up:false, man_down:false, created_at:t(20) },
  ].map(e => ({ ...e, match_date: todayISO(), client_event_id: e.id + 'c' }));
  const m3 = [
    { id:'se_30', match_id:'m3', tournament:'Sparingi', team_A:'Wolves', team_B:'Bears', period:'1', team_event:'Wolves', shot_x:0.80, shot_y:0.48, zone_name:'attack-center', result:'gol', man_up:false, man_down:false, created_at:t(180) },
    { id:'se_38', match_id:'m3', tournament:'Sparingi', team_A:'Wolves', team_B:'Bears', period:'3', team_event:'Wolves', shot_x:0.82, shot_y:0.48, zone_name:'attack-center', result:'gol', man_up:true,  man_down:false, created_at:t(120) },
  ].map(e => ({ ...e, match_date: todayISO(), client_event_id: e.id + 'c' }));
  return [...m1, ...m3];
}

const SAMPLE_DATA = {
  tournaments: [
    { id: 't1', name: 'Liga PL Wiosna 2026' },
    { id: 't2', name: 'Sparingi' },
    { id: 't3', name: 'Puchar Polski 2026' }
  ],
  scheduledMatches: [
    { id: 'm1', tournament: 'Liga PL Wiosna 2026', team_A: 'Hawks',   team_B: 'Vikings', match_date: todayISO(), status: 'live'     },
    { id: 'm2', tournament: 'Liga PL Wiosna 2026', team_A: 'Hussars', team_B: 'Eagles',  match_date: todayISO(), status: 'scheduled'},
    { id: 'm3', tournament: 'Sparingi',            team_A: 'Wolves',  team_B: 'Bears',   match_date: todayISO(), status: 'finished' },
  ],
  get events() { return makeSampleEvents(); }
};

function saveData() {}
function resetData() {}

// ── Walidacja kliencka eventów ────────────────────────────────────────────────

const VALID_RESULTS = ['celny', 'niecelny', 'gol'];
const VALID_ZONES   = ['attack-left', 'attack-center', 'attack-right',
                       'midfield-left', 'midfield-center', 'midfield-right', 'own-half'];
const PERIOD_REGEX  = /^([1-4]|OT\d+)$/;

function validateEventPayload(ev) {
  if (!VALID_RESULTS.includes(ev.result))            return 'Nieprawidłowy wynik: ' + ev.result;
  if (typeof ev.shot_x !== 'number' || ev.shot_x < -1 || ev.shot_x > 1) return 'Nieprawidłowa pozycja shot_x';
  if (typeof ev.shot_y !== 'number' || ev.shot_y < 0  || ev.shot_y > 1) return 'Nieprawidłowa pozycja shot_y';
  if (!VALID_ZONES.includes(ev.zone_name))           return 'Nieprawidłowa strefa: ' + ev.zone_name;
  if (!PERIOD_REGEX.test(String(ev.period)))         return 'Nieprawidłowy okres: ' + ev.period;
  if (ev.man_up && ev.man_down)                      return 'Nie można mieć man-up i man-down jednocześnie';
  if (ev.team_A && ev.team_B && ev.team_event !== ev.team_A && ev.team_event !== ev.team_B)
    return 'team_event musi być jedną z drużyn meczu';
  return null;
}
