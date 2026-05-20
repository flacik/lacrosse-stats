'use strict';

function renderStandings(root) {

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (APP.standingsLoading) {
    root.innerHTML = `
      <div class="app-header">
        <h1>Lacrosse Stats</h1>
        <button class="btn" data-action="go-home-from-standings">← Home</button>
      </div>
      <div class="home-content">
        <div class="loading-state"><p>⏳ Ładowanie tabeli…</p></div>
      </div>`;
    return;
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (APP.standingsError) {
    root.innerHTML = `
      <div class="app-header">
        <h1>Lacrosse Stats</h1>
        <button class="btn" data-action="go-home-from-standings">← Home</button>
      </div>
      <div class="home-content">
        <div class="error-state">
          <p>⚠ Błąd: ${escapeHtml(APP.standingsError)}</p>
          <button class="btn btn-primary" data-action="standings-retry">↺ Spróbuj ponownie</button>
        </div>
      </div>`;
    return;
  }

  // ── Loaded ───────────────────────────────────────────────────────────────────
  const { events, matches, tournaments } = APP.standingsData;
  const selectedTour = APP.standingsTournament;

  const tourOptions = tournaments.map(t =>
    `<option value="${escapeHtml(t.name)}" ${t.name === selectedTour ? 'selected' : ''}>${escapeHtml(t.name)}</option>`
  ).join('');

  const rows   = _computeStandings(events, matches, selectedTour);
  const sorted = _sortStandings(rows, APP.standingsSort);

  root.innerHTML = `
    <div class="app-header">
      <h1>Tabela ligowa</h1>
      <button class="btn" data-action="go-home-from-standings">← Home</button>
    </div>
    <div class="standings-content">
      <div class="standings-filter">
        <label>Turniej
          <select data-action="standings-set-tournament">${tourOptions}</select>
        </label>
      </div>
      ${sorted.length === 0
        ? '<p class="standings-empty">Brak danych dla tego turnieju.</p>'
        : _renderStandingsTable(sorted, APP.standingsSort)
      }
    </div>`;
}

// ── Obliczenia ────────────────────────────────────────────────────────────────

function _computeStandings(events, matches, tournament) {
  const tourMatches = matches.filter(m =>
    m.tournament === tournament && m.status === 'finished'
  );

  if (tourMatches.length === 0) return [];

  const teamSet = new Set();
  tourMatches.forEach(m => {
    if (m.team_A) teamSet.add(m.team_A);
    if (m.team_B) teamSet.add(m.team_B);
  });

  const tourEvents = events.filter(e => e.tournament === tournament);

  return [...teamSet].map(team => {
    const teamMatches = tourMatches.filter(m => m.team_A === team || m.team_B === team);
    const matchIds    = new Set(teamMatches.map(m => String(m.id)));

    const teamEvents = tourEvents.filter(e =>
      matchIds.has(String(e.match_id)) && e.team_event === team
    );
    const oppEvents = tourEvents.filter(e =>
      matchIds.has(String(e.match_id)) && e.team_event !== team
    );

    const shots      = teamEvents.length;
    const goals      = teamEvents.filter(e => e.result === 'gol').length;
    const conceded   = oppEvents.filter(e => e.result === 'gol').length;
    const manUpGoals = teamEvents.filter(e => e.result === 'gol' && e.man_up).length;
    const pct        = shots > 0 ? Math.round(goals / shots * 100) : 0;

    return { team, matches: teamMatches.length, goals, conceded, shots, pct, manUpGoals };
  });
}

function _sortStandings(rows, sort) {
  const key = sort.col;
  const dir = sort.dir === 'asc' ? 1 : -1;
  const keyMap = {
    team:        r => r.team,
    matches:     r => r.matches,
    goals:       r => r.goals,
    conceded:    r => r.conceded,
    shots:       r => r.shots,
    pct:         r => r.pct,
    manUpGoals:  r => r.manUpGoals,
  };
  const fn = keyMap[key] || (r => r.goals);
  return [...rows].sort((a, b) => {
    const av = fn(a), bv = fn(b);
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return (b.goals - a.goals) * dir;
  });
}

// ── Renderowanie ──────────────────────────────────────────────────────────────

function _renderStandingsTable(rows, sort) {
  const cols = [
    { key: 'team',       label: 'Drużyna',   align: 'left'   },
    { key: 'matches',    label: 'M',         align: 'center' },
    { key: 'goals',      label: 'G+',        align: 'center' },
    { key: 'conceded',   label: 'G−',        align: 'center' },
    { key: 'shots',      label: 'Strzały',   align: 'center' },
    { key: 'pct',        label: '% skut.',   align: 'center' },
    { key: 'manUpGoals', label: 'Man-up G',  align: 'center' },
  ];

  const headers = cols.map(c => {
    const isActive = sort.col === c.key;
    const arrow    = isActive ? (sort.dir === 'desc' ? ' ▼' : ' ▲') : '';
    return `<th class="sortable ${isActive ? 'sort-active' : ''}" data-action="standings-sort" data-arg="${c.key}" style="text-align:${c.align}">${c.label}${arrow}</th>`;
  }).join('');

  const bodyRows = rows.map((r, i) => `
    <tr class="standings-row">
      <td class="standings-rank">${i + 1}. ${escapeHtml(r.team)}</td>
      <td class="center">${r.matches}</td>
      <td class="center goals-scored">${r.goals}</td>
      <td class="center goals-conceded">${r.conceded}</td>
      <td class="center">${r.shots}</td>
      <td class="center">${r.pct}%</td>
      <td class="center">${r.manUpGoals || '—'}</td>
    </tr>`).join('');

  return `
    <table class="standings-table">
      <thead><tr>${headers}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>`;
}
