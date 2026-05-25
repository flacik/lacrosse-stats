#!/usr/bin/env node
'use strict';

// Self-contained test for F-11 goalkeeper logic.
// Runs in Node.js, no browser or GAS required.
// Usage: node test-goalie.js

const vm = require('vm');
const fs = require('fs');
const path = require('path');

// ── Minimal stubs ──────────────────────────────────────────────────────────────

const DATA = { events: [], scheduledMatches: [], tournaments: [] };
const APP  = { matchId: null };

const ctx = vm.createContext({
  DATA, APP,
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  console,
});

function load(file) {
  const src = fs.readFileSync(path.join(__dirname, file), 'utf8');
  vm.runInContext(src, ctx);
}

load('helpers.js');
load('data.js');
load('stats.js');

// Pull tested functions out of the context (after data.js overwrites DATA with let)
const {
  computeGoalieStats,
  getCurrentGoalieNumber,
  eventsForMatch,
  validateEventPayload,
  getPeriodOrder,
} = ctx;

// data.js uses `let DATA`, so ctx.DATA is NOT the vm-internal one.
// Mutate it by running code inside the vm.
function setEvents(events) {
  ctx._testEvents = events;
  vm.runInContext('DATA.events = _testEvents;', ctx);
}

// ── Test harness ───────────────────────────────────────────────────────────────

let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗  ${name}`);
    console.log(`     ${e.message}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function eq(a, b) {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) throw new Error(`expected ${jb}\n       got     ${ja}`);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const MATCH = { id: 'm1', team_A: 'Hawks', team_B: 'Vikings', tournament: 'T1', match_date: '2026-05-21' };

function shot(team, period, result, opts = {}) {
  return Object.assign({
    id: Math.random().toString(36).slice(2),
    client_event_id: Math.random().toString(36).slice(2),
    match_id: 'm1',
    tournament: 'T1', team_A: 'Hawks', team_B: 'Vikings', match_date: '2026-05-21',
    period,
    team_event: team,
    shot_x: 0.5, shot_y: 0.5,
    zone_name: 'attack-center',
    result,
    man_up: false, man_down: false, assisted: false,
    created_at: Date.now(),
  }, opts);
}

function goalieSet(team, period, number, opts = {}) {
  return Object.assign({
    id: Math.random().toString(36).slice(2),
    client_event_id: Math.random().toString(36).slice(2),
    match_id: 'm1',
    tournament: 'T1', team_A: 'Hawks', team_B: 'Vikings', match_date: '2026-05-21',
    period,
    team_event: team,
    event_type: 'goalie_set',
    goalie_number: String(number),
    result: null, shot_x: null, shot_y: null, zone_name: null,
    man_up: false, man_down: false,
    created_at: Date.now(),
  }, opts);
}

// ── Tests: validateEventPayload ────────────────────────────────────────────────

console.log('\nvalidateEventPayload');

test('goalie_set z numerem 7 → brak błędu', () => {
  const ev = goalieSet('Hawks', '1', 7);
  eq(validateEventPayload(ev), null);
});

test('goalie_set z numerem 0 → brak błędu', () => {
  eq(validateEventPayload(goalieSet('Hawks', '1', 0)), null);
});

test('goalie_set z numerem 99 → brak błędu', () => {
  eq(validateEventPayload(goalieSet('Hawks', '1', 99)), null);
});

test('goalie_set z numerem 100 → błąd', () => {
  const err = validateEventPayload(goalieSet('Hawks', '1', 100));
  assert(err && err.includes('bramkarza'), `oczekiwano błędu bramkarza, dostałem: ${err}`);
});

test('goalie_set z pustym numerem → błąd', () => {
  const ev = Object.assign({}, goalieSet('Hawks', '1', 7), { goalie_number: '' });
  const err = validateEventPayload(ev);
  assert(err !== null, 'oczekiwano błędu, dostałem null');
});

test('goalie_set z numerem null → błąd', () => {
  const ev = Object.assign({}, goalieSet('Hawks', '1', 7), { goalie_number: null });
  const err = validateEventPayload(ev);
  assert(err !== null, 'oczekiwano błędu, dostałem null');
});

test('goalie_set z nieprawidłowym periodem → błąd', () => {
  const ev = Object.assign({}, goalieSet('Hawks', 'X5', 7));
  const err = validateEventPayload(ev);
  assert(err !== null, 'oczekiwano błędu okresu');
});

test('zwykły strzał nadal waliduje się poprawnie (brak regresji)', () => {
  eq(validateEventPayload(shot('Hawks', '1', 'gol')), null);
});

test('zwykły strzał z błędnym result → błąd', () => {
  const err = validateEventPayload(shot('Hawks', '1', 'auto'));
  assert(err !== null, 'oczekiwano błędu result');
});

// ── Tests: eventsForMatch ──────────────────────────────────────────────────────

console.log('\neventsForMatch (filtr goalie_set)');

test('goalie_set nie pojawia się w wynikach', () => {
  setEvents([
    shot('Hawks', '1', 'gol'),
    goalieSet('Hawks', '1', 7),
    shot('Vikings', '1', 'celny'),
  ]);
  const result = eventsForMatch('m1');
  assert(!result.some(e => e.event_type === 'goalie_set'), 'goalie_set w wynikach!');
  eq(result.length, 2);
});

test('zwraca tylko eventy tego meczu', () => {
  setEvents([
    shot('Hawks', '1', 'gol'),
    Object.assign(shot('Hawks', '1', 'gol'), { match_id: 'm99' }),
  ]);
  const result = eventsForMatch('m1');
  eq(result.length, 1);
});

test('posortowane malejąco po created_at', () => {
  const s1 = Object.assign(shot('Hawks', '1', 'gol'), { created_at: 1000 });
  const s2 = Object.assign(shot('Hawks', '1', 'celny'), { created_at: 2000 });
  setEvents([s1, s2]);
  const result = eventsForMatch('m1');
  assert(result[0].created_at > result[1].created_at, 'nieprawidłowe sortowanie');
});

// ── Tests: getCurrentGoalieNumber ─────────────────────────────────────────────

console.log('\ngetCurrentGoalieNumber');

test('brak goalie_set → null', () => {
  const events = [shot('Hawks', '1', 'gol')];
  eq(getCurrentGoalieNumber('Hawks', events), null);
});

test('jeden goalie_set → jego numer', () => {
  const events = [goalieSet('Hawks', '1', 7)];
  eq(getCurrentGoalieNumber('Hawks', events), '7');
});

test('dwa goalie_set → ostatni (wyższy period)', () => {
  const events = [
    goalieSet('Hawks', '1', 7),
    goalieSet('Hawks', '3', 12),
  ];
  eq(getCurrentGoalieNumber('Hawks', events), '12');
});

test('goalie_set dla innej drużyny → null', () => {
  const events = [goalieSet('Hawks', '1', 7)];
  eq(getCurrentGoalieNumber('Vikings', events), null);
});

test('OT1 > Q4 w sortowaniu', () => {
  const events = [
    goalieSet('Hawks', '4', 7),
    goalieSet('Hawks', 'OT1', 12),
  ];
  eq(getCurrentGoalieNumber('Hawks', events), '12');
});

// ── Tests: computeGoalieStats ──────────────────────────────────────────────────

console.log('\ncomputeGoalieStats');

test('brak eventów → puste listy goalies, zeros', () => {
  DATA.events = [];
  const g = computeGoalieStats(MATCH, []);
  eq(g.A.goalies.length, 0);
  eq(g.A.saves, 0);
  eq(g.B.goalies.length, 0);
});

test('brak goalie_set → jeden wpis z number=null', () => {
  const events = [
    shot('Hawks', '1', 'gol'),
    shot('Hawks', '1', 'celny'),
    shot('Vikings', '1', 'celny'),
  ];
  const g = computeGoalieStats(MATCH, events);
  // Bramkarz A broni strzałów Hawks (Vikings strzelał też 1 celny)
  // B broni strzałów Vikings → gol + celny z Hawks
  eq(g.B.goalies.length, 1);
  eq(g.B.goalies[0].number, null);
  eq(g.B.goalies[0].goalsAgainst, 1);
  eq(g.B.goalies[0].saves, 1);
});

test('jeden bramkarz — poprawne statystyki', () => {
  const events = [
    goalieSet('Hawks', '1', 7),
    shot('Vikings', '1', 'gol'),     // bramkarz A #7 stracił gola
    shot('Vikings', '2', 'celny'),   // bramkarz A #7 obronił
    shot('Vikings', '3', 'niecelny'),// nie liczy się do shotsOnGoal
  ];
  const g = computeGoalieStats(MATCH, events);
  eq(g.A.goalies.length, 1);
  eq(g.A.goalies[0].number, '7');
  eq(g.A.goalies[0].goalsAgainst, 1);
  eq(g.A.goalies[0].saves, 1);
  eq(g.A.goalies[0].shotsOnGoal, 2);
  eq(g.A.goalies[0].savePct, '50.0');
  // aggregate
  eq(g.A.goalsAgainst, 1);
  eq(g.A.saves, 1);
});

test('zmiana bramkarza w Q3 — strzały trafiają do właściwego', () => {
  const events = [
    goalieSet('Hawks', '1', 7),
    goalieSet('Hawks', '3', 12),
    shot('Vikings', '1', 'gol'),    // Q1 → bramkarz #7
    shot('Vikings', '2', 'celny'),  // Q2 → bramkarz #7 (nadal obowiązuje)
    shot('Vikings', '3', 'gol'),    // Q3 → bramkarz #12
    shot('Vikings', '4', 'celny'),  // Q4 → bramkarz #12
  ];
  const g = computeGoalieStats(MATCH, events);
  eq(g.A.goalies.length, 2);
  const g7  = g.A.goalies.find(x => x.number === '7');
  const g12 = g.A.goalies.find(x => x.number === '12');
  assert(g7  !== undefined, 'Brak bramkarza #7');
  assert(g12 !== undefined, 'Brak bramkarza #12');
  eq(g7.goalsAgainst, 1);
  eq(g7.saves, 1);
  eq(g12.goalsAgainst, 1);
  eq(g12.saves, 1);
});

test('aggregate zgadza się z sumą per-bramkarz', () => {
  const events = [
    goalieSet('Hawks', '1', 7),
    goalieSet('Hawks', '3', 12),
    shot('Vikings', '1', 'gol'),
    shot('Vikings', '2', 'celny'),
    shot('Vikings', '3', 'gol'),
    shot('Vikings', '4', 'celny'),
  ];
  const g = computeGoalieStats(MATCH, events);
  const sumSaves  = g.A.goalies.reduce((s, x) => s + x.saves, 0);
  const sumGoals  = g.A.goalies.reduce((s, x) => s + x.goalsAgainst, 0);
  eq(g.A.saves, sumSaves);
  eq(g.A.goalsAgainst, sumGoals);
});

test('goalie_set nie wlicza się do statystyk drużynowych', () => {
  const events = [
    goalieSet('Hawks', '1', 7),
    shot('Hawks', '1', 'gol'),
  ];
  const g = computeGoalieStats(MATCH, events);
  // Bramkarz B broni strzałów Hawks (1 gol)
  eq(g.B.goalsAgainst, 1);
  eq(g.B.saves, 0);
});

test('goalie_set z niskim periodem nie wpływa na wcześniejsze strzały', () => {
  // Bramkarz ustawiony w Q3, ale strzały padły w Q1 i Q2 → brak bramkarza (null)
  const events = [
    goalieSet('Hawks', '3', 7),
    shot('Vikings', '1', 'gol'),
    shot('Vikings', '2', 'celny'),
    shot('Vikings', '3', 'celny'),
  ];
  const g = computeGoalieStats(MATCH, events);
  const gNone = g.A.goalies.find(x => x.number === null);
  const g7    = g.A.goalies.find(x => x.number === '7');
  assert(gNone !== undefined, 'Brak wpisu dla null (strzały przed bramkarzem)');
  eq(gNone.goalsAgainst, 1);
  eq(gNone.saves, 1);
  assert(g7 !== undefined, 'Brak wpisu dla #7');
  eq(g7.saves, 1);
});

// ── Summary ────────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Wyniki: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
