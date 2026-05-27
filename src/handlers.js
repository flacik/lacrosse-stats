'use strict';

// HANDLERS map (data-action → fn) + global event delegation listeners (click + change).

const HANDLERS = {
  'open-admin':     () => goAdmin(),
  'open-analytics': () => goAnalytics(),
  'home-retry':     () => loadHomeData(),

  // Offline backup — export/import
  'export-offline-backup': () => exportOfflineBufferToFile(),
  'import-offline-backup': () => {
    const input = document.createElement('input');
    input.type   = 'file';
    input.accept = '.json';
    input.onchange = function(e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      importOfflineBufferFromFile(file, function(count) {
        APP.offlineBanner = loadOfflineBuffer().length || null;
        APP.banner = { type: 'info', msg: 'Zaimportowano ' + count + ' eventów z kopii zapasowej' };
        render();
      });
    };
    input.click();
  },
  'viewer-retry':   () => startViewerRefresh(),
  'admin-retry':    () => loadAdminData(),

  // Analytics
  'analytics-retry':  () => loadAnalyticsData(),
  'analytics-filter-change': (val, el) => {
    const field = el.dataset.field;
    if (field && field in APP.analyticsFilters) {
      APP.analyticsFilters[field] = val;
      if (field === 'tournament') APP.analyticsFilters.team = '';
      render();
    }
  },
  'go-home-from-analytics': () => goHome(),
  'analytics-heatmap-toggle': (mode) => {
    APP.analyticsHeatmapMode = mode;
    render();
  },
  'analytics-goalie-sort': (col) => {
    const s = APP.analyticsGoalieSort;
    s.dir = s.col === col ? (s.dir === 'desc' ? 'asc' : 'desc') : 'desc';
    s.col = col;
    render();
  },
  'open-viewer-from-analytics': (matchId) => {
    // Sync analytics matches into DATA so viewer can find match info
    const am = APP.analyticsData && APP.analyticsData.matches;
    if (am) {
      am.forEach(m => {
        if (!DATA.scheduledMatches.find(x => String(x.id) === String(m.id))) {
          DATA.scheduledMatches.push(m);
        }
      });
    }
    openMatchViewer(matchId);
  },

  // Standings (tabela ligowa)
  'open-standings':            () => go('standings'),
  'go-home-from-standings':    () => goHome(),
  'standings-retry':           () => loadStandingsData(),
  'standings-set-tournament':  (val) => {
    APP.standingsTournament = val;
    render();
  },
  'standings-sort': (col) => {
    if (APP.standingsSort.col === col) {
      APP.standingsSort.dir = APP.standingsSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      APP.standingsSort = { col, dir: 'desc' };
    }
    render();
  },

  // Ręczny retry eventu z błędem sync (krok 8)
  'retry-event': (clientEventId) => {
    const ev = DATA.events.find(e => e.client_event_id === clientEventId);
    if (!ev || ev._syncing) return;

    // Sprawdź walidację przed wysłaniem
    const validationError = validateEventPayload(ev);
    if (validationError) {
      const idx = DATA.events.findIndex(e => e.client_event_id === clientEventId);
      if (idx >= 0) {
        DATA.events[idx] = Object.assign({}, DATA.events[idx], {
          _syncError: 'Błąd walidacji: ' + validationError,
        });
      }
      render();
      return;
    }

    const idx = DATA.events.findIndex(e => e.client_event_id === clientEventId);
    if (idx < 0) return;
    DATA.events[idx] = Object.assign({}, DATA.events[idx], { _syncing: true, _syncError: null });
    render();

    gasSaveEvent(ev).then(function (result) {
      const i = DATA.events.findIndex(e => e.client_event_id === clientEventId);
      if (i >= 0) {
        DATA.events[i] = Object.assign({}, DATA.events[i], {
          id:         result.id,
          _syncing:   false,
          _syncError: null,
        });
        removeFromOfflineBuffer(clientEventId);
      }
      render();
    }).catch(function (err) {
      if (err.code !== 'DEV_MODE') {
        const i = DATA.events.findIndex(e => e.client_event_id === clientEventId);
        if (i >= 0) {
          DATA.events[i] = Object.assign({}, DATA.events[i], {
            _syncing:   false,
            _syncError: err.message || 'Błąd zapisu — wyślij ponownie',
          });
        }
        render();
      }
    });
  },

  // Routing
  'open-match':  (id) => openMatchInput(id),
  'open-viewer': (id) => openMatchViewer(id),
  'back-home':   () => goHome(),
  'ad-hoc':      () => { APP.modal = { type: 'ad-hoc' }; render(); },

  // ===== Admin (etap C) =====
  'admin-set-range':      (range) => { APP.adminFilter.range = range; render(); },
  'admin-set-tournament': () => {
    const sel = document.getElementById('admin-filter-tournament');
    if (sel) APP.adminFilter.tournament = sel.value;
    render();
  },
  'admin-set-status': () => {
    const sel = document.getElementById('admin-filter-status');
    if (sel) APP.adminFilter.status = sel.value;
    render();
  },

  'tournament-new':  () => { APP.modal = { type: 'tournament-form', tournament: null }; render(); },
  'tournament-edit': (id) => {
    const t = DATA.tournaments.find(x => x.id === id);
    if (!t) return;
    APP.modal = { type: 'tournament-form', tournament: t };
    render();
  },
  'tournament-delete': (id) => {
    const t = DATA.tournaments.find(x => x.id === id);
    if (!t) return;
    const matchCount = DATA.scheduledMatches.filter(m => m.tournament === t.name).length;
    const msg = matchCount > 0
      ? `Usunąć „${t.name}"? ${matchCount} meczów straci przypisany turniej.`
      : `Usunąć turniej „${t.name}"?`;
    APP.modal = { type: 'confirm', title: 'Usuń turniej', message: msg, _action: 'delete-tournament', _arg: id };
    render();
  },
  'submit-tournament': (id) => {
    const input = document.getElementById('tournament-name');
    if (!input) return;
    const name = input.value.trim();
    if (!name) { alert('Nazwa turnieju nie może być pusta.'); return; }
    if (id) {
      // Edit — optimistic update
      const t = DATA.tournaments.find(x => x.id === id);
      if (t) t.name = name;
      APP.modal = null;
      render();
      // Async GAS
      gasUpdateTournament(id, name).catch(function(e) {
        if (e.code !== 'DEV_MODE') {
          APP.banner = { type: 'error', msg: 'Błąd zapisu turnieju: ' + (e.message || e) };
          render();
        }
      });
    } else {
      // Create — optimistic add z tymczasowym ID
      const localId = 'tlocal_' + Date.now();
      DATA.tournaments.push({ id: localId, name });
      APP.modal = null;
      render();
      // Async GAS — podmień lokalny ID na GAS ID
      gasCreateTournament(name).then(function(result) {
        const t = DATA.tournaments.find(x => x.id === localId);
        if (t) t.id = result.id;
        render();
      }).catch(function(e) {
        if (e.code !== 'DEV_MODE') {
          APP.banner = { type: 'error', msg: 'Błąd tworzenia turnieju: ' + (e.message || e) };
          render();
        }
      });
    }
  },

  'match-new':  () => { APP.modal = { type: 'match-form', match: null }; render(); },
  'match-edit': (id) => {
    const m = DATA.scheduledMatches.find(x => x.id === id);
    if (!m) return;
    APP.modal = { type: 'match-form', match: m };
    render();
  },
  'match-delete': (id) => {
    const m = DATA.scheduledMatches.find(x => x.id === id);
    if (!m) return;
    const eventCount = DATA.events.filter(e => e.match_id === id).length;
    const msg = eventCount > 0
      ? `Usunąć mecz ${m.team_A} vs ${m.team_B} (${m.match_date})? Usuniętych zostanie też ${eventCount} eventów.`
      : `Usunąć mecz ${m.team_A} vs ${m.team_B} (${m.match_date})?`;
    APP.modal = { type: 'confirm', title: 'Usuń mecz', message: msg, _action: 'delete-match', _arg: id };
    render();
  },
  'submit-match': (id) => {
    const tournament = (document.getElementById('match-tournament').value || '').trim();
    const teamA      = document.getElementById('match-team-a').value.trim().replace(/\s+/g, ' ');
    const teamB      = document.getElementById('match-team-b').value.trim().replace(/\s+/g, ' ');
    const matchDate  = document.getElementById('match-date').value;
    const status     = document.getElementById('match-status').value;
    const videoUrl   = (document.getElementById('match-video-url').value || '').trim();
    if (!teamA || !teamB || !matchDate) {
      alert('Wypełnij obie drużyny i datę.');
      return;
    }
    if (id) {
      // Edit — optimistic update
      const m = DATA.scheduledMatches.find(x => x.id === id);
      if (m) Object.assign(m, { tournament, team_A: teamA, team_B: teamB, match_date: matchDate, status, video_url: videoUrl });
      APP.modal = null;
      render();
      // Async GAS
      gasUpdateMatch(id, { tournament, team_A: teamA, team_B: teamB, match_date: matchDate, status, video_url: videoUrl })
        .catch(function(e) {
          if (e.code !== 'DEV_MODE') {
            APP.banner = { type: 'error', msg: 'Błąd zapisu meczu: ' + (e.message || e) };
            render();
          }
        });
    } else {
      // Create — optimistic add z tymczasowym ID
      const localId = 'mlocal_' + Date.now();
      DATA.scheduledMatches.push({
        id: localId,
        tournament, team_A: teamA, team_B: teamB, match_date: matchDate, status: status || 'scheduled', video_url: videoUrl
      });
      APP.modal = null;
      render();
      // Async GAS — podmień lokalny ID na GAS ID
      gasCreateMatch({ tournament, team_A: teamA, team_B: teamB, match_date: matchDate, status: status || 'scheduled', video_url: videoUrl })
        .then(function(result) {
          const m = DATA.scheduledMatches.find(x => x.id === localId);
          if (m) m.id = result.id;
          render();
        })
        .catch(function(e) {
          if (e.code !== 'DEV_MODE') {
            APP.banner = { type: 'error', msg: 'Błąd tworzenia meczu: ' + (e.message || e) };
            render();
          }
        });
    }
  },

  // CSV bulk import
  'csv-import-file': (val, el) => {
    if (!el || !el.files || el.files.length === 0) return;
    const file = el.files[0];
    const reader = new FileReader();
    reader.onload = function(ev) {
      APP.csvImport = parseCsvMatches(ev.target.result);
      render();
    };
    reader.readAsText(file, 'UTF-8');
    el.value = '';
  },
  'csv-import-cancel': () => {
    APP.csvImport = null;
    render();
  },
  'csv-import-submit': () => {
    if (!APP.csvImport) return;
    const validRows = APP.csvImport.rows.filter(r => !r._error);
    if (validRows.length === 0) return;

    APP.csvImport = Object.assign({}, APP.csvImport, { importing: true });
    render();

    const matches = validRows.map(r => ({
      tournament: r.tournament,
      match_date: r.match_date,
      team_A:     r.team_A,
      team_B:     r.team_B,
      video_url:  r.video_url || '',
      status:     'scheduled',
    }));

    gasBulkCreateMatches(matches).then(function(result) {
      matches.forEach(function(m, i) {
        DATA.scheduledMatches.push(Object.assign({ id: result.ids[i] }, m));
      });
      APP.csvImport = null;
      alert('Zaimportowano ' + result.count + ' meczy.');
      render();
    }).catch(function(e) {
      if (e.code === 'DEV_MODE') {
        matches.forEach(function(m, i) {
          DATA.scheduledMatches.push(Object.assign({ id: 'csv_' + Date.now() + '_' + i }, m));
        });
        APP.csvImport = null;
        alert('[DEV] Zaimportowano ' + matches.length + ' meczy lokalnie.');
        render();
      } else {
        APP.csvImport = Object.assign({}, APP.csvImport, { importing: false });
        alert('Błąd importu: ' + (e.message || e));
        render();
      }
    });
  },

  // Viewer controls
  'viewer-set-mode':           (mode) => { APP.viewer.view_mode    = mode; render(); },
  'viewer-set-display':        (mode) => { APP.viewer.display_mode = mode; render(); },
  'viewer-set-period-filter':  () => {
    const sel = document.getElementById('filter-period');
    if (sel) APP.viewer.filter_period = sel.value;
    render();
  },
  'viewer-set-result-filter':  () => {
    const sel = document.getElementById('filter-result');
    if (sel) APP.viewer.filter_result = sel.value;
    render();
  },

  // Period transitions
  'next-period': () => {
    const prevPeriod = APP.match.period;
    const prevSide   = APP.match.team_A_side;
    const newP = nextPeriod(APP.match.period);
    APP.match.period = newP;
    APP.match.team_A_side = prevSide === 'left' ? 'right' : 'left';
    APP._periodQueue = (APP._periodQueue || []).concat([{ prevPeriod, prevSide }]);
    clearTimeout(APP._undoTimer);
    APP.banner = { type: 'period-undo', newPeriod: newP };
    APP._undoTimer = setTimeout(() => {
      if (APP.banner && APP.banner.type === 'period-undo') {
        APP._periodQueue = [];
        APP.banner = null;
        render();
      }
    }, 8000);
    render();
  },
  'undo-period': () => {
    clearTimeout(APP._undoTimer);
    APP._undoTimer = null;
    const queue = APP._periodQueue || [];
    APP._periodQueue = [];
    if (queue.length > 0) {
      APP.match.period      = queue[0].prevPeriod;
      APP.match.team_A_side = queue[0].prevSide;
    }
    APP.banner = null;
    render();
  },
  'dismiss-period-undo': () => {
    clearTimeout(APP._undoTimer);
    APP._undoTimer = null;
    APP._periodQueue = [];
    APP.banner = null;
    render();
  },
  'period-end-prompt': () => {
    APP.banner = { type: 'period-end', fromPeriod: APP.match.period };
    render();
  },
  'next-overtime': () => {
    const newP = nextPeriod(APP.banner.fromPeriod);
    APP.match.period = newP;
    APP.banner = { type: 'swap-question', newPeriod: newP };
    render();
  },
  'cancel-banner': () => {
    clearTimeout(APP._undoTimer);
    APP._undoTimer = null;
    APP.banner = null;
    render();
  },

  // Sides
  'swap-sides': () => {
    APP.match.team_A_side = APP.match.team_A_side === 'left' ? 'right' : 'left';
    APP.banner = null;
    render();
  },
  'swap-answer': (yes) => {
    if (yes === 'yes') {
      APP.match.team_A_side = APP.match.team_A_side === 'left' ? 'right' : 'left';
    }
    APP.banner = null;
    render();
  },

  // Own-half mode
  'own-half-toggle': () => {
    APP.match.own_half_mode = APP.match.own_half_mode === 'active' ? null : 'active';
    APP.banner = APP.match.own_half_mode === 'active' ? { type: 'own-half' } : null;
    render();
  },
  'cancel-own-half': () => { APP.match.own_half_mode = null; APP.banner = null; render(); },

  'toggle-dark-mode': () => {
    const html = document.documentElement;
    const isDark = html.dataset.theme === 'dark';
    html.dataset.theme = isDark ? 'light' : 'dark';
    localStorage.setItem('lax_theme', html.dataset.theme);
    _syncThemeToggle();
  },

  'toggle-zones':   () => { APP.match.show_zones        = !APP.match.show_zones;        render(); },
  'toggle-history': () => { APP.match.history_expanded  = !APP.match.history_expanded;  render(); },

  // Event creation/edit/delete
  'submit-result': (result) => {
    const pending  = APP.modal.pending;
    const manUp    = document.getElementById('flag-man-up').checked;
    const manDown  = document.getElementById('flag-man-down').checked;
    const assisted = document.getElementById('flag-assisted')?.checked ?? false;
    recordEvent({
      shot_x: pending.shot_x, shot_y: pending.shot_y,
      zone_name: pending.zone_name, team_event: pending.team_event,
      result, man_up: manUp, man_down: manDown, assisted
    });
    APP.modal = null;
    render();
  },

  'edit-event': (id) => {
    const e = DATA.events.find(x => String(x.id) === String(id));
    if (!e) return;
    APP.modal = { type: 'edit-event', event: e };
    render();
  },
  'submit-edit': (id) => {
    const team     = document.getElementById('edit-team').value;
    const period   = document.getElementById('edit-period').value;
    const result   = document.getElementById('edit-result').value;
    const manUp    = document.getElementById('edit-man-up').checked;
    const manDown  = document.getElementById('edit-man-down').checked;
    const assisted = document.getElementById('edit-assisted')?.checked ?? false;
    updateEvent(id, { team_event: team, period, result, man_up: manUp, man_down: manDown, assisted });
    APP.modal = null;
    render();
  },
  'delete-event': (id) => {
    const ev = DATA.events.find(e => String(e.id) === String(id));
    if (!ev) return;

    // Optimistic remove z UI
    DATA.events = DATA.events.filter(e => String(e.id) !== String(id));

    // Dodaj do kolejki cofnięcia i zresetuj timer (5s)
    APP._deleteQueue = (APP._deleteQueue || []).concat([ev]);
    clearTimeout(APP._deleteTimer);
    const count = APP._deleteQueue.length;
    APP.banner = { type: 'delete-undo', count };
    APP._deleteTimer = setTimeout(function() {
      _commitDeleteQueue();
      render();
    }, 5000);

    render();
  },
  'undo-delete': () => {
    clearTimeout(APP._deleteTimer);
    APP._deleteTimer = null;
    const queue = APP._deleteQueue || [];
    APP._deleteQueue = [];
    APP.banner = null;
    queue.forEach(function(ev) { DATA.events.push(ev); });
    render();
  },
  'commit-delete': () => {
    _commitDeleteQueue();
    render();
  },

  // End match
  'end-match':         () => { APP.modal = { type: 'confirm-end' }; APP.banner = null; render(); },
  'confirm-end-match': () => {
    const match = DATA.scheduledMatches.find(m => m.id === APP.matchId);
    if (match) {
      match.status = 'finished';
      gasUpdateMatch(match.id, { status: 'finished' }).catch(function () {});
    }
    goHome();
  },

  // Modal actions
  'cancel-modal': () => closeModal(),
  'confirm-dialog-ok': () => {
    const m = APP.modal;
    APP.modal = null;
    if (m._action === 'delete-tournament') { deleteTournamentConfirmed(m._arg); return; }
    if (m._action === 'delete-match')      { deleteMatchConfirmed(m._arg); return; }
    render();
  },

  // Ad-hoc match creation
  'create-ad-hoc': () => {
    const tournament = document.getElementById('adhoc-tournament').value.trim();
    const teamA      = document.getElementById('adhoc-team-a').value.trim().replace(/\s+/g, ' ');
    const teamB      = document.getElementById('adhoc-team-b').value.trim().replace(/\s+/g, ' ');
    const date       = document.getElementById('adhoc-date').value;
    if (!teamA || !teamB || !date) { alert('Wypełnij drużyny i datę.'); return; }

    // Twórz mecz lokalnie od razu (optimistic), wyślij do GAS async
    const localId = 'adhoc_' + Date.now();
    const newMatch = {
      id: localId,
      tournament, team_A: teamA, team_B: teamB, match_date: date, status: 'live'
    };
    DATA.scheduledMatches.push(newMatch);
    APP.modal = null;
    openMatchInput(localId);

    // Async zapis do GAS (aktualizuje ID w tle — ale mecz już otwarty lokalnie)
    gasCreateMatch({ tournament, team_A: teamA, team_B: teamB, match_date: date, status: 'live' })
      .then(function (result) {
        // Zamień lokalny ID na GAS ID
        const m = DATA.scheduledMatches.find(function (x) { return x.id === localId; });
        if (m) m.id = result.id;
        if (APP.matchId === localId) APP.matchId = result.id;
        // Zaktualizuj match_id w eventach tego meczu
        DATA.events.forEach(function (e) {
          if (e.match_id === localId) e.match_id = result.id;
        });
      })
      .catch(function () { /* DEV_MODE lub błąd — lokalny ID zostaje */ });
  },

  // Mutex flags (man-up XOR man-down)
  'mutex-flag': (which) => {
    const up = document.getElementById('flag-man-up');
    const down = document.getElementById('flag-man-down');
    if (!up || !down) return;
    if (which === 'man-up'   && up.checked)   down.checked = false;
    if (which === 'man-down' && down.checked) up.checked   = false;
  },
  'mutex-edit-flag': (which) => {
    const up = document.getElementById('edit-man-up');
    const down = document.getElementById('edit-man-down');
    if (!up || !down) return;
    if (which === 'man-up'   && up.checked)   down.checked = false;
    if (which === 'man-down' && down.checked) up.checked   = false;
  },

  'modal-bg-click': () => { /* handled separately in click listener */ },

  // Viewer: toggle split-barów (F-02)
  'toggle-split-bars': () => { APP.splitBars = !APP.splitBars; render(); },

  // Bramkarze (F-11)
  'open-goalie-modal': (slot) => {
    APP.modal = { type: 'goalie-form', team_slot: slot };
    render();
  },

  'save-goalie': (slot) => {
    const input = document.getElementById('goalie-number-input');
    if (!input) return;
    const raw = input.value.trim();
    if (raw === '' || isNaN(Number(raw)) || Number(raw) < 0 || Number(raw) > 99 || !Number.isInteger(Number(raw))) {
      alert('Podaj numer bramkarza (0–99).');
      return;
    }
    const num = String(parseInt(raw, 10));
    const match = DATA.scheduledMatches.find(m => String(m.id) === String(APP.matchId));
    const teamName = slot === 'A' ? match.team_A : match.team_B;
    const period = APP.match.period;

    // Jeśli istnieje goalie_set dla tej (period, team) — zaktualizuj, w przeciwnym razie utwórz
    const existing = DATA.events.find(e =>
      String(e.match_id) === String(match.id) &&
      e.event_type === 'goalie_set' &&
      e.team_event === teamName &&
      String(e.period) === String(period)
    );

    APP.modal = null;
    if (existing) {
      updateEvent(existing.id, { goalie_number: num });
    } else {
      recordEvent({
        event_type:    'goalie_set',
        team_event:    teamName,
        goalie_number: num,
        period,
        result:        null,
        shot_x:        null,
        shot_y:        null,
        zone_name:     null,
        man_up:        false,
        man_down:      false,
      });
    }
    render();
  },

  'open-goalie-retroactive': () => {
    APP.modal = { type: 'goalie-retroactive' };
    render();
  },

  'save-goalie-retroactive': () => {
    const match = DATA.scheduledMatches.find(m => String(m.id) === String(APP.matchId));
    const inputs = document.querySelectorAll('.modal [data-period][data-team]');
    APP.modal = null;
    render();

    inputs.forEach(input => {
      const period   = input.dataset.period;
      const slot     = input.dataset.team;
      const teamName = slot === 'A' ? match.team_A : match.team_B;
      const raw      = input.value.trim();

      const existing = DATA.events.find(e =>
        String(e.match_id) === String(match.id) &&
        e.event_type === 'goalie_set' &&
        e.team_event === teamName &&
        String(e.period) === String(period)
      );

      if (raw === '') {
        if (existing) deleteEvent(existing.id);
        return;
      }
      if (isNaN(Number(raw)) || Number(raw) < 0 || Number(raw) > 99 || !Number.isInteger(Number(raw))) return;
      const num = String(parseInt(raw, 10));

      if (existing) {
        if (String(existing.goalie_number) !== num) updateEvent(existing.id, { goalie_number: num });
      } else {
        recordEvent({
          event_type:    'goalie_set',
          team_event:    teamName,
          goalie_number: num,
          period,
          result:        null,
          shot_x:        null,
          shot_y:        null,
          zone_name:     null,
          man_up:        false,
          man_down:      false,
        });
      }
    });
    render();
  },
};

// ===== Event delegation =====

document.addEventListener('click', (e) => {
  // Click on .modal-bg directly (not on its children) closes the modal.
  if (e.target.classList && e.target.classList.contains('modal-bg')) {
    closeModal();
    return;
  }
  const target = e.target.closest('[data-action]');
  if (!target) return;
  // <select> dispatches via 'change' instead.
  if (target.tagName === 'SELECT') return;
  const action = target.dataset.action;
  if (action === 'modal-bg-click') return;
  const handler = HANDLERS[action];
  if (handler) handler(target.dataset.arg);
});

document.addEventListener('change', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  if (target.tagName !== 'SELECT' && target.type !== 'checkbox' && target.type !== 'date' && target.type !== 'file') return;
  const action = target.dataset.action;
  const handler = HANDLERS[action];
  if (!handler) return;
  if (action === 'analytics-filter-change' || action === 'csv-import-file' || action === 'standings-set-tournament') {
    handler(target.value, target);
  } else {
    handler(target.dataset.arg);
  }
});

// ── CSV parsing ────────────────────────────────────────────────────────────────

function parseCsvMatches(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length === 0) return { rows: [] };

  const sep = lines[0].indexOf(';') >= 0 ? ';' : ',';

  // Auto-detect header row
  const firstCells = lines[0].split(sep).map(c => c.trim().toLowerCase().replace(/^"|"$/g, ''));
  const hasHeader = ['turniej', 'tournament', 'data', 'date', 'druzyna_a', 'team_a'].some(h => firstCells.includes(h));
  const dataLines = hasHeader ? lines.slice(1) : lines;

  const rows = dataLines.map(function(line, i) {
    const cells = line.split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
    const tournament = cells[0] || '';
    const match_date = cells[1] || '';
    const team_A     = cells[2] || '';
    const team_B     = cells[3] || '';
    const video_url  = cells[4] || '';

    let _error = null;
    if (!tournament)                               _error = 'Brak nazwy turnieju';
    else if (!match_date)                          _error = 'Brak daty';
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(match_date)) _error = 'Nieprawidłowa data — wymagany format RRRR-MM-DD';
    else if (!team_A)                              _error = 'Brak drużyny A';
    else if (!team_B)                              _error = 'Brak drużyny B';

    return { tournament, match_date, team_A, team_B, video_url, _error, _lineNum: i + (hasHeader ? 2 : 1) };
  });

  return { rows };
}

