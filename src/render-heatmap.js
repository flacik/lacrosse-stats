'use strict';

// Multi-match heatmap — the main analytics view. One or more teams, filtered by
// opponent / tournaments / dates / quarters / situation, aggregated over every
// coded match (matches can be excluded one by one). The analysed team attacks
// right (blue), its opponents attack left (red); field is 1100×600 like the
// input screen, so positions and distances line up with where shots were clicked.

const HM_W = 1100, HM_H = 600;
const HM_HEX_R = 17.6;              // = 1.6 % of field width (sketch default)
const HM_EFF_MAX = 0.5;             // efficiency colour saturates at 50 %
const HM_FIELD = '#24302a';
const HM_LINE = 'rgba(255,255,255,0.32)';
const HM_OWN = '#5b7cf0', HM_OPP = '#ef6a55';
const HM_PAL_EFF  = ['#3d5fd9', '#8fa6e8', '#e8e3cf', '#f0a050', '#e0432f'];
const HM_PAL_DENS = ['#3a1a5c', '#7a2370', '#d0414e', '#f78f3c', '#fbe17a'];
const HM_DIST_BINS = [[0, 3, '0–3 m'], [3, 6, '3–6 m'], [6, 9, '6–9 m'], [9, 12, '9–12 m'], [12, 999, '12+ m']];
const HM_QUARTERS = ['1', '2', '3', '4'];
const HM_Q_CHIPS = HM_QUARTERS.concat(['OT']);   // all overtimes share one chip

function hmState() {
  if (!APP.heatmap) APP.heatmap = hmInitialState();
  return APP.heatmap;
}

function hmInitialState() {
  return {
    teams: null,          // null = not chosen yet → default picked on first render
    opp: '',              // '' = all opponents
    tours: null,          // null = all tournaments
    preset: 'all', from: '', to: '',
    qs: HM_Q_CHIPS.slice(),
    sit: 'all',           // all | even | up | down | fb
    mode: 'eff',          // eff | dens | pts
    persp: 'both',        // both | att | def
    metric: 'shots',      // dens/pts: shots | G | on | N | ast | gb
    qMetric: 'goals',     // goals | shots | eff
    qShow: 'total',       // total | per_match
    excl: {},
    teamMenu: false, teamQuery: '',
  };
}

// ── Colour helpers ─────────────────────────────────────────────────────────────

function _hmHexToRgb(h) { return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); }

function _hmRampRgb(stops, t) {
  t = Math.max(0, Math.min(1, t));
  const n = stops.length - 1, i = Math.min(n - 1, Math.floor(t * n)), f = t * n - i;
  const a = _hmHexToRgb(stops[i]), b = _hmHexToRgb(stops[i + 1]);
  return a.map((v, k) => v + (b[k] - v) * f);
}

function _hmRamp(stops, t) {
  return 'rgb(' + _hmRampRgb(stops, t).map(Math.round).join(',') + ')';
}

const _hmMatchCount = n => `${n} ${T(n === 1 ? 'hm.match_lc' : 'hm.matches_lc')}`;
const _hmPct = (a, b) => (b ? Math.round(a / b * 100) + '%' : '–');

// ── Hex binning (pointy-top hexagons) ─────────────────────────────────────────

function _hmHexbin(x, y, R) {
  const dx = R * Math.sqrt(3), dy = R * 1.5;
  const py = y / dy;
  let pj = Math.round(py);
  const px = x / dx - (pj & 1) / 2;
  let pi = Math.round(px);
  const py1 = py - pj;
  if (Math.abs(py1) * 3 > 1) {
    const px1 = px - pi;
    const pi2 = pi + (px < pi ? -1 : 1) / 2, pj2 = pj + (py < pj ? -1 : 1);
    const px2 = px - pi2, py2 = py - pj2;
    if (px1 * px1 + py1 * py1 > px2 * px2 + py2 * py2) { pi = pi2 + (pj & 1 ? 1 : -1) / 2; pj = pj2; }
  }
  return { key: pi + ',' + pj, cx: (pi + (pj & 1) / 2) * dx, cy: pj * dy };
}

// ── Data ───────────────────────────────────────────────────────────────────────

function _hmIsoToday() { return new Date().toISOString().slice(0, 10); }

function _hmAddDays(iso, d) {
  const t = new Date(iso + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + d);
  return t.toISOString().slice(0, 10);
}

function _hmPresetFrom(preset) {
  const today = _hmIsoToday();
  if (preset === '30d')  return _hmAddDays(today, -30);
  if (preset === '90d')  return _hmAddDays(today, -90);
  if (preset === 'year') return today.slice(0, 4) + '-01-01';
  return '';
}

// Matches that have at least one recorded event, with their events grouped.
function _hmCodedMatches(events, matches) {
  const byMatch = {};
  events.forEach(e => { (byMatch[String(e.match_id)] = byMatch[String(e.match_id)] || []).push(e); });
  return matches
    .filter(m => byMatch[String(m.id)])
    .map(m => ({ m, ev: byMatch[String(m.id)] }))
    .sort((a, b) => String(b.m.match_date).localeCompare(String(a.m.match_date)));
}

function _hmAllTeams(coded) {
  const count = {};
  coded.forEach(({ m }) => { [m.team_A, m.team_B].forEach(t => { if (t) count[t] = (count[t] || 0) + 1; }); });
  return Object.keys(count).sort((a, b) => a.localeCompare(b)).map(name => ({ name, n: count[name] }));
}

function _hmDefaultTeams(allTeams) {
  const pol = allTeams.find(t => /^(poland|polska)$/i.test(t.name));
  if (pol) return [pol.name];
  const top = allTeams.slice().sort((a, b) => b.n - a.n)[0];
  return top ? [top.name] : [];
}

// Attacker-relative coords → heatmap field. The analysed team attacks right,
// its opponents attack left (mirrored), so both share one field.
function _hmPlace(e, isOwn) {
  const sx = Number(e.shot_x), sy = Number(e.shot_y);
  return isOwn
    ? { x: (0.5 + sx * 0.5) * HM_W, y: sy * HM_H }
    : { x: (0.5 - sx * 0.5) * HM_W, y: (1 - sy) * HM_H };
}

function _hmSitOk(e, sit) {
  if (sit === 'all')  return true;
  if (sit === 'up')   return !!e.man_up;
  if (sit === 'down') return !!e.man_down;
  if (sit === 'fb')   return !!e.fast_break;
  return !e.man_up && !e.man_down;  // even strength
}

function _hmCompute(S, coded) {
  const qKey = e => (String(e.period).startsWith('OT') ? 'OT' : String(e.period));
  const qOk = e => S.qs.includes(qKey(e));
  const tours = S.tours;
  const base = coded.filter(({ m }) => {
    if (S.from && m.match_date < S.from) return false;
    if (S.to && m.match_date > S.to) return false;
    if (tours && !tours.includes(m.tournament || '')) return false;
    const hasA = S.teams.includes(m.team_A), hasB = S.teams.includes(m.team_B);
    if (!hasA && !hasB) return false;
    if (S.opp) {
      const okA = hasA && m.team_B === S.opp, okB = hasB && m.team_A === S.opp;
      if (!okA && !okB) return false;
    }
    return true;
  });
  const used = base.filter(({ m }) => !S.excl[String(m.id)]);

  const F = { shots: [], gb: [], team: [] }, A = { shots: [], gb: [], team: [] };
  const q = () => ({ '1': { g: 0, s: 0 }, '2': { g: 0, s: 0 }, '3': { g: 0, s: 0 }, '4': { g: 0, s: 0 }, OT: { g: 0, s: 0 } });
  const qf = q(), qa = q();
  let dW = 0, dT = 0, W = 0, L = 0, D = 0;
  const scores = {};

  used.forEach(({ m, ev }) => {
    const goals = side => ev.filter(e => isShotEvent(e) && e.result === 'gol' && e.team_event === side).length;
    const gA = goals(m.team_A), gB = goals(m.team_B);
    scores[String(m.id)] = { A: gA, B: gB };
    const sides = [m.team_A, m.team_B].filter(t => S.teams.includes(t));
    sides.forEach(team => {
      const other = team === m.team_A ? m.team_B : m.team_A;
      if (sides.length === 1) {
        const gs = team === m.team_A ? gA : gB, go = team === m.team_A ? gB : gA;
        if (gs > go) W++; else if (gs < go) L++; else D++;
      }
      ev.forEach(e => {
        if (!qOk(e)) return;
        const own = e.team_event === team;
        if (!own && e.team_event !== other) return;
        const bucket = own ? F : A;
        const qb = (own ? qf : qa)[qKey(e)];
        if (isShotEvent(e)) {
          if (!_hmSitOk(e, S.sit)) return;
          const p = _hmPlace(e, own);
          bucket.shots.push({ x: p.x, y: p.y, res: e.result, ast: !!e.assisted, up: !!e.man_up, fb: !!e.fast_break,
            d: shotDistanceMeters(Number(e.shot_x), Number(e.shot_y)), zone: e.zone_name });
          if (qb) { qb.s++; if (e.result === 'gol') qb.g++; }
        } else if (e.event_type === 'groundball') {
          const p = _hmPlace(e, own);
          bucket.gb.push({ x: p.x, y: p.y });
        } else if (isTeamEvent(e)) {
          bucket.team.push(e);
        }
      });
      ev.forEach(e => {
        if (e.event_type !== 'draw' || !qOk(e)) return;
        dT++;
        if (e.team_event === team) dW++;
      });
    });
  });
  return { base, used, F, A, qf, qa, dW, dT, W, L, D, scores };
}

// ── Render ─────────────────────────────────────────────────────────────────────

function renderHeatmapView(events, matches, tournaments) {
  const S = hmState();
  const coded = _hmCodedMatches(events, matches);
  const allTeams = _hmAllTeams(coded);
  if (S.teams === null) S.teams = _hmDefaultTeams(allTeams);

  if (allTeams.length === 0) return `<div class="empty">${T('analytics.empty')}</div>`;

  const C = _hmCompute(S, coded);
  APP.heatmap._bins = {};  // hex key → stats, read by the tooltip

  const tourNames = APP.heatmap._tourNames = [...new Set(tournaments.map(t => t.name).concat(coded.map(({ m }) => m.tournament || '')))]
    .filter(n => n !== '' || coded.some(({ m }) => !m.tournament));

  return `
    <div class="hm-layout">
      ${_hmFiltersHtml(S, allTeams, coded, tourNames)}
      <div class="hm-main">
        ${_hmMapCardHtml(S, C)}
        <div class="hm-cards-row">
          ${_hmDistanceCardHtml(S, C)}
          ${_hmQuarterCardHtml(S, C)}
        </div>
      </div>
      <div class="hm-side">
        ${_hmSummaryCardHtml(S, C)}
        ${_hmMatchesCardHtml(S, C)}
      </div>
    </div>`;
}

function _hmChip(label, on, action, arg, extraClass) {
  return `<button class="hm-chip${on ? ' on' : ''}${extraClass ? ' ' + extraClass : ''}" data-action="${action}" data-arg="${escapeHtml(arg)}">${escapeHtml(label)}</button>`;
}

function _hmTeamLabel(teams) {
  if (teams.length === 0) return T('hm.no_team');
  if (teams.length <= 2) return teams.join(' + ');
  return teams.length + ' ' + T('hm.teams_n');
}

function _hmFiltersHtml(S, allTeams, coded, tourNames) {
  const q = S.teamQuery.trim().toLowerCase();
  const teamRows = allTeams.map(t => {
    const on = S.teams.includes(t.name);
    const hidden = q && !t.name.toLowerCase().includes(q) ? ' style="display:none"' : '';
    return `<button class="hm-check-row" data-action="hm-toggle-team" data-arg="${escapeHtml(t.name)}" data-hm-team="${escapeHtml(t.name.toLowerCase())}"${hidden}>
        <span class="hm-box${on ? ' on' : ''}"></span><span class="hm-row-label">${escapeHtml(t.name)}</span><span class="hm-count">${t.n}</span>
      </button>`;
  }).join('');

  const opponents = new Set();
  coded.forEach(({ m }) => {
    if (S.teams.includes(m.team_A)) opponents.add(m.team_B);
    if (S.teams.includes(m.team_B)) opponents.add(m.team_A);
  });
  S.teams.forEach(t => opponents.delete(t));
  const oppOptions = [`<option value="">${T('hm.all_opponents')}</option>`]
    .concat([...opponents].sort().map(o => `<option value="${escapeHtml(o)}" ${S.opp === o ? 'selected' : ''}>${escapeHtml(o)}</option>`))
    .join('');

  const tourRows = tourNames.map(name => {
    const on = !S.tours || S.tours.includes(name);
    const n = coded.filter(({ m }) => (m.tournament || '') === name && (S.teams.includes(m.team_A) || S.teams.includes(m.team_B))).length;
    return `<button class="hm-check-row" data-action="hm-toggle-tour" data-arg="${escapeHtml(name)}">
        <span class="hm-box${on ? ' on' : ''}"></span><span class="hm-row-label">${escapeHtml(name || T('hm.no_tournament'))}</span><span class="hm-count">${n}</span>
      </button>`;
  }).join('');

  const presets = [['30d', T('hm.preset.30d')], ['90d', T('hm.preset.90d')], ['year', _hmIsoToday().slice(0, 4)], ['all', T('hm.preset.all')]]
    .map(([id, l]) => _hmChip(l, S.preset === id, 'hm-preset', id, 'seg')).join('');
  const quarters = HM_Q_CHIPS.map(qq => _hmChip(qq === 'OT' ? 'OT' : 'Q' + qq, S.qs.includes(qq), 'hm-toggle-q', qq, 'mono')).join('');
  const sits = [['all', T('hm.sit.all')], ['even', T('hm.sit.even')], ['up', 'Man-up'], ['down', 'Man-down'], ['fb', 'Fast break']]
    .map(([id, l]) => _hmChip(l, S.sit === id, 'hm-set-sit', id)).join('');

  return `
    <div class="hm-card hm-filters">
      <div class="hm-group">
        <div class="hm-label">${T('hm.teams')}</div>
        <button class="hm-select" data-action="hm-team-menu">${escapeHtml(_hmTeamLabel(S.teams))} <span class="hm-caret">▾</span></button>
        ${S.teamMenu ? `
          <div class="hm-menu">
            <input type="text" class="hm-search" data-hm-search placeholder="${T('hm.search')}" value="${escapeHtml(S.teamQuery)}">
            <div class="hm-menu-list">${teamRows}</div>
          </div>` : ''}
      </div>
      <div class="hm-group">
        <div class="hm-label">${T('hm.opponent')}</div>
        <select class="hm-select-native" data-action="hm-set-opp">${oppOptions}</select>
      </div>
      <div class="hm-group">
        <div class="hm-label">${T('hm.tournament')}</div>
        <div class="hm-list">${tourRows}</div>
      </div>
      <div class="hm-group">
        <div class="hm-label">${T('hm.period')}</div>
        <div class="hm-seg">${presets}</div>
        <div class="hm-dates">
          <input type="date" data-action="hm-date" data-field="from" value="${S.from}">
          <input type="date" data-action="hm-date" data-field="to" value="${S.to}">
        </div>
      </div>
      <div class="hm-group">
        <div class="hm-label">${T('hm.quarters')}</div>
        <div class="hm-quarters">${quarters}</div>
      </div>
      <div class="hm-group">
        <div class="hm-label">${T('hm.situation')}</div>
        <div class="hm-chips">${sits}</div>
      </div>
      <button class="btn hm-reset" data-action="hm-reset">${T('hm.reset')}</button>
    </div>`;
}

function _hmFieldMarkings() {
  return `
    <g fill="none" stroke="${HM_LINE}" stroke-width="2">
      <line x1="150" y1="0" x2="150" y2="600"/>
      <line x1="950" y1="0" x2="950" y2="600"/>
      <line x1="550" y1="0" x2="550" y2="600"/>
      <line x1="350" y1="0" x2="350" y2="600" stroke-dasharray="8 8"/>
      <line x1="750" y1="0" x2="750" y2="600" stroke-dasharray="8 8"/>
      <line x1="540" y1="290" x2="560" y2="310"/><line x1="560" y1="290" x2="540" y2="310"/>
    </g>`;
}

function _hmFieldOverlay() {
  return `
    <g fill="none" stroke="${HM_LINE}" stroke-width="2.5" pointer-events="none">
      <circle cx="150" cy="300" r="30"/><circle cx="950" cy="300" r="30"/>
    </g>
    <rect x="148" y="288" width="4" height="24" fill="#fff" pointer-events="none"/>
    <rect x="948" y="288" width="4" height="24" fill="#fff" pointer-events="none"/>`;
}

function _hmMapCardHtml(S, C) {
  const isGB = (S.mode === 'dens' || S.mode === 'pts') && S.metric === 'gb';
  const half = S.mode !== 'pts' && !isGB && S.persp !== 'both' ? S.persp : null;
  const vbx = half === 'att' ? 506 : 0, vbw = half ? 594 : HM_W;
  const shotsShown = S.persp === 'both' ? C.F.shots.concat(C.A.shots) : S.persp === 'att' ? C.F.shots : C.A.shots;
  const gbShown = S.persp === 'both' ? C.F.gb.concat(C.A.gb) : S.persp === 'att' ? C.F.gb : C.A.gb;
  const metricFilter = {
    shots: () => true, G: e => e.res === 'gol', on: e => e.res !== 'niecelny', N: e => e.res === 'niecelny',
    ast: e => e.ast, gb: () => true,
  }[S.metric];
  const teamLabel = _hmTeamLabel(S.teams);

  let layer = '', shownCount = '';
  if (S.mode === 'eff' || S.mode === 'dens') {
    const src = S.mode === 'dens' && isGB ? gbShown : shotsShown;
    const bins = {};
    src.forEach(e => {
      const b = _hmHexbin(e.x, e.y, HM_HEX_R);
      const o = bins[b.key] || (bins[b.key] = { key: b.key, cx: b.cx, cy: b.cy, n: 0, gol: 0, celny: 0, niecelny: 0, ast: 0, up: 0, fb: 0, ds: 0, v: 0 });
      o.n++;
      if (e.res) { o[e.res]++; if (e.ast) o.ast++; if (e.up) o.up++; if (e.fb) o.fb++; o.ds += e.d; }
      if (S.mode === 'eff' || metricFilter(e)) o.v++;
    });
    const list = Object.values(bins).filter(b => (S.mode === 'eff' ? b.n : b.v) > 0);
    const max = Math.max(1, ...list.map(b => (S.mode === 'eff' ? b.n : b.v)));
    layer = list.map(b => {
      let s, fill, op;
      if (S.mode === 'eff') {
        s = HM_HEX_R * Math.max(0.34, Math.sqrt(b.n / max)) * 0.97;
        fill = _hmRamp(HM_PAL_EFF, b.gol / b.n / HM_EFF_MAX);
        op = b.n < 3 ? 0.45 : 1;
      } else {
        s = HM_HEX_R * 0.97;
        fill = _hmRamp(HM_PAL_DENS, Math.sqrt(b.v / max));
        op = 0.95;
      }
      APP.heatmap._bins[b.key] = Object.assign({ isGB: S.mode === 'dens' && isGB, matches: C.used.length }, b);
      return `<polygon class="hm-hex" data-hm-bin="${b.key}" points="0,-1 0.866,-0.5 0.866,0.5 0,1 -0.866,0.5 -0.866,-0.5"
        transform="translate(${b.cx.toFixed(1)} ${b.cy.toFixed(1)}) scale(${s.toFixed(2)})" fill="${fill}" opacity="${op}"/>`;
    }).join('');
    shownCount = `${src.length} ${S.mode === 'dens' && isGB ? 'GB' : T('hm.shots_lc')} · ${_hmMatchCount(C.used.length)}`;
  } else {
    const add = (arr, c) => arr.filter(metricFilter).forEach(e => {
      const tf = `translate(${e.x.toFixed(1)} ${e.y.toFixed(1)})`;
      if (!e.res) layer += `<rect x="-5" y="-5" width="10" height="10" fill="${c}" transform="${tf}" opacity="0.85"/>`;
      else if (e.res === 'gol') layer += `<circle r="6" fill="${c}" transform="${tf}" opacity="0.85"/>`;
      else if (e.res === 'celny') layer += `<circle r="5" fill="none" stroke="${c}" stroke-width="2" transform="${tf}" opacity="0.85"/>`;
      else layer += `<path d="M-5,-5L5,5M5,-5L-5,5" stroke="${c}" stroke-width="2" transform="${tf}" opacity="0.85"/>`;
    });
    const own = isGB ? C.F.gb : C.F.shots, opp = isGB ? C.A.gb : C.A.shots;
    if (S.persp !== 'def') add(own, HM_OWN);
    if (S.persp !== 'att') add(opp, HM_OPP);
    const n = (S.persp !== 'def' ? own.filter(metricFilter).length : 0) + (S.persp !== 'att' ? opp.filter(metricFilter).length : 0);
    shownCount = `${n} ${T('hm.events_lc')} · ${_hmMatchCount(C.used.length)}`;
  }

  const modes = [['eff', T('hm.mode.eff')], ['dens', T('hm.mode.dens')], ['pts', T('hm.mode.pts')]]
    .map(([id, l]) => _hmChip(l, S.mode === id, 'hm-set-mode', id, 'seg')).join('');
  const persps = [['both', T('hm.persp.both')], ['att', T('hm.persp.att')], ['def', T('hm.persp.def')]]
    .map(([id, l]) => _hmChip(l, S.persp === id, 'hm-set-persp', id, 'seg')).join('');
  const metrics = [['shots', T('hm.metric.shots')], ['G', T('hm.metric.goals')], ['on', T('hm.metric.on')], ['N', T('hm.metric.miss')], ['ast', T('hm.metric.ast')], ['gb', 'GB']]
    .map(([id, l]) => _hmChip(l, S.metric === id, 'hm-set-metric', id)).join('');

  const showDraw = !half && (S.mode === 'eff' || S.mode === 'dens') && C.dT > 0;
  const isEffScale = S.mode === 'eff';
  const grad = p => 'linear-gradient(90deg,' + p.join(',') + ')';
  const legendPts = `
    <span class="hm-leg"><svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="${HM_OWN}"/></svg>${T('hm.leg.goal')}</span>
    <span class="hm-leg"><svg width="12" height="12"><circle cx="6" cy="6" r="4" fill="none" stroke="${HM_OWN}" stroke-width="1.6"/></svg>${T('hm.leg.on')}</span>
    <span class="hm-leg"><svg width="12" height="12"><path d="M2,2L10,10M10,2L2,10" stroke="${HM_OWN}" stroke-width="1.6"/></svg>${T('hm.leg.miss')}</span>
    <span class="hm-leg"><svg width="12" height="12"><rect x="2" y="2" width="8" height="8" fill="${HM_OWN}"/></svg>GB</span>
    <span class="hm-leg"><span class="hm-swatch" style="background:${HM_OWN}"></span>${escapeHtml(teamLabel)}</span>
    <span class="hm-leg"><span class="hm-swatch" style="background:${HM_OPP}"></span>${T('hm.opponents')}</span>`;

  return `
    <div class="hm-card hm-map-card">
      <div class="hm-toolbar">
        <div class="hm-seg">${modes}</div>
        <div class="hm-seg">${persps}</div>
      </div>
      ${S.mode === 'dens' || S.mode === 'pts' ? `<div class="hm-chips hm-metrics"><span class="hm-muted">${T('hm.show')}:</span>${metrics}</div>` : ''}
      <div class="hm-field-wrap${half ? ' half' : ''}">
        <div class="hm-side-labels">
          <span class="hm-opp-color">${half === 'att' ? '' : '← ' + T('hm.label.def')}</span>
          <span class="hm-own-color">${half === 'def' ? '' : T('hm.label.att') + ': ' + escapeHtml(teamLabel) + ' →'}</span>
        </div>
        <div class="hm-field">
          <svg viewBox="${vbx} 0 ${vbw} ${HM_H}" class="hm-svg">
            <defs><clipPath id="hm-clip"><rect x="0" y="0" width="${HM_W}" height="${HM_H}"/></clipPath></defs>
            <rect x="0" y="0" width="${HM_W}" height="${HM_H}" fill="${HM_FIELD}"/>
            ${_hmFieldMarkings()}
            <g clip-path="url(#hm-clip)">${layer}</g>
            ${_hmFieldOverlay()}
          </svg>
          ${showDraw ? `<div class="hm-draw-pill">${T('hm.draws')} ${_hmPct(C.dW, C.dT)} · ${C.dW}/${C.dT}</div>` : ''}
          <div class="hm-tip" id="hm-tip" hidden></div>
        </div>
      </div>
      <div class="hm-legend">
        ${S.mode === 'pts' ? `<div class="hm-legs">${legendPts}</div>` : `
          <div class="hm-scale">
            <span>${isEffScale ? T('hm.scale.eff') : T('hm.scale.count')}</span>
            <span class="hm-mono">${isEffScale ? '0%' : T('hm.scale.low')}</span>
            <span class="hm-grad" style="background:${grad(isEffScale ? HM_PAL_EFF : HM_PAL_DENS)}"></span>
            <span class="hm-mono">${isEffScale ? '50%+' : T('hm.scale.high')}</span>
          </div>`}
        ${S.mode === 'eff' ? `<div class="hm-scale"><span>${T('hm.size_note')}</span><span class="hm-muted">· ${T('hm.faded_note')}</span></div>` : ''}
        <span class="hm-mono hm-muted">${shownCount}</span>
      </div>
    </div>`;
}

function _hmDistanceCardHtml(S, C) {
  const src = S.persp === 'def' ? C.A.shots : C.F.shots;
  const counts = HM_DIST_BINS.map(([a, b]) => {
    const ins = src.filter(e => e.d >= a && e.d < b);
    return { n: ins.length, g: ins.filter(e => e.res === 'gol').length };
  });
  const max = Math.max(1, ...counts.map(c => c.n));
  const bars = HM_DIST_BINS.map(([, , label], i) => {
    const c = counts[i];
    return `
      <div class="hm-dist-col">
        <span class="hm-mono hm-dist-pct">${_hmPct(c.g, c.n)}</span>
        <div class="hm-dist-bar" style="height:${Math.max(3, c.n / max * 88)}px;background:${c.n ? _hmRamp(HM_PAL_EFF, c.g / c.n / HM_EFF_MAX) : 'var(--hm-empty)'}"></div>
        <div class="hm-dist-label">${label}<br><span class="hm-mono hm-muted">${c.n} ${T('hm.sh')}</span></div>
      </div>`;
  }).join('');
  return `
    <div class="hm-card">
      <div class="hm-card-head"><b>${T('hm.dist.title')}</b><span class="hm-muted">${S.persp === 'def' ? T('hm.dist.opp') : T('hm.dist.own')}</span></div>
      <div class="hm-dist">${bars}</div>
    </div>`;
}

function _hmQuarterCardHtml(S, C) {
  const keys = HM_QUARTERS.concat(C.qf.OT.s || C.qa.OT.s ? ['OT'] : []);
  const nm = Math.max(1, C.used.length);
  const isEff = S.qMetric === 'eff';
  const val = b => {
    if (isEff) return b.s ? b.g / b.s : null;
    const raw = S.qMetric === 'goals' ? b.g : b.s;
    return S.qShow === 'per_match' ? raw / nm : raw;
  };
  const fmt = v => (v === null ? '–' : isEff ? Math.round(v * 100) + '%' : S.qShow === 'per_match' ? v.toFixed(1) : String(v));
  const vals = keys.map(k => ({ k, f: val(C.qf[k]), a: val(C.qa[k]) }));
  const max = Math.max(isEff ? 0.0001 : 1, ...vals.flatMap(v => [v.f || 0, v.a || 0]));
  const rows = vals.map(v => `
    <div class="hm-q-row">
      <span class="hm-mono hm-muted">${v.k === 'OT' ? 'OT' : 'Q' + v.k}</span>
      <div class="hm-q-left"><span class="hm-mono">${fmt(v.f)}</span><div class="hm-q-bar own" style="width:${(v.f || 0) / max * 100}%"></div></div>
      <div class="hm-q-right"><div class="hm-q-bar opp" style="width:${(v.a || 0) / max * 100}%"></div><span class="hm-mono">${fmt(v.a)}</span></div>
    </div>`).join('');
  const metricChips = [['goals', T('hm.metric.goals')], ['shots', T('hm.metric.shots')], ['eff', T('hm.q.eff')]]
    .map(([id, l]) => _hmChip(l, S.qMetric === id, 'hm-q-metric', id, 'seg sm')).join('');
  const showChips = [['total', T('hm.q.total')], ['per_match', T('hm.q.per_match')]]
    .map(([id, l]) => _hmChip(l, S.qShow === id, 'hm-q-show', id, 'seg sm' + (isEff ? ' disabled' : ''))).join('');
  const ownLbl = S.qMetric === 'shots' ? T('hm.q.shots_for') : T('hm.q.for');
  const oppLbl = S.qMetric === 'shots' ? T('hm.q.shots_against') : T('hm.q.against');
  return `
    <div class="hm-card">
      <div class="hm-card-head"><b>${T('hm.q.title')}</b>
        <span class="hm-q-key"><span class="hm-swatch own"></span>${ownLbl}<span class="hm-swatch opp"></span>${oppLbl}</span>
      </div>
      <div class="hm-q-controls"><div class="hm-seg">${metricChips}</div><div class="hm-seg">${showChips}</div></div>
      <div class="hm-q">${rows}</div>
    </div>`;
}

function _hmSummaryCardHtml(S, C) {
  const st = s => {
    const n = s.length, G = s.filter(e => e.res === 'gol').length, Cn = s.filter(e => e.res === 'celny').length;
    const up = s.filter(e => e.up), fb = s.filter(e => e.fb);
    return { n, G, C: Cn, ast: s.filter(e => e.ast).length,
      upG: up.filter(e => e.res === 'gol').length, upN: up.length, fbG: fb.filter(e => e.res === 'gol').length, fbN: fb.length };
  };
  const sf = st(C.F.shots), sa = st(C.A.shots);
  const nm = Math.max(1, C.used.length), avg = v => (v / nm).toFixed(1);
  const df = computeDisciplineCounts(C.F.team), da = computeDisciplineCounts(C.A.team);
  const kpis = [
    [T('hm.k.goals'), `${T('hm.per_match')}: ${avg(sf.G)} / ${avg(sa.G)}`, sf.G, sa.G],
    [T('hm.k.shots'), `${T('hm.per_match')}: ${avg(sf.n)} / ${avg(sa.n)}`, sf.n, sa.n],
    [T('hm.k.eff'), T('hm.k.eff_hint'), _hmPct(sf.G, sf.n), _hmPct(sa.G, sa.n)],
    [T('hm.k.acc'), T('hm.k.acc_hint'), _hmPct(sf.G + sf.C, sf.n), _hmPct(sa.G + sa.C, sa.n)],
    [T('hm.k.ast'), T('hm.k.ast_hint'), sf.ast, _hmPct(sf.ast, sf.G)],
    ['Man-up', T('hm.k.up_hint'), `${sf.upG}/${sf.upN}`, `${sa.upG}/${sa.upN}`],
    ['Fast break', T('hm.k.fb_hint'), `${sf.fbG}/${sf.fbN}`, `${sa.fbG}/${sa.fbN}`],
    ['Ground balls', `${T('hm.per_match')}: ${avg(C.F.gb.length)} / ${avg(C.A.gb.length)}`, C.F.gb.length, C.A.gb.length],
    [T('hm.k.draws'), T('hm.k.draws_hint'), C.dW, C.dT - C.dW],
    [T('hm.k.pen'), `${T('hm.per_match')}: ${avg(df.penalties)} / ${avg(da.penalties)}`, formatPenalties(df), formatPenalties(da)],
    [T('hm.k.sc'), `${T('hm.per_match')}: ${avg(df.shotClock)} / ${avg(da.shotClock)}`, df.shotClock, da.shotClock],
  ];
  const rows = kpis.map(([label, hint, a, b]) => `
    <div class="hm-kpi-label">${label}<span class="hm-muted">${hint}</span></div>
    <div class="hm-kpi-a hm-mono">${a}</div>
    <div class="hm-kpi-b hm-mono">${b}</div>`).join('');
  const small = C.used.length > 0 && C.used.length < 3;
  return `
    <div class="hm-card">
      <div class="hm-card-head"><b>${T('hm.summary')}</b>
        <span class="hm-mono hm-muted">W ${C.W} · L ${C.L}${C.D ? ' · D ' + C.D : ''}</span></div>
      <div class="hm-sample${small ? ' warn' : ''}">
        ${_hmMatchCount(C.used.length)} · ${sf.n + sa.n} ${T('hm.shots_lc')}${small ? ' — ' + T('hm.small_sample') : ''}
      </div>
      <div class="hm-kpis">
        <div></div><div class="hm-kpi-a hm-own-color">${T('hm.for')}</div><div class="hm-kpi-b hm-opp-color">${T('hm.against')}</div>
        ${rows}
      </div>
    </div>`;
}

function _hmMatchesCardHtml(S, C) {
  const rows = C.base.map(({ m }) => {
    const id = String(m.id);
    const on = !S.excl[id];
    const sc = C.scores[id] || (() => {
      const ev = (APP.analyticsData.events || []).filter(e => String(e.match_id) === id && isShotEvent(e) && e.result === 'gol');
      return { A: ev.filter(e => e.team_event === m.team_A).length, B: ev.filter(e => e.team_event === m.team_B).length };
    })();
    const myA = S.teams.includes(m.team_A), myB = S.teams.includes(m.team_B);
    let res = `${sc.A}:${sc.B}`, cls = '';
    if (myA !== myB) {
      const gs = myA ? sc.A : sc.B, go = myA ? sc.B : sc.A;
      res = `${gs}:${go}`;
      cls = gs > go ? ' win' : gs < go ? ' loss' : '';
    }
    const [y, mo, d] = String(m.match_date).split('-');
    return `
      <div class="hm-match${on ? '' : ' off'}">
        <button class="hm-match-toggle" data-action="hm-toggle-match" data-arg="${escapeHtml(id)}">
          <span class="hm-box${on ? ' on' : ''}"></span>
          <span class="hm-mono hm-muted hm-match-date">${d}.${mo}.${(y || '').slice(2)}</span>
          <span class="hm-match-title"><span>${escapeHtml(m.team_A)} – ${escapeHtml(m.team_B)}</span><span class="hm-muted">${escapeHtml(m.tournament || '')}</span></span>
          <span class="hm-res${cls}">${res}</span>
        </button>
        <button class="icon-btn" data-action="open-viewer-from-analytics" data-arg="${escapeHtml(id)}" title="${T('hm.open_match')}">↗</button>
      </div>`;
  }).join('');
  return `
    <div class="hm-card">
      <div class="hm-card-head"><b>${T('hm.matches')} <span class="hm-mono hm-muted">${C.used.length}/${C.base.length}</span></b>
        <button class="hm-link" data-action="hm-include-all">${T('hm.include_all')}</button></div>
      <div class="hm-muted hm-small">${T('hm.matches_hint')}</div>
      <div class="hm-match-list">${rows || `<div class="hm-muted">${T('analytics.empty')}</div>`}</div>
    </div>`;
}

// ── Tooltip (hover on desktop, tap on tablet) — DOM only, no re-render ─────────

function _hmShowTip(el) {
  const tip = document.getElementById('hm-tip');
  const b = APP.heatmap && APP.heatmap._bins && APP.heatmap._bins[el.dataset.hmBin];
  if (!tip || !b) return;
  const svg = el.ownerSVGElement;
  const vb = svg.viewBox.baseVal;
  const left = (b.cx - vb.x) / vb.width * 100, top = b.cy / HM_H * 100;
  const rows = b.isGB
    ? [[T('hm.per_match'), (b.n / Math.max(1, b.matches)).toFixed(2)]]
    : [[T('hm.k.goals'), b.gol], [T('hm.tip.saved'), b.celny], [T('hm.leg.miss'), b.niecelny], [T('hm.k.eff'), _hmPct(b.gol, b.n)],
       [T('hm.k.ast'), b.ast], ['Man-up / Fast break', b.up + ' / ' + b.fb], [T('hm.tip.dist'), (b.ds / b.n).toFixed(1) + ' m']];
  tip.innerHTML = `
    <div class="hm-tip-head"><b>${b.cx < 550 ? T('hm.tip.def_zone') : T('hm.tip.att_zone')}</b>
      <span class="hm-mono">${b.n} ${b.isGB ? 'GB' : T('hm.sh')}</span></div>
    ${rows.map(([k, v]) => `<div class="hm-tip-row"><span>${k}</span><span class="hm-mono">${v}</span></div>`).join('')}`;
  tip.style.left = left + '%';
  tip.style.top = top + '%';
  tip.style.transform = top < 40 ? 'translate(-50%, 16px)' : 'translate(-50%, calc(-100% - 16px))';
  tip.hidden = false;
  document.querySelectorAll('.hm-hex.hover').forEach(h => h.classList.remove('hover'));
  el.classList.add('hover');
}

function _hmHideTip() {
  const tip = document.getElementById('hm-tip');
  if (tip) tip.hidden = true;
  document.querySelectorAll('.hm-hex.hover').forEach(h => h.classList.remove('hover'));
}

document.addEventListener('mouseover', (e) => {
  const hex = e.target.closest && e.target.closest('[data-hm-bin]');
  if (hex) _hmShowTip(hex);
  else if (e.target.closest && !e.target.closest('.hm-field')) _hmHideTip();
});

document.addEventListener('click', (e) => {
  const hex = e.target.closest && e.target.closest('[data-hm-bin]');
  if (hex) _hmShowTip(hex);
});

// Team search filters the open list in place, so typing keeps focus.
document.addEventListener('input', (e) => {
  if (!e.target.matches || !e.target.matches('[data-hm-search]')) return;
  const q = e.target.value.trim().toLowerCase();
  if (APP.heatmap) APP.heatmap.teamQuery = e.target.value;
  document.querySelectorAll('[data-hm-team]').forEach(row => {
    row.style.display = !q || row.dataset.hmTeam.includes(q) ? '' : 'none';
  });
});

// ── State changes (called from HANDLERS) ───────────────────────────────────────

function hmUpdate(fn) {
  const S = hmState();
  fn(S);
  render();
}

function hmToggleIn(arr, v) {
  return arr.includes(v) ? arr.filter(x => x !== v) : arr.concat([v]);
}
