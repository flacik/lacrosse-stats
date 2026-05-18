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
    .filter(e => String(e.match_id) === String(matchId))
    .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
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
  // Goalkeeper of team X faces shots from the opposing team.
  // Saves = opponent's "celny" (per A.4: includes posts).
  // Goals against = opponent's "gol".
  function statsForGoalie(shotsFaced) {
    const saves        = shotsFaced.filter(e => e.result === 'celny').length;
    const goalsAgainst = shotsFaced.filter(e => e.result === 'gol').length;
    const shotsOnGoal  = saves + goalsAgainst;
    return {
      saves, goalsAgainst, shotsOnGoal,
      savePct: shotsOnGoal > 0 ? (saves / shotsOnGoal * 100).toFixed(1) : '—'
    };
  }
  return {
    A: statsForGoalie(allEvents.filter(e => e.team_event === match.team_B)),
    B: statsForGoalie(allEvents.filter(e => e.team_event === match.team_A))
  };
}

function computePerPeriodStats(matchId, match) {
  const events = DATA.events.filter(e => String(e.match_id) === String(matchId));
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

function applyViewerFilters(events, viewer) {
  let filtered = events;
  if (viewer.filter_period !== 'all') filtered = filtered.filter(e => String(e.period) === viewer.filter_period);
  if (viewer.filter_result !== 'all') filtered = filtered.filter(e => e.result === viewer.filter_result);
  return filtered;
}
