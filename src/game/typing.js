import { state } from './state.js';
import { pickPrompt, resetStory, skipToNextAct, isCaseInsensitive } from './story.js';

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

  // ---- speed model: WPM sustains speed, accuracy buys stability ----
  instabilityGain: 3,     // instability = (1 - accuracy) * this, clamped 0..1 (90% accuracy -> 0.3)
  jerkSteer: 0.6,         // wheel jerk per mistake, as a fraction of full steering lock
  jerkStreak: 3,          // ...but only once this many wrong keys happen IN A ROW (a slip or two is forgiven)
  driftAmp: 2.2,          // metres of lane wander at full instability
  driftSpeed: 0.6,        // rad/s of the wander
  hillGradeRef: 0.05,     // road grade (rise/run) that counts as a full climb
  hillStrainMax: 0.35,    // fraction of speed a non-typist loses on a full climb (fast typists hold speed)

  // ---- difficulty ramp (tutorial by osmosis): the first seconds on the highway are forgiving ----
  learnerRampS: 45,       // seconds over which the help below fades out
  learnerFloorSpeed: 10,  // m/s you keep even if you are not typing yet
};

// Rolling windows: city time and old mistakes stop dragging the numbers down.
// These same numbers are what the Phase 6 tension estimator will consume (see getTelemetry).
const WPM_WINDOW_S = 20;
const WPM_MIN_SPAN_S = 5;
const ACCURACY_WINDOW = 50;
const CHARS_PER_WORD = 5; // standard WPM definition, so sentences and single words score fairly
const KICK_LIFETIME_S = 1.5;
const TELEMETRY_WINDOW_S = 30;
const KEYLOG_MAX = 1500;
const PAUSE_S = 1.2;      // a gap this long between keys counts as a hesitation

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

let charTimes = [];   // game-clock time of each correct character
let keystrokes = [];  // rolling window of right/wrong
let kicks = [];       // recent wrong keys -> decaying wheel jerks { t, sign }
let sessionStart = null;
let wrongStreak = 0;  // consecutive wrong keys; any correct key clears it
let keyLog = [];      // whole-run record { t, key, expected, ok } (telemetry; cleared on a full reset)

export function pickNewWord() {
  const t = state.typing;
  const p = pickPrompt();
  t.buffer = '';
  if (!p) { // story over: the ending takes it from here (main.js)
    t.target = '';
    t.source = 'end';
    state.storyDone = true;
    return;
  }
  t.target = p.text;
  t.source = p.source;
}

// restartStory: true on a full game reset. Re-entering the highway from the city keeps your place in the story.
export function beginTypingSession({ restartStory = false } = {}) {
  charTimes = [];
  keystrokes = [];
  kicks = [];
  sessionStart = null;
  wrongStreak = 0;
  state.typing.wordsCompleted = 0;
  state.typing.lastErrorAt = -Infinity;
  if (restartStory) {
    keyLog = [];
    resetStory();
    state.storyDone = false;
  }
  if (restartStory || !state.typing.target) pickNewWord();
  else state.typing.buffer = '';
}

// key is the literal character typed (case and punctuation preserved), one character long.
export function handleTypingKey(key) {
  const t = state.typing;
  if (!t.target) return; // nothing to type (story finished)
  if (sessionStart === null) sessionStart = state.time;

  const expected = t.target[t.buffer.length];
  const insensitive = isCaseInsensitive(t.source);
  const ok = insensitive ? key.toLowerCase() === expected.toLowerCase() : key === expected;
  keystrokes.push(ok);
  if (keystrokes.length > ACCURACY_WINDOW) keystrokes.shift();
  keyLog.push({ t: state.time, key, expected, ok });
  if (keyLog.length > KEYLOG_MAX) keyLog.shift();

  if (ok) {
    t.buffer += insensitive ? expected : key;
    charTimes.push(state.time);
    wrongStreak = 0;
  } else {
    t.lastErrorAt = state.time;
    wrongStreak++;
    // a slip or two is forgiven; a streak of mistakes yanks the wheel (each extra wrong key yanks it again)
    if (wrongStreak >= HIGHWAY_CONFIG.jerkStreak) kicks.push({ t: state.time, sign: Math.random() < 0.5 ? -1 : 1 });
  }

  if (t.buffer === t.target) {
    t.wordsCompleted++;
    pickNewWord();
  }
}

// Dev (F6): jump to the first paragraph of the next act.
export function skipActDev() {
  skipToNextAct();
  pickNewWord();
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

// 0 = rock steady, 1 = all over the road. Recovers on its own as clean keystrokes fill the accuracy window.
export function getInstability() {
  return clamp((1 - getAccuracy()) * HIGHWAY_CONFIG.instabilityGain, 0, 1);
}

// Steering kick -1..1 from recent wrong keys: each mistake yanks the wheel one random way, then it settles.
export function getWheelJerk() {
  const now = state.time;
  while (kicks.length && now - kicks[0].t > KICK_LIFETIME_S) kicks.shift();
  let j = 0;
  for (const k of kicks) {
    const age = now - k.t;
    j += k.sign * Math.exp(-age / 0.35) * Math.min(age / 0.04, 1);
  }
  return clamp(j, -1, 1);
}

// Typing telemetry for pacing (Phase 6 tension estimator reads this; same shape a NN would get).
// In dev builds the console has window.typingTelemetry.summary() / .log() / .logJson().
export function getTelemetry() {
  const now = state.time;
  const recent = keyLog.filter((k) => now - k.t <= TELEMETRY_WINDOW_S);
  const gaps = [];
  let longestPause = 0;
  let pauses = 0;
  for (let i = 1; i < recent.length; i++) {
    const gap = recent[i].t - recent[i - 1].t;
    if (gap >= PAUSE_S) { pauses++; longestPause = Math.max(longestPause, gap); } else gaps.push(gap);
  }
  const mean = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
  const variance = gaps.length ? gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length : 0;
  const std = Math.sqrt(variance);
  const wrong = recent.filter((k) => !k.ok);

  const confusions = {};
  for (const k of keyLog) if (!k.ok) confusions[`${k.expected}>${k.key}`] = (confusions[`${k.expected}>${k.key}`] || 0) + 1;
  const topConfusions = Object.entries(confusions).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return {
    wpm: getWpm(),
    accuracy: getAccuracy(),
    instability: getInstability(),
    keystrokes: recent.length,
    errorRate: recent.length ? wrong.length / recent.length : 0,
    intervalMean: mean,                    // seconds between keys
    intervalStd: std,
    rhythm: mean > 0 ? std / mean : 0,     // coefficient of variation: high = ragged, panicky typing
    pauses,
    longestPause,
    topConfusions,                         // [['e>r', 3], ...] expected>typed over the whole run
  };
}

export function getKeyLog() {
  return keyLog.slice();
}


// Advance the current story/sign prompt without requiring player typing.
export function advancePromptAutomatically() {
  if (!state.typing.target) return;
  state.typing.wordsCompleted++;
  pickNewWord();
}
