'use strict';

// Shared line-chart SVG builder (cumulative score / progression charts).
// Pure string builder — no DOM — so the exact same markup works in the
// live app and inside the PDF report's document.write() string.

function _niceIntegerTicks(maxVal, desiredCount) {
  desiredCount = desiredCount || 5;
  const max = Math.max(1, Math.ceil(maxVal));
  let step, topTick;
  if (max <= desiredCount) {
    step = 1;
    topTick = max;
  } else {
    step = Math.max(1, Math.ceil(max / desiredCount));
    topTick = Math.ceil(max / step) * step;
  }
  const ticks = [];
  for (let v = 0; v <= topTick; v += step) ticks.push(v);
  return { step, topTick, ticks };
}

const PROGRESSION_METRICS = ['goals', 'shots', 'onTarget', 'accuracy', 'groundballs'];

function progressionMetricLabel(metric) {
  switch (metric) {
    case 'shots':       return T('progression.metric.shots');
    case 'onTarget':    return T('progression.metric.on_target');
    case 'accuracy':    return T('progression.metric.accuracy');
    case 'groundballs': return T('progression.metric.groundballs');
    default:            return T('progression.metric.goals');
  }
}

function progressionMetricToggle(actionName, activeMetrics) {
  const buttons = PROGRESSION_METRICS.map(m =>
    `<button class="btn ${activeMetrics.includes(m) ? 'btn-active' : ''}" data-action="${actionName}" data-arg="${m}">${progressionMetricLabel(m)}</button>`
  ).join('');
  return `<div class="viewer-controls" style="margin-bottom:8px;">
    <span class="ctrl-label">${T('progression.metric.label')}</span>
    <div class="toggle-group">${buttons}</div>
  </div>`;
}

// Dash pattern per metric — lets several metrics share one chart/axis while
// staying visually distinct (color is reserved for team A vs team B).
const METRIC_DASH = {
  goals:       '',
  shots:       '6,4',
  onTarget:    '2,3',
  accuracy:    '9,3,2,3',
  groundballs: '12,4',
};

// Renders 1..N metrics × team A/B on one chart. Count-based metrics (goals,
// shots, onTarget, groundballs) share a single auto-scaled left axis since
// they're all "number of events"; accuracy (%) gets its own fixed 0–100 axis
// on the right because it isn't the same unit and would flatten the rest.
function buildMultiProgressionChartSvg(labels, teamA, teamB, metricSeries, opts) {
  opts = opts || {};
  const width  = opts.width  || 560;
  const height = opts.height || 240;

  if (!labels || labels.length < 2 || !metricSeries || metricSeries.length === 0) {
    return `<svg width="${width}" height="60" viewBox="0 0 ${width} 60"></svg>`;
  }

  const leftMetrics  = metricSeries.filter(m => m.metric !== 'accuracy');
  const rightMetrics = metricSeries.filter(m => m.metric === 'accuracy');
  const hasLeft  = leftMetrics.length > 0;
  const hasRight = rightMetrics.length > 0;

  const legendRows   = Math.ceil(metricSeries.length / 3);
  const marginLeft   = 34;
  const marginRight  = hasRight ? 34 : 14;
  const marginTop    = 24 + legendRows * 14 + 14;
  const marginBottom = 26;
  const plotW      = width - marginLeft - marginRight;
  const plotH      = height - marginTop - marginBottom;
  const plotTop    = marginTop;
  const plotBottom = plotTop + plotH;

  const leftVals = hasLeft ? leftMetrics.flatMap(m => [...m.valuesA, ...m.valuesB]) : [0];
  const { ticks: leftTicks, topTick: leftTop } = _niceIntegerTicks(Math.max(...leftVals, 1));
  const rightTop   = 100;
  const rightTicks = [0, 20, 40, 60, 80, 100];

  const yScaleLeft  = v => plotBottom - (v / leftTop) * plotH;
  const yScaleRight = v => plotBottom - (v / rightTop) * plotH;
  const xScale      = i => marginLeft + i * (plotW / (labels.length - 1));

  const leftGrid = hasLeft ? leftTicks.map(t => `
    <line x1="${marginLeft}" y1="${yScaleLeft(t)}" x2="${marginLeft + plotW}" y2="${yScaleLeft(t)}" stroke="#e5e7eb" stroke-width="1"/>
    <text x="${marginLeft - 8}" y="${yScaleLeft(t) + 4}" text-anchor="end" font-size="10" fill="#9ca3af">${t}</text>`).join('') : '';

  const rightAxis = hasRight ? rightTicks.map(t => `
    <text x="${marginLeft + plotW + 8}" y="${yScaleRight(t) + 4}" text-anchor="start" font-size="10" fill="#9ca3af">${t}%</text>`).join('') : '';

  const xLabels = labels.map((lab, i) => {
    const text = lab === 'start' ? T('progression.start') : periodLabel(lab);
    const anchor = i === 0 ? 'start' : (i === labels.length - 1 ? 'end' : 'middle');
    return `<text x="${xScale(i)}" y="${plotBottom + 16}" text-anchor="${anchor}" font-size="10" fill="#6b7280">${escapeHtml(text)}</text>`;
  }).join('');

  function seriesLine(values, color, metric) {
    const scale = metric === 'accuracy' ? yScaleRight : yScaleLeft;
    const dash  = METRIC_DASH[metric] || '';
    const points  = values.map((v, i) => `${xScale(i)},${scale(v)}`).join(' ');
    const markers = values.map((v, i) => `<circle cx="${xScale(i)}" cy="${scale(v)}" r="2.5" fill="${color}"/>`).join('');
    const dashAttr = dash ? ` stroke-dasharray="${dash}"` : '';
    return `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2"${dashAttr}/>${markers}`;
  }

  const lines = metricSeries.map(m =>
    seriesLine(m.valuesA, teamA.color, m.metric) + seriesLine(m.valuesB, teamB.color, m.metric)
  ).join('');

  const teamLegend = `
    <g>
      <rect x="0" y="6" width="12" height="3" fill="${teamA.color}"/>
      <text x="16" y="12" font-size="11" fill="#374151">${escapeHtml(teamA.label)}</text>
      <rect x="${width / 2}" y="6" width="12" height="3" fill="${teamB.color}"/>
      <text x="${width / 2 + 16}" y="12" font-size="11" fill="#374151">${escapeHtml(teamB.label)}</text>
    </g>`;

  const metricLegend = metricSeries.map((m, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = 4 + col * (width / 3);
    const y = 26 + row * 14;
    const dash = METRIC_DASH[m.metric] || '';
    const dashAttr = dash ? ` stroke-dasharray="${dash}"` : '';
    return `<line x1="${x}" y1="${y}" x2="${x + 18}" y2="${y}" stroke="#6b7280" stroke-width="2"${dashAttr}/>
      <text x="${x + 22}" y="${y + 3}" font-size="10" fill="#374151">${progressionMetricLabel(m.metric)}${m.metric === 'accuracy' ? ' (%)' : ''}</text>`;
  }).join('');

  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      ${teamLegend}
      ${metricLegend}
      ${leftGrid}
      ${rightAxis}
      ${xLabels}
      ${lines}
    </svg>`;
}

// ── Layered shooting-funnel chart (Analytics "Progresja strzelecka") ──────────
// One side's shots/onTarget/goals are nested at every period (shots >= onTarget
// >= goals), so instead of stacking sums we just fill each series to the
// x-axis and draw largest-first — the smaller, darker layers show through on
// top without any stacking math. Groundballs isn't part of that funnel, so it
// stays a plain dashed line sharing the same count axis.
const LAYERED_PALETTE = {
  scored: {
    shots:    { fill: 'rgba(133,183,235,0.55)', line: '#85B7EB' },
    onTarget: { fill: 'rgba(24,95,165,0.65)',   line: '#185FA5' },
    goals:    { fill: 'rgba(4,44,83,0.75)',     line: '#042C53' },
  },
  conceded: {
    shots:    { fill: 'rgba(240,149,149,0.55)', line: '#F09595' },
    onTarget: { fill: 'rgba(163,45,45,0.65)',   line: '#A32D2D' },
    goals:    { fill: 'rgba(80,19,19,0.75)',    line: '#501313' },
  },
};
const LAYERED_GB = { line: '#52514E', dash: '4,4' };

function _layeredPanelSvg(labels, values, side, width, height) {
  const pal = LAYERED_PALETTE[side];
  const marginLeft = 34, marginRight = 14, marginTop = 30, marginBottom = 26;
  const plotW = width - marginLeft - marginRight;
  const plotH = height - marginTop - marginBottom;
  const plotBottom = marginTop + plotH;

  const allVals = [...values.shots, ...values.onTarget, ...values.goals, ...values.groundballs];
  const { ticks, topTick } = _niceIntegerTicks(Math.max(...allVals, 1));
  const yScale = v => plotBottom - (v / topTick) * plotH;
  const xScale = i => marginLeft + i * (plotW / (labels.length - 1));

  const grid = ticks.map(t => `
    <line x1="${marginLeft}" y1="${yScale(t)}" x2="${marginLeft + plotW}" y2="${yScale(t)}" stroke="#e5e7eb" stroke-width="1"/>
    <text x="${marginLeft - 8}" y="${yScale(t) + 4}" text-anchor="end" font-size="10" fill="#9ca3af">${t}</text>`).join('');

  const xLabels = labels.map((lab, i) => {
    const text = lab === 'start' ? T('progression.start') : periodLabel(lab);
    const anchor = i === 0 ? 'start' : (i === labels.length - 1 ? 'end' : 'middle');
    return `<text x="${xScale(i)}" y="${plotBottom + 16}" text-anchor="${anchor}" font-size="10" fill="#6b7280">${escapeHtml(text)}</text>`;
  }).join('');

  function area(vals, colors) {
    const top = vals.map((v, i) => `${xScale(i)},${yScale(v)}`).join(' L ');
    const path = `M ${xScale(0)},${plotBottom} L ${top} L ${xScale(vals.length - 1)},${plotBottom} Z`;
    const border = vals.map((v, i) => `${xScale(i)},${yScale(v)}`).join(' ');
    return `<path d="${path}" fill="${colors.fill}" stroke="none"/>
      <polyline points="${border}" fill="none" stroke="${colors.line}" stroke-width="2"/>`;
  }

  function gbLine(vals) {
    const points = vals.map((v, i) => `${xScale(i)},${yScale(v)}`).join(' ');
    return `<polyline points="${points}" fill="none" stroke="${LAYERED_GB.line}" stroke-width="2" stroke-dasharray="${LAYERED_GB.dash}"/>`;
  }

  // Draw order matters here (no z-index in SVG): shots first (bottom/lightest),
  // then onTarget, then goals last (top/darkest) so each smaller layer stays visible.
  const layers = area(values.shots, pal.shots) + area(values.onTarget, pal.onTarget) +
    area(values.goals, pal.goals) + gbLine(values.groundballs);

  const legendItems = [
    { label: T('progression.metric.shots'),     color: pal.shots.line },
    { label: T('progression.metric.on_target'), color: pal.onTarget.line },
    { label: T('progression.metric.goals'),     color: pal.goals.line },
    { label: T('progression.metric.groundballs'), color: LAYERED_GB.line, dashed: true },
  ];
  const legend = legendItems.map((it, i) => {
    const x = 4 + i * (width / legendItems.length);
    return it.dashed
      ? `<line x1="${x}" y1="9" x2="${x + 10}" y2="9" stroke="${it.color}" stroke-width="2" stroke-dasharray="${LAYERED_GB.dash}"/>
         <text x="${x + 14}" y="13" font-size="10" fill="#374151">${it.label}</text>`
      : `<rect x="${x}" y="4" width="10" height="10" fill="${it.color}"/>
         <text x="${x + 14}" y="13" font-size="10" fill="#374151">${it.label}</text>`;
  }).join('');

  const lastIdx = labels.length - 1;
  const summary = `${T('progression.metric.shots')} ${values.shots[lastIdx]}, ` +
    `${T('progression.metric.on_target')} ${values.onTarget[lastIdx]}, ` +
    `${T('progression.metric.goals')} ${values.goals[lastIdx]}, ` +
    `${T('progression.metric.groundballs')} ${values.groundballs[lastIdx]}`;

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(summary)}">
    ${legend}
    ${grid}
    ${xLabels}
    ${layers}
  </svg>`;
}

// dataA/dataB: { shots: number[], onTarget: number[], goals: number[], groundballs: number[] }
// (all cumulative, same length as labels). labelA/labelB are the panel headings — either
// "Strzelone"/"Stracone" (Analytics, one team's offense vs defense) or two team names
// (Viewer, team A vs team B in a single match). Colors always follow the blue/red ramp
// regardless of what the panels are labeled.
function buildLayeredProgressionChartSvg(labels, dataA, dataB, labelA, labelB, opts) {
  opts = opts || {};
  const width  = opts.width  || 560;
  const height = opts.height || 190;
  if (!labels || labels.length < 2) {
    return `<svg width="${width}" height="60" viewBox="0 0 ${width} 60"></svg>`;
  }
  return `<div class="layered-progression">
    <div class="layered-progression-panel">
      <div class="layered-progression-panel-title">${escapeHtml(labelA)}</div>
      ${_layeredPanelSvg(labels, dataA, 'scored', width, height)}
    </div>
    <div class="layered-progression-panel">
      <div class="layered-progression-panel-title">${escapeHtml(labelB)}</div>
      ${_layeredPanelSvg(labels, dataB, 'conceded', width, height)}
    </div>
  </div>`;
}
