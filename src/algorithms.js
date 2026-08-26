'use strict';

// Pure functions: zone detection, coord transforms, zone layout & colors.
// No state dependencies — everything passed via arguments.
// Coord convention: shot_x ∈ [-1, 1] in attacker frame (0 = midline, 1 = opponent end line, negatives = own half).
// shot_y ∈ [0, 1] (0 = attacker's left, 1 = attacker's right).

const ATTACK_THRESHOLD = 0.4368;  // attack/midfield boundary in attacker progress (restraining line + 20%)

function detectZone(px, py, team_A_side) {
  const A_attacks_right = team_A_side === 'left';
  const click_left_half = px < 0.5;
  const shooter_team = click_left_half
    ? (A_attacks_right ? 'B' : 'A')
    : (A_attacks_right ? 'A' : 'B');
  const shooter_attacks_right =
    (shooter_team === 'A' && A_attacks_right) ||
    (shooter_team === 'B' && !A_attacks_right);
  let shot_x = shooter_attacks_right ? (px - 0.5) * 2 : (0.5 - px) * 2;
  if (shot_x < 0) shot_x = 0;
  const shot_y = shooter_attacks_right ? py : (1 - py);
  const zone_long = shot_x > ATTACK_THRESHOLD ? 'attack' : 'midfield';
  let zone_lat;
  if (shot_y < 1/3) zone_lat = 'left';
  else if (shot_y < 2/3) zone_lat = 'center';
  else zone_lat = 'right';
  return { team: shooter_team, zone: `${zone_long}-${zone_lat}`, shot_x, shot_y };
}

// Own-half mode: detect team based on which half clicked (defensive half = own half of shooter)
function detectOwnHalfTeam(x, team_A_side) {
  const click_left_half = x < 0.5;
  if (click_left_half) return team_A_side === 'left' ? 'A' : 'B';
  return team_A_side === 'right' ? 'A' : 'B';
}

// Physical click + team + sides → attacker-relative coords. Used for own-half (shot_x is negative).
function physicalToAttacker(px, py, team_slot, team_A_side) {
  const A_attacks_right = team_A_side === 'left';
  const shooter_attacks_right =
    (team_slot === 'A' && A_attacks_right) ||
    (team_slot === 'B' && !A_attacks_right);
  const shot_x = shooter_attacks_right ? (px - 0.5) * 2 : (0.5 - px) * 2;
  const shot_y = shooter_attacks_right ? py : (1 - py);
  return { shot_x, shot_y };
}

// Zone name from attacker-relative coords, for an explicitly chosen team
// (groundball/draw — team isn't inferred from the clicked half, so shot_x
// can legitimately come out negative for that team even on a "normal" click).
function zoneForAttackerCoords(shot_x, shot_y) {
  if (shot_x < 0) return 'own-half';
  const zone_long = shot_x > ATTACK_THRESHOLD ? 'attack' : 'midfield';
  let zone_lat;
  if (shot_y < 1/3) zone_lat = 'left';
  else if (shot_y < 2/3) zone_lat = 'center';
  else zone_lat = 'right';
  return `${zone_long}-${zone_lat}`;
}

// Attacker-relative → physical for current sides (used to render markers).
function attackerToPhysical(shot_x, shot_y, team_slot, team_A_side) {
  const A_attacks_right = team_A_side === 'left';
  const shooter_attacks_right =
    (team_slot === 'A' && A_attacks_right) ||
    (team_slot === 'B' && !A_attacks_right);
  const physical_x = shooter_attacks_right ? (0.5 + shot_x * 0.5) : (0.5 - shot_x * 0.5);
  const physical_y = shooter_attacks_right ? shot_y : (1 - shot_y);
  return { physical_x, physical_y };
}

// SVG zone overlay rectangles (12 cells, physical positions on 1100×600 grid).
function getZoneLayout() {
  const TX = 790, TM = 310, T1 = 200, T2 = 400;
  return [
    { x: TX, y: 0,   w: 1100-TX, h: T1,     zone: 'attack-left',     half: 'right' },
    { x: TX, y: T1,  w: 1100-TX, h: T2-T1,  zone: 'attack-center',   half: 'right' },
    { x: TX, y: T2,  w: 1100-TX, h: 600-T2, zone: 'attack-right',    half: 'right' },
    { x: 550, y: 0,  w: TX-550,  h: T1,     zone: 'midfield-left',   half: 'right' },
    { x: 550, y: T1, w: TX-550,  h: T2-T1,  zone: 'midfield-center', half: 'right' },
    { x: 550, y: T2, w: TX-550,  h: 600-T2, zone: 'midfield-right',  half: 'right' },
    { x: 0,   y: T2, w: TM,      h: 600-T2, zone: 'attack-left',     half: 'left'  },
    { x: 0,   y: T1, w: TM,      h: T2-T1,  zone: 'attack-center',   half: 'left'  },
    { x: 0,   y: 0,  w: TM,      h: T1,     zone: 'attack-right',    half: 'left'  },
    { x: TM,  y: T2, w: 550-TM,  h: 600-T2, zone: 'midfield-left',   half: 'left'  },
    { x: TM,  y: T1, w: 550-TM,  h: T2-T1,  zone: 'midfield-center', half: 'left'  },
    { x: TM,  y: 0,  w: 550-TM,  h: T1,     zone: 'midfield-right',  half: 'left'  }
  ];
}

function getTeamForHalf(half, team_A_side) {
  if (team_A_side === 'left') return half === 'right' ? 'A' : 'B';
  return half === 'right' ? 'B' : 'A';
}

const ZONE_COLORS = {
  'A-attack-left':     '#1e3a8a', 'A-attack-center':   '#1e40af', 'A-attack-right':    '#1e3a8a',
  'A-midfield-left':   '#3b82f6', 'A-midfield-center': '#2563eb', 'A-midfield-right':  '#3b82f6',
  'B-attack-left':     '#7f1d1d', 'B-attack-center':   '#991b1b', 'B-attack-right':    '#7f1d1d',
  'B-midfield-left':   '#ef4444', 'B-midfield-center': '#dc2626', 'B-midfield-right':  '#ef4444'
};
