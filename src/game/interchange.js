// Highway interchange: the elevated cross-highway and the on-ramp that leaves the end of the city road and merges onto it.
// Model-free (ribbons + instanced rails and pillars, a few draw calls). Replaces the old ramp in world.js.
//
//   city road  ->  short straight  ->  smooth 90 degree bend (curvature and slope both continuous, rising to deck height)
//              ->  acceleration lane running ALONGSIDE the highway (edge to edge, no coplanar overlap)
//              ->  taper that narrows to a point as it merges into the highway.
//
//  - The ramp is built from edges (left = the side facing the highway, right = outer side), so the lane can taper.
//  - Guardrails only on the outer edge; the highway-facing edge is open from the start of the lane, and the highway's
//    city-side rail is open along the merge, so there is a real gap to merge through.
//  - Ramp height follows the highway deck exactly along the merge (no step, no gap to fall through).
//  - `drivePath` is the centre line to drive: city end -> bend -> lane -> eased onto the highway centre -> along the
//    highway. A lane-follower can use it instead of the z-indexed city road frame.
import * as THREE from 'three';
import { toonGradientMap } from './toon.js';
import { HW, RIBBON_LIFT } from './highwayLayout.js';

const lerp = THREE.MathUtils.lerp;
const smooth01 = (t) => t * t * (3 - 2 * t);
const yawQuat = (h) => ({ x: 0, y: Math.sin(h / 2), z: 0, w: Math.cos(h / 2) });

// The highway itself (west stub, deck, hill arc, ground road) is laid out in highwayLayout.js; these are the ramp's numbers.
export const INTERCHANGE = {
  highwayZ: HW.z,    // the cross-highway runs along x at this z
  deckRise: HW.deckRise,
  bendDx: 95,        // how far along the highway (x) the bend ends and the acceleration lane begins
  handle: 48,        // bend handle length: bigger = wider, gentler bend
  laneLen: 50,       // acceleration lane alongside the highway
  taperLen: 45,      // taper from full width to a point
  leadLen: 12,       // straight lead-in continuing the city road
};

// opts: { halfWidth, cityEndZ, getRoadFrame(z) -> {x, y, heading}, terrainHeight(x, z), layout (highwayLayout.js) }
export function createHighwayInterchange(scene, physics, RAPIER, roadMaterial, opts) {
  const { halfWidth: half, cityEndZ, getRoadFrame, terrainHeight, layout } = opts;
  const C = INTERCHANGE;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const highwayZ = HW.z;

  // ---------- helpers ----------
  function sideOf(points, i) {
    const t = points[Math.min(i + 1, points.length - 1)].clone().sub(points[Math.max(i - 1, 0)]);
    return new THREE.Vector3(t.z, 0, -t.x).normalize(); // +x travel -> -z (towards the city side)
  }

  // A road surface from two edge polylines (left[i], right[i] are paired across the road).
  function makeRibbon(left, right) {
    const n = left.length;
    const positions = new Float32Array(n * 6);
    const uvs = new Float32Array(n * 4);
    const indices = new Uint32Array((n - 1) * 6);
    let len = 0;
    for (let i = 0; i < n; i++) {
      if (i > 0) {
        const dx = (left[i].x + right[i].x - left[i - 1].x - right[i - 1].x) / 2;
        const dz = (left[i].z + right[i].z - left[i - 1].z - right[i - 1].z) / 2;
        len += Math.hypot(dx, dz);
      }
      positions.set([left[i].x, left[i].y, left[i].z, right[i].x, right[i].y, right[i].z], i * 6);
      uvs.set([0, len / 10, 1, len / 10], i * 4);
      if (i < n - 1) indices.set([i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3], i * 6);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();
    const material = roadMaterial.clone();
    material.side = THREE.DoubleSide;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
    const body = physics.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    physics.createCollider(RAPIER.ColliderDesc.trimesh(positions, indices).setFriction(0.8), body);
    return { body };
  }

  // ---------- the cross-highway ----------
  // West stub (ends in a barrier) -> elevated deck -> slow descent -> arc round the big hill -> hands over to the z-indexed
  // ground road at GROUND_START_Z. Shape and heights come from highwayLayout.js; the ribbon sits RIBBON_LIFT above the graded terrain.
  const highwaySamples = layout.sampleCenterline().map((p) => V(p.x, p.y + RIBBON_LIFT, p.z));
  const hwSides = highwaySamples.map((_, i) => sideOf(highwaySamples, i));
  const hwLeft = highwaySamples.map((p, i) => p.clone().addScaledVector(hwSides[i], -half)); // north / inner edge
  const hwRight = highwaySamples.map((p, i) => p.clone().addScaledVector(hwSides[i], half)); // south edge on the deck (faces the ramp); outer edge on the arc
  const highway = makeRibbon(hwLeft, hwRight);

  // deck height at x (only used where the ramp merges, which is on the flat part)
  const highwayYAt = (x) => layout.centerY(Math.min(x, HW.hillX)) + RIBBON_LIFT;

  // ---------- the ramp ----------
  const hwEdgeZ = highwayZ - half;           // the highway's city-side edge
  const laneZ = hwEdgeZ - half + 0.04;       // acceleration lane centre; its inner edge overlaps the deck by 4 cm
  const LIFT = 0.015;                        // ramp sits 1.5 cm above the deck where they touch (no z-fighting)
  const centres = [];

  // 1. lead-in: straight on from the city road, hugging its height
  const leadStartZ = cityEndZ - 2;
  const leadEndZ = cityEndZ + C.leadLen;
  for (let z = leadStartZ; z <= leadEndZ + 1e-6; z += 2) {
    const f = getRoadFrame(z);
    centres.push(V(f.x, f.y + 0.05, z));
  }
  const leadCount = centres.length;

  // 2. the bend: cubic Bezier from the end of the lead-in (heading along the road) to the lane start (heading +x)
  const f0 = getRoadFrame(leadEndZ);
  const P0 = [f0.x, leadEndZ];
  const P1 = [f0.x + Math.sin(f0.heading) * C.handle, leadEndZ + Math.cos(f0.heading) * C.handle];
  const P3 = [f0.x + C.bendDx, laneZ];
  const P2 = [P3[0] - C.handle, laneZ];
  const bez = (t) => {
    const u = 1 - t;
    return [0, 1].map((k) => u * u * u * P0[k] + 3 * u * u * t * P1[k] + 3 * u * t * t * P2[k] + t * t * t * P3[k]);
  };
  const M = 48;
  const bendPts = [];
  let arc = 0;
  const arcs = [0];
  for (let i = 0; i <= M; i++) {
    const p = bez(i / M);
    if (i > 0) { arc += Math.hypot(p[0] - bendPts[i - 1][0], p[1] - bendPts[i - 1][1]); arcs.push(arc); }
    bendPts.push(p);
  }
  // height: cubic Hermite from the city road's height AND slope to the deck's height with zero slope: no kinks
  const y0 = f0.y + 0.05;
  const m0 = (getRoadFrame(leadEndZ + 1).y - getRoadFrame(leadEndZ - 1).y) / 2;
  const y1 = highwayYAt(P3[0]) + LIFT;
  for (let i = 1; i <= M; i++) {
    const u = arcs[i] / arc;
    const h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u, h01 = -2 * u ** 3 + 3 * u ** 2;
    centres.push(V(bendPts[i][0], h00 * y0 + h10 * arc * m0 + h01 * y1, bendPts[i][1]));
  }
  const bendEndIdx = centres.length - 1;

  // 3. the acceleration lane, alongside the highway at exactly deck height
  const laneN = Math.round(C.laneLen / 5);
  for (let j = 1; j <= laneN; j++) {
    const x = P3[0] + (C.laneLen * j) / laneN;
    centres.push(V(x, highwayYAt(x) + LIFT, laneZ));
  }
  const sides = centres.map((_, i) => sideOf(centres, i));
  const L = centres.map((p, i) => p.clone().addScaledVector(sides[i], -half)); // highway-facing edge in the lane
  const R = centres.map((p, i) => p.clone().addScaledVector(sides[i], half));  // outer edge
  const path = centres.map((p) => p.clone());

  // 4. the taper: inner edge stays on the deck edge, outer edge sweeps in until the lane is a point
  const laneEndX = P3[0] + C.laneLen;
  const taperN = 9;
  for (let j = 1; j <= taperN; j++) {
    const u = j / taperN;
    const e = smooth01(u);
    const x = laneEndX + C.taperLen * u;
    const y = highwayYAt(x) + LIFT;
    const leftZ = hwEdgeZ + 0.04;
    const rightZ = lerp(laneZ - half, leftZ - 0.12, e);
    L.push(V(x, y, leftZ));
    R.push(V(x, y, rightZ));
    path.push(V(x, y, lerp(laneZ, highwayZ, e))); // the car eases from the lane onto the highway centre
  }
  const taperEndX = laneEndX + C.taperLen;
  const ramp = makeRibbon(L, R);

  // drive path: ramp, then along the deck and round the hill arc. It ends at the arc end (z = GROUND_START_Z); from there
  // the road is z-indexed and the lane-follower switches to getRoadFrame(z) (see writeHighwayInput).
  const drivePath = path.concat(highwaySamples.filter((p) => p.x > taperEndX + 3).map((p) => p.clone()));

  // ---------- guardrails (visible + colliders), pillars ----------
  const railPieces = [];
  function railLine(edge, other, body, skip) {
    for (let i = 0; i < edge.length - 1; i++) {
      if (skip(i)) continue;
      const a = edge[i], b = edge[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.3) continue;
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      const ox = (other[i].x + other[i + 1].x) / 2 - mx, oz = (other[i].z + other[i + 1].z) / 2 - mz;
      const ol = Math.hypot(ox, oz);
      if (ol < 0.02) continue; // lane has pinched to nothing
      railPieces.push({
        body,
        x: mx + (ox / ol) * 0.12,
        y: (a.y + b.y) / 2 + 0.43,
        z: mz + (oz / ol) * 0.12,
        yaw: Math.atan2(dx, dz),
        len: len + 0.12,
        th: 0.16,
        h: 0.52,
      });
    }
  }
  // west end of the deck: a solid barrier across the road (the stub is a dead end for now)
  railPieces.push({ body: highway.body, x: highwaySamples[0].x + 0.25, y: highwaySamples[0].y + 0.65, z: highwayZ, yaw: 0, len: half * 2 + 0.4, th: 0.5, h: 1.3 });
  // highway: north rail all the way; the city-side rail is open along the merge
  railLine(hwLeft, hwRight, highway.body, () => false);
  railLine(hwRight, hwLeft, highway.body, (i) => hwRight[i].x > P3[0] - 8 && hwRight[i].x < taperEndX + 6);
  // ramp: no rails on the lead-in (it IS the road); outer rail all the way; highway-facing rail open from the lane on
  railLine(R, L, ramp.body, (i) => i < leadCount - 1);
  railLine(L, R, ramp.body, (i) => i < leadCount - 1 || i >= bendEndIdx - 2);

  const railMaterial = new THREE.MeshToonMaterial({ color: 0xb9bec5, gradientMap: toonGradientMap });
  const rails = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), railMaterial, Math.max(railPieces.length, 1));
  const dummy = new THREE.Object3D();
  railPieces.forEach((r, i) => {
    dummy.position.set(r.x, r.y, r.z);
    dummy.rotation.set(0, r.yaw, 0);
    dummy.scale.set(r.th, r.h, r.len);
    dummy.updateMatrix();
    rails.setMatrixAt(i, dummy.matrix);
    physics.createCollider(
      RAPIER.ColliderDesc.cuboid(r.th / 2, r.h / 2, r.len / 2).setTranslation(r.x, r.y, r.z).setRotation(yawQuat(r.yaw)).setFriction(0.7),
      r.body
    );
  });
  rails.count = railPieces.length;
  rails.instanceMatrix.needsUpdate = true;
  rails.frustumCulled = false;
  scene.add(rails);

  // supports under anything that is well above the ground (none where the road is near ground level)
  const pillarSpots = [];
  const addPillar = (x, z, topY) => {
    const base = terrainHeight(x, z);
    const h = topY - base;
    if (h >= 0.6) pillarSpots.push([x, base + h / 2, z, h]);
  };
  for (let i = 4; i < highwaySamples.length - 4; i += 8) {
    for (const sign of [-1, 1]) {
      const p = highwaySamples[i];
      addPillar(p.x + hwSides[i].x * sign * (half + 1.1), p.z + hwSides[i].z * sign * (half + 1.1), p.y);
    }
  }
  for (let i = leadCount; i < path.length - taperN; i += 6) {
    const c = centres[i];
    const out = new THREE.Vector3().subVectors(R[i], L[i]).setY(0).normalize();
    addPillar(R[i].x + out.x * 1.1, R[i].z + out.z * 1.1, c.y);
    if (i < bendEndIdx - 2) addPillar(L[i].x - out.x * 1.1, L[i].z - out.z * 1.1, c.y); // none under the lane beside the highway
  }
  const pillarMat = new THREE.MeshToonMaterial({ color: 0x85878a, gradientMap: toonGradientMap });
  const pillars = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), pillarMat, Math.max(pillarSpots.length, 1));
  pillarSpots.forEach(([x, y, z, h], i) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(0.72, h, 0.72);
    dummy.updateMatrix();
    pillars.setMatrixAt(i, dummy.matrix);
  });
  pillars.count = pillarSpots.length;
  pillars.instanceMatrix.needsUpdate = true;
  pillars.frustumCulled = false;
  scene.add(pillars);

  // Is (x, z) on the ramp or the highway ribbon? (Point test against the centre lines; samples are <= 5 m apart, so allow a little slack.)
  const roadXZ = [];
  for (const p of path) roadXZ.push(p.x, p.z);
  for (const p of highwaySamples) roadXZ.push(p.x, p.z);
  const onRoadR2 = (half + 1.1) * (half + 1.1);
  function onRoad(x, z) {
    for (let i = 0; i < roadXZ.length; i += 2) {
      const dx = x - roadXZ[i], dz = z - roadXZ[i + 1];
      if (dx * dx + dz * dz < onRoadR2) return true;
    }
    return false;
  }

  return { drivePath, mergeStartX: P3[0], taperEndX, highwaySamples, rampLeft: L, rampRight: R, rampCentre: path, onRoad, westEndX: HW.westX };
}
