import { state } from './state.js';
import { pickWord } from './story.js';

// Highway tuning lives here so typing feel is tweaked in one place.
export const HIGHWAY_CONFIG = {
  minSpeed: 4,
  maxSpeed: 26,
  wpmForMaxSpeed: 60,
  throttleGain: 0.5,
  centeringGain: 0.04,
  maxAutoHeading: 0.4,
  headingResponse: 3,
};

// Rolling windows: city time and old mistakes stop dragging the numbers down.
// These same two numbers are what the Phase 6 tension estimator will consume.
const WPM_WINDOW_S = 20;
const WPM_MIN_SPAN_S = 5;
const ACCURACY_WINDOW = 50;

let completions = [];
let keystrokes = [];
let sessionStart = null;

export function pickNewWord() {
  const t = state.typing;
  t.target = pickWord();
  t.buffer = '';
}

export function beginTypingSession() {
  completions = [];
  keystrokes = [];
  sessionStart = null;
  state.typing.wordsCompleted = 0;
  state.typing.lastErrorAt = -Infinity;
  pickNewWord();
}

export function handleTypingKey(key) {
  const t = state.typing;
  if (sessionStart === null) sessionStart = state.time;

  const ok = key === t.target[t.buffer.length];
  keystrokes.push(ok);
  if (keystrokes.length > ACCURACY_WINDOW) keystrokes.shift();

  if (ok) t.buffer += key;
  else t.lastErrorAt = state.time;

  if (t.buffer === t.target) {
    t.wordsCompleted++;
    completions.push(state.time);
    pickNewWord();
  }
}

export function getWpm() {
  if (sessionStart === null) return 0;
  const now = state.time;
  while (completions.length && completions[0] < now - WPM_WINDOW_S) completions.shift();
  const span = Math.min(Math.max(now - sessionStart, WPM_MIN_SPAN_S), WPM_WINDOW_S);
  return completions.length / (span / 60);
}

export function getAccuracy() {
  if (keystrokes.length === 0) return 1;
  let good = 0;
  for (const k of keystrokes) if (k) good++;
  return good / keystrokes.length;
}