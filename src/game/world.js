import * as THREE from 'three';
import { HIGHWAY_ZONE_Z, ZONE_HYSTERESIS } from './zones.js';

export const ROAD_HALF_WIDTH = 4.5;

// Terrain: one regular grid, used for BOTH the visible mesh and the Rapier heightfield, so what
// you see is exactly what the wheels touch. 2.5 m cells keep the flat road strip accurate.
const VIEW = 400;                 // half-extent of the live terrain around the vehicle
const TERRAIN_SIZE = VIEW * 2;
const CELL = 2.5;
const SEG = TERRAIN_SIZE / CELL;  // 320 cells per side
const N = SEG + 1;                // vertices per side
const REPEAT = 200;               // road curves/grades repeat every 200 m; terrain recentres on multiples of this
const RECENTER_DIST = 120;        // hysteresis: only rebuild once this far from the centre
const ROAD_PERIOD = 10;           // metres per repeat of the road texture
const FLAT_DIST = ROAD_HALF_WIDTH + 2.5;  // terrain is exactly road-height out to here (guardrails sit inside it)
const SLOPE_DIST = 9;             // then rises to the hills over this distance
const HILL = 1.5;                 // hill height multiplier

const GRASS = new THREE.Color(0x4a7c3a);
const DIRT = new THREE.Color(0x8a7d5c);

function roadCenterX(z) {
  const t = (((z % REPEAT) + REPEAT) % REPEAT) / REPEAT * Math.PI * 2;
  return 2.0 * Math.sin(t) + 0.8 * Math.sin(t * 2 + 0.4);
}

function roadHeight(z) {
  const t = (((z % REPEAT) + REPEAT) % REPEAT) / REPEAT * Math.PI * 2;
  return 0.35 * Math.sin(t) + 0.12 * Math.sin(t * 2 + 0.7);
}

export function getRoadFrame(z) {
  const dz = 0.5;
  const x = roadCenterX(z);
  const dx = (roadCenterX(z + dz) - roadCenterX(z - dz)) / (2 * dz);
  return { x, heading: Math.atan2(dx, 1), y: roadHeight(z) };
}

function naturalHeight(x, z) {
  return HILL * (
    0.9 * Math.sin(z * Math.PI * 2 / 140) +
    0.45 * Math.sin((x * 0.8 + z * 0.35) * Math.PI * 2 / 90) +
    0.18 * Math.sin((x - z * 0.15) * Math.PI * 2 / 32)
  );
}

export function terrainHeight(x, z) {
  const d = Math.abs(x - roadCenterX(z));
  const blend = THREE.MathUtils.smoothstep(d, FLAT_DIST, FLAT_DIST + SLOPE_DIST);
  return THREE.MathUtils.lerp(roadHeight(z), naturalHeight(x, z), blend);
}

// Heights (row-major: zi * N + xi) and vertex colours for the grid centred on (0, centerZ).
function buildTerrainData(centerZ) {
  const heights = new Float32Array(N * N);
  const colors = new Float32Array(N * N * 3);
  const c = new THREE.Color();
  for (let zi = 0; zi < N; zi++) {
    const z = centerZ + (-VIEW + zi * CELL);
    const rx = roadCenterX(z);
    const ry = roadHeight(z);
    for (let xi = 0; xi < N; xi++) {
      const x = -VIEW + xi * CELL;
      const d = Math.abs(x - rx);
      const blend = THREE.MathUtils.smoothstep(d, FLAT_DIST, FLAT_DIST + SLOPE_DIST);
      const hgt = THREE.MathUtils.lerp(ry, naturalHeight(x, z), blend);
      const i = zi * N + xi;
      heights[i] = hgt;

      const shade = 0.8 + 0.25 * THREE.MathUtils.clamp((hgt + 1.5) / 4, 0, 1);
      const dirt = 1 - THREE.MathUtils.smoothstep(d, ROAD_HALF_WIDTH + 0.2, ROAD_HALF_WIDTH + 3.5);
      c.copy(GRASS).lerp(DIRT, dirt).multiplyScalar(shade);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
  }
  return { heights, colors };
}

function buildTerrainGeometry({ heights, colors }) {
  const pos = new Float32Array(N * N * 3);
  const nor = new Float32Array(N * N * 3);
  for (let zi = 0; zi < N; zi++) {
    const zl = Math.max(zi - 1, 0), zr = Math.min(zi + 1, SEG);
    for (let xi = 0; xi < N; xi++) {
      const xl = Math.max(xi - 1, 0), xr = Math.min(xi + 1, SEG);
      const i = zi * N + xi;
      pos[i * 3] = -VIEW + xi * CELL;
      pos[i * 3 + 1] = heights[i];
      pos[i * 3 + 2] = -VIEW + zi * CELL;

      const dx = (heights[zi * N + xr] - heights[zi * N + xl]) / ((xr - xl) * CELL);
      const dz = (heights[zr * N + xi] - heights[zl * N + xi]) / ((zr - zl) * CELL);
      const len = Math.hypot(dx, 1, dz);
      nor[i * 3] = -dx / len;
      nor[i * 3 + 1] = 1 / len;
      nor[i * 3 + 2] = -dz / len;
    }
  }
  const idx = new Uint32Array(SEG * SEG * 6);
  let k = 0;
  for (let zi = 0; zi < SEG; zi++) {
    for (let xi = 0; xi < SEG; xi++) {
      const a = zi * N + xi, b = a + 1, c = a + N, d = c + 1;
      idx[k++] = a; idx[k++] = c; idx[k++] = b; // both triangles face up
      idx[k++] = b; idx[k++] = c; idx[k++] = d;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

// Rapier heightfields are column-major: x column, then z row.
function toColliderHeights(heights) {
  const out = new Float32Array(N * N);
  for (let xi = 0; xi < N; xi++) {
    for (let zi = 0; zi < N; zi++) out[xi * N + zi] = heights[zi * N + xi];
  }
  return out;
}

function buildRoadGeometry(centerZ) {
  const rows = SEG + 1;
  const pos = new Float32Array(rows * 2 * 3);
  const nor = new Float32Array(rows * 2 * 3);
  const uv = new Float32Array(rows * 2 * 2);
  for (let zi = 0; zi < rows; zi++) {
    const lz = -VIEW + zi * CELL;
    const z = centerZ + lz;
    const rx = roadCenterX(z);
    const ry = roadHeight(z) + 0.035;
    for (let s = 0; s < 2; s++) {
      const i = zi * 2 + s;
      pos[i * 3] = rx + (s === 0 ? -ROAD_HALF_WIDTH : ROAD_HALF_WIDTH);
      pos[i * 3 + 1] = ry;
      pos[i * 3 + 2] = lz;
      nor[i * 3 + 1] = 1;
      uv[i * 2] = s;
      uv[i * 2 + 1] = z / ROAD_PERIOD; // world-based, so the dashes never slide when the strip rebuilds
    }
  }
  const idx = new Uint32Array(SEG * 6);
  let k = 0;
  for (let zi = 0; zi < SEG; zi++) {
    const a = zi * 2, b = a + 1, c = a + 2, d = a + 3;
    idx[k++] = a; idx[k++] = c; idx[k++] = b;
    idx[k++] = b; idx[k++] = c; idx[k++] = d;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

function makeRoadTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#3a3a40';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 700; i++) { // asphalt speckle
    const l = 50 + Math.random() * 30;
    g.fillStyle = `rgb(${l},${l},${l + 4})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  g.fillStyle = '#e8e8e8';       // edge lines
  g.fillRect(9, 0, 5, 256);
  g.fillRect(256 - 14, 0, 5, 256);
  g.fillStyle = '#f2c94c';       // dashed centre line: 4m dash, 6m gap
  g.fillRect(126, 0, 4, 102);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

// Hilly terrain with the road laid on it. Roadside props (guardrails, markers) live in props.js.
export function createWorld(scene, physics, RAPIER) {
  let centerZ = 0;

  // ---------- terrain + road ----------
  const data0 = buildTerrainData(centerZ);
  const terrain = new THREE.Mesh(
    buildTerrainGeometry(data0),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })
  );
  terrain.receiveShadow = true;
  scene.add(terrain);

  const road = new THREE.Mesh(
    buildRoadGeometry(centerZ),
    new THREE.MeshStandardMaterial({
      map: makeRoadTexture(),
      roughness: 0.95,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  );
  road.receiveShadow = true;
  scene.add(road);

  // On-ramp trigger line: painted across the road where the game hands you over from WASD to typing
  // (see zones.js). Fixed in world space, so terrain recentring doesn't affect it.
  const gateZ = HIGHWAY_ZONE_Z + ZONE_HYSTERESIS;
  const gateFrame = getRoadFrame(gateZ);
  const gate = new THREE.Group();
  gate.position.set(gateFrame.x, gateFrame.y + 0.05, gateZ);
  gate.rotation.y = gateFrame.heading;
  const stripe = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_HALF_WIDTH * 2 - 0.6, 0.9),
    new THREE.MeshStandardMaterial({
      color: 0xf4f4f4, roughness: 0.9,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    })
  );
  stripe.rotation.x = -Math.PI / 2;
  stripe.receiveShadow = true;
  gate.add(stripe);
  scene.add(gate);

  const terrainBody = physics.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, centerZ)
  );
  function makeCollider(heights) {
    // heightfield(nrows, ncols) takes SUBDIVISIONS (vertices - 1); the heights array has (n+1)^2 entries
    return physics.createCollider(
      RAPIER.ColliderDesc.heightfield(SEG, SEG, toColliderHeights(heights), { x: TERRAIN_SIZE, y: 1, z: TERRAIN_SIZE })
        .setFriction(0.8),
      terrainBody
    );
  }
  let terrainCollider = makeCollider(data0.heights);

  function rebuildTerrain(newCenterZ) {
    centerZ = newCenterZ;
    const data = buildTerrainData(centerZ);
    terrain.geometry.dispose();
    terrain.geometry = buildTerrainGeometry(data);
    terrain.position.z = centerZ;
    road.geometry.dispose();
    road.geometry = buildRoadGeometry(centerZ);
    road.position.z = centerZ;

    physics.removeCollider(terrainCollider, true);
    terrainBody.setTranslation({ x: 0, y: 0, z: centerZ }, true);
    terrainCollider = makeCollider(data.heights);
  }

  function update(x, z) {
    if (Math.abs(z - centerZ) > RECENTER_DIST) rebuildTerrain(Math.round(z / REPEAT) * REPEAT);
  }

  // What is under the vehicle? Feeds grip/speed penalties (and later, audio + tire tracks).
  function surfaceAt(x, z) {
    const f = getRoadFrame(z);
    return { offRoad: Math.abs(x - f.x) > ROAD_HALF_WIDTH + 0.3 };
  }

  return { update, surfaceAt, getRoadFrame };
}