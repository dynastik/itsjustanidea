// Vehicle-only delivery stops, one per city visit. A glowing bay is painted in a lane of the city road; park inside it (slow down
// and stay put for DWELL_S) and the stop is marked delivered on the delivery sheet (ui/sheet.js).
// The city is reused every visit (roadmap: re-use a few places and let the text change). From visit 2 on, the sheet already says
// the stop is delivered before you arrive (setVisit(i, { pre: true })). Stops are optional, so nothing can soft-lock.
import * as THREE from 'three';
import { state } from './state.js';

// lateral: metres from the road centre; negative = right-hand lane when facing +z (visit 0 drives +z, later visits drive -z)
export const STOP_DEFS = [
  { name: 'MILL LANE', z: -64, lateral: -2.25 },
  { name: 'BELLWEATHER RD', z: 60, lateral: 2.25 },
  { name: 'ORCHARD ROW', z: 0, lateral: 2.25 },
  { name: 'MILL LANE', z: -64, lateral: 2.25 },
  { name: '????????', z: -126, lateral: 2.25 },
];
const HALF_LEN = 3.2;      // zone half length along the road
const HALF_WID = 2.3;      // zone half width across it
const DWELL_S = 1.5;       // seconds you have to stay in the bay, nearly stopped
const MAX_SPEED = 1.2;     // m/s counted as "stopped"
const AMBER = new THREE.Color(0xf2c94c);
const GREEN = new THREE.Color(0x7fd18b);
const reducedMotion = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const stop = { progress: 0, done: false, inZone: false, pre: false, index: 0, name: STOP_DEFS[0].name };
export const getStop = () => stop;

export function createStops(scene, getRoadFrame) {
  const group = new THREE.Group();
  group.rotation.order = 'YXZ'; // yaw first, then pitch along the road's grade (same as city.js)
  const material = new THREE.MeshBasicMaterial({
    color: AMBER, transparent: true, opacity: 0.3, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
  });
  const flat = (w, l, x, z, lift) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, l), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, lift, z);
    group.add(mesh);
  };
  flat(HALF_WID * 2, HALF_LEN * 2, 0, 0, 0);
  for (const s of [-1, 1]) {
    flat(0.16, HALF_LEN * 2, s * HALF_WID, 0, 0.004);
    flat(HALF_WID * 2, 0.16, 0, s * HALF_LEN, 0.004);
  }
  scene.add(group);

  let cx = 0, cz = 0, cos = 1, sin = 0;
  const tmp = new THREE.Color();

  function setVisit(i, { pre = false } = {}) {
    const def = STOP_DEFS[Math.min(i, STOP_DEFS.length - 1)];
    const f = getRoadFrame(def.z);
    const pitch = Math.atan2(getRoadFrame(def.z + 2).y - getRoadFrame(def.z - 2).y, 4);
    cos = Math.cos(f.heading); sin = Math.sin(f.heading);
    group.rotation.set(-pitch, f.heading, 0);
    group.position.set(f.x + def.lateral * cos, f.y + 0.09, def.z - def.lateral * sin);
    cx = group.position.x; cz = group.position.z;
    stop.index = i; stop.name = def.name; stop.pre = pre;
    stop.done = pre; stop.progress = pre ? 1 : 0; stop.inZone = false;
  }
  setVisit(0);

  return {
    setVisit,
    // pos: vehicle.center, speed: vehicle.speed (m/s), active: only the city counts (the highway is typing)
    update(dt, pos, speed, active) {
      const rx = pos.x - cx, rz = pos.z - cz;
      const across = rx * cos - rz * sin;
      const along = rx * sin + rz * cos;
      stop.inZone = Math.abs(across) < HALF_WID && Math.abs(along) < HALF_LEN;
      if (active && !stop.done && dt > 0) {
        if (stop.inZone && Math.abs(speed) < MAX_SPEED) stop.progress = Math.min(1, stop.progress + dt / DWELL_S);
        else stop.progress = Math.max(0, stop.progress - dt * 1.5);
        if (stop.progress >= 1) stop.done = true;
      }
      tmp.copy(AMBER).lerp(GREEN, stop.done ? 1 : stop.progress);
      material.color.copy(tmp);
      material.opacity = stop.done ? 0.16 : 0.26 + (reducedMotion ? 0.06 : 0.08 * Math.sin(state.time * 3));
    },
    reset(pre = false) { setVisit(0, { pre }); },
  };
}
