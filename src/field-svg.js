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
  fieldG.appendChild(svgEl('rect', { x: 0, y: 0, width: 1100, height: 600, fill: '#9bbf85', class: 'field-bg' }));

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
  const markings = svgEl('g', { class: 'field-markings' });
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

  if (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.variant === 'field') {
    fieldG.appendChild(buildFieldLacrosseRozki(1100, 600));
  }

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
    const isMissed = e.result === 'niecelny';
    const isGroundball = e.event_type === 'groundball';
    const isDraw        = e.event_type === 'draw';
    const dotR = isLatest ? 11 : 7;
    const sw = isLatest ? (isOwnHalf ? 4 : 3) : (isOwnHalf ? 3 : 2);

    // Man-up / man-down outer ring (rendered before dot so dot sits on top)
    if (e.man_up || e.man_down) {
      const ringAttrs = {
        cx: sx, cy: sy,
        r: dotR + 5,
        fill: 'transparent',
        stroke: e.man_up ? '#f59e0b' : '#7c3aed',
        'stroke-width': 2,
      };
      if (e.man_down) ringAttrs['stroke-dasharray'] = '3,2';
      markersG.appendChild(svgEl('circle', ringAttrs));
    }

    let markerEl;
    if (isGroundball) {
      const s = dotR - 2;
      markerEl = svgEl('rect', {
        x: sx - s, y: sy - s, width: s * 2, height: s * 2,
        fill: fillColor, stroke: isOwnHalf ? '#ca8a04' : 'white', 'stroke-width': sw,
        class: 'marker' + (isLatest ? ' latest' : '')
      });
    } else if (isDraw) {
      const s = dotR;
      const points = `${sx},${sy - s} ${sx - s * 0.87},${sy + s * 0.5} ${sx + s * 0.87},${sy + s * 0.5}`;
      markerEl = svgEl('polygon', {
        points, fill: fillColor, stroke: isOwnHalf ? '#ca8a04' : 'white', 'stroke-width': sw,
        class: 'marker' + (isLatest ? ' latest' : '')
      });
    } else if (isMissed) {
      const s = dotR - 2;
      const xColor = isOwnHalf ? '#ca8a04' : fillColor;
      markerEl = svgEl('g', { class: 'marker' + (isLatest ? ' latest' : '') });
      markerEl.appendChild(svgEl('line', { x1: sx - s, y1: sy - s, x2: sx + s, y2: sy + s, stroke: xColor, 'stroke-width': sw, 'stroke-linecap': 'round' }));
      markerEl.appendChild(svgEl('line', { x1: sx + s, y1: sy - s, x2: sx - s, y2: sy + s, stroke: xColor, 'stroke-width': sw, 'stroke-linecap': 'round' }));
    } else {
      markerEl = svgEl('circle', {
        cx: sx, cy: sy,
        r: dotR,
        fill: isGoal ? fillColor : 'transparent',
        stroke: isOwnHalf ? '#ca8a04' : (isGoal ? 'white' : fillColor),
        'stroke-width': sw,
        class: 'marker' + (isLatest ? ' latest' : '')
      });
    }

    if (e.assisted || e.free_position || e.penalty_shot) {
      const g = svgEl('g');
      g.appendChild(markerEl);
      if (e.assisted) {
        const bx = sx + dotR - 2;
        const by = sy - dotR + 2;
        g.appendChild(svgEl('circle', { cx: bx, cy: by, r: 6, fill: '#f59e0b', stroke: 'white', 'stroke-width': 1 }));
        const t = svgEl('text', { x: bx, y: by + 0.5, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
          'font-size': 7, 'font-weight': 'bold', fill: 'white' });
        t.textContent = 'A';
        g.appendChild(t);
      }
      if (e.free_position) {
        const bx = sx - dotR + 2;
        const by = sy - dotR + 2;
        g.appendChild(svgEl('circle', { cx: bx, cy: by, r: 6, fill: '#0891b2', stroke: 'white', 'stroke-width': 1 }));
        const t = svgEl('text', { x: bx, y: by + 0.5, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
          'font-size': 7, 'font-weight': 'bold', fill: 'white' });
        t.textContent = 'W';
        g.appendChild(t);
      }
      if (e.penalty_shot) {
        const bx = sx - dotR + 2;
        const by = sy + dotR - 2;
        g.appendChild(svgEl('circle', { cx: bx, cy: by, r: 6, fill: '#dc2626', stroke: 'white', 'stroke-width': 1 }));
        const t = svgEl('text', { x: bx, y: by + 0.5, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
          'font-size': 7, 'font-weight': 'bold', fill: 'white' });
        t.textContent = 'K';
        g.appendChild(t);
      }
      markersG.appendChild(g);
    } else {
      markersG.appendChild(markerEl);
    }

    if (e.fast_break) {
      const ax = sx + dotR + 7;
      const tip = ax + 16;
      markersG.appendChild(svgEl('line', { x1: ax, y1: sy, x2: tip, y2: sy, stroke: 'white', 'stroke-width': 5, 'stroke-linecap': 'round' }));
      markersG.appendChild(svgEl('line', { x1: tip - 7, y1: sy - 7, x2: tip, y2: sy, stroke: 'white', 'stroke-width': 5, 'stroke-linecap': 'round' }));
      markersG.appendChild(svgEl('line', { x1: tip - 7, y1: sy + 7, x2: tip, y2: sy, stroke: 'white', 'stroke-width': 5, 'stroke-linecap': 'round' }));
      markersG.appendChild(svgEl('line', { x1: ax, y1: sy, x2: tip, y2: sy, stroke: '#10b981', 'stroke-width': 3, 'stroke-linecap': 'round' }));
      markersG.appendChild(svgEl('line', { x1: tip - 7, y1: sy - 7, x2: tip, y2: sy, stroke: '#10b981', 'stroke-width': 3, 'stroke-linecap': 'round' }));
      markersG.appendChild(svgEl('line', { x1: tip - 7, y1: sy + 7, x2: tip, y2: sy, stroke: '#10b981', 'stroke-width': 3, 'stroke-linecap': 'round' }));
    }
  });
  fieldG.appendChild(markersG);

  drawZoneLabels(fieldG, APP.match.team_A_side);

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
        zone_name: 'own-half',
        click_x: x, click_y: y,
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
      zone_name: det.zone,
      click_x: x, click_y: y,
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

// Klastry dla aktualnego widoku (view_mode/display_mode) — używane zarówno przy
// rysowaniu mapy, jak i przez kartę szczegółów rozwiniętego klastra w panelu
// bocznym (renderViewerClusterDetailCard), żeby obie strony widziały te same ID.
function computeViewerClusters(match, filtered, viewer) {
  if (viewer.display_mode === 'heatmap') return [];
  let items;
  if (viewer.view_mode === 'full') {
    items = buildFullFieldItems(filtered, match);
  } else {
    const teamSlot_ = viewer.view_mode === 'half-A' ? 'A' : 'B';
    const teamName  = teamSlot_ === 'A' ? match.team_A : match.team_B;
    const teamColor = teamSlot_ === 'A' ? '#1d4ed8' : '#b91c1c';
    const teamShots = filtered.filter(e => e.team_event === teamName && e.shot_x >= 0);
    items = buildHalfFieldItems(teamShots, teamSlot_, teamColor);
  }
  const clusters = clusteringEnabled()
    ? clusterMarkers(items)
    : items.map(it => ({ team: it.team, cx: it.cx, cy: it.cy, count: 1, members: [it] }));
  clusters.forEach(c => { c.id = clusterIdFor(c); });
  return clusters;
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
  note.textContent = T('field.canonical_note');
  sideLabels.appendChild(note);
  svg.appendChild(sideLabels);

  const fieldG = svgEl('g', { transform: 'translate(0, 50)' });
  drawFieldMarkings(fieldG, 1100, 600);
  drawShotsFullField(fieldG, filtered, match, viewer.display_mode);
  drawZoneLabels(fieldG, 'left');  // canonical viewer: A always attacks right
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
  title.textContent = `${teamName} — ${T('field.attack_up')}`;
  svg.appendChild(title);

  const fieldG = svgEl('g', { transform: 'translate(0, 50)' });
  // Half-field 540 wide × 600 tall (one offensive half, goal at top).
  fieldG.appendChild(svgEl('rect', { x: 0, y: 0, width: 540, height: 600, fill: '#9bbf85', class: 'field-bg' }));
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

  if (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.variant === 'field') {
    fieldG.appendChild(buildFieldLacrosseRozkiHalf());
  }

  // Plot only shots with shot_x ≥ 0 (skip own-half).
  // Rotation mapping: attacker shot_x (0→1, center→end) → cy = (1 − shot_x) × 600 (bottom→top).
  //                   attacker shot_y (0→1, attacker-left→right) → cx = shot_y × 540.
  const chartShots = teamShots.filter(e => e.shot_x >= 0);
  if (viewer.display_mode === 'heatmap') {
    chartShots.forEach(e => drawHeatBlob(fieldG, e.shot_y * 540, (1 - e.shot_x) * 600, teamColor));
  } else {
    renderClusteredMarkers(fieldG, buildHalfFieldItems(chartShots, teamSlot_, teamColor), 540, 600);
  }

  svg.appendChild(fieldG);
}

function drawFieldMarkings(g, w, h) {
  g.appendChild(svgEl('rect',   { x: 0, y: 0, width: w, height: h, fill: '#9bbf85', class: 'field-bg' }));
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
  if (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.variant === 'field') {
    g.appendChild(buildFieldLacrosseRozki(w, h));
  }
}

function buildFullFieldItems(events, match) {
  // Canonical orientation: A on left attacking right (team_A_side='left')
  return events.map(e => {
    const slot = teamSlot(match.id, e.team_event);
    const color = slot === 'A' ? '#1d4ed8' : '#b91c1c';
    const { physical_x, physical_y } = attackerToPhysical(e.shot_x, e.shot_y, slot, 'left');
    return { event: e, team: slot, color, cx: physical_x * 1100, cy: physical_y * 600 };
  });
}

function buildHalfFieldItems(chartShots, teamSlot_, teamColor) {
  return chartShots.map(e => ({ event: e, team: teamSlot_, color: teamColor, cx: e.shot_y * 540, cy: (1 - e.shot_x) * 600 }));
}

// Stabilny (per skład członków) identyfikator klastra — używany do zapamiętania,
// który bąbel jest rozwinięty (APP.viewer.expandedClusterId), mimo że klastry są
// przeliczane od zera przy każdym renderze.
function clusterIdFor(cluster) {
  return cluster.members.map(it => String(it.event.id)).sort().join('|');
}

// Współdzielone przez pełne boisko i połówkę: pojedyncze markery i bąble bez
// zmian, a bąbel wskazany w APP.viewer.expandedClusterId renderuje się jako
// rozwinięty wachlarz (drawExpandedCluster) — reszta markerów/bąbli na widoku
// zostaje przygaszona, żeby wachlarz był jednoznacznie na pierwszym planie.
function clusteringEnabled() {
  return !APP.viewer || APP.viewer.clustering_enabled !== false;
}

function renderClusteredMarkers(g, items, fieldW, fieldH) {
  const clusters = clusteringEnabled()
    ? clusterMarkers(items)
    : items.map(it => ({ team: it.team, cx: it.cx, cy: it.cy, count: 1, members: [it] }));
  clusters.forEach(c => { c.id = clusterIdFor(c); });

  const expandedId = APP.viewer && APP.viewer.expandedClusterId;
  let expandedCluster = null;
  const collapsedEls = [];

  clusters.forEach(cluster => {
    if (cluster.count > 1 && cluster.id === expandedId) {
      expandedCluster = cluster;
      return;
    }
    const wrap = svgEl('g');
    if (cluster.count === 1) {
      const it = cluster.members[0], e = it.event;
      drawShotMarker(wrap, it.cx, it.cy, it.color, e.result, e.zone_name === 'own-half', e.man_up, e.man_down, e.assisted, e.fast_break, e.free_position, e.penalty_shot, e.event_type);
    } else {
      drawClusterBubble(wrap, cluster.cx, cluster.cy, cluster.count, cluster.members[0].color, cluster.id);
    }
    g.appendChild(wrap);
    collapsedEls.push(wrap);
  });

  if (expandedCluster) {
    drawExpandedCluster(g, expandedCluster, fieldW, fieldH);
    collapsedEls.forEach(el => el.setAttribute('opacity', '0.25'));
  }
}

function drawShotsFullField(g, events, match, displayMode) {
  const items = buildFullFieldItems(events, match);
  if (displayMode === 'heatmap') {
    items.forEach(it => drawHeatBlob(g, it.cx, it.cy, it.color));
    return;
  }
  renderClusteredMarkers(g, items, 1100, 600);
}

function drawShotMarker(g, cx, cy, color, result, isOwnHalf, manUp, manDown, hasAssist, fastBreak, freePosition, penaltyShot, eventType) {
  const isGoal       = result === 'gol';
  const isMissed      = result === 'niecelny';
  const isGroundball  = eventType === 'groundball';
  const isDraw        = eventType === 'draw';
  const strokeColor = isOwnHalf ? '#ca8a04' : color;

  // Man-up / man-down outer ring (rendered first, behind marker)
  if (manUp || manDown) {
    const ringAttrs = {
      cx, cy, r: 12,
      fill: 'transparent',
      stroke: manUp ? '#f59e0b' : '#7c3aed',
      'stroke-width': 2,
    };
    if (manDown) ringAttrs['stroke-dasharray'] = '3,2';
    g.appendChild(svgEl('circle', ringAttrs));
  }

  if (isGroundball) {
    const s = 6;
    g.appendChild(svgEl('rect', { x: cx - s, y: cy - s, width: s * 2, height: s * 2, fill: color, stroke: isOwnHalf ? '#ca8a04' : 'white', 'stroke-width': 2 }));
  } else if (isDraw) {
    const s = 7.5;
    const points = `${cx},${cy - s} ${cx - s * 0.87},${cy + s * 0.5} ${cx + s * 0.87},${cy + s * 0.5}`;
    g.appendChild(svgEl('polygon', { points, fill: color, stroke: isOwnHalf ? '#ca8a04' : 'white', 'stroke-width': 2 }));
  } else if (isMissed) {
    const s = 5;
    g.appendChild(svgEl('line', { x1: cx - s, y1: cy - s, x2: cx + s, y2: cy + s, stroke: strokeColor, 'stroke-width': 2 }));
    g.appendChild(svgEl('line', { x1: cx + s, y1: cy - s, x2: cx - s, y2: cy + s, stroke: strokeColor, 'stroke-width': 2 }));
  } else {
    g.appendChild(svgEl('circle', {
      cx, cy, r: 7,
      fill: isGoal ? color : 'transparent',
      stroke: isOwnHalf ? '#ca8a04' : (isGoal ? 'white' : color),
      'stroke-width': 2
    }));
  }

  if (hasAssist) {
    g.appendChild(svgEl('circle', { cx: cx + 5, cy: cy - 5, r: 5, fill: '#f59e0b', stroke: 'white', 'stroke-width': 1 }));
    const t = svgEl('text', {
      x: cx + 5, y: cy - 4.5,
      'text-anchor': 'middle', 'dominant-baseline': 'middle',
      'font-size': 6, 'font-weight': 'bold', fill: 'white'
    });
    t.textContent = 'A';
    g.appendChild(t);
  }

  if (freePosition) {
    g.appendChild(svgEl('circle', { cx: cx - 5, cy: cy - 5, r: 5, fill: '#0891b2', stroke: 'white', 'stroke-width': 1 }));
    const t = svgEl('text', {
      x: cx - 5, y: cy - 4.5,
      'text-anchor': 'middle', 'dominant-baseline': 'middle',
      'font-size': 6, 'font-weight': 'bold', fill: 'white'
    });
    t.textContent = 'W';
    g.appendChild(t);
  }

  if (penaltyShot) {
    g.appendChild(svgEl('circle', { cx: cx - 5, cy: cy + 5, r: 5, fill: '#dc2626', stroke: 'white', 'stroke-width': 1 }));
    const t = svgEl('text', {
      x: cx - 5, y: cy + 5.5,
      'text-anchor': 'middle', 'dominant-baseline': 'middle',
      'font-size': 6, 'font-weight': 'bold', fill: 'white'
    });
    t.textContent = 'K';
    g.appendChild(t);
  }

  if (fastBreak) {
    const ax = cx + 10;
    const tip = ax + 16;
    // white outline for contrast on green field
    g.appendChild(svgEl('line', { x1: ax, y1: cy, x2: tip, y2: cy, stroke: 'white', 'stroke-width': 5, 'stroke-linecap': 'round' }));
    g.appendChild(svgEl('line', { x1: tip - 7, y1: cy - 7, x2: tip, y2: cy, stroke: 'white', 'stroke-width': 5, 'stroke-linecap': 'round' }));
    g.appendChild(svgEl('line', { x1: tip - 7, y1: cy + 7, x2: tip, y2: cy, stroke: 'white', 'stroke-width': 5, 'stroke-linecap': 'round' }));
    // teal fill on top
    g.appendChild(svgEl('line', { x1: ax, y1: cy, x2: tip, y2: cy, stroke: '#10b981', 'stroke-width': 3, 'stroke-linecap': 'round' }));
    g.appendChild(svgEl('line', { x1: tip - 7, y1: cy - 7, x2: tip, y2: cy, stroke: '#10b981', 'stroke-width': 3, 'stroke-linecap': 'round' }));
    g.appendChild(svgEl('line', { x1: tip - 7, y1: cy + 7, x2: tip, y2: cy, stroke: '#10b981', 'stroke-width': 3, 'stroke-linecap': 'round' }));
  }
}

// ── Etykiety stref A1–B6 (F-04) ──────────────────────────────────────────────

function drawZoneLabels(g, team_A_side) {
  const A_atk_right = team_A_side === 'left';
  // X-centers (SVG field coords, 1100px wide)
  // Attack/midfield boundary at shot_x=0.4368 → physical_x=0.7184 → 790px (right side)
  //                                                                  0.2816 → 310px (left side)
  const aAtckX = A_atk_right ? 945 : 155;  // center of attack zone for A
  const aMidX  = A_atk_right ? 670 : 430;  // center of midfield zone for A
  const bAtckX = A_atk_right ? 155 : 945;
  const bMidX  = A_atk_right ? 430 : 670;
  // Y-centers: left/center/right from attacker's POV
  // Attacking right: left=top(100), center=mid(300), right=bottom(500)
  // Attacking left:  left=bottom(500), center=mid(300), right=top(100)
  const aY = A_atk_right ? [100, 300, 500] : [500, 300, 100];
  const bY = A_atk_right ? [500, 300, 100] : [100, 300, 500];

  const items = [
    { l: 'A1', x: aAtckX, y: aY[0] }, { l: 'A2', x: aAtckX, y: aY[1] }, { l: 'A3', x: aAtckX, y: aY[2] },
    { l: 'A4', x: aMidX,  y: aY[0] }, { l: 'A5', x: aMidX,  y: aY[1] }, { l: 'A6', x: aMidX,  y: aY[2] },
    { l: 'B1', x: bAtckX, y: bY[0] }, { l: 'B2', x: bAtckX, y: bY[1] }, { l: 'B3', x: bAtckX, y: bY[2] },
    { l: 'B4', x: bMidX,  y: bY[0] }, { l: 'B5', x: bMidX,  y: bY[1] }, { l: 'B6', x: bMidX,  y: bY[2] },
  ];
  items.forEach(({ l, x, y }) => {
    const t = svgEl('text', {
      x, y, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      'font-size': 11, fill: '#9ca3af', 'pointer-events': 'none', 'font-weight': '600'
    });
    t.textContent = l;
    g.appendChild(t);
  });
}

// ── Legenda mapy boiska (F-03) ────────────────────────────────────────────────

function buildFieldLegend(match, opts) {
  opts = opts || {};
  const div = document.createElement('div');
  div.className = 'field-legend';
  div.innerHTML = `
    <span class="leg-item">
      <svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" fill="#1d4ed8"/></svg>
      ${T('legend.goal')} (A)
    </span>
    <span class="leg-item">
      <svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5" fill="none" stroke="#1d4ed8" stroke-width="2"/></svg>
      ${T('legend.on_target')} (A)
    </span>
    <span class="leg-item">
      <svg width="14" height="14" viewBox="0 0 14 14">
        <line x1="2" y1="2" x2="12" y2="12" stroke="#1d4ed8" stroke-width="2"/>
        <line x1="12" y1="2" x2="2" y2="12" stroke="#1d4ed8" stroke-width="2"/>
      </svg>
      ${T('legend.off_target')} (A)
    </span>
    <span class="leg-item">
      <svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" fill="#b91c1c"/></svg>
      ${T('legend.goal')} (B)
    </span>
    <span class="leg-item">
      <svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5" fill="none" stroke="#b91c1c" stroke-width="2"/></svg>
      ${T('legend.on_target')} (B)
    </span>
    <span class="leg-item">
      <svg width="14" height="14" viewBox="0 0 14 14">
        <line x1="2" y1="2" x2="12" y2="12" stroke="#b91c1c" stroke-width="2"/>
        <line x1="12" y1="2" x2="2" y2="12" stroke="#b91c1c" stroke-width="2"/>
      </svg>
      ${T('legend.off_target')} (B)
    </span>
    ${opts.includeManUp ? `
    <span class="leg-item">
      <svg width="20" height="20" viewBox="0 0 20 20">
        <circle cx="10" cy="10" r="9" fill="none" stroke="#f59e0b" stroke-width="1.5"/>
        <circle cx="10" cy="10" r="5" fill="#1d4ed8"/>
      </svg>
      ${T('legend.man_up')}
    </span>
    <span class="leg-item">
      <svg width="20" height="20" viewBox="0 0 20 20">
        <circle cx="10" cy="10" r="9" fill="none" stroke="#7c3aed" stroke-width="1.5" stroke-dasharray="3,2"/>
        <circle cx="10" cy="10" r="5" fill="#1d4ed8"/>
      </svg>
      ${T('legend.man_down')}
    </span>
    ` : ''}
    <span class="leg-item">
      <svg width="22" height="14" viewBox="0 0 22 14">
        <circle cx="7" cy="7" r="6" fill="#1d4ed8"/>
        <circle cx="17" cy="3" r="4" fill="#f59e0b"/>
        <text x="17" y="3.5" text-anchor="middle" dominant-baseline="middle" font-size="5" font-weight="bold" fill="white">A</text>
      </svg>
      ${T('legend.assisted')}
    </span>
    <span class="leg-item">
      <svg width="24" height="14" viewBox="0 0 24 14">
        <circle cx="6" cy="7" r="5" fill="none" stroke="#10b981" stroke-width="2"/>
        <line x1="12" y1="7" x2="19" y2="7" stroke="#10b981" stroke-width="2" stroke-linecap="round"/>
        <polyline points="16,4 19,7 16,10" fill="none" stroke="#10b981" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      </svg>
      ${T('legend.fast_break')}
    </span>
    <span class="leg-item">
      <svg width="14" height="14" viewBox="0 0 14 14"><rect x="2" y="2" width="10" height="10" fill="#6b7280" stroke="white" stroke-width="1.5"/></svg>
      ${T('legend.groundball')}
    </span>
    <span class="leg-item">
      <svg width="14" height="14" viewBox="0 0 14 14"><polygon points="7,1 13,12 1,12" fill="#6b7280" stroke="white" stroke-width="1.5"/></svg>
      ${T('legend.draw')}
    </span>
    ${(opts.includeFieldShotTypes || (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.variant === 'field')) ? `
    <span class="leg-item">
      <svg width="22" height="14" viewBox="0 0 22 14">
        <circle cx="9" cy="7" r="6" fill="#1d4ed8"/>
        <circle cx="3" cy="1" r="4" fill="#0891b2" stroke="white" stroke-width="1"/>
        <text x="3" y="1.5" text-anchor="middle" dominant-baseline="middle" font-size="5" font-weight="bold" fill="white">W</text>
      </svg>
      ${T('legend.free_position')}
    </span>
    <span class="leg-item">
      <svg width="22" height="14" viewBox="0 0 22 14">
        <circle cx="9" cy="7" r="6" fill="#1d4ed8"/>
        <circle cx="3" cy="13" r="4" fill="#dc2626" stroke="white" stroke-width="1"/>
        <text x="3" y="13.5" text-anchor="middle" dominant-baseline="middle" font-size="5" font-weight="bold" fill="white">K</text>
      </svg>
      ${T('legend.penalty_shot')}
    </span>
    ` : ''}
  `;
  return div;
}

// ==================== FIELD LACROSSE VARIANT MARKINGS ====================

// Returns an SVG <g> with additional lines specific to field lacrosse (variant='field'):
// GLE (3m–15m), łuk 15m, rózki + łuk 11m z kreskami hash, punkty 4m, koło środkowe 9m.
// Coordinates are defined for the base 1100×600 canvas and scaled to the given w/h
// (same convention as drawFieldMarkings). Crease/goal-mouth stay canonical (r=30) —
// drawn separately in drawFieldMarkings so charts remain comparable across variants.
function buildFieldLacrosseRozki(w, h) {
  const g = svgEl('g', { class: 'field-lacrosse-rozki' });
  const scaleX = w / 1100;
  const scaleY = h / 600;
  const sx = x => x * scaleX;
  const sy = y => y * scaleY;

  const line = (x1, y1, x2, y2, opts = {}) => g.appendChild(svgEl('line', {
    x1: sx(x1), y1: sy(y1), x2: sx(x2), y2: sy(y2),
    stroke: 'white', 'stroke-width': 1.5, ...opts
  }));
  const arc = (x1, y1, rBase, sweep, x2, y2, opts = {}) => g.appendChild(svgEl('path', {
    d: `M ${sx(x1)} ${sy(y1)} A ${rBase * scaleX} ${rBase * scaleY} 0 0 ${sweep} ${sx(x2)} ${sy(y2)}`,
    stroke: 'white', fill: 'none', 'stroke-width': 1.5, ...opts
  }));

  // GLE — 3m–15m od środka bramki, po obu stronach
  line(150, 135, 150, 267, { opacity: 0.8 });
  line(150, 333, 150, 465, { opacity: 0.8 });
  line(950, 135, 950, 267, { opacity: 0.8 });
  line(950, 333, 950, 465, { opacity: 0.8 });

  // Łuk 15m
  arc(150, 135, 165, 1, 150, 465, { opacity: 0.7 });
  arc(950, 135, 165, 0, 950, 465, { opacity: 0.7 });

  // Rózki + łuk 11m
  line(150, 270, 219.2, 200.8);
  line(150, 330, 219.2, 399.2);
  arc(219.2, 200.8, 121, 1, 219.2, 399.2);
  line(950, 270, 880.8, 200.8);
  line(950, 330, 880.8, 399.2);
  arc(880.8, 200.8, 121, 0, 880.8, 399.2);

  // Kreski hash na łuku 11m (7 marks: center + ±2×4m + ostatnia para na styku rurek ~55°)
  [
    [267, 300, 275, 300], [259.4, 341.6, 266.8, 344.5], [259.4, 258.4, 266.8, 255.5],
    [237.4, 377.8, 243.4, 383.1], [237.4, 222.2, 243.4, 216.9],
    [216.9, 396.0, 221.5, 402.5], [216.9, 204.0, 221.5, 197.5],
  ].forEach(([x1, y1, x2, y2]) => line(x1, y1, x2, y2));
  [
    [825, 300, 833, 300], [833.2, 344.5, 840.6, 341.6], [833.2, 255.5, 840.6, 258.4],
    [856.6, 383.1, 862.6, 377.8], [856.6, 216.9, 862.6, 222.2],
    [878.5, 402.5, 883.1, 396.0], [878.5, 197.5, 883.1, 204.0],
  ].forEach(([x1, y1, x2, y2]) => line(x1, y1, x2, y2));

  // Punkty 4m od linii końcowej
  const dotR = 4 * Math.min(scaleX, scaleY);
  [[44, 135], [44, 465], [1056, 135], [1056, 465]].forEach(([x, y]) => {
    g.appendChild(svgEl('circle', { cx: sx(x), cy: sy(y), r: dotR, fill: 'white' }));
  });

  // Koło środkowe 9m
  g.appendChild(svgEl('ellipse', {
    cx: sx(550), cy: sy(300), rx: 99 * scaleX, ry: 99 * scaleY,
    fill: 'none', stroke: 'white', 'stroke-width': 1.5, opacity: 0.7
  }));

  return g;
}

// Half-field equivalent of buildFieldLacrosseRozki, pre-computed for the fixed
// 540×600 half-field canvas used by drawHalfFieldChart. Derived from the full-field
// markings via the right-goal transform: cx = sy_full * 0.9, cy = (1100 - sx_full) * 12/11.
function buildFieldLacrosseRozkiHalf() {
  const g = svgEl('g', { class: 'field-lacrosse-rozki' });
  const line = (x1, y1, x2, y2) => g.appendChild(svgEl('line', {
    x1, y1, x2, y2, stroke: 'white', 'stroke-width': 1.5
  }));

  // Łuk 15m
  g.appendChild(svgEl('path', {
    d: 'M 121.5 163.64 A 148.5 180 0 0 0 270 343.64 A 148.5 180 0 0 0 418.5 163.64',
    stroke: 'white', fill: 'none', 'stroke-width': 1.5, opacity: 0.7
  }));

  // Rózki + łuk 11m
  line(243, 163.64, 180.7, 239.1);
  line(297, 163.64, 359.3, 239.1);
  g.appendChild(svgEl('path', {
    d: 'M 180.7 239.1 A 109 132 0 0 0 359.3 239.1',
    stroke: 'white', fill: 'none', 'stroke-width': 1.5
  }));

  // Kreski hash na łuku 11m
  [
    [270, 300, 270, 291.3], [310.1, 291.1, 307.4, 283.0], [230.0, 291.1, 232.6, 283.0],
    [344.8, 265.8, 340.0, 259.3], [195.2, 265.8, 200.0, 259.3],
    [362.3, 241.6, 356.4, 236.6], [177.8, 241.6, 183.6, 236.6],
  ].forEach(([x1, y1, x2, y2]) => line(x1, y1, x2, y2));

  // Punkty 4m od linii końcowej
  g.appendChild(svgEl('circle', { cx: 121.5, cy: 48, r: 4, fill: 'white' }));
  g.appendChild(svgEl('circle', { cx: 418.5, cy: 48, r: 4, fill: 'white' }));

  // Koło środkowe 9m (połowa widoczna od linii środkowej, sklejona z drugą połową boiska)
  g.appendChild(svgEl('ellipse', {
    cx: 270, cy: 600, rx: 89.1, ry: 108,
    fill: 'none', stroke: 'white', 'stroke-width': 1.5, opacity: 0.7
  }));

  return g;
}

function drawHeatBlob(g, cx, cy, color) {
  const rgb = color === '#1d4ed8' ? '29, 78, 216' : '185, 28, 28';
  g.appendChild(svgEl('circle', { cx, cy, r: 35, fill: `rgba(${rgb}, 0.18)`, stroke: 'none' }));
  g.appendChild(svgEl('circle', { cx, cy, r: 3,  fill: `rgba(${rgb}, 0.7)`,  stroke: 'none' }));
}

// Zbiorczy bąbel dla klastra >1 zdarzenia (patrz clusterMarkers w algorithms.js).
function drawClusterBubble(g, cx, cy, count, color, clusterId) {
  const r = clusterBubbleRadius(count);
  const circle = svgEl('circle', {
    cx, cy, r, fill: color, opacity: 0.6, stroke: 'white', 'stroke-width': 2,
    style: 'cursor:pointer'
  });
  if (clusterId) {
    circle.setAttribute('data-action', 'viewer-toggle-cluster');
    circle.setAttribute('data-arg', clusterId);
  }
  g.appendChild(circle);
  const t = svgEl('text', {
    x: cx, y: cy, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
    'font-size': 12, 'font-weight': 700, fill: 'white', 'pointer-events': 'none'
  });
  t.textContent = String(count);
  g.appendChild(t);
}

// Rozwinięcie bąbla: biały hub z liczbą w centroidzie klastra, człony rozstawione
// po okręgu wokół huba i połączone przerywanymi liniami. Pozycje na okręgu są
// czysto wizualne (do rozdzielenia nakładających się punktów) — nie są prawdziwą
// lokalizacją strzału. Hub jest odsuwany od krawędzi boiska, żeby wachlarz nigdy
// nie wychodził poza pole gry.
function drawExpandedCluster(g, cluster, fieldW, fieldH) {
  const n = cluster.count;
  const fanR = Math.min(90, 30 + n * 4);
  const margin = fanR + 16;
  const hubX = Math.min(fieldW - margin, Math.max(margin, cluster.cx));
  const hubY = Math.min(fieldH - margin, Math.max(margin, cluster.cy));
  const color = cluster.members[0].color;

  const fanG = svgEl('g', { class: 'cluster-expanded' });

  cluster.members.forEach((it, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    const mx = hubX + fanR * Math.cos(angle);
    const my = hubY + fanR * Math.sin(angle);
    fanG.appendChild(svgEl('line', {
      x1: hubX, y1: hubY, x2: mx, y2: my,
      stroke: 'white', 'stroke-width': 1.5, 'stroke-dasharray': '3,3', opacity: 0.8
    }));
    const e = it.event;
    drawShotMarker(fanG, mx, my, it.color, e.result, e.zone_name === 'own-half', e.man_up, e.man_down, e.assisted, e.fast_break, e.free_position, e.penalty_shot, e.event_type);
  });

  const hub = svgEl('circle', {
    cx: hubX, cy: hubY, r: 16, fill: 'white', stroke: color, 'stroke-width': 3,
    style: 'cursor:pointer', 'data-action': 'viewer-toggle-cluster', 'data-arg': cluster.id
  });
  fanG.appendChild(hub);
  const hubText = svgEl('text', {
    x: hubX, y: hubY, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
    'font-size': 13, 'font-weight': 700, fill: color, 'pointer-events': 'none'
  });
  hubText.textContent = String(n);
  fanG.appendChild(hubText);

  g.appendChild(fanG);
}
