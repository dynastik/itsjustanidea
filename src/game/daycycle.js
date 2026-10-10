// The one place that knows what time of day it is. worldTime runs 0..1 over one full day:
//
//   c 0.00 morning -> 0.12-0.46 afternoon to sunset -> 0.46-0.64 dusk to night -> night
//     -> 0.76-0.86 night to sunrise -> 0.86-0.97 sunrise to morning -> (wraps to 0.00)
//
// lighting.js, render.js (colour grade) and city.js (windows, streetlights) all read these factors, so
// they can never disagree. Phase 5 can drive worldTime by distance/story beat instead of the wall clock
// without touching any of them.
import * as THREE from 'three';

// 'story': the clock follows how far through the story the player has typed (day -> night -> false sunrise, see
//          story.js). This is the real game.
// 'free':  the clock loops by itself every DAY_CYCLE_SECONDS. Handy for tuning the sky without typing.
export const CLOCK_MODE = 'story';
export const DAY_CYCLE_SECONDS = 300;
export const LONG_DAY_SECONDS = 900;

const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
const clamp01 = (v) => THREE.MathUtils.clamp(v, 0, 1);

const SUN_RISE = 0.84; // the sun is above the horizon from here for DAY_LEN of the cycle
const DAY_LEN = 0.62;

export function wrapTime(t) {
  return ((t % 1) + 1) % 1;
}

// The three consumers each call this every frame with the same time, so the last result is reused.
let lastTime = NaN;
let lastFactors = null;

export function dayFactors(worldTime) {
  if (worldTime === lastTime) return lastFactors;
  lastTime = worldTime;
  const c = wrapTime(worldTime);
  const sinceRise = wrapTime(c - SUN_RISE);
  lastFactors = {
    // Palette blends, same meaning as before: colour = morning.lerp(evening, evening).lerp(night, night).
    // At dawn night fades out first (leaving the orange "evening" palette = sunrise), then evening fades out.
    evening: smooth(0.12, 0.46, c) * (1 - smooth(0.86, 0.97, c)),
    night: smooth(0.46, 0.64, c) * (1 - smooth(0.76, 0.86, c)),
    // 0 at sunrise, 1 at sunset; > 1 means the sun is down
    dayFrac: sinceRise / DAY_LEN,
    // moon: 0..1 across the night, and how strongly it shines
    moonFrac: clamp01((c - 0.5) / 0.36),
    moonAmount: smooth(0.52, 0.66, c) * (1 - smooth(0.76, 0.86, c)),
    // streetlights come on in the dusk and go off during sunrise
    lamp: smooth(0.3, 0.52, c) * (1 - smooth(0.8, 0.9, c)),
  };
  return lastFactors;
}
