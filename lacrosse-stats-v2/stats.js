'use strict';

// Stats / aggregations / period helpers. All read DATA, no mutation.

function computeScore(matchId) {
  const match = DATA.scheduledMatches.find(m => String(m.id) === String(matchId));
  if (!match) return { A: 0, B: 0 };
  const events = DATA.events.filter(e => String(e.match_id) === String(matchId) && e.result === 'gol');
  let A = 0, B = 0;
  events.forEach(e => {
    if (e.team_event === match.team_A) A++;
    else if (e.team_event === match.team_B) B++;
  });
  return { A, B };
}

function nextPeriod(current) {
  if (current === '1') return '2';
  if (current === '2') return '3';
  if (current === '3') return '4';
  if (current === '4') return 'OT1';
  const m = current.match(/^OT(\d+)$/);
  if (m) return 'OT' + (parseInt(m[1]) + 1);
  return current;
}

function periodLabel(p) {
  if (!p) return '?';
  p = String(p);
  if (p === 'OT1') return 'Dogrywka 1';
  if (p.startsWith('OT')) return 'Dogrywka ' + p.slice(2);
  return 'Q' + p;
}

function getPeriodOrder(p) {
  if (!p) return 999;
  p = String(p);
  if (p.startsWith('OT')) return 4 + parseInt(p.slice(2));
  return parseInt(p);
}

function teamSlot(matchId, teamName) {
  const m = DATA.scheduledMatches.find(x => String(x.id) === String(matchId));
  if (!m) return '';
  if (teamName === m.team_A) return 'A';
  if (teamName === m.team_B) return 'B';
  return '';
}

function eventsForMatch(matchId) {
  return DATA.events
    .filter(e => String(e.match_id) === String(matchId) && e.event_type !== 'goalie_set')
    .sort((a, b) => {
      const aId = Number(a.id) || 0;
      const bId = Number(b.id) || 0;
      if (aId !== bId) return bId - aId;
      return (Number(b.created_at) || 0) - (Number(a.created_at) || 0);
    });
}

function getCurrentGoalieNumber(teamName, events) {
  const sets = events
    .filter(e => e.event_type === 'goalie_set' && e.team_event === teamName)
    .sort((a, b) => getPeriodOrder(a.period) - getPeriodOrder(b.period));
  return sets.length > 0 ? sets[sets.length - 1].goalie_number : null;
}

function computeTeamStats(matchId, teamName, events) {
  const teamEvents = events.filter(e => e.team_event === teamName);
  const total      = teamEvents.length;
  const goals      = teamEvents.filter(e => e.result === 'gol').length;
  const saves      = teamEvents.filter(e => e.result === 'celny').length;     // strzały obronione (per A.4: także trafienia w słupek)
  const onTarget   = teamEvents.filter(e => e.result === 'celny' || e.result === 'gol').length;
  const offTarget  = teamEvents.filter(e => e.result === 'niecelny').length;
  return {
    total, goals, saves, onTarget, offTarget,
    goalRate:     total > 0 ? (goals    / total * 100).toFixed(1) : '—',
    onTargetRate: total > 0 ? (onTarget / total * 100).toFixed(1) : '—'
  };
}

function computeGoalieStats(match, allEvents) {
  const goalieSetEvents = allEvents.filter(e => e.event_type === 'goalie_set');
  const shots = allEvents.filter(e => e.event_type !== 'goalie_set');

  function getActiveGoalie(teamName, period) {
    const assignments = goalieSetEvents
      .filter(e => e.team_event === teamName)
      .sort((a, b) => getPeriodOrder(a.period) - getPeriodOrder(b.period));
    let number = null;
    for (const a of assignments) {
      if (getPeriodOrder(a.period) <= getPeriodOrder(period)) number = a.goalie_number;
    }
    return number;
  }

  function statsForTeam(goalieTeamName, shotTeamName) {
    const faced = shots.filter(e => e.team_event === shotTeamName);
    const byGoalie = {};
    for (const shot of faced) {
      const num = getActiveGoalie(goalieTeamName, shot.period) || '__none__';
      if (!byGoalie[num]) byGoalie[num] = [];
      byGoalie[num].push(shot);
    }
    return Object.entries(byGoalie).map(([num, shotList]) => {
      const saves        = shotList.filter(e => e.result === 'celny').length;
      const goalsAgainst = shotList.filter(e => e.result === 'gol').length;
      const shotsOnGoal  = saves + goalsAgainst;
      return {
        number: num === '__none__' ? null : num,
        saves, goalsAgainst, shotsOnGoal,
        savePct: shotsOnGoal > 0 ? (saves / shotsOnGoal * 100).toFixed(1) : '—'
      };
    });
  }

  function aggregate(list) {
    const saves        = list.reduce((s, g) => s + g.saves, 0);
    const goalsAgainst = list.reduce((s, g) => s + g.goalsAgainst, 0);
    const shotsOnGoal  = saves + goalsAgainst;
    return {
      saves, goalsAgainst, shotsOnGoal,
      savePct: shotsOnGoal > 0 ? (saves / shotsOnGoal * 100).toFixed(1) : '—',
      goalies: list,
    };
  }

  return {
    A: aggregate(statsForTeam(match.team_A, match.team_B)),
    B: aggregate(statsForTeam(match.team_B, match.team_A)),
  };
}

function computePerPeriodStats(matchId, match) {
  const events = DATA.events.filter(e => String(e.match_id) === String(matchId) && e.event_type !== 'goalie_set');
  const periods = new Set();
  events.forEach(e => { if (e.period !== undefined && e.period !== '') periods.add(String(e.period)); });
  const sorted = Array.from(periods).sort((a, b) => getPeriodOrder(a) - getPeriodOrder(b));
  return sorted.map(p => {
    const periodEvents = events.filter(e => String(e.period) === p);
    const A_shots = periodEvents.filter(e => e.team_event === match.team_A).length;
    const A_goals = periodEvents.filter(e => e.team_event === match.team_A && e.result === 'gol').length;
    const B_shots = periodEvents.filter(e => e.team_event === match.team_B).length;
    const B_goals = periodEvents.filter(e => e.team_event === match.team_B && e.result === 'gol').length;
    return { period: p, A_shots, A_goals, B_shots, B_goals };
  });
}

function computeSituationStats(matchId, match, allEvents) {
  function statsForSituation(events, teamName) {
    const teamEvents = events.filter(e => e.team_event === teamName);
    const shots = teamEvents.length;
    const goals = teamEvents.filter(e => e.result === 'gol').length;
    const rate  = shots > 0 ? (goals / shots * 100).toFixed(1) : '—';
    return { shots, goals, rate };
  }

  const manUpEvents   = allEvents.filter(e => e.man_up   === true);
  const manDownEvents = allEvents.filter(e => e.man_down === true);
  const equalEvents   = allEvents.filter(e => !e.man_up && !e.man_down);

  return {
    manUp:   { A: statsForSituation(manUpEvents,   match.team_A), B: statsForSituation(manUpEvents,   match.team_B) },
    equal:   { A: statsForSituation(equalEvents,   match.team_A), B: statsForSituation(equalEvents,   match.team_B) },
    manDown: { A: statsForSituation(manDownEvents, match.team_A), B: statsForSituation(manDownEvents, match.team_B) },
  };
}

function applyViewerFilters(events, viewer) {
  let filtered = events;
  if (viewer.filter_period !== 'all') filtered = filtered.filter(e => String(e.period) === viewer.filter_period);
  if (viewer.filter_result !== 'all') filtered = filtered.filter(e => e.result === viewer.filter_result);
  return filtered;
}
