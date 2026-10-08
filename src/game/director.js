// Director: the horror pacing. The story decides the act (see story.js), so the director simply reports it;
// when Phase 5 props/audio/cab wrongness need to know "how bad is it", they ask here.
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

export function reset() {
  distanceDriven = 0;
}
