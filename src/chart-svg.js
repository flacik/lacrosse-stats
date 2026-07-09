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
