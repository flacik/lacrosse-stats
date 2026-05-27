'use strict';

// Admin screen — manage tournaments and scheduled matches (etap C).
//
// Two stacked sections in one screen:
//   1. Turnieje — global list, used as the dropdown source in match forms.
//   2. Mecze — schedule of past, today and upcoming matches; filterable.
//
// CRUD on both lists. Tournament names are denormalized into matches as plain
// strings (matching the production model in architektura-v2.md sekcja 11), so
// renaming a tournament does NOT cascade to existing matches — admin sees a
// warning if they try.

function uniqueTeamNames() {
  const names = new Set();
  (DATA.scheduledMatches || []).forEach(m => {
    if (m.team_A) names.add(m.team_A.trim());
    if (m.team_B) names.add(m.team_B.trim());
  });
  return [...names].sort((a, b) => a.localeCompare(b));
}

function renderAdmin(root) {
  if (!APP.adminFilter) {
    APP.adminFilter = {
      range: 'upcoming',          // 'upcoming' | 'today' | 'past' | 'all'
      tournament: 'all',          // 'all' | <tournament name>
      status: 'all'               // 'all' | 'scheduled' | 'live' | 'finished'
    };
  }

  const header = `
    <div class="app-header">
      <button class="btn" data-action="back-home">← Wróć</button>
      <h1>Panel admin — turnieje i harmonogram</h1>
      <span class="meta">${todayISO()}</span>
      <button class="btn" data-action="toggle-dark-mode" id="theme-toggle" title="Przełącz tryb ciemny">🌙</button>
    </div>
  `;

  if (APP.adminLoading) {
    root.innerHTML = header + `<div class="home-loading"><div class="spinner"></div><p>Ładowanie danych…</p></div>`;
    return;
  }

  if (APP.adminError) {
    root.innerHTML = header + `
      <div class="home-error">
        <p>⚠ ${escapeHtml(APP.adminError)}</p>
        <button class="btn btn-primary" data-action="admin-retry">Spróbuj ponownie</button>
      </div>
    `;
    return;
  }

  const filter = APP.adminFilter;

  root.innerHTML = header + `
    <div class="admin-content">
      ${renderAccessCard()}
      ${renderTournamentsCard()}
      ${renderMatchesCard(filter)}
      ${renderCsvImportCard()}
    </div>
  `;
}

function renderAccessCard() {
  if (APP.accessLoading) {
    return `<div class="admin-card"><h2>Dostęp — Użytkownicy</h2><p class="admin-loading">Ładowanie…</p></div>`;
  }
  if (APP.accessError) {
    return `<div class="admin-card"><h2>Dostęp — Użytkownicy</h2><p class="admin-error">⚠ ${escapeHtml(APP.accessError)}</p></div>`;
  }

  const users = APP.accessUsers || [];
  const selfEmail = APP.userEmail || '';
  const editorCount = users.filter(u => u.role === 'editor').length;

  let rows = '';
  if (users.length === 0) {
    rows = '<div class="admin-empty">Brak użytkowników na liście.</div>';
  } else {
    rows = '<ul class="admin-list">';
    users.forEach(u => {
      const isSelf = u.email === selfEmail;
      const isLastEditor = u.role === 'editor' && editorCount === 1;
      const cantDelete = isSelf || isLastEditor;
      const deleteTitle = isSelf
        ? 'Nie możesz usunąć swojego konta'
        : isLastEditor
        ? 'Nie można usunąć ostatniego editora'
        : 'Usuń użytkownika';
      rows += `
        <li class="admin-row">
          <div class="admin-row-main">
            <strong>${escapeHtml(u.email)}</strong>
            <span class="admin-row-meta">${escapeHtml(u.role)}${isSelf ? ' (ty)' : ''}</span>
          </div>
          <div class="admin-row-actions">
            <button class="btn btn-sm" data-action="access-user-edit" data-arg="${escapeHtml(u.id)}">Edytuj</button>
            <button class="btn btn-sm btn-danger" data-action="access-user-delete" data-arg="${escapeHtml(u.id)}"
              ${cantDelete ? 'disabled title="' + escapeHtml(deleteTitle) + '"' : ''}>Usuń</button>
          </div>
        </li>`;
    });
    rows += '</ul>';
  }

  return `
    <div class="admin-card">
      <div class="admin-card-header">
        <h2>Dostęp — Użytkownicy</h2>
        <button class="btn btn-primary btn-sm" data-action="access-user-new">+ Dodaj użytkownika</button>
      </div>
      ${rows}
    </div>
  `;
}

function renderTournamentsCard() {
  const tournaments = DATA.tournaments;
  let rows = '';
  if (tournaments.length === 0) {
    rows = '<div class="admin-empty">Brak turniejów. Dodaj pierwszy.</div>';
  } else {
    rows = '<ul class="admin-list">';
    tournaments.forEach(t => {
      const matchCount = DATA.scheduledMatches.filter(m => m.tournament === t.name).length;
      rows += `
        <li class="admin-row">
          <div class="admin-row-main">
            <strong>${escapeHtml(t.name)}</strong>
            <span class="admin-row-meta">${matchCount} ${matchCount === 1 ? 'mecz' : (matchCount >= 2 && matchCount <= 4 ? 'mecze' : 'meczy')}</span>
          </div>
          <div class="admin-row-actions">
            <button class="btn" data-action="tournament-edit" data-arg="${t.id}">Edytuj</button>
            <button class="btn btn-danger" data-action="tournament-delete" data-arg="${t.id}">Usuń</button>
          </div>
        </li>
      `;
    });
    rows += '</ul>';
  }

  return `
    <section class="admin-card">
      <header class="admin-card-header">
        <h2>Turnieje</h2>
        <button class="btn btn-primary" data-action="tournament-new">+ Dodaj turniej</button>
      </header>
      ${rows}
    </section>
  `;
}

function renderMatchesCard(filter) {
  const today = todayISO();
  const all = DATA.scheduledMatches.slice().sort((a, b) => {
    if (a.match_date !== b.match_date) return a.match_date < b.match_date ? -1 : 1;
    return (a.team_A || '').localeCompare(b.team_A || '');
  });

  const filtered = all.filter(m => {
    if (filter.range === 'today'    && m.match_date !== today) return false;
    if (filter.range === 'upcoming' && m.match_date <  today)  return false;
    if (filter.range === 'past'     && m.match_date >= today)  return false;
    if (filter.tournament !== 'all' && m.tournament !== filter.tournament) return false;
    if (filter.status     !== 'all' && m.status     !== filter.status)     return false;
    return true;
  });

  const tournamentOpts = ['<option value="all">— wszystkie —</option>']
    .concat(DATA.tournaments.map(t => `<option value="${escapeHtml(t.name)}" ${filter.tournament === t.name ? 'selected' : ''}>${escapeHtml(t.name)}</option>`))
    .join('');

  let rows = '';
  if (filtered.length === 0) {
    rows = '<div class="admin-empty">Brak meczy spełniających filtr.</div>';
  } else {
    rows = '<ul class="admin-list">';
    filtered.forEach(m => {
      const eventCount = DATA.events.filter(e => e.match_id === m.id).length;
      const isToday = m.match_date === today;
      rows += `
        <li class="admin-row">
          <div class="admin-row-main">
            <div class="admin-match-line">
              <span class="admin-date ${isToday ? 'today' : ''}">${m.match_date}</span>
              <span class="admin-tournament">${escapeHtml(m.tournament || '—')}</span>
            </div>
            <div class="admin-match-teams">
              <strong>${escapeHtml(m.team_A)}</strong>
              <span class="vs">vs</span>
              <strong>${escapeHtml(m.team_B)}</strong>
              <span class="admin-status status-${m.status}">${m.status}</span>
              ${eventCount > 0 ? `<span class="admin-event-count">${eventCount} eventów</span>` : ''}
              ${m.video_url ? `<a class="admin-video-link" href="${escapeHtml(m.video_url)}" target="_blank" rel="noopener" title="Otwórz nagranie">▶ nagranie</a>` : ''}
            </div>
          </div>
          <div class="admin-row-actions">
            <button class="btn" data-action="match-edit" data-arg="${m.id}">Edytuj</button>
            <button class="btn btn-danger" data-action="match-delete" data-arg="${m.id}">Usuń</button>
          </div>
        </li>
      `;
    });
    rows += '</ul>';
  }

  return `
    <section class="admin-card">
      <header class="admin-card-header">
        <h2>Mecze</h2>
        <button class="btn btn-primary" data-action="match-new">+ Zaplanuj mecz</button>
      </header>
      <div class="admin-filters">
        <div class="toggle-group">
          <button class="btn ${filter.range === 'upcoming' ? 'btn-active' : ''}" data-action="admin-set-range" data-arg="upcoming">Nadchodzące</button>
          <button class="btn ${filter.range === 'today'    ? 'btn-active' : ''}" data-action="admin-set-range" data-arg="today">Dziś</button>
          <button class="btn ${filter.range === 'past'     ? 'btn-active' : ''}" data-action="admin-set-range" data-arg="past">Przeszłe</button>
          <button class="btn ${filter.range === 'all'      ? 'btn-active' : ''}" data-action="admin-set-range" data-arg="all">Wszystkie</button>
        </div>
        <label class="admin-filter-field">
          <span>Turniej</span>
          <select id="admin-filter-tournament" data-action="admin-set-tournament">${tournamentOpts}</select>
        </label>
        <label class="admin-filter-field">
          <span>Status</span>
          <select id="admin-filter-status" data-action="admin-set-status">
            <option value="all"       ${filter.status === 'all'       ? 'selected' : ''}>— wszystkie —</option>
            <option value="scheduled" ${filter.status === 'scheduled' ? 'selected' : ''}>Zaplanowane</option>
            <option value="live"      ${filter.status === 'live'      ? 'selected' : ''}>W trakcie</option>
            <option value="finished"  ${filter.status === 'finished'  ? 'selected' : ''}>Zakończone</option>
          </select>
        </label>
      </div>
      ${rows}
    </section>
  `;
}

function renderCsvImportCard() {
  const ci = APP.csvImport;
  let previewHtml = '';

  if (ci) {
    const validRows = ci.rows.filter(r => !r._error);
    const errorRows = ci.rows.filter(r => r._error);

    const tableRows = ci.rows.map(r => `
      <tr class="${r._error ? 'csv-row-error' : ''}">
        <td class="csv-linenum">${r._lineNum}</td>
        <td>${escapeHtml(r.tournament)}</td>
        <td>${escapeHtml(r.match_date)}</td>
        <td>${escapeHtml(r.team_A)}</td>
        <td>${escapeHtml(r.team_B)}</td>
        <td>${r.video_url ? '<span class="csv-link-badge">🔗</span>' : ''}</td>
        <td>${r._error ? `<span class="csv-err-msg">${escapeHtml(r._error)}</span>` : ''}</td>
      </tr>
    `).join('');

    previewHtml = `
      <div class="csv-preview">
        <div class="csv-stats">
          <span class="csv-stat-ok">${validRows.length} poprawnych</span>
          ${errorRows.length > 0 ? `<span class="csv-stat-err">${errorRows.length} z błędem</span>` : ''}
        </div>
        ${ci.rows.length > 0 ? `
          <div class="csv-table-wrap">
            <table class="csv-table">
              <thead><tr><th>#</th><th>Turniej</th><th>Data</th><th>Drużyna A</th><th>Drużyna B</th><th>Link</th><th></th></tr></thead>
              <tbody>${tableRows}</tbody>
            </table>
          </div>
        ` : '<div class="admin-empty">Brak wierszy danych.</div>'}
        <div class="csv-actions">
          ${validRows.length > 0 && !ci.importing
            ? `<button class="btn btn-primary" data-action="csv-import-submit">Importuj ${validRows.length} meczy</button>`
            : ''}
          ${ci.importing ? '<span class="csv-importing">Importowanie…</span>' : ''}
          <button class="btn" data-action="csv-import-cancel">Anuluj</button>
        </div>
      </div>
    `;
  }

  return `
    <section class="admin-card">
      <header class="admin-card-header">
        <h2>Import CSV</h2>
        <label class="btn btn-primary csv-file-label" for="csv-import-input">Wgraj plik CSV</label>
        <input type="file" id="csv-import-input" accept=".csv,.txt" style="display:none" data-action="csv-import-file">
      </header>
      <div class="admin-card-hint">Format: <code>turniej,data,druzyna_a,druzyna_b,link</code> (link opcjonalny). Data: <code>RRRR-MM-DD</code>. Separator: przecinek lub średnik.</div>
      ${previewHtml}
    </section>
  `;
}

// ===== Modal templates (registered in render-modal.js dispatcher) =====

function renderTournamentModal(t) {
  const isEdit = !!t;
  const matchCount = isEdit
    ? DATA.scheduledMatches.filter(m => m.tournament === t.name).length
    : 0;
  const warning = isEdit && matchCount > 0
    ? `<div class="modal-subtitle" style="color:#854d0e">⚠ Zmiana nazwy nie zaktualizuje ${matchCount} przypisanych meczów (denormalizacja). W razie potrzeby zaktualizuj je ręcznie.</div>`
    : '';
  return `
    <div class="modal" data-stop-propagation="true">
      <h2>${isEdit ? 'Edytuj turniej' : 'Nowy turniej'}</h2>
      ${warning}
      <label class="field">
        <span class="field-label">Nazwa turnieju</span>
        <input id="tournament-name" placeholder="np. Liga PL Wiosna 2026" value="${isEdit ? escapeHtml(t.name) : ''}">
      </label>
      <div class="modal-actions">
        <button class="btn" data-action="cancel-modal">Anuluj</button>
        <button class="btn btn-primary" data-action="submit-tournament" data-arg="${isEdit ? t.id : ''}">${isEdit ? 'Zapisz' : 'Dodaj'}</button>
      </div>
    </div>
  `;
}

function renderMatchModal(m) {
  const isEdit = !!m;
  const tournaments = DATA.tournaments;
  const eventCount = isEdit ? DATA.events.filter(e => e.match_id === m.id).length : 0;
  const tournamentOpts = tournaments.length === 0
    ? '<option value="">(brak turniejów — dodaj na liście)</option>'
    : tournaments.map(t => `<option value="${escapeHtml(t.name)}" ${isEdit && m.tournament === t.name ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('');
  const eventWarning = isEdit && eventCount > 0
    ? `<div class="modal-subtitle" style="color:#854d0e">⚠ Mecz ma ${eventCount} zarejestrowanych eventów. Zmiana drużyn lub turnieju nie zaktualizuje ich denormalizowanej kopii.</div>`
    : '';
  return `
    <div class="modal" data-stop-propagation="true">
      <h2>${isEdit ? 'Edytuj mecz' : 'Zaplanuj mecz'}</h2>
      ${eventWarning}
      <label class="field">
        <span class="field-label">Turniej</span>
        <select id="match-tournament">${tournamentOpts}</select>
      </label>
      <label class="field">
        <span class="field-label">Drużyna A</span>
        <input id="match-team-a" list="teams-datalist" placeholder="np. Hawks" value="${isEdit ? escapeHtml(m.team_A) : ''}">
      </label>
      <label class="field">
        <span class="field-label">Drużyna B</span>
        <input id="match-team-b" list="teams-datalist" placeholder="np. Vikings" value="${isEdit ? escapeHtml(m.team_B) : ''}">
      </label>
      <datalist id="teams-datalist">
        ${uniqueTeamNames().map(n => `<option value="${escapeHtml(n)}">`).join('')}
      </datalist>
      <label class="field">
        <span class="field-label">Data</span>
        <input id="match-date" type="date" value="${isEdit ? m.match_date : todayISO()}">
      </label>
      <label class="field">
        <span class="field-label">Status</span>
        <select id="match-status">
          <option value="scheduled" ${(!isEdit || m.status === 'scheduled') ? 'selected' : ''}>Zaplanowany</option>
          <option value="live"      ${isEdit && m.status === 'live'      ? 'selected' : ''}>W trakcie</option>
          <option value="finished"  ${isEdit && m.status === 'finished'  ? 'selected' : ''}>Zakończony</option>
        </select>
      </label>
      <label class="field">
        <span class="field-label">Link do nagrania (opcjonalny)</span>
        <input id="match-video-url" type="url" placeholder="https://youtube.com/..." value="${isEdit && m.video_url ? escapeHtml(m.video_url) : ''}">
      </label>
      <div class="modal-actions">
        <button class="btn" data-action="cancel-modal">Anuluj</button>
        <button class="btn btn-primary" data-action="submit-match" data-arg="${isEdit ? m.id : ''}">${isEdit ? 'Zapisz' : 'Dodaj mecz'}</button>
      </div>
    </div>
  `;
}
