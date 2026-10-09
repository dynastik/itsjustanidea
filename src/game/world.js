import * as THREE from 'three';
import { HIGHWAY_ZONE_Z, ZONE_HYSTERESIS, CITY_Z_MIN, CITY_Z_MAX, CITY_BAY_WIDTH, CITY_WALK_WIDTH } from './zones.js';
import { toonGradientMap } from './toon.js';

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
const SLOPE_DIST = 20;            // broad transition from the flat road corridor into the hills
const HILL = 4.5;                  // broad, tall scenery while the road keeps a separate gentle grade

const GRASS = new THREE.Color(0x4a7c3a);
const DIRT = new THREE.Color(0x8a7d5c);

function roadCenterX(z) {
  const t = (((z % REPEAT) + REPEAT) % REPEAT) / REPEAT * Math.PI * 2;
  return 2.0 * Math.sin(t) + 0.8 * Math.sin(t * 2 + 0.4);
}

function roadHeight(z) {
  return 1.9 * Math.sin(z * Math.PI * 2 / 360) +
    0.8 * Math.sin(z * Math.PI * 2 / 220 + 0.6);
}

export function getRoadFrame(z) {
  const dz = 0.5;
  const x = roadCenterX(z);
  const dx = (roadCenterX(z + dz) - roadCenterX(z - dz)) / (2 * dz);
  return { x, heading: Math.atan2(dx, 1), y: roadHeight(z) };
}

// The city is flat; the hills grow in on either side of it instead of starting at its doorstep.
function hillFactor(z) {
  const ahead = THREE.MathUtils.smoothstep(z, CITY_Z_MAX, CITY_Z_MAX + 120);
  const behind = THREE.MathUtils.smoothstep(-z, -CITY_Z_MIN, -CITY_Z_MIN + 120);
  return Math.max(ahead, behind);
}

function naturalHeight(x, z) {
  return hillFactor(z) * HILL * (
    0.9 * Math.sin(z * Math.PI * 2 / 260) +
    0.45 * Math.sin((x * 0.8 + z * 0.35) * Math.PI * 2 / 190) +
    0.18 * Math.sin((x - z * 0.15) * Math.PI * 2 / 60)
  );
}

export function terrainHeight(x, z) {
  const d = Math.abs(x - roadCenterX(z));
  const blend = THREE.MathUtils.smoothstep(d, FLAT_DIST, FLAT_DIST + SLOPE_DIST);
  return THREE.MathUtils.lerp(roadHeight(z), naturalHeight(x, z), blend);
}

// Heights (row-major: zi * N + xi) and vertex colours for the grid centred on (0, centerZ).
// The two arrays are shared and rewritten on every rebuild (nothing keeps a reference to the old values),
// so recentring the terrain every ~200 m no longer allocates and throws away ~2 MB each time.
const TERRAIN_HEIGHTS = new Float32Array(N * N);
const TERRAIN_COLORS = new Float32Array(N * N * 3);
function buildTerrainData(centerZ) {
  const heights = TERRAIN_HEIGHTS;
  const colors = TERRAIN_COLORS;
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

      const shade = 0.8 + 0.25 * THREE.MathUtils.clamp((hgt + 5) / 10, 0, 1);
      const dirt = 1 - THREE.MathUtils.smoothstep(d, ROAD_HALF_WIDTH + 0.2, ROAD_HALF_WIDTH + 3.5);
      c.copy(GRASS).lerp(DIRT, dirt).multiplyScalar(shade);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
  }
  return { heights, colors };
}

// Created once. Later rebuilds pass the existing geometry and only rewrite heights, normals and colours in place:
// no new geometry, no 600k-entry index rebuild, no GPU buffer churn.
function buildTerrainGeometry({ heights, colors }, existing = null) {
  const pos = existing ? existing.attributes.position.array : new Float32Array(N * N * 3);
  const nor = existing ? existing.attributes.normal.array : new Float32Array(N * N * 3);
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
  if (existing) {
    existing.attributes.position.needsUpdate = true;
    existing.attributes.normal.needsUpdate = true;
    existing.attributes.color.needsUpdate = true; // its array IS the shared colour buffer, already rewritten
    return existing;
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
    // The city road ends here; the elevated cross-highway is now the primary highway.
    const roadVisible = z <= CITY_Z_MAX;
    for (let s = 0; s < 2; s++) {
      const i = zi * 2 + s;
      pos[i * 3] = roadVisible ? rx + (s === 0 ? -ROAD_HALF_WIDTH : ROAD_HALF_WIDTH) : 10000;
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

// A compact, model-free flyover ramp. It is a visual set piece for the typing highway:
 // one road ribbon, instanced guardrails, and instanced box pillars keep draw calls low.
function createHighwayInterchange(scene, physics, RAPIER, roadMaterial) {
  const width = ROAD_HALF_WIDTH * 2;
  const cityEndZ = CITY_Z_MAX;
  const startX = roadCenterX(cityEndZ);
  const startY = roadHeight(cityEndZ);
  const highwayZ = 170;
  const mergeX = startX + 12;
  const highwayY = startY + 4.5;

  // Build one continuous east-west primary highway. Both ends descend smoothly
  // to terrain level well before the supported world edge, so there is no road cliff.
  const highwayControls = [
    [-380, startY + 0.08, highwayZ],
    [-330, startY + 0.08, highwayZ],
    [-280, startY + 0.7, highwayZ],
    [-230, startY + 2.2, highwayZ],
    [-175, highwayY - 0.4, highwayZ],
    [-115, highwayY, highwayZ],
    [mergeX, highwayY, highwayZ],
    [115, highwayY, highwayZ],
    [175, highwayY - 0.4, highwayZ],
    [230, startY + 2.2, highwayZ],
    [280, startY + 0.7, highwayZ],
    [330, startY + 0.08, highwayZ],
    [380, startY + 0.08, highwayZ],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const highwayCurve = new THREE.CatmullRomCurve3(highwayControls, false, 'catmullrom', 0.2);
  const highwaySamples = highwayCurve.getPoints(240);

  function frameSides(samples) {
    return samples.map((p, i) => {
      const before = samples[Math.max(0, i - 1)];
      const after = samples[Math.min(samples.length - 1, i + 1)];
      const tangent = after.clone().sub(before);
      return new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
    });
  }
  function cumulativeLengths(samples) {
    const lengths = [0];
    for (let i = 1; i < samples.length; i++) lengths.push(lengths[i - 1] + samples[i].distanceTo(samples[i - 1]));
    return lengths;
  }
  function makeRibbon(samples, sides, lengths) {
    const positions = new Float32Array(samples.length * 2 * 3);
    const uvs = new Float32Array(samples.length * 2 * 2);
    const indices = new Uint32Array((samples.length - 1) * 6);
    for (let i = 0; i < samples.length; i++) {
      const p = samples[i];
      const left = p.clone().addScaledVector(sides[i], -width / 2);
      const right = p.clone().addScaledVector(sides[i], width / 2);
      const vi = i * 2;
      positions.set([left.x, left.y, left.z, right.x, right.y, right.z], vi * 3);
      uvs.set([0, lengths[i] / 10, 1, lengths[i] / 10], vi * 2);
      if (i < samples.length - 1) {
        const k = i * 6, a = vi, b = vi + 1, c = vi + 2, d = vi + 3;
        indices.set([a, c, b, b, c, d], k);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();
    return { geometry, positions, indices };
  }
  function addRoad(samples, sides, lengths) {
    const ribbon = makeRibbon(samples, sides, lengths);
    const material = roadMaterial.clone();
    material.side = THREE.DoubleSide;
    const mesh = new THREE.Mesh(ribbon.geometry, material);
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
    const body = physics.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    physics.createCollider(
      RAPIER.ColliderDesc.trimesh(ribbon.positions, ribbon.indices).setFriction(0.8),
      body
    );
    return body;
  }

  const highwaySides = frameSides(highwaySamples);
  const highwayBody = addRoad(highwaySamples, highwaySides, cumulativeLengths(highwaySamples));

  // The city road curves right into the east-west highway. The final ramp tangent
  // is aligned with the highway, and its end shares the highway's exact merge point.
  const rampControls = [
    [startX, startY + 0.08, cityEndZ],
    [startX + 0.5, startY + 0.12, cityEndZ + 10],
    [startX + 2.5, startY + 0.55, cityEndZ + 22],
    [startX + 7, startY + 1.5, cityEndZ + 36],
    [mergeX - 24, highwayY - 1.4, highwayZ + 20],
    [mergeX - 10, highwayY - 0.25, highwayZ + 5],
    [mergeX, highwayY, highwayZ],
    [mergeX + 24, highwayY, highwayZ],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const rampCurve = new THREE.CatmullRomCurve3(rampControls, false, 'catmullrom', 0.15);
  const rampSamples = rampCurve.getPoints(96);
  const rampSides = frameSides(rampSamples);
  const rampBody = addRoad(rampSamples, rampSides, cumulativeLengths(rampSamples));

  // Guardrails are visible and collidable on both roads.
  const railMaterial = new THREE.MeshToonMaterial({ color: 0xb9bec5, gradientMap: toonGradientMap });
  const dummy = new THREE.Object3D();
  function addRails(samples, sides, body) {
    const rails = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), railMaterial, (samples.length - 1) * 2);
    let idx = 0;
    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[i], b = samples[i + 1];
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz) + 0.1;
      const yaw = Math.atan2(dx, dz);
      const tangentSide = sides[i].clone().add(sides[i + 1]).normalize();
      for (const side of [-1, 1]) {
        const offset = tangentSide.clone().multiplyScalar(side * (width / 2 - 0.12));
        const x = mid.x + offset.x, y = mid.y + 0.43, z = mid.z + offset.z;
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(0.16, 0.52, len);
        dummy.updateMatrix();
        rails.setMatrixAt(idx++, dummy.matrix);
        physics.createCollider(
          RAPIER.ColliderDesc.cuboid(0.08, 0.26, len / 2)
            .setTranslation(x, y, z)
            .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
            .setFriction(0.7),
          body
        );
      }
    }
    rails.instanceMatrix.needsUpdate = true;
    rails.frustumCulled = false;
    scene.add(rails);
  }
  addRails(rampSamples, rampSides, rampBody);
  addRails(highwaySamples, highwaySides, highwayBody);

  // Pillars under elevated portions only. Skip where terrain is already near deck height.
  const pillarMat = new THREE.MeshToonMaterial({ color: 0x85878a, gradientMap: toonGradientMap });
  const pillars = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), pillarMat, 48);
  let pillarIndex = 0;
  for (let i = 8; i < highwaySamples.length - 8; i += 12) {
    const p = highwaySamples[i];
    const base = terrainHeight(p.x, p.z);
    const height = p.y - base;
    if (height < 2.2) continue;
    for (const side of [-1, 1]) {
      const offset = highwaySides[i].clone().multiplyScalar(side * (width / 2 + 1.1));
      dummy.position.set(p.x + offset.x, base + height / 2, p.z + offset.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(0.72, height, 0.72);
      dummy.updateMatrix();
      pillars.setMatrixAt(pillarIndex++, dummy.matrix);
    }
  }
  pillars.count = pillarIndex;
  pillars.instanceMatrix.needsUpdate = true;
  pillars.frustumCulled = false;
  scene.add(pillars);
}

// Hilly terrain with the road laid on it. Roadside props (guardrails, markers) live in props.js.
export function createWorld(scene, physics, RAPIER) {
  let centerZ = 0;

  // ---------- terrain + road ----------
  const data0 = buildTerrainData(centerZ);
  const terrain = new THREE.Mesh(
    buildTerrainGeometry(data0),
    new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradientMap })
  );
  terrain.receiveShadow = true;
  terrain.frustumCulled = false; // the geometry is rewritten in place and always surrounds the vehicle
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

  // One lightweight elevated joining ramp ahead of the player; no imported models or extra lights.
  createHighwayInterchange(scene, physics, RAPIER, road.material);

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
    buildTerrainGeometry(data, terrain.geometry);
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
    // inside the city the parking bays and sidewalks are paved, so only leaving them counts as off-road
    const paved = z > CITY_Z_MIN && z < CITY_Z_MAX ? ROAD_HALF_WIDTH + CITY_BAY_WIDTH + CITY_WALK_WIDTH : ROAD_HALF_WIDTH;
    return { offRoad: Math.abs(x - f.x) > paved + 0.3 };
  }

  return { update, surfaceAt, getRoadFrame };
}