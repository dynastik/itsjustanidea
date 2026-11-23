// Whole-run typing stats for the ending screen (keystrokes, active typing time, best WPM saved locally).
const KEY = 'itsjustanidea.best';
let correct = 0, wrong = 0, active = 0, lastT = null, firstT = null, lastNow = 0;

export function reset() { correct = 0; wrong = 0; active = 0; lastT = null; firstT = null; lastNow = 0; }

// ok: was the keystroke right; now: state.time (game clock, frozen while paused)
export function record(ok, now) {
  if (firstT === null) firstT = now;
  if (lastT !== null) active += Math.min(Math.max(now - lastT, 0), 2); // long gaps (city driving, thinking) do not count
  lastT = now; lastNow = now;
  if (ok) correct++; else wrong++;
}

export function getBest() {
  try { return Number(window.localStorage.getItem(KEY)) || 0; } catch { return 0; }
}

export function summary() {
  const keys = correct + wrong;
  const wpm = keys ? (correct / 5) / (Math.max(active, 5) / 60) : 0;
  return { keys, wpm, accuracy: keys ? correct / keys : 1, seconds: firstT === null ? 0 : lastNow - firstT, best: getBest() };
}

// Saves a new best WPM; returns true if this run beat the old one.
export function commitBest() {
  const s = summary();
  if (s.keys < 50 || s.wpm <= s.best) return false;
  try { window.localStorage.setItem(KEY, String(Math.round(s.wpm))); } catch { /* storage may be blocked */ }
  return true;
}
