'use strict';

// ── PDF Report ────────────────────────────────────────────────────────────────
// Opens a new window with an A4-optimised report and calls window.print().
// Two modes: openMatchReport(matchId) — single-match report from the Viewer
//            openAnalyticsReport()    — report from Analytics (active filters)

function openMatchReport(matchId) {
  var match = DATA.scheduledMatches.find(function(m) {
    return String(m.id) === String(matchId);
  });
  if (!match) { alert(T('error.match_not_found_alert')); return; }

  var allEvents  = DATA.events.filter(function(e) {
    return String(e.match_id) === String(matchId);
  });
  var shotEvents = allEvents.filter(function(e) {
    return isShotEvent(e);
  });

  var score     = computeScore(matchId);
  var statsA    = computeTeamStats(matchId, match.team_A, shotEvents);
  var statsB    = computeTeamStats(matchId, match.team_B, shotEvents);
  var goalies   = computeGoalieStats(match, allEvents);
  var perPeriod = computePerPeriodStats(matchId, match);
  var situation = computeSituationStats(matchId, match, shotEvents);

  var evA = shotEvents.filter(function(e) { return e.team_event === match.team_A; });
  var evB = shotEvents.filter(function(e) { return e.team_event === match.team_B; });
  var svgA = _reportHalfFieldSvg(evA, match.team_A, false);
  var svgB = _reportHalfFieldSvg(evB, match.team_B, false);

  var title    = escapeHtml(match.team_A) + ' vs ' + escapeHtml(match.team_B);
  var subtitle = [match.tournament, match.match_date].filter(Boolean).map(escapeHtml).join(' · ');

  var html = _reportShell(title, subtitle, [
    _sectionMatchHeader(match, score),
    _sectionShotStats(statsA, statsB, match),
    _sectionSituations(situation, match),
    _sectionGoalies(goalies, match),
    _sectionPerPeriod(perPeriod, match),
    _sectionShotCharts(svgA, svgB, match),
  ]);

  _openPrintWindow(html);
}

function openAnalyticsReport() {
  var data = APP.analyticsData;
  if (!data || !data.events) { alert(T('error.no_analytics')); return; }

  var f        = APP.analyticsFilters;
  var filtered = _analyticsApplyFilters(data.events, f);
  if (filtered.length === 0) { alert(T('error.no_filtered')); return; }

  var s          = computeAnalyticsStats(filtered);
  var goalieData = _computeGoalieAnalytics(filtered, data.events, data.matches, f, APP.analyticsGoalieSort);

  var teamLabel = f.team || T('report.all_teams');
  var parts     = [f.tournament, teamLabel, f.period ? periodLabel(f.period) : '', f.dateFrom, f.dateTo].filter(Boolean);
  var subtitle  = parts.join(' · ');

  var svgOff = '', svgDef = '';
  if (f.team) {
    svgOff = filtered.length > 0 ? _reportHalfFieldSvg(filtered, f.team) : '';
    var matchIds  = new Set(filtered.map(function(e) { return String(e.match_id); }));
    var conceded  = data.events.filter(function(e) {
      return matchIds.has(String(e.match_id)) &&
             e.team_event !== f.team &&
             isShotEvent(e);
    });
    svgDef = conceded.length > 0 ? _reportHalfFieldSvg(conceded, conceded[0].team_event || '__opp__', true) : '';
  }

  var html = _reportShell(T('report.analytics') + ' — ' + escapeHtml(teamLabel), subtitle, [
    _sectionAnalyticsSummary(s, filtered, f),
    _sectionAnalyticsZones(s),
    _sectionAnalyticsPeriods(s),
    _sectionAnalyticsSituations(s),
    _sectionAnalyticsGoalies(goalieData),
    (svgOff || svgDef) ? _sectionAnalyticsShotCharts(svgOff, svgDef, f.team) : '',
    _sectionMatchHistory(filtered, data.events, data.matches, f),
  ]);

  _openPrintWindow(html);
}

// ── Document shell ────────────────────────────────────────────────────────────

function _reportShell(title, subtitle, sections) {
  return '<!DOCTYPE html><html lang="' + APP.lang + '"><head>' +
    '<meta charset="UTF-8">' +
    '<title>' + title + '</title>' +
    '<style>' + _reportCss() + '</style>' +
    '</head><body>' +
    '<div class="doc-header">' +
      '<div class="doc-title">' + title + '</div>' +
      (subtitle ? '<div class="doc-subtitle">' + subtitle + '</div>' : '') +
      '<div class="doc-brand">Lacrosse Stats</div>' +
    '</div>' +
    sections.filter(Boolean).join('') +
    '<script>window.onload=function(){window.print();}<\/script>' +
    '</body></html>';
}

function _openPrintWindow(html) {
  var w = window.open('', '_blank');
  if (!w) { alert(T('popup.blocked')); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

// ── Match report sections ─────────────────────────────────────────────────────

function _sectionMatchHeader(match, score) {
  var statusMap = { live: T('report.status.live'), finished: T('report.status.finished'), planned: T('report.status.planned') };
  var status = statusMap[match.status] || match.status;
  return '<div class="section match-banner">' +
    '<div class="banner-score">' +
      '<span class="team-a">' + escapeHtml(match.team_A) + '</span>' +
      '<span class="score-num">' + score.A + ' : ' + score.B + '</span>' +
      '<span class="team-b">' + escapeHtml(match.team_B) + '</span>' +
    '</div>' +
    '<div class="banner-meta">' + escapeHtml(match.tournament || '') + ' &nbsp;|&nbsp; ' + escapeHtml(String(match.match_date || '')) + ' &nbsp;|&nbsp; ' + status + '</div>' +
  '</div>';
}

function _sectionShotStats(sA, sB, match) {
  var fmt = function(v, isRate) { return v === '—' ? '—' : (isRate ? v + '%' : v); };
  var rows = [
    [T('report.rows.shots'),     sA.total,              sB.total,              false],
    [T('report.rows.goals'),     sA.goals,              sB.goals,              false],
    [T('report.rows.on_target'), sA.onTarget,           sB.onTarget,           false],
    [T('report.rows.off_target'),sA.offTarget,          sB.offTarget,          false],
    [T('report.rows.rate'),      fmt(sA.goalRate,1),    fmt(sB.goalRate,1),    false],
    [T('report.rows.on_rate'),   fmt(sA.onTargetRate,1),fmt(sB.onTargetRate,1),false],
  ];
  var tbody = rows.map(function(r) {
    return '<tr><td class="num-a">' + r[1] + '</td><td class="lbl">' + r[0] + '</td><td class="num-b">' + r[2] + '</td></tr>';
  }).join('');
  return _section(T('report.shot_stats'),
    '<table class="cmp-table">' +
    '<thead><tr><th class="num-a">' + escapeHtml(match.team_A) + '</th><th class="lbl"></th><th class="num-b">' + escapeHtml(match.team_B) + '</th></tr></thead>' +
    '<tbody>' + tbody + '</tbody></table>');
}

function _sectionSituations(situation, match) {
  var sits = [
    { key: 'manUp',    label: 'Man-up ↑'   },
    { key: 'equal',    label: '5v5 ·'      },
    { key: 'manDown',  label: 'Man-down ↓' },
    { key: 'fastBreak',label: 'Fast break →'},
  ];
  var rows = sits.map(function(s) {
    var dA = situation[s.key].A, dB = situation[s.key].B;
    if (!dA || !dB) return '';
    if (dA.shots === 0 && dB.shots === 0) return '';
    return '<tr>' +
      '<td class="num-a">' + dA.shots + '/' + dA.goals + ' (' + (dA.rate === '—' ? '—' : dA.rate + '%') + ')</td>' +
      '<td class="lbl">' + s.label + '</td>' +
      '<td class="num-b">' + dB.shots + '/' + dB.goals + ' (' + (dB.rate === '—' ? '—' : dB.rate + '%') + ')</td>' +
    '</tr>';
  }).filter(Boolean).join('');
  if (!rows) return '';
  return _section(T('report.situations'),
    '<table class="cmp-table">' +
    '<thead><tr><th class="num-a">' + escapeHtml(match.team_A) + '</th><th class="lbl">' + T('report.situations_th') + '</th><th class="num-b">' + escapeHtml(match.team_B) + '</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>');
}

function _sectionGoalies(goalies, match) {
  var fmt = function(v) { return v === '—' ? '—' : v + '%'; };

  function sideHtml(side, teamName) {
    var g = goalies[side];
    if (!g) return '';
    var list = g.goalies && g.goalies.length > 0 ? g.goalies : null;
    if (!list) {
      return '<tr><td class="lbl" colspan="2">' + escapeHtml(teamName) + ' ' + T('report.goalies.no_number') + '</td>' +
        '<td>' + g.saves + '</td><td>' + g.goalsAgainst + '</td><td>' + g.shotsOnGoal + '</td><td>' + fmt(g.savePct) + '</td></tr>';
    }
    return list.map(function(gi) {
      var nr = gi.number !== null ? '#' + gi.number : T('report.goalies.no_nr');
      return '<tr><td class="lbl">' + escapeHtml(teamName) + '</td><td>' + nr + '</td>' +
        '<td>' + gi.saves + '</td><td>' + gi.goalsAgainst + '</td><td>' + gi.shotsOnGoal + '</td><td>' + fmt(gi.savePct) + '</td></tr>';
    }).join('');
  }

  return _section(T('report.goalies'),
    '<table class="data-table">' +
    '<thead><tr><th>' + T('report.goalies.team') + '</th><th>' + T('report.goalies.nr') + '</th><th>' + T('report.goalies.saves') + '</th><th>' + T('report.goalies.goals_ag') + '</th><th>' + T('report.goalies.shots_on') + '</th><th>' + T('report.goalies.save_pct') + '</th></tr></thead>' +
    '<tbody>' + sideHtml('A', match.team_A) + sideHtml('B', match.team_B) + '</tbody></table>');
}

function _sectionPerPeriod(perPeriod, match) {
  var rows = perPeriod.map(function(p) {
    return '<tr><td class="lbl">' + periodLabel(p.period) + '</td>' +
      '<td class="num-a">' + p.A_shots + ' (' + p.A_goals + ' ' + T('report.per_period.goals') + ')</td>' +
      '<td class="num-b">' + p.B_shots + ' (' + p.B_goals + ' ' + T('report.per_period.goals') + ')</td></tr>';
  }).join('');
  if (!rows) return '';
  return _section(T('report.per_period'),
    '<table class="cmp-table">' +
    '<thead><tr><th class="lbl">' + T('report.per_period.period') + '</th><th class="num-a">' + escapeHtml(match.team_A) + '</th><th class="num-b">' + escapeHtml(match.team_B) + '</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>');
}

function _sectionShotCharts(svgA, svgB, match) {
  var legendHtml = buildFieldLegend(null, {}).outerHTML;
  return '<div class="section page-break">' +
    '<h2>' + T('report.shot_chart') + '</h2>' +
    '<div class="shot-charts">' +
      '<div class="chart-col">' +
        '<div class="chart-label team-a">' + escapeHtml(match.team_A) + '</div>' +
        '<div class="chart-svg">' + svgA + '</div>' +
      '</div>' +
      '<div class="chart-col">' +
        '<div class="chart-label team-b">' + escapeHtml(match.team_B) + '</div>' +
        '<div class="chart-svg">' + svgB + '</div>' +
      '</div>' +
    '</div>' +
    legendHtml +
  '</div>';
}

// ── Analytics report sections ─────────────────────────────────────────────────

function _sectionAnalyticsSummary(s, filtered, f) {
  var matchCount = new Set(filtered.map(function(e) { return String(e.match_id); })).size;
  var rows = [
    [T('report.rows.match_count'), matchCount],
    [T('report.rows.shots_short'), s.total],
    [T('report.rows.goals_short'), s.goals],
    [T('report.rows.on_target_short'), s.onTarget],
    [T('report.rows.eff'), s.pct + '%'],
    [T('report.rows.on_pct'), s.onPct + '%'],
  ];
  if (s.manUp)     rows.push(['Man-up',     s.manUp]);
  if (s.manDown)   rows.push(['Man-down',   s.manDown]);
  if (s.fastBreak) rows.push(['Fast break', s.fastBreak]);

  var cells = rows.map(function(r) {
    return '<div class="sum-cell"><div class="sum-val">' + r[1] + '</div><div class="sum-lbl">' + r[0] + '</div></div>';
  }).join('');

  return _section(T('report.summary'), '<div class="summary-grid">' + cells + '</div>');
}

function _sectionAnalyticsZones(s) {
  var zoneOrder = ['attack-center','attack-left','attack-right','midfield-center','midfield-left','midfield-right','own-half'];
  var zoneLabels = {
    'attack-center':   T('zone.attack_center'),
    'attack-left':     T('zone.attack_left'),
    'attack-right':    T('zone.attack_right'),
    'midfield-center': T('zone.midfield_center'),
    'midfield-left':   T('zone.midfield_left'),
    'midfield-right':  T('zone.midfield_right'),
    'own-half':        T('zone.own_half'),
  };
  var rows = zoneOrder.filter(function(z) { return s.zones[z]; }).map(function(z) {
    var cnt = s.zones[z];
    var pct = Math.round(cnt / s.total * 100);
    return '<tr><td>' + zoneLabels[z] + '</td><td class="num">' + cnt + '</td><td class="num">' + pct + '%</td></tr>';
  }).join('');
  if (!rows) return '';
  return _section(T('report.zones'),
    '<table class="data-table">' +
    '<thead><tr><th>' + T('analytics.zones.zone') + '</th><th>' + T('report.rows.shots_short') + '</th><th>%</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>');
}

function _sectionAnalyticsPeriods(s) {
  var entries = Object.entries(s.periods).sort(function(a, b) {
    var aOT = a[0].startsWith('OT'), bOT = b[0].startsWith('OT');
    if (!aOT && !bOT) return Number(a[0]) - Number(b[0]);
    if (!aOT) return -1; if (!bOT) return 1;
    return Number(a[0].slice(2)) - Number(b[0].slice(2));
  });
  var rows = entries.map(function(kv) {
    var p = kv[0], v = kv[1];
    var pct = v.total > 0 ? Math.round(v.goals / v.total * 100) : 0;
    return '<tr><td>' + periodLabel(p) + '</td><td class="num">' + v.total + '</td><td class="num">' + v.goals + '</td><td class="num">' + pct + '%</td></tr>';
  }).join('');
  if (!rows) return '';
  return _section(T('report.periods'),
    '<table class="data-table">' +
    '<thead><tr><th>' + T('report.per_period.period') + '</th><th>' + T('report.rows.shots_short') + '</th><th>' + T('report.rows.goals_short') + '</th><th>' + T('report.periods.rate') + '</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>');
}

function _sectionAnalyticsSituations(s) {
  var sits = [
    s.situations.manUp,
    s.situations.even,
    s.situations.manDown,
    s.situations.fastBreak,
  ].filter(function(sit) { return sit.total > 0; });
  if (!sits.length) return '';
  var rows = sits.map(function(sit) {
    return '<tr><td>' + sit.label + '</td><td class="num">' + sit.total + '</td><td class="num">' + sit.goals + '</td><td class="num">' + sit.pct + '%</td></tr>';
  }).join('');
  return _section(T('report.situations_lbl'),
    '<table class="data-table">' +
    '<thead><tr><th>' + T('report.situations_th') + '</th><th>' + T('report.rows.shots_short') + '</th><th>' + T('report.rows.goals_short') + '</th><th>' + T('report.periods.rate') + '</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>');
}

function _sectionAnalyticsGoalies(data) {
  if (!data || !data.list || data.list.length === 0) return '';
  var rows = data.list.map(function(g) {
    var nr   = g.number !== null ? '#' + g.number : '—';
    var pct  = g.savePct !== null ? g.savePct + '%' : '—';
    return '<tr><td>' + escapeHtml(g.team) + '</td><td>' + nr + '</td>' +
      '<td class="num">' + g.matchCount + '</td>' +
      '<td class="num">' + g.shotsOnGoal + '</td>' +
      '<td class="num">' + g.saves + '</td>' +
      '<td class="num">' + g.goalsAgainst + '</td>' +
      '<td class="num">' + pct + '</td></tr>';
  }).join('');
  return _section(T('report.goalies'),
    '<table class="data-table">' +
    '<thead><tr><th>' + T('report.goalies.team') + '</th><th>' + T('report.goalies.nr') + '</th><th>' + T('analytics.goalies.matches') + '</th><th>' + T('report.goalies.shots_on') + '</th><th>' + T('report.goalies.saves') + '</th><th>' + T('report.goalies.goals_ag') + '</th><th>' + T('report.goalies.save_pct') + '</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>');
}

function _sectionAnalyticsShotCharts(svgOff, svgDef, teamName) {
  return '<div class="section">' +
    '<h2>' + T('report.shot_chart') + ' — ' + escapeHtml(teamName) + '</h2>' +
    '<div class="shot-charts">' +
      (svgOff ? '<div class="chart-col"><div class="chart-sublabel">' + T('report.shots_fired') + '</div><div class="chart-svg">' + svgOff + '</div></div>' : '') +
      (svgDef ? '<div class="chart-col"><div class="chart-sublabel">' + T('report.shots_conceded') + '</div><div class="chart-svg">' + svgDef + '</div></div>' : '') +
    '</div>' +
    buildFieldLegend(null, {}).outerHTML +
  '</div>';
}

function _sectionMatchHistory(filtered, allEvents, allMatches, f) {
  if (!f.team) return '';
  var matchIds = new Set(filtered.map(function(e) { return String(e.match_id); }));
  var relevant = allMatches.filter(function(m) {
    return (m.team_A === f.team || m.team_B === f.team) && matchIds.has(String(m.id));
  }).sort(function(a, b) { return String(b.match_date).localeCompare(String(a.match_date)); });
  if (!relevant.length) return '';

  var rows = relevant.map(function(m) {
    var mEvs   = allEvents.filter(function(e) { return String(e.match_id) === String(m.id); });
    var goalsA = mEvs.filter(function(e) { return e.team_event === m.team_A && e.result === 'gol'; }).length;
    var goalsB = mEvs.filter(function(e) { return e.team_event === m.team_B && e.result === 'gol'; }).length;
    var opp    = m.team_A === f.team ? m.team_B : m.team_A;
    var myG    = m.team_A === f.team ? goalsA   : goalsB;
    var oppG   = m.team_A === f.team ? goalsB   : goalsA;
    var result = mEvs.length === 0 ? '— : —' : myG + ' : ' + oppG;
    var cls    = mEvs.length === 0 ? '' : myG > oppG ? 'won' : myG === oppG ? 'drew' : 'lost';
    return '<tr class="' + cls + '"><td>' + escapeHtml(String(m.match_date || '')) + '</td>' +
      '<td>' + escapeHtml(m.tournament || '—') + '</td>' +
      '<td>' + escapeHtml(opp) + '</td>' +
      '<td class="num">' + result + '</td></tr>';
  }).join('');

  return _section(T('report.history') + ' — ' + escapeHtml(f.team),
    '<table class="data-table">' +
    '<thead><tr><th>' + T('analytics.history.date') + '</th><th>' + T('analytics.history.tournament') + '</th><th>' + T('analytics.history.opponent') + '</th><th>' + T('analytics.history.result') + '</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _section(title, bodyHtml) {
  return '<div class="section"><h2>' + title + '</h2>' + bodyHtml + '</div>';
}

function _reportHalfFieldSvg(shotEvents, teamName, useSlotB) {
  var ns  = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 540 660');
  svg.setAttribute('xmlns', ns);
  var slot       = useSlotB ? 'B' : 'A';
  var mockMatch  = useSlotB
    ? { id: '__report__', team_A: '__other__', team_B: teamName, team_A_side: 'left' }
    : { id: '__report__', team_A: teamName,    team_B: '__other__', team_A_side: 'left' };
  var mockEvents = shotEvents.map(function(e) { return Object.assign({}, e, { team_event: teamName }); });
  var mockViewer = { view_mode: 'half-' + slot, display_mode: 'markers' };
  drawHalfFieldChart(svg, mockMatch, mockEvents, mockViewer);
  return svg.outerHTML;
}

// ── CSS ───────────────────────────────────────────────────────────────────────

function _reportCss() {
  return [
    '@page{size:A4;margin:14mm 12mm}',
    '*{box-sizing:border-box;margin:0;padding:0}',
    'body{font-family:Arial,sans-serif;font-size:10pt;color:#111;background:#fff;line-height:1.4}',
    '.doc-header{display:flex;align-items:baseline;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:4pt;margin-bottom:12pt}',
    '.doc-title{font-size:15pt;font-weight:700}',
    '.doc-subtitle{font-size:9pt;color:#555;margin-left:10pt;flex:1}',
    '.doc-brand{font-size:8pt;color:#888}',
    '.match-banner{text-align:center;padding:8pt 0}',
    '.banner-score{font-size:20pt;font-weight:700;margin-bottom:4pt}',
    '.banner-meta{font-size:9pt;color:#555}',
    '.team-a{color:#1d4ed8}',
    '.team-b{color:#b91c1c}',
    '.score-num{margin:0 12pt;color:#111}',
    '.section{margin-bottom:14pt;page-break-inside:avoid}',
    '.section h2{font-size:11pt;font-weight:700;border-bottom:1px solid #ccc;padding-bottom:2pt;margin-bottom:6pt}',
    '.page-break{page-break-before:always}',
    '.cmp-table{width:100%;border-collapse:collapse;font-size:9.5pt}',
    '.cmp-table th,.cmp-table td{padding:3pt 6pt;border:1px solid #ddd}',
    '.cmp-table .num-a{text-align:right;color:#1d4ed8;font-weight:600;width:22%}',
    '.cmp-table .num-b{text-align:left;color:#b91c1c;font-weight:600;width:22%}',
    '.cmp-table .lbl{text-align:center;color:#374151;width:56%}',
    '.cmp-table thead th{background:#f3f4f6;font-weight:700;font-size:9pt}',
    '.cmp-table thead .num-a{text-align:center}',
    '.cmp-table thead .num-b{text-align:center}',
    '.data-table{width:100%;border-collapse:collapse;font-size:9.5pt}',
    '.data-table th,.data-table td{padding:3pt 6pt;border:1px solid #ddd}',
    '.data-table thead th{background:#f3f4f6;font-weight:700;text-align:left}',
    '.data-table .num{text-align:right}',
    '.won td:last-child{font-weight:700;color:#15803d}',
    '.drew td:last-child{color:#6b7280}',
    '.lost td:last-child{font-weight:700;color:#b91c1c}',
    '.summary-grid{display:flex;flex-wrap:wrap;gap:6pt}',
    '.sum-cell{border:1px solid #e5e7eb;border-radius:4pt;padding:4pt 8pt;min-width:60pt;text-align:center}',
    '.sum-val{font-size:14pt;font-weight:700;color:#111}',
    '.sum-lbl{font-size:8pt;color:#6b7280}',
    '.shot-charts{display:flex;gap:12pt}',
    '.chart-col{flex:1;text-align:center}',
    '.chart-label{font-weight:700;font-size:10pt;margin-bottom:4pt}',
    '.chart-sublabel{font-size:9pt;color:#6b7280;margin-bottom:3pt;text-align:center}',
    '.chart-svg svg{width:100%;height:auto}',
    '.chart-team-row{margin-bottom:10pt;page-break-inside:avoid}',
    '.chart-team-label{font-weight:700;font-size:10pt;margin-bottom:5pt;padding-bottom:2pt;border-bottom:1px solid #e5e7eb}',
    '.field-legend{display:flex;gap:10pt;flex-wrap:wrap;font-size:8pt;color:#6b7280;margin-top:4pt;padding-top:4pt;border-top:1px solid #e5e7eb}',
    '.leg-item{display:flex;align-items:center;gap:4px}',
    '.leg-item svg{flex-shrink:0}',
  ].join('\n');
}
