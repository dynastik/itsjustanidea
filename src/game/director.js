// Director: state machine that drives the pacing and horror progression.
// For now, a placeholder. Phase 5 implements the full CALM -> UNEASY -> WRONG -> HORROR flow.

import { state } from './state.js';

const HIGHWAY_ZONE_Z = 80;
const ZONE_HYSTERESIS = 10;

export const DIRECTOR_STATE = {
  CALM: 'calm',
  UNEASY: 'uneasy',
  WRONG: 'wrong',
  HORROR: 'horror',
};

let currentState = DIRECTOR_STATE.CALM;
let distanceDriven = 0;

export function getDirectorState() {
  return currentState;
}

export function update(vehicleZ) {
  // Track distance driven on highway (Phase 5 will use this to drive state progression)
  if (state.mode === 'highway') {
    distanceDriven = Math.max(vehicleZ - HIGHWAY_ZONE_Z, 0);
  } else {
    distanceDriven = 0;
  }

  // Placeholder: advance state at certain distances (Phase 5 refines this)
  if (distanceDriven > 500 && currentState === DIRECTOR_STATE.CALM) {
    currentState = DIRECTOR_STATE.UNEASY;
    console.log('[director] entering UNEASY');
  }
  if (distanceDriven > 1500 && currentState === DIRECTOR_STATE.UNEASY) {
    currentState = DIRECTOR_STATE.WRONG;
    console.log('[director] entering WRONG');
  }
  if (distanceDriven > 3000 && currentState === DIRECTOR_STATE.WRONG) {
    currentState = DIRECTOR_STATE.HORROR;
    console.log('[director] entering HORROR');
  }
}

export function reset() {
  currentState = DIRECTOR_STATE.CALM;
  distanceDriven = 0;
}
