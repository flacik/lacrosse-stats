'use strict';

// Top-level render dispatcher + init.

const APP_VERSION = 'v2.0.0';

function _renderFooter(container) {
  const f = document.createElement('footer');
  f.className = 'app-footer';
  f.textContent = 'Lacrosse Stats ' + APP_VERSION;
  container.appendChild(f);
}

function render() {
  const app = document.getElementById('app');
  app.innerHTML = '';
  if      (APP.screen === 'home')          renderHome(app);
  else if (APP.screen === 'admin')         renderAdmin(app);
  else if (APP.screen === 'match-input')   renderMatchInput(app);
  else if (APP.screen === 'match-viewer')  renderMatchViewer(app);
  else if (APP.screen === 'analytics')     renderAnalytics(app);

  _renderFooter(app);

  // Strip stale modals from previous render
  const oldModal = document.querySelector('.modal-bg');
  if (oldModal) oldModal.remove();

  if (APP.modal) renderModal();
  _syncThemeToggle();
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
render();
