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

function exportOfflineBufferToFile() {
  var buffer = loadOfflineBuffer();
  if (!buffer.length) return;
  var json = JSON.stringify(buffer, null, 2);
  var blob = new Blob([json], { type: 'application/json' });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href     = url;
  a.download = 'lacrosse-backup-' + todayISO() + '.json';
  a.click();
  URL.revokeObjectURL(url);
}

function importOfflineBufferFromFile(file, onDone) {
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var events = JSON.parse(e.target.result);
      if (!Array.isArray(events)) return;
      var count = 0;
      events.forEach(function(ev) {
        if (ev && ev.client_event_id) { addToOfflineBuffer(ev); count++; }
      });
      if (onDone) onDone(count);
    } catch (_) {}
  };
  reader.readAsText(file);
}

// ── SAMPLE_DATA — fallback dla trybu dev ──────────────────────────────────────

// Mulberry32 — deterministyczny PRNG z seedem
function _prng(seed) {
  let s = seed >>> 0;
  return function() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSampleEvents() {
  const ZONES = [
    { name: 'attack-center',   sxMin: 0.65, sxMax: 0.99, syMin: 0.28, syMax: 0.72, w: 0.32, pGol: 0.38, pCelny: 0.30 },
    { name: 'attack-left',     sxMin: 0.65, sxMax: 0.99, syMin: 0.01, syMax: 0.33, w: 0.17, pGol: 0.28, pCelny: 0.32 },
    { name: 'attack-right',    sxMin: 0.65, sxMax: 0.99, syMin: 0.67, syMax: 0.99, w: 0.17, pGol: 0.28, pCelny: 0.32 },
    { name: 'midfield-center', sxMin: 0.25, sxMax: 0.60, syMin: 0.28, syMax: 0.72, w: 0.13, pGol: 0.14, pCelny: 0.28 },
    { name: 'midfield-left',   sxMin: 0.25, sxMax: 0.60, syMin: 0.01, syMax: 0.33, w: 0.08, pGol: 0.09, pCelny: 0.22 },
    { name: 'midfield-right',  sxMin: 0.25, sxMax: 0.60, syMin: 0.67, syMax: 0.99, w: 0.08, pGol: 0.09, pCelny: 0.22 },
    { name: 'own-half',        sxMin:-0.80, sxMax:-0.05, syMin: 0.05, syMax: 0.95, w: 0.05, pGol: 0.02, pCelny: 0.10 },
  ];
  // Weights: 0.32+0.17+0.17+0.13+0.08+0.08+0.05 = 1.00

  const MATCHES = [
    // Liga PL Wiosna 2026
    { id: 'm3',  tour: 'Liga PL Wiosna 2026',  tA: 'Hawks',   tB: 'Vikings', date: '2026-02-08' },
    { id: 'm4',  tour: 'Liga PL Wiosna 2026',  tA: 'Hussars', tB: 'Eagles',  date: '2026-02-08' },
    { id: 'm5',  tour: 'Liga PL Wiosna 2026',  tA: 'Hawks',   tB: 'Hussars', date: '2026-02-15' },
    { id: 'm6',  tour: 'Liga PL Wiosna 2026',  tA: 'Vikings', tB: 'Eagles',  date: '2026-02-15' },
    { id: 'm7',  tour: 'Liga PL Wiosna 2026',  tA: 'Hawks',   tB: 'Eagles',  date: '2026-02-22' },
    { id: 'm8',  tour: 'Liga PL Wiosna 2026',  tA: 'Vikings', tB: 'Hussars', date: '2026-02-22' },
    // Puchar Polski 2026
    { id: 'm9',  tour: 'Puchar Polski 2026',   tA: 'Hawks',   tB: 'Hussars', date: '2026-03-08' },
    { id: 'm10', tour: 'Puchar Polski 2026',   tA: 'Eagles',  tB: 'Vikings', date: '2026-03-08' },
    { id: 'm11', tour: 'Puchar Polski 2026',   tA: 'Hawks',   tB: 'Vikings', date: '2026-03-15' },
    { id: 'm12', tour: 'Puchar Polski 2026',   tA: 'Hussars', tB: 'Eagles',  date: '2026-03-15' },
    // Sparingi
    { id: 'm13', tour: 'Sparingi',             tA: 'Wolves',  tB: 'Bears',   date: '2026-03-22' },
    { id: 'm14', tour: 'Sparingi',             tA: 'Hawks',   tB: 'Wolves',  date: '2026-03-22' },
    { id: 'm15', tour: 'Sparingi',             tA: 'Vikings', tB: 'Bears',   date: '2026-03-29' },
  ];

  // Per-match: numery bramkarzy na start, zmiany bramkarzy w trakcie, flaga OT
  const MATCH_META = [
    { gA: '33', gB: '7'  },                                                     // m3:  Hawks(33) vs Vikings(7)
    { gA: '11', gB: '44' },                                                     // m4:  Hussars(11) vs Eagles(44)
    { gA: '33', gB: '11', changes: [{ slot:'A', period:'3', num:'22' }] },      // m5:  Hawks #33→#22 w Q3
    { gA: '7',  gB: '44' },                                                     // m6:  Vikings(7) vs Eagles(44)
    { gA: '33', gB: '44', ot: true },                                           // m7:  Hawks vs Eagles →OT1
    { gA: '7',  gB: '11' },                                                     // m8:  Vikings(7) vs Hussars(11)
    { gA: '33', gB: '11', ot: true },                                           // m9:  Hawks vs Hussars →OT1
    { gA: '44', gB: '7'  },                                                     // m10: Eagles(44) vs Vikings(7)
    { gA: '22', gB: '7',  changes: [{ slot:'B', period:'2', num:'21' }] },      // m11: Vikings #7→#21 w Q2
    { gA: '11', gB: '44' },                                                     // m12: Hussars(11) vs Eagles(44)
    { gA: '5',  gB: '15' },                                                     // m13: Wolves(5) vs Bears(15)
    { gA: '33', gB: '5'  },                                                     // m14: Hawks(33) vs Wolves(5)
    { gA: '7',  gB: '15' },                                                     // m15: Vikings(7) vs Bears(15)
  ];

  const events = [];
  let eIdx = 0;

  MATCHES.forEach((m, mi) => {
    const rand = _prng(mi * 9973 + 31337);
    const meta = MATCH_META[mi];

    function pushGoalie(team, num, period) {
      events.push({
        id: `gs_${m.id}_${team}_${period}`, client_event_id: `gs_${m.id}_${team}_${period}_c`,
        event_type: 'goalie_set', match_id: m.id, tournament: m.tour,
        team_A: m.tA, team_B: m.tB, team_event: team, goalie_number: num, period,
        match_date: m.date, created_at: Date.now(),
      });
    }

    pushGoalie(m.tA, meta.gA, '1');
    pushGoalie(m.tB, meta.gB, '1');
    if (meta.changes) {
      meta.changes.forEach(ch => pushGoalie(ch.slot === 'A' ? m.tA : m.tB, ch.num, ch.period));
    }

    const periods = ['1', '2', '3', '4'];
    if (meta.ot) periods.push('OT1');

    periods.forEach(period => {
      const isOT = period.startsWith('OT');
      const total = isOT ? (2 + Math.floor(rand() * 3)) : (8 + Math.floor(rand() * 3));

      for (let i = 0; i < total; i++) {
        const team = rand() < 0.50 ? m.tA : m.tB;

        let zr = rand(), cumW = 0, zone = ZONES[0];
        for (const z of ZONES) { cumW += z.w; if (zr <= cumW) { zone = z; break; } }

        const sx = zone.sxMin + rand() * (zone.sxMax - zone.sxMin);
        const sy = zone.syMin + rand() * (zone.syMax - zone.syMin);
        const rr = rand();
        const result = rr < zone.pGol ? 'gol' : rr < zone.pGol + zone.pCelny ? 'celny' : 'niecelny';
        const mr = rand();
        const man_up   = mr < 0.10;
        const man_down = !man_up && mr > 0.88;

        events.push({
          id: `e_${++eIdx}`, client_event_id: `e_${eIdx}_c`,
          match_id: m.id, tournament: m.tour, team_A: m.tA, team_B: m.tB,
          period, team_event: team,
          shot_x: Math.round(sx * 1000) / 1000,
          shot_y: Math.round(sy * 1000) / 1000,
          zone_name: zone.name, result, man_up, man_down,
          match_date: m.date, created_at: Date.now(),
        });
      }
    });
  });

  // Live mecz m1 — bramkarze + strzały (Q1 + Q2 w trakcie)
  const liveGoalies = [
    { id: 'sg_m1_H', event_type: 'goalie_set', team_event: 'Hawks',   goalie_number: '33', period: '1' },
    { id: 'sg_m1_V', event_type: 'goalie_set', team_event: 'Vikings', goalie_number: '7',  period: '1' },
  ].map(e => ({
    ...e, client_event_id: e.id + '_c',
    match_id: 'm1', tournament: 'Liga PL Wiosna 2026',
    team_A: 'Hawks', team_B: 'Vikings',
    match_date: todayISO(), created_at: Date.now(),
  }));

  const liveShots = [
    { id:'se_01', period:'1', team_event:'Hawks',   shot_x: 0.82, shot_y:0.52, zone_name:'attack-center',   result:'gol',      man_up:false, man_down:false },
    { id:'se_02', period:'1', team_event:'Vikings', shot_x: 0.75, shot_y:0.35, zone_name:'attack-left',     result:'celny',    man_up:false, man_down:false },
    { id:'se_03', period:'1', team_event:'Hawks',   shot_x: 0.45, shot_y:0.62, zone_name:'midfield-right',  result:'niecelny', man_up:false, man_down:false },
    { id:'se_04', period:'1', team_event:'Vikings', shot_x: 0.88, shot_y:0.50, zone_name:'attack-center',   result:'gol',      man_up:false, man_down:false },
    { id:'se_05', period:'1', team_event:'Hawks',   shot_x: 0.91, shot_y:0.44, zone_name:'attack-center',   result:'celny',    man_up:true,  man_down:false },
    { id:'se_06', period:'1', team_event:'Vikings', shot_x: 0.38, shot_y:0.58, zone_name:'midfield-center', result:'niecelny', man_up:false, man_down:false },
    { id:'se_07', period:'2', team_event:'Vikings', shot_x: 0.71, shot_y:0.28, zone_name:'attack-left',     result:'celny',    man_up:true,  man_down:false },
    { id:'se_08', period:'2', team_event:'Hawks',   shot_x: 0.90, shot_y:0.48, zone_name:'attack-center',   result:'gol',      man_up:true,  man_down:false },
    { id:'se_09', period:'2', team_event:'Hawks',   shot_x: 0.93, shot_y:0.45, zone_name:'attack-center',   result:'gol',      man_up:true,  man_down:false },
    { id:'se_10', period:'2', team_event:'Vikings', shot_x: 0.40, shot_y:0.55, zone_name:'midfield-center', result:'niecelny', man_up:false, man_down:true  },
    { id:'se_11', period:'2', team_event:'Hawks',   shot_x: 0.78, shot_y:0.68, zone_name:'attack-right',    result:'celny',    man_up:false, man_down:true  },
    { id:'se_12', period:'2', team_event:'Vikings', shot_x: 0.85, shot_y:0.42, zone_name:'attack-center',   result:'gol',      man_up:false, man_down:false },
    { id:'se_13', period:'2', team_event:'Hawks',   shot_x: 0.77, shot_y:0.33, zone_name:'attack-left',     result:'gol',      man_up:false, man_down:false },
    { id:'se_14', period:'2', team_event:'Hawks',   shot_x:-0.30, shot_y:0.45, zone_name:'own-half',        result:'niecelny', man_up:false, man_down:false },
    { id:'se_15', period:'2', team_event:'Vikings', shot_x: 0.55, shot_y:0.48, zone_name:'midfield-center', result:'celny',    man_up:false, man_down:false },
  ].map(e => ({
    ...e, client_event_id: e.id + '_c',
    match_id: 'm1', tournament: 'Liga PL Wiosna 2026',
    team_A: 'Hawks', team_B: 'Vikings',
    match_date: todayISO(), created_at: Date.now(),
  }));

  return [...liveGoalies, ...liveShots, ...events];
}

const SAMPLE_DATA = {
  tournaments: [
    { id: 't1', name: 'Liga PL Wiosna 2026' },
    { id: 't2', name: 'Puchar Polski 2026'  },
    { id: 't3', name: 'Sparingi'            },
  ],
  scheduledMatches: [
    { id: 'm1',  tournament: 'Liga PL Wiosna 2026', team_A: 'Hawks',   team_B: 'Vikings', match_date: todayISO(),    status: 'live'      },
    { id: 'm2',  tournament: 'Liga PL Wiosna 2026', team_A: 'Hussars', team_B: 'Eagles',  match_date: todayISO(),    status: 'scheduled' },
    { id: 'm3',  tournament: 'Liga PL Wiosna 2026', team_A: 'Hawks',   team_B: 'Vikings', match_date: '2026-02-08',  status: 'finished'  },
    { id: 'm4',  tournament: 'Liga PL Wiosna 2026', team_A: 'Hussars', team_B: 'Eagles',  match_date: '2026-02-08',  status: 'finished'  },
    { id: 'm5',  tournament: 'Liga PL Wiosna 2026', team_A: 'Hawks',   team_B: 'Hussars', match_date: '2026-02-15',  status: 'finished'  },
    { id: 'm6',  tournament: 'Liga PL Wiosna 2026', team_A: 'Vikings', team_B: 'Eagles',  match_date: '2026-02-15',  status: 'finished'  },
    { id: 'm7',  tournament: 'Liga PL Wiosna 2026', team_A: 'Hawks',   team_B: 'Eagles',  match_date: '2026-02-22',  status: 'finished'  },
    { id: 'm8',  tournament: 'Liga PL Wiosna 2026', team_A: 'Vikings', team_B: 'Hussars', match_date: '2026-02-22',  status: 'finished'  },
    { id: 'm9',  tournament: 'Puchar Polski 2026',  team_A: 'Hawks',   team_B: 'Hussars', match_date: '2026-03-08',  status: 'finished'  },
    { id: 'm10', tournament: 'Puchar Polski 2026',  team_A: 'Eagles',  team_B: 'Vikings', match_date: '2026-03-08',  status: 'finished'  },
    { id: 'm11', tournament: 'Puchar Polski 2026',  team_A: 'Hawks',   team_B: 'Vikings', match_date: '2026-03-15',  status: 'finished'  },
    { id: 'm12', tournament: 'Puchar Polski 2026',  team_A: 'Hussars', team_B: 'Eagles',  match_date: '2026-03-15',  status: 'finished'  },
    { id: 'm13', tournament: 'Sparingi',            team_A: 'Wolves',  team_B: 'Bears',   match_date: '2026-03-22',  status: 'finished'  },
    { id: 'm14', tournament: 'Sparingi',            team_A: 'Hawks',   team_B: 'Wolves',  match_date: '2026-03-22',  status: 'finished'  },
    { id: 'm15', tournament: 'Sparingi',            team_A: 'Vikings', team_B: 'Bears',   match_date: '2026-03-29',  status: 'finished'  },
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
  if (ev.event_type === 'goalie_set') {
    const gn = String(ev.goalie_number !== undefined && ev.goalie_number !== null ? ev.goalie_number : '');
    if (!/^\d{1,2}$/.test(gn)) return 'Nieprawidłowy numer bramkarza: ' + gn;
    if (!PERIOD_REGEX.test(String(ev.period))) return 'Nieprawidłowy okres: ' + ev.period;
    return null;
  }
  if (ev.event_type === 'groundball' || ev.event_type === 'draw') {
    if (!PERIOD_REGEX.test(String(ev.period))) return 'Nieprawidłowy okres: ' + ev.period;
    return null;
  }
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
