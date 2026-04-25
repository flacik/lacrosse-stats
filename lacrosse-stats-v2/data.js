'use strict';

// Data layer — DATA shape, SAMPLE_DATA, localStorage persistence.
// (v1 storage: localStorage; switched to Google Apps Script backend in v2.0.0)

const LS_KEY = 'lacrosse-v2-data';

let DATA = {
  tournaments:      [],
  scheduledMatches: [],
  events:           [],
};

// ── Persistence ───────────────────────────────────────────────────────────────

function saveData() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(DATA)); } catch(e) {}
}

function loadData() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) { DATA = JSON.parse(raw); return true; }
  } catch(e) {}
  return false;
}

function resetData() {
  DATA = {
    tournaments:      JSON.parse(JSON.stringify(SAMPLE_DATA.tournaments)),
    scheduledMatches: JSON.parse(JSON.stringify(SAMPLE_DATA.scheduledMatches)),
    events:           SAMPLE_DATA.events,
  };
  saveData();
}

// ── SAMPLE_DATA — dev/demo fallback ──────────────────────────────────────────

function makeSampleEvents() {
  const now = Date.now();
  const t = (minsAgo) => now - minsAgo * 60000;

  const m1 = [
    { id:'se_01', match_id:'m1', tournament:'Liga PL Wiosna 2026', team_A:'Hawks', team_B:'Vikings', period:'1', team_event:'Hawks',   shot_x:0.82, shot_y:0.52, zone_name:'attack-center',  result:'gol',      man_up:false, man_down:false, created_at:t(68) },
    { id:'se_02', match_id:'m1', tournament:'Liga PL Wiosna 2026', team_A:'Hawks', team_B:'Vikings', period:'1', team_event:'Vikings',  shot_x:0.75, shot_y:0.35, zone_name:'attack-left',     result:'celny',    man_up:false, man_down:false, created_at:t(65) },
    { id:'se_03', match_id:'m1', tournament:'Liga PL Wiosna 2026', team_A:'Hawks', team_B:'Vikings', period:'1', team_event:'Hawks',   shot_x:0.91, shot_y:0.48, zone_name:'attack-center',  result:'niecelny', man_up:true,  man_down:false, created_at:t(62) },
    { id:'se_04', match_id:'m1', tournament:'Liga PL Wiosna 2026', team_A:'Hawks', team_B:'Vikings', period:'1', team_event:'Vikings',  shot_x:0.88, shot_y:0.65, zone_name:'attack-right',    result:'gol',      man_up:false, man_down:true,  created_at:t(58) },
    { id:'se_08', match_id:'m1', tournament:'Liga PL Wiosna 2026', team_A:'Hawks', team_B:'Vikings', period:'2', team_event:'Hawks',   shot_x:0.93, shot_y:0.45, zone_name:'attack-center',  result:'gol',      man_up:true,  man_down:false, created_at:t(38) },
    { id:'se_12', match_id:'m1', tournament:'Liga PL Wiosna 2026', team_A:'Hawks', team_B:'Vikings', period:'2', team_event:'Hawks',   shot_x:0.77, shot_y:0.33, zone_name:'attack-left',     result:'gol',      man_up:false, man_down:false, created_at:t(20) },
  ].map(e => ({ ...e, match_date: todayISO() }));

  const m3 = [
    { id:'se_30', match_id:'m3', tournament:'Sparingi', team_A:'Wolves', team_B:'Bears', period:'1', team_event:'Wolves', shot_x:0.80, shot_y:0.48, zone_name:'attack-center', result:'gol',      man_up:false, man_down:false, created_at:t(180) },
    { id:'se_33', match_id:'m3', tournament:'Sparingi', team_A:'Wolves', team_B:'Bears', period:'1', team_event:'Bears',  shot_x:0.92, shot_y:0.58, zone_name:'attack-center', result:'gol',      man_up:true,  man_down:false, created_at:t(170) },
    { id:'se_34', match_id:'m3', tournament:'Sparingi', team_A:'Wolves', team_B:'Bears', period:'2', team_event:'Wolves', shot_x:0.85, shot_y:0.45, zone_name:'attack-center', result:'gol',      man_up:false, man_down:false, created_at:t(155) },
    { id:'se_38', match_id:'m3', tournament:'Sparingi', team_A:'Wolves', team_B:'Bears', period:'3', team_event:'Wolves', shot_x:0.82, shot_y:0.48, zone_name:'attack-center', result:'gol',      man_up:true,  man_down:false, created_at:t(120) },
    { id:'se_42', match_id:'m3', tournament:'Sparingi', team_A:'Wolves', team_B:'Bears', period:'4', team_event:'Wolves', shot_x:0.96, shot_y:0.50, zone_name:'attack-center', result:'gol',      man_up:false, man_down:false, created_at:t(85)  },
    { id:'se_43', match_id:'m3', tournament:'Sparingi', team_A:'Wolves', team_B:'Bears', period:'4', team_event:'Bears',  shot_x:0.71, shot_y:0.48, zone_name:'attack-center', result:'gol',      man_up:true,  man_down:false, created_at:t(80)  },
  ].map(e => ({ ...e, match_date: todayISO() }));

  return [...m1, ...m3];
}

const SAMPLE_DATA = {
  tournaments: [
    { id: 't1', name: 'Liga PL Wiosna 2026' },
    { id: 't2', name: 'Sparingi' },
  ],
  scheduledMatches: [
    { id: 'm1', tournament: 'Liga PL Wiosna 2026', team_A: 'Hawks',  team_B: 'Vikings', match_date: todayISO(), status: 'live'     },
    { id: 'm2', tournament: 'Liga PL Wiosna 2026', team_A: 'Wolves', team_B: 'Eagles',  match_date: todayISO(), status: 'scheduled'},
    { id: 'm3', tournament: 'Sparingi',            team_A: 'Wolves', team_B: 'Bears',   match_date: todayISO(), status: 'finished' },
  ],
  get events() { return makeSampleEvents(); }
};
