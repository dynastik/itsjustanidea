// Central game state. Everything that more than one module needs lives here.
export const state = {
  mode: 'city',        // 'city' | 'highway'
  zoneAuto: true,      // false after a dev Tab override (until reset)
  worldTime: 0,        // 0 = calm day, 1 = dusk. TODO Phase 5: drive by distance/story beat
  paused: false,
  debug: false,
  speed: 0,            // mirrored from the vehicle each frame (HUD, audio, camera read this)
  typing: {
    target: '',
    buffer: '',
    wordsCompleted: 0,
    keystrokesCorrect: 0,
    keystrokesTotal: 0,
    startTime: null,
    lastErrorAt: -Infinity,
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
