'use strict';

// Generic helpers used everywhere — no project-specific logic.

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function svgEl(name, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', name);
  Object.entries(attrs || {}).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

function uuid() {
  return 'ev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Buduje HTML badge'ów obecności.
 * selfMode: 'input' | 'viewer' | null — tryb bieżącego użytkownika (do odjęcia siebie)
 */
function _renderPresenceBadge(inputCount, viewerCount, selfMode) {
  const editors = selfMode === 'input' ? Math.max(0, inputCount - 1) : inputCount;
  const viewers = selfMode === 'viewer' ? Math.max(0, viewerCount - 1) : viewerCount;
  if (editors === 0 && viewers === 0) return '';
  const parts = [];
  if (editors > 0) parts.push(`<span class="presence-badge presence-badge-input" title="${editors} ${T_n(editors, 'presence.editor_1', 'presence.editor_n')}">✏️ ${editors}</span>`);
  if (viewers > 0) parts.push(`<span class="presence-badge presence-badge-viewer" title="${viewers} ${T_n(viewers, 'presence.viewer_1', 'presence.viewer_n')}">👁 ${viewers}</span>`);
  return parts.join('');
}
