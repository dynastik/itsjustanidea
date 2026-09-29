import * as THREE from 'three';

export const ROAD_HALF_WIDTH = 4.5;
const VIEW = 320;        // how far ahead/behind the world is kept alive
const ROAD_PERIOD = 10;  // metres per repeat of the road texture
const TERRAIN_SIZE = VIEW * 2;
const TERRAIN_SEGMENTS = 64;
const TERRAIN_REPEAT = 200;

function roadHeight(z) {
  const t = (((z % TERRAIN_REPEAT) + TERRAIN_REPEAT) % TERRAIN_REPEAT) / TERRAIN_REPEAT * Math.PI * 2;
  return 0.35 * Math.sin(t) + 0.12 * Math.sin(t * 2 + 0.7);
}

export function terrainHeight(x, z) {
  const road = roadHeight(z);
  const natural =
    0.9 * Math.sin(z * Math.PI * 2 / 140) +
    0.45 * Math.sin((x * 0.8 + z * 0.35) * Math.PI * 2 / 90) +
    0.18 * Math.sin((x - z * 0.15) * Math.PI * 2 / 32);
  const roadBlend = THREE.MathUtils.smoothstep(
    Math.abs(x), ROAD_HALF_WIDTH + 0.5, ROAD_HALF_WIDTH + 5
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
    const x = p.getX(i);
    const z = centerZ + p.getY(i);
    p.setXYZ(i, x, roadHeight(z) + 0.035, z - centerZ);
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
  tex.repeat.set(1, (VIEW * 2) / ROAD_PERIOD);
  return tex;
}

// Interim world: ground, road, and roadside trees that recycle around the vehicle.
// Trees have real colliders, so hitting one costs you speed. Phase 2 replaces all of this
// with the terrain + road generator; surfaceAt() and the tree-collider pattern carry over.
export function createWorld(scene, physics, RAPIER) {
  // Phase 2 terrain pass: deterministic repeating hills. The physics collider
  // remains the flat ground until the dedicated terrain-collider checklist item.
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
    (() => {
      const mesh = buildTerrainColliderMesh(centerZ);
      return RAPIER.ColliderDesc.trimesh(mesh.vertices, mesh.indices).setFriction(0.8);
    })(),
    terrainBody
  );

  // trees (instanced visuals + one fixed collider each)
  const perSide = (VIEW * 2) / 5;
  const treeCount = perSide * 2;
  const trunkMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.15, 0.2, 1.2, 6),
    new THREE.MeshStandardMaterial({ color: 0x5a3d2b }), treeCount);
  const leavesMesh = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1.1, 2.2, 7),
    new THREE.MeshStandardMaterial({ color: 0x2d5a34 }), treeCount);
  for (const m of [trunkMesh, leavesMesh]) {
    m.castShadow = true;
    m.frustumCulled = false; // instances move; the cached bounding sphere would cull them
    scene.add(m);
  }

  const dummy = new THREE.Object3D();
  const trees = [];
  const treeBodies = [];

  function writeTree(i) {
    const t = trees[i];
    const groundY = terrainHeight(t.x, t.z);
    dummy.position.set(t.x, groundY + 0.6 * t.s, t.z);
    dummy.scale.setScalar(t.s);
    dummy.updateMatrix();
    trunkMesh.setMatrixAt(i, dummy.matrix);
    dummy.position.set(t.x, (1.2 + 1.1) * t.s, t.z);
    dummy.updateMatrix();
    leavesMesh.setMatrixAt(i, dummy.matrix);
  }

  for (const side of [-1, 1]) {
    for (let z = -VIEW; z < VIEW; z += 5) {
      const t = {
        x: side * (10 + Math.random() * 6),
        z: z + (Math.random() - 0.5) * 3,
        s: 0.7 + Math.random() * 0.6,
      };
      trees.push(t);
      const body = physics.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(t.x, terrainHeight(t.x, t.z) + t.s, t.z));
      physics.createCollider(
        RAPIER.ColliderDesc.cylinder(t.s, 0.35 * t.s).setFriction(0.2).setRestitution(0.1),
        body
      );
      treeBodies.push(body);
      writeTree(trees.length - 1);
    }
  }
  trunkMesh.instanceMatrix.needsUpdate = true;
  leavesMesh.instanceMatrix.needsUpdate = true;

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

    groundBody.setTranslation({ x: Math.round(x / 50) * 50, y: -0.5, z: Math.round(z / 50) * 50 }, true);

    let dirty = false;
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i];
      if (t.z < z - VIEW) t.z += VIEW * 2;
      else if (t.z > z + VIEW) t.z -= VIEW * 2;
      else continue;
      writeTree(i);
      treeBodies[i].setTranslation({ x: t.x, y: terrainHeight(t.x, t.z) + t.s, z: t.z }, false);
      dirty = true;
    }
    if (dirty) {
      trunkMesh.instanceMatrix.needsUpdate = true;
      leavesMesh.instanceMatrix.needsUpdate = true;
    }
  }

  // What is under the vehicle? Feeds grip/speed penalties (and later, audio + tire tracks).
  function surfaceAt(x) {
    return { offRoad: Math.abs(x) > ROAD_HALF_WIDTH + 0.3 };
  }

  return { update, surfaceAt };
}