// The long-mode journey: start (depot lot) -> city -> highway leg -> EXIT -> city -> highway leg -> ... -> end.
//
// The highway is a loop now (returnRoad.js brings it back round to the west end of the elevated deck), so nothing is teleported:
// when the last prompt of a leg is typed (state.legDone) the van keeps lapping on autopilot until it comes round to the west stub,
// then follows the exit ramp (interchange.exitPath) down onto the city road and hands control to the player. There the player
// delivers (or finds the delivery already done), turns round at a cross street and drives back up the on-ramp for the next leg.
// The next leg of the story starts when the player re-enters the highway.
import { state, setMode } from './state.js';
import { getStoryMode, advanceLeg } from './story.js';

const APPROACH_SPEED = 25;      // m/s while lapping towards the exit
const APPROACH_SLOW = 14;       // m/s for the last SLOW_DIST metres before the exit
const SLOW_DIST = 170;
const ENTER_DIST = 14;          // within this of the exit path's first point (west stub) the exit takes over
const EXIT_SPEED = 13;
const EXIT_FINAL_SPEED = 7;
const APPROACH_TIMEOUT_S = 240; // safety nets: if something goes wrong the van is simply placed in the city
const EXIT_TIMEOUT_S = 60;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// placeVan(x, y, z, heading, speed): teleport helper from main.js; only used by the safety nets
export function createRoute({ world, vehicle, stops, placeVan }) {
  let phase = 'play'; // play | approach | exit
  let t = 0;
  let idx = 0;
  let toExit = Infinity;

  function begin(p) { phase = p; t = 0; }

  function holdSpeed(d, target) {
    const s = Math.max(0, vehicle.speed);
    d.throttle = s < target - 0.35 ? 1 : 0;
    d.brake = s > target + 1.5 ? clamp((s - target) * 0.12, 0, 0.35) : 0;
  }

  // the next city visit starts here: the story moves on to the next leg, the sheet gets its next row
  function nextVisit() {
    advanceLeg();
    state.legDone = false;
    state.visit = (state.visit || 0) + 1;
    stops.setVisit(state.visit, { pre: state.visit >= 2 }); // from the third city on, the record is already complete
  }

  function startExit() {
    nextVisit();
    idx = 0;
    begin('exit');
  }

  function finishExit(forced) {
    if (forced) {
      if (phase === 'approach') nextVisit();
      const f = world.getRoadFrame(84);
      placeVan(f.x - 2.25, f.y + 0.05 + vehicle.cfg.spawnHeight, 84, f.heading + Math.PI, 6);
    }
    begin('play');
    state.outro = false;
    state.zoneAuto = true;
    setMode('city');
    vehicle.smartShift?.();
  }

  // pure pursuit along the exit path (angles wrapped, since the exit turns the van right round to face -z)
  function followExit(d) {
    const path = world.exitPath;
    const v = vehicle.center;
    let best = Infinity, bi = idx;
    for (let i = idx; i < Math.min(path.length, idx + 25); i++) {
      const dx = v.x - path[i].x, dz = v.z - path[i].z, d2 = dx * dx + dz * dz;
      if (d2 < best) { best = d2; bi = i; }
    }
    idx = bi;
    const speed = Math.max(vehicle.speed, 0);
    const look = clamp(6 + speed * 0.6, 6, 14);
    let j = idx, acc = 0;
    while (j < path.length - 1 && acc < look) {
      acc += Math.hypot(path[j + 1].x - path[j].x, path[j + 1].z - path[j].z);
      j++;
    }
    const tp = path[j];
    const alpha = wrap(Math.atan2(tp.x - v.x, tp.z - v.z) - vehicle.heading);
    const delta = Math.atan2(2 * vehicle.cfg.wheelbase * Math.sin(alpha), Math.max(look, 1));
    d.steer = clamp(delta / vehicle.maxSteerAtSpeed(Math.max(speed, 0.1)), -1, 1);
    d.speedCap = 25;
    holdSpeed(d, path.length - 1 - idx < 14 ? EXIT_FINAL_SPEED : EXIT_SPEED);
    if (idx >= path.length - 2 || v.z < 86) finishExit(false);
  }

  return {
    get phase() { return phase; },
    get controlling() { return phase !== 'play'; },
    reset() {
      phase = 'play'; t = 0; idx = 0; toExit = Infinity;
      state.outro = false;
      state.legDone = false;
      state.visit = 0;
      state.zoneAuto = true;
      stops.setVisit(0, { pre: state.loops > 0 }); // after a loop, the first delivery is already complete
    },
    update(dt) {
      if (dt <= 0) return;
      t += dt;
      if (phase === 'play') {
        if (state.legDone && getStoryMode() === 'long' && state.mode === 'highway') {
          begin('approach');
          state.outro = true;
          state.zoneAuto = false;
        }
      } else if (phase === 'approach') {
        const p0 = world.exitPath[0], v = vehicle.center;
        toExit = Math.hypot(v.x - p0.x, v.z - p0.z);
        const eastbound = Math.abs(wrap(vehicle.heading - Math.PI / 2)) < 0.6;
        if (toExit < ENTER_DIST && eastbound) startExit();
        else if (t > APPROACH_TIMEOUT_S) finishExit(true);
      } else if (phase === 'exit' && t > EXIT_TIMEOUT_S) {
        finishExit(true);
      }
    },
    // Fills the drive input while the route is in control. baseHighway() writes the normal highway steering (the loop path).
    drive(d, baseHighway) {
      if (phase === 'exit') followExit(d);
      else { baseHighway(); holdSpeed(d, toExit < SLOW_DIST ? APPROACH_SLOW : APPROACH_SPEED); }
    },
  };
}
