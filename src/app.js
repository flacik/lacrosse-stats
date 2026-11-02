'use strict';

// Top-level render dispatcher + init.

const APP_VERSION = 'v2.6.0';

function _renderFooter(container) {
  const f = document.createElement('footer');
  f.className = 'app-footer';
  f.textContent = 'Lacrosse Stats ' + APP_VERSION;
  container.appendChild(f);
}

function render() {
  const app = document.getElementById('app');
  const prevActive = document.activeElement;
  const keepFocusId = prevActive && prevActive.id && prevActive.tagName === 'INPUT' && prevActive.type === 'search'
    ? prevActive.id : null;
  const caret = keepFocusId ? prevActive.selectionStart : null;
  app.innerHTML = '';
  if      (APP.screen === 'home')          renderHome(app);
  else if (APP.screen === 'admin')         renderAdmin(app);
  else if (APP.screen === 'match-input')   renderMatchInput(app);
  else if (APP.screen === 'match-viewer')  renderMatchViewer(app);
  else if (APP.screen === 'analytics')     renderAnalytics(app);
  else if (APP.screen === 'standings')     renderStandings(app);

  _renderFooter(app);

  // Strip stale modals from previous render
  const oldModal = document.querySelector('.modal-bg');
  if (oldModal) oldModal.remove();

  if (APP.modal) renderModal();
  _syncThemeToggle();

  if (keepFocusId) {
    const el = document.getElementById(keepFocusId);
    if (el) { el.focus(); try { el.setSelectionRange(caret, caret); } catch (_) {} }
  }
}

// Init motywu — przed pierwszym render()
(function() {
  const saved = localStorage.getItem('lax_theme');
  if (saved === 'dark' || saved === 'light') {
    document.documentElement.dataset.theme = saved;
  }
})();

function _syncThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = document.documentElement.dataset.theme === 'dark' ? '☀' : '🌙';
}

// Init — must be last after all modules loaded.
(function() {
  var buf = loadOfflineBuffer();
  if (buf.length > 0) APP.offlineBanner = buf.length;
})();
go('home');
