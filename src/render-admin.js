'use strict';

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
      range: 'upcoming',
      tournament: 'all',
      status: 'all'
    };
  }

  const header = `
    <div class="app-header">
      <button class="btn" data-action="back-home">${T('nav.back')}</button>
      <h1>${T('admin.title')}</h1>
      <span class="meta">${todayISO()}</span>
      ${_langToggleBtn()}
      <button class="btn" data-action="toggle-dark-mode" id="theme-toggle" title="${T('nav.theme')}">🌙</button>
    </div>
  `;

  if (APP.adminLoading) {
    root.innerHTML = header + `<div class="home-loading"><div class="spinner"></div><p>${T('loading.data')}</p></div>`;
    return;
  }

  if (APP.adminError) {
    root.innerHTML = header + `
      <div class="home-error">
        <p>⚠ ${escapeHtml(APP.adminError)}</p>
        <button class="btn btn-primary" data-action="admin-retry">${T('btn.retry_short')}</button>
      </div>
    `;
    return;
  }

  const filter = APP.adminFilter;

  root.innerHTML = header + `
    <div class="admin-content">
      ${renderTournamentsCard()}
      ${renderMatchesCard(filter)}
      ${renderCsvImportCard()}
      ${renderEmbedCard()}
    </div>
  `;
}

function renderTournamentsCard() {
  const tournaments = DATA.tournaments;
  let rows = '';
  if (tournaments.length === 0) {
    rows = `<div class="admin-empty">${T('admin.no_tournaments')}</div>`;
  } else {
    rows = '<ul class="admin-list">';
    tournaments.forEach(t => {
      const matchCount = DATA.scheduledMatches.filter(m => m.tournament === t.name).length;
      rows += `
        <li class="admin-row">
          <div class="admin-row-main">
            <strong>${escapeHtml(t.name)}</strong>
            <span class="admin-row-meta">${matchCount} ${T_match(matchCount)}</span>
          </div>
          <div class="admin-row-actions">
            <button class="btn" data-action="tournament-edit" data-arg="${t.id}">${T('btn.edit')}</button>
            <button class="btn btn-danger" data-action="tournament-delete" data-arg="${t.id}">${T('btn.delete')}</button>
          </div>
        </li>
      `;
    });
    rows += '</ul>';
  }

  return `
    <section class="admin-card">
      <header class="admin-card-header">
        <h2>${T('admin.tournaments.title')}</h2>
        <button class="btn btn-primary" data-action="tournament-new">${T('btn.add_tournament')}</button>
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

  const tournamentOpts = [`<option value="all">${T('admin.status.all')}</option>`]
    .concat(DATA.tournaments.map(t => `<option value="${escapeHtml(t.name)}" ${filter.tournament === t.name ? 'selected' : ''}>${escapeHtml(t.name)}</option>`))
    .join('');

  const statusLabels = {
    scheduled: T('status.scheduled_short'),
    live:      T('status.in_progress'),
    finished:  T('status.finished'),
  };

  let rows = '';
  if (filtered.length === 0) {
    rows = `<div class="admin-empty">${T('admin.no_matches')}</div>`;
  } else {
    rows = '<ul class="admin-list">';
    filtered.forEach(m => {
      const eventCount = DATA.events.filter(e => e.match_id === m.id).length;
      const isToday = m.match_date === today;
      const statusLbl = statusLabels[m.status] || m.status;
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
              <span class="admin-status status-${m.status}">${statusLbl}</span>
              ${eventCount > 0 ? `<span class="admin-event-count">${eventCount} ${T('admin.events')}</span>` : ''}
              ${m.video_url ? `<a class="admin-video-link" href="${escapeHtml(m.video_url)}" target="_blank" rel="noopener" title="${T('btn.view')}">${T('admin.video')}</a>` : ''}
            </div>
          </div>
          <div class="admin-row-actions">
            <button class="btn" data-action="match-edit" data-arg="${m.id}">${T('btn.edit')}</button>
            <button class="btn btn-danger" data-action="match-delete" data-arg="${m.id}">${T('btn.delete')}</button>
          </div>
        </li>
      `;
    });
    rows += '</ul>';
  }

  return `
    <section class="admin-card">
      <header class="admin-card-header">
        <h2>${T('admin.matches.title')}</h2>
        <button class="btn btn-primary" data-action="match-new">${T('btn.plan_match')}</button>
      </header>
      <div class="admin-filters">
        <div class="toggle-group">
          <button class="btn ${filter.range === 'upcoming' ? 'btn-active' : ''}" data-action="admin-set-range" data-arg="upcoming">${T('admin.range.upcoming')}</button>
          <button class="btn ${filter.range === 'today'    ? 'btn-active' : ''}" data-action="admin-set-range" data-arg="today">${T('admin.range.today')}</button>
          <button class="btn ${filter.range === 'past'     ? 'btn-active' : ''}" data-action="admin-set-range" data-arg="past">${T('admin.range.past')}</button>
          <button class="btn ${filter.range === 'all'      ? 'btn-active' : ''}" data-action="admin-set-range" data-arg="all">${T('admin.range.all')}</button>
        </div>
        <label class="admin-filter-field">
          <span>${T('field.tournament')}</span>
          <select id="admin-filter-tournament" data-action="admin-set-tournament">${tournamentOpts}</select>
        </label>
        <label class="admin-filter-field">
          <span>${T('field.status')}</span>
          <select id="admin-filter-status" data-action="admin-set-status">
            <option value="all"       ${filter.status === 'all'       ? 'selected' : ''}>${T('admin.status.all')}</option>
            <option value="scheduled" ${filter.status === 'scheduled' ? 'selected' : ''}>${T('admin.status.scheduled')}</option>
            <option value="live"      ${filter.status === 'live'      ? 'selected' : ''}>${T('admin.status.live')}</option>
            <option value="finished"  ${filter.status === 'finished'  ? 'selected' : ''}>${T('admin.status.finished')}</option>
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
          <span class="csv-stat-ok">${validRows.length} ${T('admin.csv.valid')}</span>
          ${errorRows.length > 0 ? `<span class="csv-stat-err">${errorRows.length} ${T('admin.csv.errors')}</span>` : ''}
        </div>
        ${ci.rows.length > 0 ? `
          <div class="csv-table-wrap">
            <table class="csv-table">
              <thead><tr><th>${T('admin.csv.col.num')}</th><th>${T('admin.csv.col.tournament')}</th><th>${T('admin.csv.col.date')}</th><th>${T('admin.csv.col.team_a')}</th><th>${T('admin.csv.col.team_b')}</th><th>${T('admin.csv.col.link')}</th><th></th></tr></thead>
              <tbody>${tableRows}</tbody>
            </table>
          </div>
        ` : `<div class="admin-empty">${T('admin.csv.empty')}</div>`}
        <div class="csv-actions">
          ${validRows.length > 0 && !ci.importing
            ? `<button class="btn btn-primary" data-action="csv-import-submit">${T('admin.csv.import_btn')} ${validRows.length} ${T_match(validRows.length)}</button>`
            : ''}
          ${ci.importing ? `<span class="csv-importing">${T('admin.csv.importing')}</span>` : ''}
          <button class="btn" data-action="csv-import-cancel">${T('btn.cancel')}</button>
        </div>
      </div>
    `;
  }

  return `
    <section class="admin-card">
      <header class="admin-card-header">
        <h2>${T('admin.csv.title')}</h2>
        <label class="btn btn-primary csv-file-label" for="csv-import-input">${T('btn.upload_csv')}</label>
        <input type="file" id="csv-import-input" accept=".csv,.txt" style="display:none" data-action="csv-import-file">
      </header>
      <div class="admin-card-hint">${T('admin.csv.hint')}</div>
      ${previewHtml}
    </section>
  `;
}

function renderEmbedCard() {
  const baseUrl = window.location.href.split('?')[0];
  const selectedId = APP.embedSelectedMatch || '';
  const url = selectedId ? baseUrl + '?match=' + encodeURIComponent(selectedId) : baseUrl;
  const snippet = `<iframe src="${url}" width="100%" height="700" frameborder="0" style="border:none; border-radius:8px;"></iframe>`;

  const matchOpts = [`<option value="">${T('admin.embed.all')}</option>`]
    .concat(
      DATA.scheduledMatches.slice()
        .sort((a, b) => b.match_date.localeCompare(a.match_date))
        .map(m => {
          const label = `${m.match_date} — ${escapeHtml(m.team_A)} vs ${escapeHtml(m.team_B)}${m.tournament ? ' (' + escapeHtml(m.tournament) + ')' : ''}`;
          return `<option value="${escapeHtml(String(m.id))}" ${selectedId === String(m.id) ? 'selected' : ''}>${label}</option>`;
        })
    ).join('');

  return `
    <section class="admin-card">
      <header class="admin-card-header">
        <h2>${T('admin.embed.title')}</h2>
      </header>
      <div class="embed-card-body">
        <p class="embed-hint">${T('admin.embed.hint')}</p>
        <div class="embed-select-wrap">
          <label class="embed-select-label">${T('admin.embed.label')}</label>
          <select id="embed-match-select" class="embed-select" data-action="embed-select-match">
            ${matchOpts}
          </select>
        </div>
        <textarea id="embed-snippet" readonly class="embed-textarea">${escapeHtml(snippet)}</textarea>
        <div class="embed-actions">
          <button class="btn btn-primary" data-action="embed-copy">${T('btn.copy_code')}</button>
          <span id="embed-copy-feedback" class="embed-feedback" style="display:none">${T('btn.copied')}</span>
        </div>
      </div>
    </section>
  `;
}

// ===== Modal templates =====

function renderTournamentModal(t) {
  const isEdit = !!t;
  const matchCount = isEdit
    ? DATA.scheduledMatches.filter(m => m.tournament === t.name).length
    : 0;
  const warning = isEdit && matchCount > 0
    ? `<div class="modal-subtitle" style="color:#854d0e">⚠ ${T('admin.rename_warning')} ${matchCount} ${T('admin.rename_warning2')}</div>`
    : '';
  return `
    <div class="modal" data-stop-propagation="true">
      <h2>${isEdit ? T('modal.tournament.edit') : T('modal.tournament.new')}</h2>
      ${warning}
      <label class="field">
        <span class="field-label">${T('field.tournament_name')}</span>
        <input id="tournament-name" placeholder="np. Liga PL Wiosna 2026" value="${isEdit ? escapeHtml(t.name) : ''}">
      </label>
      <div class="modal-actions">
        <button class="btn" data-action="cancel-modal">${T('btn.cancel')}</button>
        <button class="btn btn-primary" data-action="submit-tournament" data-arg="${isEdit ? t.id : ''}">${isEdit ? T('btn.save') : T('btn.add')}</button>
      </div>
    </div>
  `;
}

function renderMatchModal(m) {
  const isEdit = !!m;
  const tournaments = DATA.tournaments;
  const eventCount = isEdit ? DATA.events.filter(e => e.match_id === m.id).length : 0;
  const tournamentOpts = tournaments.length === 0
    ? `<option value="">${T('admin.no_tournaments_yet')}</option>`
    : tournaments.map(t => `<option value="${escapeHtml(t.name)}" ${isEdit && m.tournament === t.name ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('');
  const eventWarning = isEdit && eventCount > 0
    ? `<div class="modal-subtitle" style="color:#854d0e">⚠ ${T('admin.match_events_pre')} ${eventCount} ${T('admin.events')}. ${T('admin.match_event_warning')}</div>`
    : '';
  return `
    <div class="modal" data-stop-propagation="true">
      <h2>${isEdit ? T('modal.match.edit') : T('modal.match.new')}</h2>
      ${eventWarning}
      <label class="field">
        <span class="field-label">${T('field.tournament')}</span>
        <select id="match-tournament">${tournamentOpts}</select>
      </label>
      <label class="field">
        <span class="field-label">${T('field.team_a')}</span>
        <input id="match-team-a" list="teams-datalist" placeholder="np. Hawks" value="${isEdit ? escapeHtml(m.team_A) : ''}">
      </label>
      <label class="field">
        <span class="field-label">${T('field.team_b')}</span>
        <input id="match-team-b" list="teams-datalist" placeholder="np. Vikings" value="${isEdit ? escapeHtml(m.team_B) : ''}">
      </label>
      <datalist id="teams-datalist">
        ${uniqueTeamNames().map(n => `<option value="${escapeHtml(n)}">`).join('')}
      </datalist>
      <label class="field">
        <span class="field-label">${T('field.date')}</span>
        <input id="match-date" type="date" value="${isEdit ? m.match_date : todayISO()}">
      </label>
      <label class="field">
        <span class="field-label">${T('field.status')}</span>
        <select id="match-status">
          <option value="scheduled" ${(!isEdit || m.status === 'scheduled') ? 'selected' : ''}>${T('status.scheduled_short')}</option>
          <option value="live"      ${isEdit && m.status === 'live'      ? 'selected' : ''}>${T('status.in_progress')}</option>
          <option value="finished"  ${isEdit && m.status === 'finished'  ? 'selected' : ''}>${T('status.finished')}</option>
        </select>
      </label>
      <label class="field">
        <span class="field-label">${T('field.video_url')}</span>
        <input id="match-video-url" type="url" placeholder="https://youtube.com/..." value="${isEdit && m.video_url ? escapeHtml(m.video_url) : ''}">
      </label>
      <div class="modal-actions">
        <button class="btn" data-action="cancel-modal">${T('btn.cancel')}</button>
        <button class="btn btn-primary" data-action="submit-match" data-arg="${isEdit ? m.id : ''}">${isEdit ? T('btn.save') : T('btn.add_match')}</button>
      </div>
    </div>
  `;
}
