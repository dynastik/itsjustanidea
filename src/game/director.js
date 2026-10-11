// Director: the horror pacing. The story decides the act (see story.js), so the director simply reports it;
// when Phase 5 props/audio/cab wrongness need to know "how bad is it", they ask here.
//
// It also owns the few AUTHORED headlight flickers (roadmap Phase 2: never random, only when the story asks).
import { state } from './state.js';
import { getAct } from './story.js';

const HIGHWAY_ZONE_Z = 80;

export const DIRECTOR_STATE = {
  CALM: 'calm',
  UNEASY: 'uneasy',
  WRONG: 'wrong',
  HORROR: 'horror',
  FINALE: 'finale',
};

let distanceDriven = 0;

export function getDirectorState() {
  return getAct();
}

export function getDistanceDriven() {
  return distanceDriven;
}

export function update(vehicleZ) {
  // distance on the highway, kept for Phase 5 (road-loop tricks key off it); the act itself comes from the story
  distanceDriven = state.mode === 'highway' ? Math.max(vehicleZ - HIGHWAY_ZONE_Z, 0) : 0;
}

// ---------- authored headlight flicker ----------
// Only these road messages trigger it, so the player learns to trust the lights first and then loses them twice.
const HEADLIGHT_CUES = new Set([
  'YOU HAVE BEEN HERE BEFORE.',
  'YOU WERE ALWAYS GOING TO COME HERE.',
  'DELIVERY RECIPIENT: IDENTIFIED.',
]);
const FLICKER_S = 1.3;
// [segment end (s), glitch 0..1] where 1 = beams fully out
const FLICKER_STEPS = [[0.12, 1], [0.22, 0], [0.30, 1], [0.55, 0.15], [0.70, 1], [FLICKER_S, 0.35]];
const reducedMotion = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
let flickerStart = -Infinity;

// Called when a new typing prompt starts. Does nothing unless the prompt is a cue and the player has the lights on.
export function cueHeadlights(promptText, now, lightsOn) {
  if (lightsOn && HEADLIGHT_CUES.has(promptText)) flickerStart = now;
}

// 0 = normal, 1 = beams out. Reduced-motion players get one slow dim instead of a strobe.
export function getHeadlightGlitch(now) {
  const t = now - flickerStart;
  if (t < 0 || t > FLICKER_S) return 0;
  if (reducedMotion) return 0.5 * Math.sin(Math.PI * t / FLICKER_S);
  for (const [end, value] of FLICKER_STEPS) if (t < end) return value;
  return 0;
}

export function reset() {
  distanceDriven = 0;
  flickerStart = -Infinity;
}
