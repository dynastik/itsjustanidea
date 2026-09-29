// Central game state. Everything that more than one module needs lives here.
export const state = {
  mode: 'city',        // 'city' | 'highway'
  zoneAuto: true,      // false after a dev Tab override (until reset)
  worldTime: 0,        // 0 = calm day, 1 = dusk. TODO Phase 5: drive by distance/story beat
  time: 0,             // game clock in seconds; frozen while paused (typing windows use this)
  paused: false,
  debug: false,
  speed: 0,            // forward speed mirrored from the vehicle (HUD, audio, camera read this)
  typing: {
    target: '',
    buffer: '',
    wordsCompleted: 0,
    lastErrorAt: -Infinity, // game-clock time of the last wrong key (HUD flash)
  },
};

const modeListeners = [];
export function onModeChange(fn) {
  modeListeners.push(fn);
}
export function setMode(mode) {
  if (state.mode === mode) return;
  state.mode = mode;
  modeListeners.forEach((fn) => fn(mode));
}