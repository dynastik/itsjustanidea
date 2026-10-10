import { state } from './state.js';
import { HIGHWAY_CONFIG, getWpm, getAccuracy, getInstability, getWheelJerk } from './typing.js';
import { HANDOFF_SPEED_S } from './zones.js';

// Non-printable keys on purpose: the highway types letters, capitals, spaces and punctuation.
export const KEYS = {
  debug: '`',
  devModeSwitch: 'tab',
  cabView: 'f2',
  look: 'f3',
  reset: 'f4',
  skipTime: 'f6',
  mute: 'f9',
  headlights: 'f5',
  pause: 'escape',
};

const CITY_SPEED_CAP = 16;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// The ONE object the vehicle reads. City fills it from WASD, highway from typing.
// Phase 5 horror injects wheel pull / brake lag by modifying it before vehicle.step().
// steer: -1 (right) .. +1 (left) | throttle: -1 (reverse) .. 1 | brake: 0..1
export function createDriveInput() {
  return { steer: 0, throttle: 0, brake: 0, speedCap: CITY_SPEED_CAP };
}

export function createInput(actions) {
  const held = { w: false, a: false, s: false, d: false };
  const hotkeys = {
    [KEYS.debug]: actions.toggleDebug,
    [KEYS.devModeSwitch]: actions.devSwitchMode,
    [KEYS.cabView]: actions.toggleCab,
    [KEYS.look]: actions.cycleLook,
    [KEYS.reset]: actions.reset,
    [KEYS.skipTime]: actions.skipTime,
    [KEYS.mute]: actions.toggleMute,
    [KEYS.headlights]: actions.toggleHeadlights,
    [KEYS.pause]: actions.togglePause,
  };
  for (const k in hotkeys) if (!hotkeys[k]) delete hotkeys[k]; // e.g. the dev mode switch isn't registered in release builds

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.toLowerCase();

    if (state.mode === 'city' && !e.repeat && (key === '1' || key === '2')) {
      e.preventDefault();
      actions.setStoryMode?.(key === '1' ? 'short' : 'long');
      return;
    }

    if (key === 'r' && state.mode === 'city') {
      e.preventDefault();
      if (!e.repeat) actions.reset();
      return;
    }

    // Shift is a single clutch-like request: choose the gear appropriate to current speed.
    // It works in both modes and never consumes story text. No background shifting occurs.
    if (key === 'shift') {
      e.preventDefault();
      if (!e.repeat && !state.paused) actions.smartShift?.();
      return;
    }

    if (key in hotkeys) {
      e.preventDefault();
      if (key === KEYS.cabView) clearHeld();
      if (!e.repeat) hotkeys[key]();
      return;
    }

    if (e.repeat || state.paused) return;

    if (state.mode === 'city') {
      if (key in held) held[key] = true;
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      actions.typeBackspace?.();
    } else if (e.key.length === 1) {
      e.preventDefault(); // stops ' and / opening Firefox quick-find, space scrolling, etc.
      actions.typeKey(e.key); // literal char: capitals, spaces and punctuation all count now
    }
  });

  window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (key in held) held[key] = false;
  });
  window.addEventListener('blur', clearHeld);

  function clearHeld() {
    for (const k in held) held[k] = false;
  }

  return {
    clearHeld,
    writeCity(d, speed) {
      d.steer = (held.a ? 1 : 0) - (held.d ? 1 : 0);
      d.throttle = 0;
      d.brake = 0;
      if (held.w) d.throttle = 1;
      else if (held.s) {
        if (speed > 0.3) d.brake = 1;
        else d.throttle = -1;
      }
      d.speedCap = CITY_SPEED_CAP;
    },
  };
}

// Highway: hands-off. Lane-follow steering + throttle chasing a WPM x accuracy target speed.
// Speed model: WPM sustains speed (and holds it up hills), accuracy buys stability. Wrong keys yank the
// wheel, sloppy typing makes the lane wander. The first seconds are forgiving (see learnerRampS).
export function writeHighwayInput(d, vehicle, road = null) {
  const c = HIGHWAY_CONFIG;
  const wpmFactor = clamp(getWpm() / c.wpmForMaxSpeed, 0, 1);
  const sinceEntry = state.time - state.highwayEnteredAt;
  const learn = 1 - clamp(sinceEntry / c.learnerRampS, 0, 1); // 1 on arrival -> 0 once settled in
  const z = vehicle.center.z;
  // ramp -> deck -> hill arc follow drivePath; once the road is z-indexed again (ground highway) follow getRoadFrame(z)
  const usePath = !!road?.drivePath?.length && z < (road.groundStartZ ?? Infinity);
  let frame = road?.getRoadFrame(z) ?? { x: 0, heading: 0, y: 0 };
  let lateral;
  let curvature = 0; // heading change per metre of road (feed-forward so bends do not need a lateral error to be followed)
  if (usePath) {
    const path = road.drivePath;
    let nearest = 0, best = Infinity;
    for (let i = 0; i < path.length; i++) {
      const dx = vehicle.center.x - path[i].x, dz = vehicle.center.z - path[i].z;
      const dist = dx * dx + dz * dz;
      if (dist < best) { best = dist; nearest = i; }
    }
    const a = path[Math.max(0, nearest - 1)], b = path[Math.min(path.length - 1, nearest + 1)], p = path[nearest];
    frame = { x: p.x, y: p.y, z: p.z, heading: Math.atan2(b.x - a.x, b.z - a.z) };
    lateral = (vehicle.center.x - p.x) * Math.cos(frame.heading) - (vehicle.center.z - p.z) * Math.sin(frame.heading);
    if (nearest > 0 && nearest < path.length - 1) {
      const ds = (Math.hypot(p.x - a.x, p.z - a.z) + Math.hypot(b.x - p.x, b.z - p.z)) / 2;
      if (ds > 0.5) curvature = (Math.atan2(b.x - p.x, b.z - p.z) - Math.atan2(p.x - a.x, p.z - a.z)) / ds;
    }
  } else {
    lateral = vehicle.center.x - frame.x;
    if (road) curvature = (road.getRoadFrame(z + 4).heading - road.getRoadFrame(z - 4).heading) / 8;
  }
  curvature = clamp(curvature, -0.05, 0.05);

  // Uphill = engine strain: people who are not typing lose speed on climbs, fast typists hold it.
  let strain = 0;
  if (road) {
    const grade = usePath ? 0 : (road.getRoadFrame(z + 3).y - road.getRoadFrame(z - 3).y) / 6;
    strain = clamp(grade / c.hillGradeRef, 0, 1);
  }
  const strainPenalty = strain * (1 - wpmFactor) * c.hillStrainMax;
  const typedTarget = (c.minSpeed + (c.maxSpeed - c.minSpeed) * wpmFactor) * getAccuracy() * (1 - strainPenalty);

  // Handoff from the city: carry the speed you arrived with, easing it down to what your typing earns.
  // (Type to keep your speed: tutorial by osmosis.) The learner floor keeps a beginner rolling a bit longer.
  const ease = clamp(sinceEntry / HANDOFF_SPEED_S, 0, 1);
  const carry = state.highwayEntrySpeed * (1 - ease * ease * (3 - 2 * ease));
  const target = Math.max(typedTarget, carry, c.learnerFloorSpeed * learn);
  const err = target - vehicle.speed;
  d.throttle = clamp(err * c.throttleGain, 0, 1);
  d.brake = clamp(-err * c.throttleGain, 0, 1);
  d.speedCap = c.maxSpeed;

  // Sloppy typing makes the lane wander (slow, smooth, never off the road at full instability).
  const instability = getInstability() * (1 - 0.6 * learn);
  const drift = instability * c.driftAmp * Math.sin(state.time * c.driftSpeed + 1.7 * Math.sin(state.time * 0.31));

  // Desired heading points back at the lane centre; invert the bicycle model so loop gain stays
  // constant at any speed. Uses the vehicle's speed-sensitive max steer.
  lateral += drift;
  const desiredHeading = clamp(
    frame.heading - lateral * c.centeringGain,
    frame.heading - c.maxAutoHeading,
    frame.heading + c.maxAutoHeading
  );
  const wDes = c.headingResponse * (desiredHeading - vehicle.heading) + curvature * Math.max(vehicle.speed, 0);
  const v = Math.abs(vehicle.speed);
  const angle = Math.atan((wDes * vehicle.cfg.wheelbase) / Math.max(v, 2));
  const steer = angle / vehicle.maxSteerAtSpeed(v);
  // every wrong key yanks the wheel (halved while you are still learning)
  d.steer = clamp(steer + getWheelJerk() * c.jerkSteer * (1 - 0.5 * learn), -1, 1);
}
