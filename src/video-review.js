'use strict';

// Przypisywanie zdarzeń do konkretnego momentu w nagraniu YouTube — retroaktywnie,
// podczas przeglądania filmu po meczu. Nie modelujemy czasu meczowego (timeSec) —
// jedno nagranie czasem obejmuje kilka meczów pod rząd, więc "czas meczu → czas
// filmu" nie da się wiarygodnie policzyć. Zamiast tego każde zdarzenie dostaje
// wprost bezwzględny znacznik czasu w filmie (video_ts, sekundy).
//
// Odtwarzacz żyje w osobnym oknie, wypełnianym przez YouTube IFrame API —
// dzięki temu mamy bezpośredni dostęp do jego aktualnego czasu odtwarzania
// (ten sam origin co strona główna, więc bez postMessage).
//
// WAŻNE: window.open() dostaje jawny literał 'about:blank', NIE pusty string.
// Aplikacja działa wewnątrz sandboxowego iframe'a GAS (*.googleusercontent.com);
// pusty string w window.open('', ...) rozwiązuje się tam do bieżącego, PEŁNEGO
// URL-a aplikacji (nie do about:blank), więc document.write ścigał się z
// nawigacją do kopii całej appki — to powodowało crash renderera w Safari.
// Blob URL (wcześniejsza próba naprawy) usuwał ten wyścig, ale Safari w tym
// samym sandboxowanym kontekście blokuje window.open na nietypowe schematy
// (blob:/data:) niezależnie od ustawienia "Pozwól" dla wyskakujących okien —
// stąd powrót do klasycznego, szeroko kompatybilnego about:blank + document.write.

function extractYouTubeId(url) {
  if (!url) return null;
  // 'live/' — transmisje na żywo (częste dla turniejów: jedna transmisja na cały dzień).
  const m = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([\w-]{6,})/);
  return m ? m[1] : null;
}

// Jeśli video_url meczu już niesie swój własny &t=/?start= (typowe dla linku
// wskazującego z grubsza początek meczu w wielogodzinnej transmisji dnia),
// użyj go jako punktu startowego odtwarzacza — nie ma sensu zaczynać od 0:00.
function extractStartHint(url) {
  const seconds = parseVideoTimestampInput(url || '');
  return seconds !== null ? seconds : 0;
}

function openVideoReviewWindow(videoUrl) {
  const videoId = extractYouTubeId(videoUrl);
  if (!videoId) {
    alert(APP.lang === 'pl'
      ? 'Nie rozpoznano ID filmu YouTube w linku meczu.'
      : 'Could not parse a YouTube video ID from the match link.');
    return;
  }

  if (APP.videoReviewWindow && !APP.videoReviewWindow.closed) {
    APP.videoReviewWindow.focus();
    return;
  }

  const popup = window.open('about:blank', 'lacrosse-video-review', 'width=960,height=640');
  if (!popup) {
    alert(APP.lang === 'pl'
      ? 'Przeglądarka zablokowała otwarcie okna z odtwarzaczem (popup blocker) — pozwól na wyskakujące okna dla tej strony.'
      : 'The browser blocked the video review popup — allow pop-ups for this site.');
    return;
  }

  const startHint = extractStartHint(videoUrl);
  popup.document.open();
  popup.document.write(
    '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Lacrosse Stats — wideo</title>' +
    '<style>html,body{margin:0;height:100%;background:#000;}#player{width:100%;height:100%;}</style>' +
    '</head><body>' +
    '<div id="player"></div>' +
    '<script src="https://www.youtube.com/iframe_api"><' + '/script>' +
    '<script>' +
    'window.onYouTubeIframeAPIReady = function() {' +
    '  window.ytPlayer = new YT.Player("player", { videoId: ' + JSON.stringify(videoId) +
    ', playerVars: { autoplay: 1, start: ' + startHint + ' },' +
    ' events: { onError: function(e) { window.ytPlayerError = e.data; } } });' +
    '};' +
    '<' + '/script>' +
    '</body></html>'
  );
  popup.document.close();
  APP.videoReviewWindow = popup;
}

function isVideoPlayerAvailable() {
  const w = APP.videoReviewWindow;
  return !!(w && !w.closed && w.ytPlayer && typeof w.ytPlayer.getCurrentTime === 'function' && !w.ytPlayerError);
}

// Ten film odrzucił osadzenie (np. właściciel wyłączył embedding — częste dla
// transmisji na żywo spoza naszego kanału) — odróżniamy to od "okno niegotowe",
// żeby pokazać trafniejszą podpowiedź i nie proponować trybu "z odtwarzacza",
// który i tak niczego by nie przechwycił.
function videoPlayerErrorReason() {
  const w = APP.videoReviewWindow;
  return (w && !w.closed && w.ytPlayerError) ? w.ytPlayerError : null;
}

function getCurrentPlayerTime() {
  if (!isVideoPlayerAvailable()) return null;
  try {
    const t = APP.videoReviewWindow.ytPlayer.getCurrentTime();
    return Number.isFinite(t) ? Math.floor(t) : null;
  } catch (err) {
    return null;
  }
}

// Ręczne wpisanie: albo gołe sekundy, albo wklejony pełny URL z &t=/?start=.
function parseVideoTimestampInput(str) {
  if (!str) return null;
  str = String(str).trim();
  if (/^\d+$/.test(str)) return parseInt(str, 10);
  const m = str.match(/[?&](?:t|start)=(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

// Ustawia/nadpisuje parametr t= — video_url meczu (linki do transmisji dnia)
// często już ma swoje własne &t=, więc zwykłe doklejenie dawałoby dwa "t=" naraz.
function appendYtTimestamp(url, seconds) {
  try {
    const u = new URL(url);
    u.searchParams.set('t', Math.floor(seconds) + 's');
    return u.toString();
  } catch (err) {
    const sep = url.indexOf('?') === -1 ? '?' : '&';
    return url + sep + 't=' + Math.floor(seconds) + 's';
  }
}
