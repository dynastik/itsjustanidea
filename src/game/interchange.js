// Highway interchange: the elevated cross-highway and the on-ramp that leaves the end of the city road and merges onto it.
// Model-free (ribbons + instanced rails, piers, caps and girders: a handful of draw calls). Replaces the old ramp in world.js.
//
//   city road  ->  short straight  ->  smooth 90 degree bend (curvature and slope both continuous, rising to deck height)
//              ->  acceleration lane running ALONGSIDE the highway (edge to edge, no coplanar overlap)
//              ->  taper that narrows to a point as it merges into the highway.
//
//  - The ramp is built from edges (left = the side facing the highway, right = outer side), so the lane can taper.
//  - Guardrails only on the outer edge; the highway-facing edge is open from the start of the lane, and the highway's
//    city-side rail is open along the merge, so there is a real gap to merge through.
//  - Ramp height follows the highway deck exactly along the merge (no step, no gap to fall through).
//  - Supports: ONE chunky square pier per ~PILLAR_SPACING m, centred under the road, with a wider cap slab on top,
//    plus a dark girder strip along the underside so the deck has thickness from below.
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

// Support tuning (metres). The road is 9 m wide.
const SUPPORT = {
  pierSize: 3.4,     // square pier footprint
  spacing: 36,       // road length between piers
  capW: 7.8,         // cap slab, across the road
  capL: 4.8,         // cap slab, along the road
  capH: 0.7,
  girderW: 6.6,      // underside girder strip
  girderH: 0.55,
  minPierH: 0.6,     // no pier where the road is this close to the ground
  minGirderGap: 1.0, // no girder where the road is this close to the ground
};

// opts: { halfWidth, cityEndZ, getRoadFrame(z) -> {x, y, heading}, terrainHeight(x, z), layout (highwayLayout.js) }
export function createHighwayInterchange(scene, physics, RAPIER, roadMaterial, opts) {
  const { halfWidth: half, cityEndZ, getRoadFrame, terrainHeight, layout } = opts;
  const C = INTERCHANGE;
  const S = SUPPORT;
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

  // Visual-only ribbon for the temporary exit ramp. Unlike makeRibbon(), it deliberately has no physics collider:
  // the exit is scenery for now and does not change vehicle routing.
  function makeVisualRibbon(left, right) {
    const n = left.length;
    const positions = new Float32Array(n * 6);
    const uvs = new Float32Array(n * 4);
    const indices = new Uint32Array((n - 1) * 6);
    let length = 0;
    for (let i = 0; i < n; i++) {
      if (i > 0) {
        const dx = ((left[i].x + right[i].x) - (left[i - 1].x + right[i - 1].x)) * 0.5;
        const dz = ((left[i].z + right[i].z) - (left[i - 1].z + right[i - 1].z)) * 0.5;
        length += Math.hypot(dx, dz);
      }
      positions.set([left[i].x, left[i].y, left[i].z, right[i].x, right[i].y, right[i].z], i * 6);
      uvs.set([0, length / 10, 1, length / 10], i * 4);
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
    return mesh;
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


  // ---------- city cloverleaf concept (visual-only first pass) ----------
  // Four broad loop ramps frame the main highway / city-road crossing. They are deliberately scenery-only
  // in this pass: the existing entrance ramp and vehicle drivePath remain untouched until each movement
  // is given a tested, continuous drivable route.
  const CLOVER = { radius: 34, width: 7.5, samples: 56, rise: 2.4 };
  const cloverMaterial = roadMaterial;
  function makeCloverLoop(cx, cz, sx, sz) {
    const left = [], right = [];
    const pts = [];
    // A rounded 270-degree loop, opening toward the nearby highway/city-road approach.
    // Parametric ellipse with a smooth vertical lift; each quadrant sits at a distinct visual level.
    const start = -Math.PI / 2;
    for (let i = 0; i <= CLOVER.samples; i++) {
      const t = i / CLOVER.samples;
      const a = start + t * Math.PI * 1.5;
      const x = cx + sx * CLOVER.radius * Math.cos(a);
      const z = cz + sz * CLOVER.radius * Math.sin(a);
      const y = highwayYAt(Math.max(HW.westFlatX, Math.min(x, HW.hillX))) + 0.12 +
        CLOVER.rise * Math.sin(Math.PI * t);
      pts.push(V(x, y, z));
    }
    const side = (i) => {
      const tangent = pts[Math.min(i + 1, pts.length - 1)].clone().sub(pts[Math.max(i - 1, 0)]);
      return new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
    };
    for (let i = 0; i < pts.length; i++) {
      const s = side(i);
      left.push(pts[i].clone().addScaledVector(s, -CLOVER.width / 2));
      right.push(pts[i].clone().addScaledVector(s, CLOVER.width / 2));
    }
    makeVisualRibbon(left, right);
  }
  // Four quadrants around the junction. Kept clear of the straight highway's central crossing.
  makeCloverLoop(-CLOVER.radius * 0.72, HW.z - CLOVER.radius * 0.72, -1, -1);
  makeCloverLoop(CLOVER.radius * 0.72, HW.z - CLOVER.radius * 0.72, 1, -1);
  makeCloverLoop(-CLOVER.radius * 0.72, HW.z + CLOVER.radius * 0.72, -1, 1);
  makeCloverLoop(CLOVER.radius * 0.72, HW.z + CLOVER.radius * 0.72, 1, 1);

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

  // ---------- visual-only exit ramp (original test geometry) ----------
  // A gore leaves the western flat deck, runs alongside it, then bends down and joins the city road's west edge.
  // Scenery only for now: no exit-ramp physics body and no change to the driving path.
  const EXIT = { goreX: -105, goreLen: 40, laneLen: 10, handleA: 34, handleB: 30, joinZ: 128, taperZ: 114, endZ: 90 };
  const roadX = (z) => getRoadFrame(z).x;
  const cityY = (z) => getRoadFrame(z).y + 0.05 + LIFT;
  const cityLaneX = (z) => roadX(z) - 2 * half + 0.04;
  const exitLeft = [];
  const exitRight = [];
  const goreN = 8;
  const goreEndX = EXIT.goreX + EXIT.goreLen;

  // Gore: a point at the deck edge widens into the diverge lane.
  for (let j = 0; j < goreN; j++) {
    const u = j / goreN;
    const x = EXIT.goreX + EXIT.goreLen * u;
    const y = highwayYAt(x) + LIFT;
    exitLeft.push(V(x, y, hwEdgeZ + 0.04));
    exitRight.push(V(x, y, lerp(hwEdgeZ + 0.04 - 0.12, laneZ - half, smooth01(u))));
  }

  // Straight diverge lane, then a cubic bend down toward the city.
  const exitCentres = [];
  const exitBendX0 = goreEndX + EXIT.laneLen;
  for (let x = goreEndX; x <= exitBendX0 + 1e-6; x += 5) {
    exitCentres.push(V(x, highwayYAt(x) + LIFT, laneZ));
  }
  const eP0 = [exitBendX0, laneZ];
  const eP3 = [cityLaneX(EXIT.joinZ), EXIT.joinZ];
  const eP1 = [eP0[0] + EXIT.handleA, eP0[1]];
  const eP2 = [eP3[0], eP3[1] + EXIT.handleB];
  const exitBezier = (t) => {
    const u = 1 - t;
    return [0, 1].map((k) => u ** 3 * eP0[k] + 3 * u ** 2 * t * eP1[k] +
      3 * u * t ** 2 * eP2[k] + t ** 3 * eP3[k]);
  };
  const exitCurveN = 40;
  const exitCurve = [];
  const exitArcLengths = [0];
  let exitArcLength = 0;
  for (let i = 0; i <= exitCurveN; i++) {
    const p = exitBezier(i / exitCurveN);
    if (i > 0) {
      exitArcLength += Math.hypot(p[0] - exitCurve[i - 1][0], p[1] - exitCurve[i - 1][1]);
      exitArcLengths.push(exitArcLength);
    }
    exitCurve.push(p);
  }

  // Smooth vertical profile from the flat deck to the city road's existing grade.
  const exitY0 = highwayYAt(exitBendX0) + LIFT;
  const exitY1 = cityY(EXIT.joinZ);
  const exitM1 = -(cityY(EXIT.joinZ + 1) - cityY(EXIT.joinZ - 1)) / 2;
  for (let i = 1; i <= exitCurveN; i++) {
    const u = exitArcLengths[i] / exitArcLength;
    const h00 = 2 * u ** 3 - 3 * u ** 2 + 1;
    const h01 = -2 * u ** 3 + 3 * u ** 2;
    const h11 = u ** 3 - u ** 2;
    exitCentres.push(V(exitCurve[i][0],
      h00 * exitY0 + h01 * exitY1 + h11 * exitArcLength * exitM1,
      exitCurve[i][1]));
  }
  for (let z = EXIT.joinZ - 2; z >= EXIT.taperZ - 1e-6; z -= 2) {
    exitCentres.push(V(cityLaneX(z), cityY(z), z));
  }

  const exitSides = exitCentres.map((_, i) => sideOf(exitCentres, i));
  exitCentres.forEach((p, i) => {
    exitLeft.push(p.clone().addScaledVector(exitSides[i], -half));
    exitRight.push(p.clone().addScaledVector(exitSides[i], half));
  });

  // Taper into the city road just beyond the last city block.
  const exitTaperN = 8;
  for (let j = 1; j <= exitTaperN; j++) {
    const u = j / exitTaperN;
    const z = lerp(EXIT.taperZ, EXIT.endZ, u);
    const lx = roadX(z) - half + 0.04;
    const y = cityY(z);
    exitLeft.push(V(lx, y, z));
    exitRight.push(V(lerp(lx - 2 * half, lx - 0.12, smooth01(u)), y, z));
  }
  makeVisualRibbon(exitLeft, exitRight);

  // Temporary visual supports along the elevated exit; no colliders.
  const exitPierMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshToonMaterial({ color: 0x77787b, gradientMap: toonGradientMap }),
    Math.max(1, Math.ceil(exitCentres.length / 8))
  );
  const exitDummy = new THREE.Object3D();
  let exitPierCount = 0;
  for (let i = 8; i < exitCentres.length - 2; i += 8) {
    const p = exitCentres[i];
    if (p.z < 130 && p.x < 110) continue; // leave the entrance-ramp crossing clear
    const groundY = terrainHeight(p.x, p.z);
    const h = p.y - groundY - 0.55;
    if (h < 1.5) continue;
    exitDummy.position.set(p.x, groundY + h / 2, p.z);
    exitDummy.rotation.set(0, 0, 0);
    exitDummy.scale.set(2.6, h, 2.6);
    exitDummy.updateMatrix();
    exitPierMesh.setMatrixAt(exitPierCount++, exitDummy.matrix);
  }
  exitPierMesh.count = exitPierCount;
  exitPierMesh.instanceMatrix.needsUpdate = true;
  exitPierMesh.castShadow = true;
  exitPierMesh.receiveShadow = true;
  exitPierMesh.frustumCulled = false;
  scene.add(exitPierMesh);

  // Guardrails along exposed edges, leaving the gore open at the highway.
  const exitRailGeo = new THREE.BoxGeometry(1, 1, 1);
  const exitRailMat = new THREE.MeshToonMaterial({ color: 0x85888b, gradientMap: toonGradientMap });
  const exitRailMesh = new THREE.InstancedMesh(exitRailGeo, exitRailMat, Math.max(1, (exitLeft.length - goreN - 1) * 2));
  const exitRailDummy = new THREE.Object3D();
  let exitRailCount = 0;
  for (let i = goreN; i < exitLeft.length - 1; i++) {
    for (const edge of [exitLeft, exitRight]) {
      const a = edge[i], b = edge[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.3) continue;
      exitRailDummy.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 + 0.42, (a.z + b.z) / 2);
      exitRailDummy.rotation.set(0, Math.atan2(dx, dz), 0);
      exitRailDummy.scale.set(0.16, 0.65, len + 0.08);
      exitRailDummy.updateMatrix();
      exitRailMesh.setMatrixAt(exitRailCount++, exitRailDummy.matrix);
    }
  }
  exitRailMesh.count = exitRailCount;
  exitRailMesh.instanceMatrix.needsUpdate = true;
  exitRailMesh.castShadow = true;
  exitRailMesh.receiveShadow = true;
  exitRailMesh.frustumCulled = false;
  scene.add(exitRailMesh);

  // drive path: ramp, then along the deck and round the hill arc. It ends at the arc end (z = GROUND_START_Z); from there
  // the road is z-indexed and the lane-follower switches to getRoadFrame(z) (see writeHighwayInput).
  const drivePath = path.concat(highwaySamples.filter((p) => p.x > taperEndX + 3).map((p) => p.clone()));

  // ---------- guardrails (visible + colliders) ----------
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
  railLine(hwRight, hwLeft, highway.body, (i) => (hwRight[i].x > P3[0] - 8 && hwRight[i].x < taperEndX + 6) || (hwRight[i].x > EXIT.goreX - 6 && hwRight[i].x < exitBendX0 + 6));
  // ramp: no rails on the lead-in (it IS the road); outer rail all the way; highway-facing rail open from the lane on
  railLine(R, L, ramp.body, (i) => i < leadCount - 1);
  railLine(L, R, ramp.body, (i) => i < leadCount - 1 || i >= bendEndIdx - 2 || (i < centres.length && centres[i].z < 118));

  const railMaterial = new THREE.MeshToonMaterial({ color: 0xb9bec5, gradientMap: toonGradientMap });
  const rails = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), railMaterial, Math.max(railPieces.length, 1));
  const dummy = new THREE.Object3D();
  dummy.rotation.order = 'YXZ'; // yaw first, then pitch along the road's grade (girders)
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

  // ---------- supports: chunky piers + caps, underside girders ----------
  // Box local axes after yaw = heading: +x across the road, +z along it.
  const headingOf = (side) => Math.atan2(-side.z, side.x); // side = (tz, 0, -tx), so this is atan2(tx, tz)
  const piers = [];   // { x, z, base, h, capY, heading }
  function addPier(x, z, roadY, heading) {
    const base = terrainHeight(x, z);
    const topOfPier = roadY - 0.05 - S.capH;       // the cap sits just under the ribbon (no z-fighting)
    const h = topOfPier - base;
    if (h < S.minPierH) return;
    piers.push({ x, z, base, h, capY: topOfPier + S.capH / 2, heading });
  }
  // walk a polyline, dropping a pier every S.spacing metres of road
  function pierRun(points, headings, from, to) {
    let run = S.spacing / 2;
    for (let i = Math.max(from, 1); i < to; i++) {
      run += points[i].distanceTo(points[i - 1]);
      if (run < S.spacing) continue;
      run = 0;
      addPier(points[i].x, points[i].z, points[i].y, headings[i]);
    }
  }
  pierRun(highwaySamples, hwSides.map(headingOf), 1, highwaySamples.length - 1);
  pierRun(centres, sides.map(headingOf), leadCount, centres.length); // ramp bend + lane (the taper is skipped)

  const pierMat = new THREE.MeshToonMaterial({ color: 0x85878a, gradientMap: toonGradientMap });
  const capMat = new THREE.MeshToonMaterial({ color: 0x6f7276, gradientMap: toonGradientMap });
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const pierMesh = new THREE.InstancedMesh(unit, pierMat, Math.max(piers.length, 1));
  const capMesh = new THREE.InstancedMesh(unit, capMat, Math.max(piers.length, 1));
  piers.forEach((p, i) => {
    dummy.position.set(p.x, p.base + p.h / 2, p.z);
    dummy.rotation.set(0, p.heading, 0);
    dummy.scale.set(S.pierSize, p.h, S.pierSize);
    dummy.updateMatrix();
    pierMesh.setMatrixAt(i, dummy.matrix);
    dummy.position.set(p.x, p.capY, p.z);
    dummy.scale.set(S.capW, S.capH, S.capL);
    dummy.updateMatrix();
    capMesh.setMatrixAt(i, dummy.matrix);
    physics.createCollider(
      RAPIER.ColliderDesc.cuboid(S.pierSize / 2, p.h / 2, S.pierSize / 2)
        .setTranslation(p.x, p.base + p.h / 2, p.z).setRotation(yawQuat(p.heading)).setFriction(0.6),
      highway.body
    );
  });
  for (const m of [pierMesh, capMesh]) {
    m.count = piers.length;
    m.instanceMatrix.needsUpdate = true;
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    scene.add(m);
  }

  // Girder strip hugging the underside of the road, only where the road is well above the ground.
  const girders = [];  // { x, y, z, len, yaw, pitch }
  function girderRun(points, from, to) {
    for (let i = Math.max(from, 1); i < to; i++) {
      const a = points[i - 1], b = points[i];
      const dx = b.x - a.x, dz = b.z - a.z, flat = Math.hypot(dx, dz);
      if (flat < 0.3) continue;
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, my = (a.y + b.y) / 2;
      if (my - terrainHeight(mx, mz) < S.minGirderGap) continue;
      girders.push({
        x: mx, z: mz, y: my - 0.05 - S.girderH / 2,
        len: Math.hypot(flat, b.y - a.y) + 0.2,
        yaw: Math.atan2(dx, dz), pitch: Math.atan2(b.y - a.y, flat),
      });
    }
  }
  girderRun(highwaySamples, 1, highwaySamples.length);
  girderRun(centres, leadCount, centres.length);
  const girderMat = new THREE.MeshToonMaterial({ color: 0x4d5054, gradientMap: toonGradientMap });
  const girderMesh = new THREE.InstancedMesh(unit, girderMat, Math.max(girders.length, 1));
  girders.forEach((g, i) => {
    dummy.position.set(g.x, g.y, g.z);
    dummy.rotation.set(-g.pitch, g.yaw, 0);
    dummy.scale.set(S.girderW, S.girderH, g.len);
    dummy.updateMatrix();
    girderMesh.setMatrixAt(i, dummy.matrix);
  });
  girderMesh.count = girders.length;
  girderMesh.instanceMatrix.needsUpdate = true;
  girderMesh.castShadow = true;
  girderMesh.frustumCulled = false;
  scene.add(girderMesh);

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

  return {
    drivePath, mergeStartX: P3[0], taperEndX, highwaySamples, rampLeft: L, rampRight: R, rampCentre: path, onRoad,
    westEndX: HW.westX, pierCount: piers.length, girderCount: girders.length,
  };
}