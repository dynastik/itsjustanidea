// Beam-only reveal (roadmap Phase 2 / 6). An empty van, identical to the player's, is parked in the oncoming lane up the road.
// It is only visible while the player's headlight beam is actually on it: opacity follows the same cone the spotlights use
// (HEADLIGHT_CONFIG angle / penumbra / range). No headlights, no van; the lights flickering out takes it away again.
// It is evidence, not a character: no driver, no movement, no collider. Placed by the story director on one authored prompt
// (director.isRevealCue) and gone once the player has driven past it.
import * as THREE from 'three';
import { state } from './state.js';
import { getHeadlightGlitch, getReducedScare } from './director.js';
import { HEADLIGHT_CONFIG } from './headlights.js';

const LEFT_LANE = 2.25;     // metres left of the centre line (the oncoming lane), so the player passes beside it
const RANGE_FULL = 55;      // fully visible inside this distance, fading out by RANGE_END (a little inside the beam's own range)
const RANGE_END = 80;
const PASSED_BEHIND = 25;   // metres behind the player before it is removed
const FADE_IN = 6;          // 1/s opacity easing
const FADE_OUT = 3;
const DIM = 0.6;            // slightly darker paint than the player's van

function fallbackVan() {
  const g = new THREE.Group();
  const mat = new THREE.MeshToonMaterial({ color: 0xd8d6cc });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.5, 4.2), mat);
  body.position.y = 1.05;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, 1.4), mat);
  cab.position.set(0, 1.95, 1.2);
  g.add(body, cab);
  return g;
}

export function createReveal(scene, vehicle, { onSeen } = {}) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);
  const mats = [];
  let built = false;
  let active = false;
  let opacity = 0;
  let seen = false;

  function build() {
    if (built) return;
    let model = vehicle.cloneExterior ? vehicle.cloneExterior() : null;
    if (!model) model = fallbackVan();
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false;
      o.receiveShadow = false;
      const own = (m) => { // never touch the player's materials: every mesh gets its own transparent copy
        const c = m.clone();
        c.transparent = true;
        c.opacity = 0;
        if (c.color) c.color.multiplyScalar(DIM);
        mats.push(c);
        return c;
      };
      o.material = Array.isArray(o.material) ? o.material.map(own) : own(o.material);
    });
    group.add(model);
    built = true;
  }

  function hide() {
    active = false;
    opacity = 0;
    group.visible = false;
  }

  return {
    get active() { return active; },
    // pose: { x, y, z, heading } on the drive path (world.getAheadPose)
    place(pose) {
      if (getReducedScare() || !pose) return;
      build();
      const cos = Math.cos(pose.heading), sin = Math.sin(pose.heading);
      group.position.set(pose.x + LEFT_LANE * cos, pose.y, pose.z - LEFT_LANE * sin);
      group.rotation.y = pose.heading;
      opacity = 0;
      group.visible = false;
      active = true;
      seen = false;
    },
    reset: hide,
    update(dt, now) {
      if (!active || dt <= 0) return;
      if (getReducedScare()) { hide(); return; }
      const c = vehicle.center;
      const fx = Math.sin(vehicle.heading), fz = Math.cos(vehicle.heading);
      const along = (group.position.x - c.x) * fx + (group.position.z - c.z) * fz;
      if (along < -PASSED_BEHIND) { hide(); return; }

      let target = 0;
      if (state.headlightsOn) {
        const vx = group.position.x - (c.x + fx * 1.05);
        const vy = group.position.y + 1.0 - (c.y + 0.12);
        const vz = group.position.z - (c.z + fz * 1.05);
        const dist = Math.hypot(vx, vy, vz);
        if (dist > 1 && dist < RANGE_END) {
          const cosAng = (vx * fx + vz * fz - vy * 0.02) / dist; // beam aims ~1 degree below the horizon
          const coneCos = Math.cos(HEADLIGHT_CONFIG.angle);
          const penumbraCos = Math.cos(HEADLIGHT_CONFIG.angle * (1 - HEADLIGHT_CONFIG.penumbra));
          const cone = THREE.MathUtils.smoothstep(cosAng, coneCos, penumbraCos); // same falloff three.js uses for a SpotLight
          const range = 1 - THREE.MathUtils.smoothstep(dist, RANGE_FULL, RANGE_END);
          target = cone * range * (1 - getHeadlightGlitch(now));
        }
      }
      opacity += (target - opacity) * (1 - Math.exp(-(target > opacity ? FADE_IN : FADE_OUT) * dt));
      group.visible = opacity > 0.01;
      for (const m of mats) m.opacity = opacity;
      if (!seen && opacity > 0.5) { seen = true; if (onSeen) onSeen(); }
    },
  };
}
