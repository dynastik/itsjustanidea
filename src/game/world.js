import * as THREE from 'three';

export const ROAD_HALF_WIDTH = 4.5;
const VIEW = 320;        // how far ahead/behind the world is kept alive
const ROAD_PERIOD = 10;  // metres per repeat of the road texture

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
  // ground (visual follows the vehicle; the collider is snapped to a 50m grid so it isn't teleported every frame)
  const groundMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(VIEW * 2, VIEW * 2),
    new THREE.MeshStandardMaterial({ color: 0x4a7c3a })
  );
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  const groundBody = physics.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  physics.createCollider(RAPIER.ColliderDesc.cuboid(200, 0.5, 200), groundBody); // top surface at y = 0

  // road: one long textured strip, snapped to multiples of the texture period so it never visibly slides
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_HALF_WIDTH * 2, VIEW * 2),
    new THREE.MeshStandardMaterial({
      map: makeRoadTexture(),
      roughness: 0.95,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  );
  road.rotation.x = -Math.PI / 2;
  road.position.y = 0.04;
  road.receiveShadow = true;
  scene.add(road);

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
    dummy.position.set(t.x, 0.6 * t.s, t.z);
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
      const body = physics.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(t.x, t.s, t.z));
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

  function update(x, z) {
    groundMesh.position.set(x, 0, z);
    groundBody.setTranslation({ x: Math.round(x / 50) * 50, y: -0.5, z: Math.round(z / 50) * 50 }, true);
    road.position.z = Math.round(z / ROAD_PERIOD) * ROAD_PERIOD;

    let dirty = false;
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i];
      if (t.z < z - VIEW) t.z += VIEW * 2;
      else if (t.z > z + VIEW) t.z -= VIEW * 2;
      else continue;
      writeTree(i);
      treeBodies[i].setTranslation({ x: t.x, y: t.s, z: t.z }, false);
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