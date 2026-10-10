// Sanity checks for the highway (no browser, no GPU): npm run check:highway
//  - the pieces of the road join up (position, heading, height) at x = hillX and z = GROUND_START_Z
//  - the graded terrain never pokes through the deck, and meets the road where the road is at ground level
//  - the interchange builds (against stub physics) and its drive path is continuous
import * as THREE from 'three';
import { HW, GROUND_START_Z, GROUND_X, RIBBON_LIFT, ARC_CENTER } from '../src/game/highwayLayout.js';
import { terrainHeight, getRoadFrame, ROAD_HALF_WIDTH } from '../src/game/world.js';
import { createHighwayInterchange } from '../src/game/interchange.js';
import { createHighwayLayout } from '../src/game/highwayLayout.js';
import { CITY_Z_MAX } from '../src/game/zones.js';

let failures = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? '  ' + extra : ''}`);
};

// ---- the same layout world.js uses (recreated from the exported frame so we test the real numbers)
const roadHeight = (z) => 1.9 * Math.sin(z * Math.PI * 2 / 360) + 0.8 * Math.sin(z * Math.PI * 2 / 220 + 0.6);
const roadCenterX = (z) => {
  const t = (((z % 200) + 200) % 200) / 200 * Math.PI * 2;
  return 2.0 * Math.sin(t) + 0.8 * Math.sin(t * 2 + 0.4);
};
const layout = createHighwayLayout({ startY: roadHeight(CITY_Z_MAX), roadCenterX, roadHeight });

// ---- joins
const a1 = layout.arcPoint(Math.PI / 2);
check('arc ends at ground road start', Math.hypot(a1.x - GROUND_X, a1.z - GROUND_START_Z) < 1e-6);
check('arc start sits on the deck line', Math.abs(layout.arcPoint(0).z - HW.z) < 1e-6 && Math.abs(layout.arcPoint(0).x - HW.hillX) < 1e-6);
check('height continuous at hillX', Math.abs(layout.centerY(HW.hillX) - layout.arcY(0)) < 1e-9);
check('height continuous at ground start', Math.abs(layout.arcY(Math.PI / 2) - layout.groundY(GROUND_START_Z)) < 1e-9);
check('ground road heading is +z at the join', Math.abs(layout.groundFrame(GROUND_START_Z).heading) < 1e-3);
check('getRoadFrame hands over to the ground road', Math.abs(getRoadFrame(GROUND_START_Z + 50).x - layout.groundX(GROUND_START_Z + 50)) < 1e-9);
check('GROUND_START_Z is a multiple of the 2.5 m terrain cell', GROUND_START_Z % 2.5 === 0);

// corridor continuity across the shared edges
const out1 = { d: 0, y: 0, w: 0 }, out2 = { d: 0, y: 0, w: 0 };
let worst = 0;
for (let dz = -20; dz <= 20; dz += 2.5) {
  layout.corridor(HW.hillX - 1e-6, HW.z + dz, 40, out1);
  layout.corridor(HW.hillX + 1e-6, HW.z + dz, 40, out2);
  worst = Math.max(worst, Math.abs(out1.d - out2.d), Math.abs(out1.y - out2.y));
}
check('corridor continuous across x = hillX', worst < 1e-3, `worst ${worst.toExponential(1)}`);
worst = 0;
for (let dx = -20; dx <= 20; dx += 2.5) {
  layout.corridor(GROUND_X + dx, GROUND_START_Z - 1e-6, 40, out1);
  layout.corridor(GROUND_X + dx, GROUND_START_Z + 1e-6, 40, out2);
  worst = Math.max(worst, Math.abs(out1.d - out2.d), Math.abs(out1.y - out2.y));
}
check('corridor continuous across z = GROUND_START_Z', worst < 1e-3, `worst ${worst.toExponential(1)}`);

// ---- terrain vs ribbon
const pts = layout.sampleCenterline();
let maxPoke = -Infinity, maxGapAtGrade = 0, worstSlope = 0;
for (let i = 0; i < pts.length; i++) {
  const p = pts[i];
  const ribbonY = p.y + RIBBON_LIFT;
  for (const off of [-ROAD_HALF_WIDTH, -2, 0, 2, ROAD_HALF_WIDTH]) {
    // offset perpendicular to the local direction
    const q = pts[Math.min(i + 1, pts.length - 1)], r = pts[Math.max(i - 1, 0)];
    const tx = q.x - r.x, tz = q.z - r.z, tl = Math.hypot(tx, tz);
    const x = p.x + (tz / tl) * off, z = p.z - (tx / tl) * off;
    const t = terrainHeight(x, z);
    maxPoke = Math.max(maxPoke, t - ribbonY);
    if (p.x >= HW.hillX - 1e-6) maxGapAtGrade = Math.max(maxGapAtGrade, Math.abs(t - p.y));
  }
  if (i > 0) worstSlope = Math.max(worstSlope, Math.abs(p.y - pts[i - 1].y) / Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z));
}
check('terrain never pokes through the ribbon (road width)', maxPoke < 0, `max terrain - ribbon = ${maxPoke.toFixed(3)} m`);
check('terrain meets the road on the hill arc (|terrain - road| across the width)', maxGapAtGrade < 0.2, `worst ${maxGapAtGrade.toFixed(3)} m`);
check('road grade stays gentle', worstSlope < 0.03, `max ${(worstSlope * 100).toFixed(2)} %`);
const t0 = pts[0], tN = pts[pts.length - 1];
console.log(`     deck y ${layout.deckY.toFixed(2)}, hill road y ${layout.hillRoadY.toFixed(2)}, ground y ${layout.baseY.toFixed(2)}; west end x=${t0.x}, arc end (${tN.x.toFixed(1)}, ${tN.z.toFixed(1)})`);
check('terrain under the deck at the west end is low (pillars)', layout.deckY - terrainHeight(-100, HW.z) > 2);
let heightAboveGround = layout.deckY - terrainHeight(300, HW.z);
console.log(`     pillar height at x=300: ${heightAboveGround.toFixed(2)} m, at x=380: ${(layout.centerY(380) - terrainHeight(380, HW.z)).toFixed(2)} m`);

// ---- ground road is smooth for a good while
let prev = getRoadFrame(GROUND_START_Z), maxTurn = 0;
for (let z = GROUND_START_Z + 5; z < GROUND_START_Z + 1500; z += 5) {
  const f = getRoadFrame(z);
  maxTurn = Math.max(maxTurn, Math.abs(f.heading - prev.heading) / 5);
  prev = f;
}
check('ground road curvature is gentle', maxTurn < 0.01, `max ${maxTurn.toFixed(4)} rad/m`);

// ---- interchange against stub physics
const chain = new Proxy(function () {}, { get: () => chain, apply: () => chain });
const RAPIER = { RigidBodyDesc: { fixed: () => chain }, ColliderDesc: { trimesh: () => chain, cuboid: () => chain } };
let colliders = 0;
const physics = { createRigidBody: () => ({}), createCollider: () => { colliders++; return {}; } };
const scene = { add() {} };
const ic = createHighwayInterchange(scene, physics, RAPIER, new THREE.MeshStandardMaterial(), {
  halfWidth: ROAD_HALF_WIDTH, cityEndZ: CITY_Z_MAX, getRoadFrame, terrainHeight, layout,
});
const path = ic.drivePath;
let maxStep = 0;
for (let i = 1; i < path.length; i++) maxStep = Math.max(maxStep, Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z));
check('drive path points are close together', maxStep < 6, `max step ${maxStep.toFixed(2)} m, ${path.length} points`);
const last = path[path.length - 1];
check('drive path ends at the ground road start', Math.abs(last.z - GROUND_START_Z) < 1e-6 && Math.abs(last.x - GROUND_X) < 1e-6);
check('on-ramp merge ends before the deck starts to descend', ic.taperEndX < HW.descentFromX, `taper ends x=${ic.taperEndX.toFixed(1)}`);
check('onRoad: on the deck / on the arc / in a field', ic.onRoad(250, HW.z) && ic.onRoad(layout.arcPoint(0.8).x, layout.arcPoint(0.8).z) && !ic.onRoad(250, HW.z + 30));
console.log(`     ${colliders} colliders created, ${ic.highwaySamples.length} highway samples`);

console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
