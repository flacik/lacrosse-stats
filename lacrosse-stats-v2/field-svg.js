'use strict';

// SVG rendering of the lacrosse field — input mode (interactive) and viewer mode (read-only).

// ==================== INPUT MODE FIELD ====================

function buildFieldSvg(match) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'field');
  svg.setAttribute('id', 'field-svg');
  svg.setAttribute('viewBox', '0 0 1100 700');
  svg.setAttribute('xmlns', ns);

  // Side labels (top strip 50px)
  const A_left = APP.match.team_A_side === 'left';
  const sideLabels = svgEl('g');
  const leftLabel = svgEl('text', {
    x: 100, y: 35, 'font-size': 22, 'font-weight': 700,
    fill: A_left ? '#1d4ed8' : '#b91c1c'
  });
  leftLabel.textContent = `${A_left ? match.team_A : match.team_B} →`;
  sideLabels.appendChild(leftLabel);
  const rightLabel = svgEl('text', {
    x: 1000, y: 35, 'text-anchor': 'end',
    'font-size': 22, 'font-weight': 700,
    fill: A_left ? '#b91c1c' : '#1d4ed8'
  });
  rightLabel.textContent = `← ${A_left ? match.team_B : match.team_A}`;
  sideLabels.appendChild(rightLabel);
  svg.appendChild(sideLabels);

  const fieldG = svgEl('g', { transform: 'translate(0, 50)' });
  fieldG.appendChild(svgEl('rect', { x: 0, y: 0, width: 1100, height: 600, fill: '#9bbf85' }));

  // Zone overlay (toggleable)
  if (APP.match.show_zones) {
    const zonesG = svgEl('g', { class: 'zone-overlay' });
    getZoneLayout().forEach(z => {
      const team = getTeamForHalf(z.half, APP.match.team_A_side);
      const color = ZONE_COLORS[`${team}-${z.zone}`] || '#888';
      zonesG.appendChild(svgEl('rect', {
        x: z.x, y: z.y, width: z.w, height: z.h, fill: color, class: 'zone-rect'
      }));
      const t = svgEl('text', {
        x: z.x + z.w / 2, y: z.y + z.h / 2 + 12, class: 'zone-label-team'
      });
      t.textContent = team;
      zonesG.appendChild(t);
    });
    fieldG.appendChild(zonesG);
  }

  // Field markings
  const markings = svgEl('g');
  markings.innerHTML = `
    <line x1="550" y1="0" x2="550" y2="600" stroke="white" stroke-width="2"/>
    <line x1="540" y1="290" x2="560" y2="310" stroke="white" stroke-width="2"/>
    <line x1="540" y1="310" x2="560" y2="290" stroke="white" stroke-width="2"/>
    <line x1="150" y1="0" x2="150" y2="600" stroke="white" stroke-width="1.5" opacity="0.7"/>
    <line x1="950" y1="0" x2="950" y2="600" stroke="white" stroke-width="1.5" opacity="0.7"/>
    <line x1="350" y1="0" x2="350" y2="600" stroke="white" stroke-width="1.5" stroke-dasharray="6,4" opacity="0.85"/>
    <line x1="750" y1="0" x2="750" y2="600" stroke="white" stroke-width="1.5" stroke-dasharray="6,4" opacity="0.85"/>
    <rect x="0" y="0" width="1100" height="600" fill="none" stroke="white" stroke-width="3"/>
    <circle cx="150" cy="300" r="30" fill="#9bbf85" stroke="white" stroke-width="2"/>
    <circle cx="950" cy="300" r="30" fill="#9bbf85" stroke="white" stroke-width="2"/>
    <line x1="150" y1="288" x2="150" y2="312" stroke="white" stroke-width="5"/>
    <line x1="950" y1="288" x2="950" y2="312" stroke="white" stroke-width="5"/>
  `;
  fieldG.appendChild(markings);

  // Markers (history dots) — convert attacker-relative to physical
  const markersG = svgEl('g');
  const events = eventsForMatch(match.id);
  events.forEach((e, i) => {
    const teamSlotName = teamSlot(match.id, e.team_event);
    const { physical_x, physical_y } = attackerToPhysical(e.shot_x, e.shot_y, teamSlotName, APP.match.team_A_side);
    const sx = physical_x * 1100;
    const sy = physical_y * 600;
    const isLatest = i === 0;
    const fillColor = teamSlotName === 'A' ? '#1d4ed8' : '#b91c1c';
    const isOwnHalf = e.zone_name === 'own-half';
    const isGoal = e.result === 'gol';
    const dot = svgEl('circle', {
      cx: sx, cy: sy,
      r: isLatest ? 11 : 7,
      fill: isGoal ? fillColor : 'transparent',
      stroke: isOwnHalf ? '#ca8a04' : (isGoal ? 'white' : fillColor),
      'stroke-width': isLatest ? (isOwnHalf ? 4 : 3) : (isOwnHalf ? 3 : 2),
      class: 'marker' + (isLatest ? ' latest' : '')
    });
    markersG.appendChild(dot);
  });
  fieldG.appendChild(markersG);

  svg.appendChild(fieldG);
  svg.addEventListener('click', handleFieldClick);
  return svg;
}

function handleFieldClick(ev) {
  const svg = ev.currentTarget;
  const pt = svg.createSVGPoint();
  pt.x = ev.clientX; pt.y = ev.clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return;
  const svgPt = pt.matrixTransform(ctm.inverse());
  const fieldY = svgPt.y - 50;
  if (fieldY < 0 || fieldY > 600) return;
  const x = svgPt.x / 1100;
  const y = fieldY / 600;
  if (x < 0 || x > 1) return;

  const match = DATA.scheduledMatches.find(m => m.id === APP.matchId);
  if (!match) return;

  if (APP.match.own_half_mode === 'active') {
    const teamSlotChosen = detectOwnHalfTeam(x, APP.match.team_A_side);
    const teamName = teamSlotChosen === 'A' ? match.team_A : match.team_B;
    const { shot_x, shot_y } = physicalToAttacker(x, y, teamSlotChosen, APP.match.team_A_side);
    APP.match.own_half_mode = null;
    APP.banner = null;
    APP.modal = {
      type: 'result',
      pending: {
        shot_x, shot_y,
        team_event: teamName, team_slot: teamSlotChosen,
        zone_name: 'own-half'
      }
    };
    render();
    return;
  }

  const det = detectZone(x, y, APP.match.team_A_side);
  const teamName = det.team === 'A' ? match.team_A : match.team_B;
  APP.modal = {
    type: 'result',
    pending: {
      shot_x: det.shot_x, shot_y: det.shot_y,
      team_event: teamName, team_slot: det.team,
      zone_name: det.zone
    }
  };
  render();
}

// ==================== VIEWER MODE CHARTS ====================

function buildViewerChart(match, filtered) {
  const v = APP.viewer;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'field');
  svg.setAttribute('xmlns', ns);

  if (v.view_mode === 'full') {
    svg.setAttribute('viewBox', '0 0 1100 700');
    drawFullFieldChart(svg, match, filtered, v);
  } else {
    svg.setAttribute('viewBox', '0 0 540 660');
    svg.setAttribute('class', 'field field-half');
    drawHalfFieldChart(svg, match, filtered, v);
  }
  return svg;
}

function drawFullFieldChart(svg, match, filtered, viewer) {
  const sideLabels = svgEl('g');
  const lLab = svgEl('text', { x: 100, y: 35, 'font-size': 22, 'font-weight': 700, fill: '#1d4ed8' });
  lLab.textContent = `${match.team_A} →`;
  sideLabels.appendChild(lLab);
  const rLab = svgEl('text', { x: 1000, y: 35, 'text-anchor': 'end', 'font-size': 22, 'font-weight': 700, fill: '#b91c1c' });
  rLab.textContent = `← ${match.team_B}`;
  sideLabels.appendChild(rLab);
  const note = svgEl('text', { x: 550, y: 35, 'text-anchor': 'middle', 'font-size': 11, fill: '#999' });
  note.textContent = 'widok kanoniczny — A zawsze po lewej';
  sideLabels.appendChild(note);
  svg.appendChild(sideLabels);

  const fieldG = svgEl('g', { transform: 'translate(0, 50)' });
  drawFieldMarkings(fieldG, 1100, 600);
  drawShotsFullField(fieldG, filtered, match, viewer.display_mode);
  svg.appendChild(fieldG);
}

function drawHalfFieldChart(svg, match, filtered, viewer) {
  const teamSlot_ = viewer.view_mode === 'half-A' ? 'A' : 'B';
  const teamName  = teamSlot_ === 'A' ? match.team_A : match.team_B;
  const teamColor = teamSlot_ === 'A' ? '#1d4ed8'   : '#b91c1c';
  const teamShots = filtered.filter(e => e.team_event === teamName);

  // Portrait orientation: attack axis goes upward, goal at the top.
  // viewBox: 540 wide × 660 tall (50px title strip + 600 tall field + 10px buffer).
  const title = svgEl('text', { x: 270, y: 28, 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 700, fill: teamColor });
  title.textContent = `${teamName} — atak ↑ (bramka u góry)`;
  svg.appendChild(title);

  const fieldG = svgEl('g', { transform: 'translate(0, 50)' });
  // Half-field 540 wide × 600 tall (one offensive half, goal at top).
  fieldG.appendChild(svgEl('rect', { x: 0, y: 0, width: 540, height: 600, fill: '#9bbf85' }));
  // Center line at the bottom (where attack starts).
  fieldG.appendChild(svgEl('line', { x1: 0, y1: 600, x2: 540, y2: 600, stroke: 'white', 'stroke-width': 3 }));
  // Restraining line (attacker_progress 0.4368 → cy = (1 − 0.4368) × 600 ≈ 337.92).
  fieldG.appendChild(svgEl('line', { x1: 0, y1: 337.92, x2: 540, y2: 337.92, stroke: 'white', 'stroke-width': 1.5, 'stroke-dasharray': '6,4', opacity: 0.85 }));
  // Goal line (attacker_progress 40/55 ≈ 0.7273 → cy ≈ 163.64).
  fieldG.appendChild(svgEl('line', { x1: 0, y1: 163.64, x2: 540, y2: 163.64, stroke: 'white', 'stroke-width': 1.5, opacity: 0.7 }));
  // End line at the top.
  fieldG.appendChild(svgEl('line', { x1: 0, y1: 0, x2: 540, y2: 0, stroke: 'white', 'stroke-width': 3 }));
  // Side lines (left and right).
  fieldG.appendChild(svgEl('line', { x1: 0,   y1: 0, x2: 0,   y2: 600, stroke: 'white', 'stroke-width': 3 }));
  fieldG.appendChild(svgEl('line', { x1: 540, y1: 0, x2: 540, y2: 600, stroke: 'white', 'stroke-width': 3 }));
  // Crease + goal mouth at the goal line.
  fieldG.appendChild(svgEl('circle', { cx: 270, cy: 163.64, r: 27, fill: '#9bbf85', stroke: 'white', 'stroke-width': 2 }));
  fieldG.appendChild(svgEl('line',   { x1: 258, y1: 163.64, x2: 282, y2: 163.64, stroke: 'white', 'stroke-width': 5 }));

  // Plot only shots with shot_x ≥ 0 (skip own-half).
  // Rotation mapping: attacker shot_x (0→1, center→end) → cy = (1 − shot_x) × 600 (bottom→top).
  //                   attacker shot_y (0→1, attacker-left→right) → cx = shot_y × 540.
  const chartShots = teamShots.filter(e => e.shot_x >= 0);
  chartShots.forEach(e => {
    const cx = e.shot_y * 540;
    const cy = (1 - e.shot_x) * 600;
    if (viewer.display_mode === 'heatmap') drawHeatBlob(fieldG, cx, cy, teamColor);
    else                                    drawShotMarker(fieldG, cx, cy, teamColor, e.result, false);
  });

  svg.appendChild(fieldG);
}

function drawFieldMarkings(g, w, h) {
  g.appendChild(svgEl('rect',   { x: 0, y: 0, width: w, height: h, fill: '#9bbf85' }));
  g.appendChild(svgEl('line',   { x1: w / 2, y1: 0, x2: w / 2, y2: h, stroke: 'white', 'stroke-width': 2 }));
  g.appendChild(svgEl('line',   { x1: w / 2 - 10, y1: h / 2 - 10, x2: w / 2 + 10, y2: h / 2 + 10, stroke: 'white', 'stroke-width': 2 }));
  g.appendChild(svgEl('line',   { x1: w / 2 - 10, y1: h / 2 + 10, x2: w / 2 + 10, y2: h / 2 - 10, stroke: 'white', 'stroke-width': 2 }));
  g.appendChild(svgEl('line',   { x1: w * 150 / 1100, y1: 0, x2: w * 150 / 1100, y2: h, stroke: 'white', 'stroke-width': 1.5, opacity: 0.7 }));
  g.appendChild(svgEl('line',   { x1: w * 950 / 1100, y1: 0, x2: w * 950 / 1100, y2: h, stroke: 'white', 'stroke-width': 1.5, opacity: 0.7 }));
  g.appendChild(svgEl('line',   { x1: w * 350 / 1100, y1: 0, x2: w * 350 / 1100, y2: h, stroke: 'white', 'stroke-width': 1.5, 'stroke-dasharray': '6,4', opacity: 0.85 }));
  g.appendChild(svgEl('line',   { x1: w * 750 / 1100, y1: 0, x2: w * 750 / 1100, y2: h, stroke: 'white', 'stroke-width': 1.5, 'stroke-dasharray': '6,4', opacity: 0.85 }));
  g.appendChild(svgEl('rect',   { x: 0, y: 0, width: w, height: h, fill: 'none', stroke: 'white', 'stroke-width': 3 }));
  g.appendChild(svgEl('circle', { cx: w * 150 / 1100, cy: h / 2, r: 30, fill: '#9bbf85', stroke: 'white', 'stroke-width': 2 }));
  g.appendChild(svgEl('circle', { cx: w * 950 / 1100, cy: h / 2, r: 30, fill: '#9bbf85', stroke: 'white', 'stroke-width': 2 }));
  g.appendChild(svgEl('line',   { x1: w * 150 / 1100, y1: h / 2 - 12, x2: w * 150 / 1100, y2: h / 2 + 12, stroke: 'white', 'stroke-width': 5 }));
  g.appendChild(svgEl('line',   { x1: w * 950 / 1100, y1: h / 2 - 12, x2: w * 950 / 1100, y2: h / 2 + 12, stroke: 'white', 'stroke-width': 5 }));
}

function drawShotsFullField(g, events, match, displayMode) {
  // Canonical orientation: A on left attacking right (team_A_side='left')
  events.forEach(e => {
    const slot = teamSlot(match.id, e.team_event);
    const color = slot === 'A' ? '#1d4ed8' : '#b91c1c';
    const { physical_x, physical_y } = attackerToPhysical(e.shot_x, e.shot_y, slot, 'left');
    const cx = physical_x * 1100;
    const cy = physical_y * 600;
    if (displayMode === 'heatmap') drawHeatBlob(g, cx, cy, color);
    else                            drawShotMarker(g, cx, cy, color, e.result, e.zone_name === 'own-half');
  });
}

function drawShotMarker(g, cx, cy, color, result, isOwnHalf) {
  const isGoal = result === 'gol';
  const dot = svgEl('circle', {
    cx, cy, r: 7,
    fill: isGoal ? color : 'transparent',
    stroke: isOwnHalf ? '#ca8a04' : (isGoal ? 'white' : color),
    'stroke-width': isOwnHalf ? 3 : 2
  });
  g.appendChild(dot);
}

function drawHeatBlob(g, cx, cy, color) {
  const rgb = color === '#1d4ed8' ? '29, 78, 216' : '185, 28, 28';
  g.appendChild(svgEl('circle', { cx, cy, r: 35, fill: `rgba(${rgb}, 0.18)`, stroke: 'none' }));
  g.appendChild(svgEl('circle', { cx, cy, r: 3,  fill: `rgba(${rgb}, 0.7)`,  stroke: 'none' }));
}
