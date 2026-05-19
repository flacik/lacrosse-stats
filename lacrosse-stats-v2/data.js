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
    { name: 'attack-center',   sxMin: 0.65, sxMax: 0.99, syMin: 0.28, syMax: 0.72, w: 0.34, pGol: 0.38, pCelny: 0.30 },
    { name: 'attack-left',     sxMin: 0.65, sxMax: 0.99, syMin: 0.01, syMax: 0.33, w: 0.18, pGol: 0.28, pCelny: 0.32 },
    { name: 'attack-right',    sxMin: 0.65, sxMax: 0.99, syMin: 0.67, syMax: 0.99, w: 0.18, pGol: 0.28, pCelny: 0.32 },
    { name: 'midfield-center', sxMin: 0.25, sxMax: 0.60, syMin: 0.28, syMax: 0.72, w: 0.14, pGol: 0.14, pCelny: 0.28 },
    { name: 'midfield-left',   sxMin: 0.25, sxMax: 0.60, syMin: 0.01, syMax: 0.33, w: 0.08, pGol: 0.09, pCelny: 0.22 },
    { name: 'midfield-right',  sxMin: 0.25, sxMax: 0.60, syMin: 0.67, syMax: 0.99, w: 0.08, pGol: 0.09, pCelny: 0.22 },
  ];

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

  const events = [];
  let eIdx = 0;

  MATCHES.forEach((m, mi) => {
    const rand = _prng(mi * 9973 + 31337);

    ['1', '2', '3', '4'].forEach(period => {
      // ~8-10 strzałów per kwarta per mecz (łącznie ~32-40 / mecz)
      const total = 8 + Math.floor(rand() * 3);

      for (let i = 0; i < total; i++) {
        const team = rand() < 0.50 ? m.tA : m.tB;

        // wybór strefy wg wag
        let zr = rand(), cumW = 0, zone = ZONES[0];
        for (const z of ZONES) {
          cumW += z.w;
          if (zr <= cumW) { zone = z; break; }
        }

        const sx = zone.sxMin + rand() * (zone.sxMax - zone.sxMin);
        const sy = zone.syMin + rand() * (zone.syMax - zone.syMin);

        const rr = rand();
        const result = rr < zone.pGol ? 'gol'
                     : rr < zone.pGol + zone.pCelny ? 'celny'
                     : 'niecelny';

        const mr = rand();
        const man_up   = mr < 0.10;
        const man_down = !man_up && mr > 0.88;

        events.push({
          id:               `e_${++eIdx}`,
          client_event_id:  `e_${eIdx}_c`,
          match_id:         m.id,
          tournament:       m.tour,
          team_A:           m.tA,
          team_B:           m.tB,
          period,
          team_event:       team,
          shot_x:           Math.round(sx * 1000) / 1000,
          shot_y:           Math.round(sy * 1000) / 1000,
          zone_name:        zone.name,
          result,
          man_up,
          man_down,
          match_date:       m.date,
          created_at:       Date.now(),
        });
      }
    });
  });

  // Dorzuć też live-match m1 events (do home screena)
  const liveEvents = [
    { id:'se_01', match_id:'m1', tournament:'Liga PL Wiosna 2026', team_A:'Hawks', team_B:'Vikings', period:'1', team_event:'Hawks',  shot_x:0.82, shot_y:0.52, zone_name:'attack-center', result:'gol',     man_up:false, man_down:false },
    { id:'se_02', match_id:'m1', tournament:'Liga PL Wiosna 2026', team_A:'Hawks', team_B:'Vikings', period:'1', team_event:'Vikings', shot_x:0.75, shot_y:0.35, zone_name:'attack-left',   result:'celny',   man_up:false, man_down:false },
    { id:'se_08', match_id:'m1', tournament:'Liga PL Wiosna 2026', team_A:'Hawks', team_B:'Vikings', period:'2', team_event:'Hawks',  shot_x:0.93, shot_y:0.45, zone_name:'attack-center', result:'gol',     man_up:true,  man_down:false },
    { id:'se_12', match_id:'m1', tournament:'Liga PL Wiosna 2026', team_A:'Hawks', team_B:'Vikings', period:'2', team_event:'Hawks',  shot_x:0.77, shot_y:0.33, zone_name:'attack-left',   result:'gol',     man_up:false, man_down:false },
  ].map(e => ({ ...e, client_event_id: e.id + '_c', match_date: todayISO(), created_at: Date.now() }));

  return [...liveEvents, ...events];
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
