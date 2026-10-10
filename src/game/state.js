// Central game state. Everything that more than one module needs lives here.
export const state = {
  mode: 'city',        // 'city' | 'highway'
  zoneAuto: true,      // false after a dev Tab override (until reset)
  worldTime: 0,
  dayIndex: 0,        // looping day clock: 0..1 is one full day, wraps forever (daycycle.js). TODO Phase 5: drive by distance/story beat
  time: 0,             // game clock in seconds; frozen while paused (typing windows use this)
  paused: false,
  storyDone: false,    // the last paragraph has been typed: the ending plays, then the run restarts
  loops: 0,            // how many full runs have been completed
  debug: false,
  speed: 0,            // forward speed mirrored from the vehicle (HUD, audio, camera read this)
  headlightsOn: false, // manual player-controlled headlights
  highwayEnteredAt: -Infinity, // game-clock time of the last city -> highway handoff (speed ease + typing UI fade key off this)
  highwayEntrySpeed: 0,        // forward speed at that moment (m/s)
  typing: {
    target: '',
    source: 'story',        // where the current prompt came from: story | sign | radio (HUD label)
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