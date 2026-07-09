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

function buildProgressionChartSvg(labels, seriesA, seriesB, opts) {
  opts = opts || {};
  const width  = opts.width  || 480;
  const height = opts.height || 220;

  if (!labels || labels.length < 2) {
    return `<svg width="${width}" height="60" viewBox="0 0 ${width} 60"></svg>`;
  }

  const marginLeft = 34, marginRight = 14, marginTop = 32, marginBottom = 26;
  const plotLeft   = marginLeft;
  const plotTop    = marginTop;
  const plotW      = width - marginLeft - marginRight;
  const plotH      = height - marginTop - marginBottom;
  const plotBottom = plotTop + plotH;

  const maxVal = Math.max(...seriesA.values, ...seriesB.values, 1);
  const { ticks, topTick } = _niceIntegerTicks(maxVal);

  const yScale = v => plotBottom - (v / topTick) * plotH;
  const xScale = i  => plotLeft + i * (plotW / (labels.length - 1));

  const gridLines = ticks.map(t => `
    <line x1="${plotLeft}" y1="${yScale(t)}" x2="${plotLeft + plotW}" y2="${yScale(t)}" stroke="#e5e7eb" stroke-width="1"/>
    <text x="${plotLeft - 8}" y="${yScale(t) + 4}" text-anchor="end" font-size="10" fill="#9ca3af">${t}</text>`).join('');

  const xLabels = labels.map((lab, i) => {
    const text = lab === 'start' ? T('progression.start') : periodLabel(lab);
    const anchor = i === 0 ? 'start' : (i === labels.length - 1 ? 'end' : 'middle');
    return `<text x="${xScale(i)}" y="${plotBottom + 16}" text-anchor="${anchor}" font-size="10" fill="#6b7280">${escapeHtml(text)}</text>`;
  }).join('');

  function seriesLine(series) {
    const points = series.values.map((v, i) => `${xScale(i)},${yScale(v)}`).join(' ');
    const markers = series.values.map((v, i) => `<circle cx="${xScale(i)}" cy="${yScale(v)}" r="3" fill="${series.color}"/>`).join('');
    return `<polyline points="${points}" fill="none" stroke="${series.color}" stroke-width="2.5"/>${markers}`;
  }

  const lastIdx  = labels.length - 1;
  const lastA    = seriesA.values[lastIdx];
  const lastB    = seriesB.values[lastIdx];
  const endLabels = `
    <text x="${xScale(lastIdx)}" y="${yScale(lastA) - 8}" text-anchor="middle" font-size="11" font-weight="700" fill="${seriesA.color}">${lastA}</text>
    <text x="${xScale(lastIdx)}" y="${yScale(lastB) + 16}" text-anchor="middle" font-size="11" font-weight="700" fill="${seriesB.color}">${lastB}</text>`;

  const legend = `
    <g>
      <rect x="0" y="6" width="12" height="3" fill="${seriesA.color}"/>
      <text x="16" y="12" font-size="11" fill="#374151">${escapeHtml(seriesA.label)}</text>
      <rect x="${width / 2}" y="6" width="12" height="3" fill="${seriesB.color}"/>
      <text x="${width / 2 + 16}" y="12" font-size="11" fill="#374151">${escapeHtml(seriesB.label)}</text>
    </g>`;

  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      ${legend}
      ${gridLines}
      ${xLabels}
      ${seriesLine(seriesA)}
      ${seriesLine(seriesB)}
      ${endLabels}
    </svg>`;
}
