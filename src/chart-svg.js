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
    const text = periodLabel(lab);
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
