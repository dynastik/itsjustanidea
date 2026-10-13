// The long-mode journey between legs: start (depot lot) -> city -> highway leg -> EXIT -> city -> highway leg -> ... -> end.
//
// When the last prompt of a leg is typed (state.legDone) the van keeps cruising for a few seconds, the screen fades to black, the
// van is placed at the west end of the elevated highway and drives itself along the exit ramp (interchange.exitPath) onto the city
// road. There the player takes over with WASD, delivers (or finds the delivery already done), turns round at a cross street and
// drives back up the on-ramp for the next leg. The next leg of the story starts when you re-enter the highway.
import { state, setMode } from './state.js';
import { getStoryMode, advanceLeg } from './story.js';

const OUTRO_S = 4.5;        // cruise on after the last line of a leg
const FADE_S = 1.2;
const EXIT_TIMEOUT_S = 50;  // safety net: if the van gets stuck on the exit it is placed at the end
const CRUISE_SPEED = 16;
const EXIT_SPEED = 13;
const EXIT_FINAL_SPEED = 7;
const START_SPEED = 12;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// placeVan(x, y, z, heading, speed): teleport helper from main.js (also recentres terrain, props and trees)
export function createRoute({ world, vehicle, stops, placeVan }) {
  const fader = document.createElement('div');
  fader.style.cssText = 'position:fixed;inset:0;z-index:31;background:#000;opacity:0;pointer-events:none;transition:opacity 1.1s ease';
  document.body.appendChild(fader);

  let phase = 'play'; // play | outro | fade | exit
  let t = 0;
  let idx = 0;

  function begin(p) { phase = p; t = 0; }

  function holdSpeed(d, target) {
    const s = Math.max(0, vehicle.speed);
    d.throttle = s < target - 0.35 ? 1 : 0;
    d.brake = s > target + 1.5 ? clamp((s - target) * 0.12, 0, 0.35) : 0;
  }

  function teleportToExit() {
    advanceLeg();
    state.legDone = false;
    state.visit = (state.visit || 0) + 1;
    const p = world.exitPath[0];
    const y = world.layout.centerY(p.x) + 0.035 + vehicle.cfg.spawnHeight;
    placeVan(p.x, y, p.z, Math.PI / 2, START_SPEED);
    idx = 0;
    stops.setVisit(state.visit, { pre: state.visit >= 2 }); // from the third city on, the record is already complete
  }

  function finishExit(forced) {
    if (forced) {
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
      phase = 'play'; t = 0; idx = 0;
      fader.style.transition = 'none';
      fader.style.opacity = '0';
      void fader.offsetWidth;
      fader.style.transition = '';
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
          begin('outro');
          state.outro = true;
          state.zoneAuto = false;
        }
      } else if (phase === 'outro') {
        if (t >= OUTRO_S) { begin('fade'); fader.style.opacity = '1'; }
      } else if (phase === 'fade') {
        if (t >= FADE_S) { teleportToExit(); begin('exit'); fader.style.opacity = '0'; }
      } else if (phase === 'exit' && t > EXIT_TIMEOUT_S) {
        finishExit(true);
      }
    },
    // Fills the drive input while the route is in control. baseHighway() writes the normal highway steering.
    drive(d, baseHighway) {
      if (phase === 'exit') followExit(d);
      else { baseHighway(); holdSpeed(d, CRUISE_SPEED); }
    },
  };
}
