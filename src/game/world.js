import * as THREE from 'three';

export const ROAD_HALF_WIDTH = 4.5;
const VIEW = 320;        // how far ahead/behind the world is kept alive
const ROAD_PERIOD = 10;  // metres per repeat of the road texture
const TERRAIN_SIZE = VIEW * 2;
const TERRAIN_SEGMENTS = 64;
const TERRAIN_REPEAT = 200;

function roadCenterX(z) {
  const t = (((z % TERRAIN_REPEAT) + TERRAIN_REPEAT) % TERRAIN_REPEAT) / TERRAIN_REPEAT * Math.PI * 2;
  return 2.0 * Math.sin(t) + 0.8 * Math.sin(t * 2 + 0.4);
}

function roadHeight(z) {
  const t = (((z % TERRAIN_REPEAT) + TERRAIN_REPEAT) % TERRAIN_REPEAT) / TERRAIN_REPEAT * Math.PI * 2;
  return 0.35 * Math.sin(t) + 0.12 * Math.sin(t * 2 + 0.7);
}

export function getRoadFrame(z) {
  const dz = 0.5;
  const x = roadCenterX(z);
  const dx = (roadCenterX(z + dz) - roadCenterX(z - dz)) / (2 * dz);
  return { x, heading: Math.atan2(dx, 1), y: roadHeight(z) };
}

export function terrainHeight(x, z) {
  const frame = getRoadFrame(z);
  const road = frame.y;
  const distanceFromRoad = Math.abs(x - frame.x);
  const natural =
    0.9 * Math.sin(z * Math.PI * 2 / 140) +
    0.45 * Math.sin((x * 0.8 + z * 0.35) * Math.PI * 2 / 90) +
    0.18 * Math.sin((x - z * 0.15) * Math.PI * 2 / 32);
  const roadBlend = THREE.MathUtils.smoothstep(
    distanceFromRoad, ROAD_HALF_WIDTH + 0.5, ROAD_HALF_WIDTH + 5
  );
  return THREE.MathUtils.lerp(road, natural, roadBlend);
}

function buildTerrainGeometry(centerZ) {
  const g = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = centerZ + p.getY(i);
    p.setXYZ(i, x, terrainHeight(x, z), z - centerZ);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

function buildTerrainHeights(centerZ) {
  const n = TERRAIN_SEGMENTS + 1;
  const heights = new Float32Array(n * n);
  for (let x = 0; x < n; x++) {
    const localX = (x / TERRAIN_SEGMENTS - 0.5) * TERRAIN_SIZE;
    for (let z = 0; z < n; z++) {
      const localZ = (z / TERRAIN_SEGMENTS - 0.5) * TERRAIN_SIZE;
      // Rapier stores 3D heightfields column-major: x column, then z row.
      heights[x * n + z] = terrainHeight(localX, centerZ + localZ);
    }
  }
  return heights;
}

function buildRoadGeometry(centerZ) {
  const g = new THREE.PlaneGeometry(ROAD_HALF_WIDTH * 2, TERRAIN_SIZE, 1, TERRAIN_SEGMENTS);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const localX = p.getX(i);
    const z = centerZ + p.getY(i);
    p.setXYZ(i, roadCenterX(z) + localX, roadHeight(z) + 0.035, z - centerZ);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

function makeRoadTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#3a3a40';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 700; i++) {
    const l = 50 + Math.random() * 30;
    g.fillStyle = `rgb(${l},${l},${l + 4})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  g.fillStyle = '#e8e8e8';
  g.fillRect(9, 0, 5, 256);
  g.fillRect(256 - 14, 0, 5, 256);
  g.fillStyle = '#f2c94c';
  g.fillRect(126, 0, 4, 102);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.repeat.set(1, (VIEW * 2) / ROAD_PERIOD);
  return tex;
}

// Hilly terrain with road carved on top. Trees removed; Phase 2 add props later.
export function createWorld(scene, physics, RAPIER) {
  let centerZ = 0;
  const terrain = new THREE.Mesh(
    buildTerrainGeometry(centerZ),
    new THREE.MeshStandardMaterial({ color: 0x4a7c3a, roughness: 1 })
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

  const terrainBody = physics.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, centerZ)
  );
  let terrainCollider = physics.createCollider(
    RAPIER.ColliderDesc.heightfield(
      TERRAIN_SEGMENTS + 1,
      TERRAIN_SEGMENTS + 1,
      buildTerrainHeights(centerZ),
      { x: TERRAIN_SIZE, y: 1, z: TERRAIN_SIZE }
    ).setFriction(0.8),
    terrainBody
  );

  function rebuildTerrain(newCenterZ) {
    centerZ = Math.round(newCenterZ / TERRAIN_REPEAT) * TERRAIN_REPEAT;
    terrain.geometry.dispose();
    terrain.geometry = buildTerrainGeometry(centerZ);
    road.geometry.dispose();
    road.geometry = buildRoadGeometry(centerZ);

    physics.removeCollider(terrainCollider, true);
    terrainCollider = physics.createCollider(
      RAPIER.ColliderDesc.heightfield(
        TERRAIN_SEGMENTS + 1,
        TERRAIN_SEGMENTS + 1,
        buildTerrainHeights(centerZ),
        { x: TERRAIN_SIZE, y: 1, z: TERRAIN_SIZE }
      ).setFriction(0.8),
      terrainBody
    );
    terrainBody.setTranslation({ x: 0, y: 0, z: centerZ }, true);
  }

  function update(x, z) {
    const nextCenter = Math.round(z / TERRAIN_REPEAT) * TERRAIN_REPEAT;
    if (nextCenter !== centerZ) rebuildTerrain(nextCenter);
  }

  function surfaceAt(x, z) {
    const road = getRoadFrame(z);
    return { offRoad: Math.abs(x - road.x) > ROAD_HALF_WIDTH + 0.3 };
  }

  return { update, surfaceAt, getRoadFrame };
}