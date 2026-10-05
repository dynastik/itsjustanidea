import { state } from './state.js';
import { HIGHWAY_CONFIG, getWpm, getAccuracy } from './typing.js';

// Non-letter keys on purpose: the highway uses the whole alphabet for typing.
export const KEYS = {
  debug: '`',
  devModeSwitch: 'tab',
  cabView: 'f2',
  look: 'f3',
  reset: 'f4',
  mute: 'f9',
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
    [KEYS.mute]: actions.toggleMute,
    [KEYS.pause]: actions.togglePause,
  };

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.toLowerCase();

    if (key === 'r' && state.mode === 'city') {
      e.preventDefault();
      if (!e.repeat) actions.reset();
      return;
    }

    if (key in hotkeys) {
      e.preventDefault();
      if (!e.repeat) hotkeys[key]();
      return;
    }

    if (e.repeat || state.paused) return;

    if (state.mode === 'city') {
      if (key in held) held[key] = true;
    } else if (key.length === 1 && /[a-z]/.test(key)) {
      actions.typeKey(key);
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
export function writeHighwayInput(d, vehicle, road = null) {
  const c = HIGHWAY_CONFIG;
  const wpmFactor = clamp(getWpm() / c.wpmForMaxSpeed, 0, 1);
  const target = (c.minSpeed + (c.maxSpeed - c.minSpeed) * wpmFactor) * getAccuracy();
  const err = target - vehicle.speed;
  d.throttle = clamp(err * c.throttleGain, 0, 1);
  d.brake = clamp(-err * c.throttleGain, 0, 1);
  d.speedCap = c.maxSpeed;

  // Desired heading points back at x=0; invert the bicycle model so loop gain stays
  // constant at any speed. Uses the vehicle's speed-sensitive max steer.
  const frame = road?.getRoadFrame(vehicle.center.z) ?? { x: 0, heading: 0 };
  const lateral = vehicle.center.x - frame.x;
  const desiredHeading = clamp(
    frame.heading - lateral * c.centeringGain,
    frame.heading - c.maxAutoHeading,
    frame.heading + c.maxAutoHeading
  );
  const wDes = c.headingResponse * (desiredHeading - vehicle.heading);
  const v = Math.abs(vehicle.speed);
  const angle = Math.atan((wDes * vehicle.cfg.wheelbase) / Math.max(v, 2));
  d.steer = clamp(angle / vehicle.maxSteerAtSpeed(v), -1, 1);
}
