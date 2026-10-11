import { state } from './state.js';
import { HIGHWAY_CONFIG, getWpm, getInstability, getWheelJerk } from './typing.js';

// Driving controls are shared; highway steering is automated.
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

const CITY_SPEED_CAP = 25;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

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
  for (const k in hotkeys) if (!hotkeys[k]) delete hotkeys[k];

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

    if (key in hotkeys) {
      e.preventDefault();
      if (key === KEYS.cabView || key === KEYS.debug) clearHeld();
      if (!e.repeat) hotkeys[key]();
      return;
    }

    // Highway letters belong to the typing mechanic, including Q/E and uppercase characters.
    // Route them before gear shortcuts so story text can contain every letter.
    if (state.mode === 'highway') {
      if (state.paused || e.repeat) return;
      if (key === 'backspace') {
        e.preventDefault();
        actions.typeBackspace?.();
      } else if (e.key.length === 1) {
        e.preventDefault();
        actions.typeKey?.(e.key);
      }
      return;
    }

    // Q/E shift down/up in the city; Shift quick-selects a speed-appropriate gear.
    if (key === 'q' || key === 'e') {
      e.preventDefault();
      if (!e.repeat && !state.paused) {
        if (key === 'q') actions.shiftDown?.();
        else actions.shiftUp?.();
      }
      return;
    }

    if (key === 'shift') {
      e.preventDefault();
      if (!e.repeat && !state.paused) actions.smartShift?.();
      return;
    }

    if (e.repeat || state.paused) return;
    if (key in held) held[key] = true;
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
    writeHighway(d, vehicle, road) { writeHighwayInput(d, vehicle, road, held); },
    writeCity(d, speed) {
      d.steer = (held.a ? 1 : 0) - (held.d ? 1 : 0);
      d.throttle = 0;
      d.brake = 0;
      if (held.w) d.throttle = 1;
      else if (held.s) d.brake = 1;
      d.speedCap = CITY_SPEED_CAP;
    },
  };
}

// Highway: typing sustains speed; accurate typing keeps the van stable. Steering follows the road.
export function writeHighwayInput(d, vehicle, road = null, held = {}) {
  const c = HIGHWAY_CONFIG;
  const z = vehicle.center.z;
  const usePath = !!road?.drivePath?.length && z < (road.groundStartZ ?? Infinity);
  let frame = road?.getRoadFrame(z) ?? { x: 0, heading: 0, y: 0 };
  let lateral;
  let curvature = 0;

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

  const elapsed = Math.max(0, state.time - (state.highwayEnteredAt || state.time));
  const learner = 1 - clamp(elapsed / c.learnerRampS, 0, 1);
  const typingSpeed = c.minSpeed + clamp(getWpm() / c.wpmForMaxSpeed, 0, 1) * (c.maxSpeed - c.minSpeed);
  const targetSpeed = Math.max(typingSpeed, c.learnerFloorSpeed * learner);
  const speed = Math.max(0, vehicle.speed);
  d.throttle = speed < targetSpeed - 0.35 ? 1 : 0;
  d.brake = speed > targetSpeed + 1.5 ? clamp((speed - targetSpeed) * 0.12, 0, 0.35) : 0;
  d.speedCap = c.maxSpeed;

  const instability = getInstability();
  const drift = Math.sin(state.time * c.driftSpeed * Math.PI * 2) * c.driftAmp * instability;
  const jerk = getWheelJerk() * c.jerkSteer;
  const desiredHeading = clamp(
    frame.heading - (lateral - drift) * c.centeringGain + jerk * 0.12,
    frame.heading - c.maxAutoHeading,
    frame.heading + c.maxAutoHeading
  );
  const wDes = c.headingResponse * (desiredHeading - vehicle.heading) + curvature * Math.max(vehicle.speed, 0);
  const steerSpeed = Math.abs(vehicle.speed);
  const angle = Math.atan((wDes * vehicle.cfg.wheelbase) / Math.max(steerSpeed, 2));
  d.steer = clamp(angle / vehicle.maxSteerAtSpeed(steerSpeed), -1, 1);
}
