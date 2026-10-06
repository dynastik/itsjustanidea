import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROAD_HALF_WIDTH, getRoadFrame, terrainHeight } from './world.js';
import { toonGradientMap } from './toon.js';

const SPACING = 20;
const SLOTS = 40;
const COLLISION_RANGE = 60;
const MIN_OFFSET = ROAD_HALF_WIDTH + 8;
const MAX_OFFSET = ROAD_HALF_WIDTH + 25;

function hash(n, salt) {
  const value = Math.sin(n * 127.1 + salt * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function makeTreeGeometry(variant) {
  const pieces = [];
  const tiers = variant === 0
    ? [
      [1.45, 1.5, 2.7],
      [1.1, 1.9, 3.9],
      [0.7, 2.3, 5.1],
    ]
    : [
      [1.7, 1.4, 2.6],
      [1.25, 1.85, 3.8],
      [0.8, 2.1, 5.0],
    ];
  for (const [radius, height, y] of tiers) {
    const cone = new THREE.ConeGeometry(radius, height, 6, 1);
    cone.translate(0, y, 0);
    pieces.push(cone);
  }

  const clusterOffsets = variant === 0
    ? [[-0.85, 3.2, 0.1], [0.8, 3.4, -0.2], [0.55, 4.6, 0.45], [-0.55, 4.45, -0.45]]
    : [[-0.9, 3.1, -0.3], [0.85, 3.25, 0.3], [0.45, 4.55, -0.45], [-0.65, 4.4, 0.4]];
  for (const [x, y, z] of clusterOffsets) {
    const cluster = new THREE.IcosahedronGeometry(0.8, 0);
    cluster.scale(0.8, 0.7, 0.8);
    cluster.translate(x, y, z);
    pieces.push(cluster);
  }

  const nonIndexedPieces = pieces.map((piece) => piece.index ? piece.toNonIndexed() : piece);
  const geometry = mergeGeometries(nonIndexedPieces, false);
  for (const piece of pieces) piece.dispose();
  for (let i = 0; i < pieces.length; i++) {
    if (nonIndexedPieces[i] !== pieces[i]) nonIndexedPieces[i].dispose();
  }
  return geometry;
}

function roadSidePose(z, side, offset) {
  const frame = getRoadFrame(z);
  return {
    x: frame.x + side * offset * Math.cos(frame.heading),
    z: z - side * offset * Math.sin(frame.heading),
    heading: frame.heading,
  };
}

export function createTrees(scene, physics, RAPIER) {
  const trunkMaterial = new THREE.MeshToonMaterial({ color: 0x72513a, gradientMap: toonGradientMap });
  const foliageMaterials = [
    new THREE.MeshToonMaterial({ color: 0x31583b, gradientMap: toonGradientMap }),
    new THREE.MeshToonMaterial({ color: 0x426b43, gradientMap: toonGradientMap }),
  ];
  const variants = [0, 1].map((variant) => {
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.22, 2.1, 6), trunkMaterial, SLOTS * 2);
    const foliage = new THREE.InstancedMesh(makeTreeGeometry(variant), foliageMaterials[variant], SLOTS * 2);
    for (const mesh of [trunk, foliage]) {
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
    }
    return { trunk, foliage };
  });

  const dummy = new THREE.Object3D();
  const matricesDirty = new Set();
  const slotKeys = new Int32Array(SLOTS * 2).fill(-2147483648);
  const colliders = new Map();

  function setInstance(mesh, slot, x, y, z, heading, scale, heightScale) {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, heading, 0);
    dummy.scale.set(scale, scale * heightScale, scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(slot, dummy.matrix);
    matricesDirty.add(mesh);
  }

  function hideSlot(slot) {
    for (const variant of variants) {
      setInstance(variant.trunk, slot, 0, -1000, 0, 0, 0, 1);
      setInstance(variant.foliage, slot, 0, -1000, 0, 0, 0, 1);
    }
  }

  function writeTree(k, side, slot) {
    if ((Math.floor(hash(k, side + 1) * 7) === 0)) {
      hideSlot(slot);
      return;
    }
    const z = (k + 0.5 + (hash(k, side + 2) - 0.5) * 0.35) * SPACING;
    const offset = THREE.MathUtils.lerp(MIN_OFFSET, MAX_OFFSET, hash(k, side + 3));
    const pose = roadSidePose(z, side, offset);
    const y = terrainHeight(pose.x, pose.z);
    const variantIndex = hash(k, side + 4) < 0.5 ? 0 : 1;
    const scale = 0.85 + hash(k, side + 5) * 0.45;
    const heightScale = 0.9 + hash(k, side + 6) * 0.35;

    for (let i = 0; i < variants.length; i++) {
      const { trunk, foliage } = variants[i];
      if (i === variantIndex) {
        setInstance(trunk, slot, pose.x, y + 1.05 * scale * heightScale, pose.z, pose.heading + (hash(k, side + 7) - 0.5) * 0.5, scale, heightScale);
        setInstance(foliage, slot, pose.x, y, pose.z, pose.heading + (hash(k, side + 7) - 0.5) * 0.5, scale, heightScale);
      } else {
        setInstance(trunk, slot, 0, -1000, 0, 0, 0, 1);
        setInstance(foliage, slot, 0, -1000, 0, 0, 0, 1);
      }
    }
  }

  function addTreeCollider(k, side) {
    if (Math.floor(hash(k, side + 1) * 7) === 0) return null;
    const z = (k + 0.5 + (hash(k, side + 2) - 0.5) * 0.35) * SPACING;
    const offset = THREE.MathUtils.lerp(MIN_OFFSET, MAX_OFFSET, hash(k, side + 3));
    const pose = roadSidePose(z, side, offset);
    const y = terrainHeight(pose.x, pose.z);
    const body = physics.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(pose.x, y + 1.05, pose.z)
    );
    physics.createCollider(
      RAPIER.ColliderDesc.cylinder(1.05, 0.3).setFriction(0.55).setRestitution(0.05),
      body
    );
    return body;
  }

  function update(vehicleZ) {
    const center = Math.floor(vehicleZ / SPACING);
    for (let n = -SLOTS / 2; n < SLOTS / 2; n++) {
      const k = center + n;
      for (const side of [-1, 1]) {
        const slot = ((n + SLOTS / 2) * 2) + (side < 0 ? 0 : 1);
        const key = k * 2 + (side < 0 ? 0 : 1);
        if (slotKeys[slot] === key) continue;
        writeTree(k, side, slot);
        slotKeys[slot] = key;
      }
    }
    for (const mesh of matricesDirty) mesh.instanceMatrix.needsUpdate = true;
    matricesDirty.clear();

    const min = center - Math.ceil(COLLISION_RANGE / SPACING);
    const max = center + Math.ceil(COLLISION_RANGE / SPACING);
    for (let k = min; k <= max; k++) {
      if (colliders.has(k)) continue;
      colliders.set(k, [-1, 1].map((side) => addTreeCollider(k, side)).filter(Boolean));
    }
    for (const [k, bodies] of colliders) {
      if (k >= min && k <= max) continue;
      for (const body of bodies) physics.removeRigidBody(body);
      colliders.delete(k);
    }
  }

  return { update };
}
