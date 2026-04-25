'use strict';

// Top-level render dispatcher + init.

function render() {
  const app = document.getElementById('app');
  app.innerHTML = '';
  if      (APP.screen === 'home')        renderHome(app);
  else if (APP.screen === 'match-input') renderMatchInput(app);

  // Strip stale modals from previous render
  const oldModal = document.querySelector('.modal-bg');
  if (oldModal) oldModal.remove();

  if (APP.modal) renderModal();
}

// Init — must be last after all modules loaded.
render();
