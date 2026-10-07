import { state } from './state.js';
import { pickPrompt, resetStory } from './story.js';

// Highway tuning lives here so typing feel is tweaked in one place.
export const HIGHWAY_CONFIG = {
  minSpeed: 4,
  maxSpeed: 26,
  wpmForMaxSpeed: 60,
  throttleGain: 0.5,
  centeringGain: 0.04,
  maxAutoHeading: 0.4,
  headingResponse: 3,
  // Wrong keys never enter the buffer, so backspace only steps back through letters you got right.
  // Phase 5 can flip this off to take the "undo" away from the player.
  allowBackspace: true,
};

// Rolling windows: city time and old mistakes stop dragging the numbers down.
// These same two numbers are what the Phase 6 tension estimator will consume.
const WPM_WINDOW_S = 20;
const WPM_MIN_SPAN_S = 5;
const ACCURACY_WINDOW = 50;
const CHARS_PER_WORD = 5; // standard WPM definition, so sentences and single words score fairly

let charTimes = [];   // game-clock time of each correct character
let keystrokes = [];  // rolling window of right/wrong
let sessionStart = null;

export function pickNewWord() {
  const t = state.typing;
  t.target = pickPrompt();
  t.buffer = '';
}

// restartStory: true on a full game reset. Re-entering the highway from the city keeps your place in the story.
export function beginTypingSession({ restartStory = false } = {}) {
  charTimes = [];
  keystrokes = [];
  sessionStart = null;
  state.typing.wordsCompleted = 0;
  state.typing.lastErrorAt = -Infinity;
  if (restartStory) resetStory();
  if (restartStory || !state.typing.target) pickNewWord();
  else state.typing.buffer = '';
}

// key is the literal character typed (case and punctuation preserved), one character long.
export function handleTypingKey(key) {
  const t = state.typing;
  if (sessionStart === null) sessionStart = state.time;

  const ok = key === t.target[t.buffer.length];
  keystrokes.push(ok);
  if (keystrokes.length > ACCURACY_WINDOW) keystrokes.shift();

  if (ok) {
    t.buffer += key;
    charTimes.push(state.time);
  } else {
    t.lastErrorAt = state.time;
  }

  if (t.buffer === t.target) {
    t.wordsCompleted++;
    pickNewWord();
  }
}

export function handleTypingBackspace() {
  const t = state.typing;
  if (!HIGHWAY_CONFIG.allowBackspace || !t.buffer) return;
  t.buffer = t.buffer.slice(0, -1);
}

export function getWpm() {
  if (sessionStart === null) return 0;
  const now = state.time;
  while (charTimes.length && charTimes[0] < now - WPM_WINDOW_S) charTimes.shift();
  const span = Math.min(Math.max(now - sessionStart, WPM_MIN_SPAN_S), WPM_WINDOW_S);
  return (charTimes.length / CHARS_PER_WORD) / (span / 60);
}

export function getAccuracy() {
  if (keystrokes.length === 0) return 1;
  let good = 0;
  for (const k of keystrokes) if (k) good++;
  return good / keystrokes.length;
}
