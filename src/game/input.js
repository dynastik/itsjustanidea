import { state } from './state.js';
import { HIGHWAY_CONFIG } from './typing.js';

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

// Match the vehicle's 30 m/s max; per-gear caps still apply.
const CITY_SPEED_CAP = 30;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// The ONE object the vehicle reads. City uses WASD steering; highway follows the road automatically.
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

    // Q/E shift down/up in both zones; Shift quick-selects a speed-appropriate gear.
    if (key === 'q' || key === 'e') {
      e.preventDefault();
      if (!e.repeat && !state.paused) {
        if (key === 'q') actions.shiftDown?.();
        else actions.shiftUp?.();
      }
      return;
    }

    // Shift quick-selects a gear in either zone.
    if (key === 'shift') {
      e.preventDefault();
      if (!e.repeat && !state.paused) actions.smartShift?.();
      return;
    }

    if (key in hotkeys) {
      e.preventDefault();
      // Don't carry a held accelerator into debug mode (or back out of it).
      if (key === KEYS.cabView || key === KEYS.debug) clearHeld();
      if (!e.repeat) hotkeys[key]();
      return;
    }

    if (e.repeat || state.paused) return;

    // W/S drive in both zones. A/D only affect city steering; highway steering is automatic.
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
export function writeHighwayInput(d, vehicle, road = null, held = {}) {
  const c = HIGHWAY_CONFIG;
  const z = vehicle.center.z;
  // Follow the sampled ramp path, then the road's regular frame beyond the ramp.
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

  // W accelerates, S brakes. Steering follows the lane and anticipates road curvature.
  d.throttle = held.w ? 1 : 0;
  d.brake = held.s ? 1 : 0;
  d.speedCap = c.maxSpeed;

  const desiredHeading = clamp(
    frame.heading - lateral * c.centeringGain,
    frame.heading - c.maxAutoHeading,
    frame.heading + c.maxAutoHeading
  );
  const wDes = c.headingResponse * (desiredHeading - vehicle.heading) + curvature * Math.max(vehicle.speed, 0);
  const speed = Math.abs(vehicle.speed);
  const angle = Math.atan((wDes * vehicle.cfg.wheelbase) / Math.max(speed, 2));
  d.steer = clamp(angle / vehicle.maxSteerAtSpeed(speed), -1, 1);
}
