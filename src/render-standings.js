'use strict';

function renderStandings(root) {

  if (APP.standingsLoading) {
    root.innerHTML = `
      <div class="app-header">
        <h1>Lacrosse Stats</h1>
        <button class="btn" data-action="go-home-from-standings">${T('nav.home')}</button>
        ${_langToggleBtn()}
        <button class="btn" data-action="toggle-dark-mode" id="theme-toggle" title="${T('nav.theme')}">🌙</button>
      </div>
      <div class="home-content">
        <div class="loading-state"><p>⏳ ${T('loading.standings')}</p></div>
      </div>`;
    return;
  }

  if (APP.standingsError) {
    root.innerHTML = `
      <div class="app-header">
        <h1>Lacrosse Stats</h1>
        <button class="btn" data-action="go-home-from-standings">${T('nav.home')}</button>
        ${_langToggleBtn()}
        <button class="btn" data-action="toggle-dark-mode" id="theme-toggle" title="${T('nav.theme')}">🌙</button>
      </div>
      <div class="home-content">
        <div class="error-state">
          <p>⚠ ${T('error.loading')}: ${escapeHtml(APP.standingsError)}</p>
          <button class="btn btn-primary" data-action="standings-retry">${T('btn.retry')}</button>
        </div>
      </div>`;
    return;
  }

  const { events, matches, tournaments } = APP.standingsData;
  const selectedTour = APP.standingsTournament;

  const tourOptions = tournaments.map(t =>
    `<option value="${escapeHtml(t.name)}" ${t.name === selectedTour ? 'selected' : ''}>${escapeHtml(t.name)}</option>`
  ).join('');

  const rows   = _computeStandings(events, matches, selectedTour);
  const sorted = _sortStandings(rows, APP.standingsSort);

  root.innerHTML = `
    <div class="app-header">
      <h1>${T('standings.title')}</h1>
      <button class="btn" data-action="go-home-from-standings">${T('nav.home')}</button>
      ${_langToggleBtn()}
      <button class="btn" data-action="toggle-dark-mode" id="theme-toggle" title="${T('nav.theme')}">🌙</button>
    </div>
    <div class="standings-content">
      <div class="standings-filter">
        <label>${T('field.tournament')}
          <select data-action="standings-set-tournament">${tourOptions}</select>
        </label>
      </div>
      ${sorted.length === 0
        ? `<p class="standings-empty">${T('standings.empty')}</p>`
        : _renderStandingsTable(sorted, APP.standingsSort)
      }
    </div>`;
}

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
    const teamEvents  = tourEvents.filter(e => matchIds.has(String(e.match_id)) && e.team_event === team);
    const oppEvents   = tourEvents.filter(e => matchIds.has(String(e.match_id)) && e.team_event !== team);
    const goals       = teamEvents.filter(e => e.result === 'gol').length;
    const celne       = teamEvents.filter(e => e.result === 'celny').length;
    const niecelne    = teamEvents.filter(e => e.result === 'niecelny').length;
    const shots       = goals + celne + niecelne;
    const conceded    = oppEvents.filter(e => e.result === 'gol').length;
    const manUpGoals  = teamEvents.filter(e => e.result === 'gol' && e.man_up).length;
    const pctSkut     = shots > 0 ? Math.round(goals / shots * 100) : 0;
    const pctCel      = shots > 0 ? Math.round((goals + celne) / shots * 100) : 0;
    return { team, matches: teamMatches.length, goals, conceded, celne, niecelne, pctSkut, pctCel, manUpGoals };
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
    celne:       r => r.celne,
    niecelne:    r => r.niecelne,
    pctSkut:     r => r.pctSkut,
    pctCel:      r => r.pctCel,
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

function _renderStandingsTable(rows, sort) {
  const cols = [
    { key: 'team',       labelKey: 'standings.col.team',       align: 'left'   },
    { key: 'matches',    labelKey: 'standings.col.matches',     align: 'center' },
    { key: 'goals',      labelKey: 'standings.col.goals_plus',  align: 'center' },
    { key: 'conceded',   labelKey: 'standings.col.goals_minus', align: 'center' },
    { key: 'celne',      labelKey: 'standings.col.on_target',   align: 'center' },
    { key: 'niecelne',   labelKey: 'standings.col.off_target',  align: 'center' },
    { key: 'pctSkut',    labelKey: 'standings.col.pct_skut',    align: 'center' },
    { key: 'pctCel',     labelKey: 'standings.col.pct_cel',     align: 'center' },
    { key: 'manUpGoals', labelKey: 'standings.col.man_up',      align: 'center' },
  ];

  const headers = cols.map(c => {
    const isActive = sort.col === c.key;
    const arrow    = isActive ? (sort.dir === 'desc' ? ' ▼' : ' ▲') : '';
    return `<th class="sortable ${isActive ? 'sort-active' : ''}" data-action="standings-sort" data-arg="${c.key}" style="text-align:${c.align}">${T(c.labelKey)}${arrow}</th>`;
  }).join('');

  const bodyRows = rows.map((r, i) => `
    <tr class="standings-row">
      <td class="standings-rank">${i + 1}. ${escapeHtml(r.team)}</td>
      <td class="center">${r.matches}</td>
      <td class="center goals-scored">${r.goals}</td>
      <td class="center goals-conceded">${r.conceded}</td>
      <td class="center">${r.celne}</td>
      <td class="center">${r.niecelne}</td>
      <td class="center">${r.pctSkut}%</td>
      <td class="center">${r.pctCel}%</td>
      <td class="center">${r.manUpGoals || '—'}</td>
    </tr>`).join('');

  return `
    <table class="standings-table">
      <thead><tr>${headers}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>`;
}
