// Typing difficulty presets affect pressure and mistake tolerance only.
// Story content is never gated by WPM. Cycle with F7 or use ?difficulty=easy|medium|hard.
import { HIGHWAY_CONFIG } from './typing.js';

const KEY = 'itsjustanidea.difficulty';
export const DIFFICULTIES = ['easy', 'medium', 'hard'];
const TUNED = ['minSpeed', 'wpmForMaxSpeed', 'instabilityGain', 'jerkSteer', 'jerkStreak', 'driftAmp', 'learnerRampS', 'learnerFloorSpeed'];
const BASE = Object.fromEntries(TUNED.map((k) => [k, HIGHWAY_CONFIG[k]]));

const PRESETS = {
  easy: { minSpeed: 6, wpmForMaxSpeed: 40, instabilityGain: 1.5, jerkSteer: 0.3, jerkStreak: 5, driftAmp: 1.2, learnerRampS: 90, learnerFloorSpeed: 12 },
  medium: {},
  hard: { minSpeed: 3, wpmForMaxSpeed: 75, instabilityGain: 4.5, jerkSteer: 0.8, jerkStreak: 2, driftAmp: 3, learnerRampS: 20, learnerFloorSpeed: 6 },
};
let current = 'medium';
function apply() { Object.assign(HIGHWAY_CONFIG, BASE, PRESETS[current]); }
export function getDifficulty() { return current; }
export function setDifficulty(name) {
  if (!DIFFICULTIES.includes(name)) return;
  current = name;
  try { window.localStorage.setItem(KEY, name); } catch { /* storage may be blocked */ }
  apply();
}
export function cycleDifficulty() {
  setDifficulty(DIFFICULTIES[(DIFFICULTIES.indexOf(current) + 1) % DIFFICULTIES.length]);
  return current;
}
try {
  const wanted = new URLSearchParams(window.location.search).get('difficulty') || window.localStorage.getItem(KEY);
  if (DIFFICULTIES.includes(wanted)) current = wanted;
} catch { /* ignore */ }
apply();
