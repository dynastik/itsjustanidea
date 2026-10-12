// Phase 4: one vehicle-only town stop. A glowing bay is painted on the right-hand lane of the city road; park inside it
// (slow down and stay put for DWELL_S) and the stop is marked delivered on the delivery sheet (ui/sheet.js).
// It is optional (nothing is gated behind it, so it can never soft-lock a run) and it re-uses the same place every run:
// later acts change what the SHEET says about it, not the world.
import * as THREE from 'three';
import { state } from './state.js';

const STOP_Z = -64;        // middle of the block between the cross streets at z = -96 and -32 (clear of the parked cars)
const LATERAL = -2.25;     // metres left of the road centre (negative = the right-hand lane when facing +z)
const HALF_LEN = 3.2;      // zone half length along the road
const HALF_WID = 1.9;      // zone half width across it
const DWELL_S = 1.5;       // seconds you have to stay in the bay, nearly stopped
const MAX_SPEED = 1.2;     // m/s counted as "stopped"
const AMBER = new THREE.Color(0xf2c94c);
const GREEN = new THREE.Color(0x7fd18b);
const reducedMotion = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const stop = { progress: 0, done: false, inZone: false };
export const getStop = () => stop;

export function createStops(scene, getRoadFrame) {
  const f = getRoadFrame(STOP_Z);
  const pitch = Math.atan2(getRoadFrame(STOP_Z + 2).y - getRoadFrame(STOP_Z - 2).y, 4);
  const cos = Math.cos(f.heading), sin = Math.sin(f.heading);

  const group = new THREE.Group();
  group.rotation.order = 'YXZ'; // yaw first, then pitch along the road's grade (same as city.js)
  group.rotation.set(-pitch, f.heading, 0);
  group.position.set(f.x + LATERAL * cos, f.y + 0.09, STOP_Z - LATERAL * sin);

  const material = new THREE.MeshBasicMaterial({
    color: AMBER, transparent: true, opacity: 0.3, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
  });
  // w along the road's across axis (x), l along its length (z); lies flat
  const flat = (w, l, x, z, lift) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, l), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, lift, z);
    group.add(mesh);
  };
  flat(HALF_WID * 2, HALF_LEN * 2, 0, 0, 0); // fill
  for (const s of [-1, 1]) {
    flat(0.16, HALF_LEN * 2, s * HALF_WID, 0, 0.004);
    flat(HALF_WID * 2, 0.16, 0, s * HALF_LEN, 0.004);
  }
  scene.add(group);

  const cx = group.position.x, cz = group.position.z;
  const tmp = new THREE.Color();

  return {
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
    reset() {
      stop.progress = 0;
      stop.done = false;
      stop.inZone = false;
    },
  };
}
