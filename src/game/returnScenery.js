// Roadside trees along the return road (returnRoad.js), so the long way round is not bare. One instanced mesh of cheap blob trees,
// placed once from a hash along the road. No colliders: the van is on autopilot and trees stand 12+ m from the centre line.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { terrainHeight } from './world.js';
import { toonGradientMap } from './toon.js';

const STEP = 11;          // metres between tree slots along the road
const MIN_OFFSET = 12;
const MAX_OFFSET = 42;
const KEEP = 0.62;

function hash(n, salt) {
  const v = Math.sin(n * 127.1 + salt * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

function colored(geometry, colorAt) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) { colorAt(pos.getY(i), c); c.toArray(colors, i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

function treeGeometry() {
  const bark = new THREE.Color(0x72513a), leaves = new THREE.Color(0x4a8a3c);
  const pieces = [];
  const trunk = new THREE.CylinderGeometry(0.2, 0.3, 3.0, 6, 1);
  trunk.translate(0, 1.5, 0);
  pieces.push(colored(trunk, (y, c) => c.copy(bark).multiplyScalar(0.86 + y * 0.05)));
  for (const [x, y, z, rx, ry, rz] of [[0, 4.1, 0, 2.0, 1.7, 2.0], [-1.15, 3.5, 0.45, 1.35, 1.15, 1.35], [1.05, 3.6, -0.5, 1.4, 1.2, 1.4], [0.1, 5.2, 0.2, 1.3, 1.0, 1.3]]) {
    const blob = new THREE.IcosahedronGeometry(1, 1);
    blob.scale(rx, ry, rz);
    blob.translate(x, y, z);
    pieces.push(colored(blob, (py, c) => c.copy(leaves).multiplyScalar(0.78 + THREE.MathUtils.clamp((py - 2.6) * 0.09, 0, 0.3))));
  }
  return mergeGeometries(pieces, false);
}

export function createReturnScenery(scene, returnRoad) {
  const spots = [];
  const pts = returnRoad.sample(STEP);
  pts.forEach((p, i) => {
    for (const side of [-1, 1]) {
      const key = i * 2 + (side < 0 ? 0 : 1);
      if (hash(key, 1) > KEEP) continue;
      const off = MIN_OFFSET + hash(key, 2) * (MAX_OFFSET - MIN_OFFSET);
      const x = p.x + side * off * Math.cos(p.heading) + (hash(key, 3) - 0.5) * 4;
      const z = p.z - side * off * Math.sin(p.heading) + (hash(key, 4) - 0.5) * 4;
      spots.push({ x, z, y: terrainHeight(x, z), s: 0.85 + hash(key, 5) * 0.55, h: 0.9 + hash(key, 6) * 0.35, r: hash(key, 7) * Math.PI * 2 });
    }
  });
  const mesh = new THREE.InstancedMesh(
    treeGeometry(),
    new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradientMap }),
    Math.max(spots.length, 1)
  );
  const d = new THREE.Object3D();
  spots.forEach((t, i) => {
    d.position.set(t.x, t.y, t.z);
    d.rotation.set(0, t.r, 0);
    d.scale.set(t.s, t.s * t.h, t.s);
    d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
  });
  mesh.count = spots.length;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { count: spots.length };
}
