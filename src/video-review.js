'use strict';

// Linking events to a moment in the match recording. The recording opens as a
// plain link (new tab, move it to the second screen); the moment is typed in
// the edit modal — seconds, or a pasted YouTube URL with &t=.
// The earlier embedded-player popup (about:blank + YouTube IFrame API) was
// removed: inside the GAS sandbox it was unreliable (Safari crashes, popup
// blocking, YouTube embed rejections).

// Ręczne wpisanie: gołe sekundy, czas jak w odtwarzaczu (m:ss / h:mm:ss)
// albo wklejony pełny URL z &t=/?start=.
function parseVideoTimestampInput(str) {
  if (!str) return null;
  str = String(str).trim();
  if (/^\d+$/.test(str)) return parseInt(str, 10);
  const clock = str.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (clock) return (parseInt(clock[1] || '0', 10) * 3600) + parseInt(clock[2], 10) * 60 + parseInt(clock[3], 10);
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

// 754 → "12:34", 3723 → "1:02:03" — the same format the player shows.
function formatVideoTs(seconds) {
  const t = Math.floor(Number(seconds));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  const pad = n => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
