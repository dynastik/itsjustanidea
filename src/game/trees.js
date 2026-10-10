import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROAD_HALF_WIDTH, getRoadFrame, terrainHeight } from './world.js';
import { toonGradientMap } from './toon.js';
import { CITY_Z_MIN } from './zones.js';
import { GROUND_START_Z } from './highwayLayout.js';

const TREE_SPACING = 20;
const TREE_SLOTS = 40;
const TREE_DETAIL_RADIUS = 2;
const TREE_DETAIL_SLOTS = (TREE_DETAIL_RADIUS * 2 + 1) * 2;
const COLLISION_RANGE = 60;
const TREE_MIN_OFFSET = ROAD_HALF_WIDTH + 8;
const TREE_MAX_OFFSET = ROAD_HALF_WIDTH + 25;
const HIDDEN_Y = -1000;

function hash(n, salt) {
  const value = Math.sin(n * 127.1 + salt * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function addVertexColors(geometry, colorAt) {
  const result = geometry.index ? geometry.toNonIndexed() : geometry;
  if (result !== geometry) geometry.dispose();
  const positions = result.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    colorAt(positions.getX(i), positions.getY(i), positions.getZ(i), color);
    color.toArray(colors, i * 3);
  }
  result.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return result;
}

function mergePieces(pieces) {
  const geometry = mergeGeometries(pieces, false);
  for (const piece of pieces) piece.dispose();
  if (!geometry) throw new Error('Unable to merge vegetation geometry');
  return geometry;
}

async function loadDetailedTreeAssets() {
  const geometryUrl = new URL('../assets/fluffy-tree-geometry.bin', import.meta.url);
  const textureUrl = new URL('../assets/fluffy-tree-leaves.png', import.meta.url);
  const [response, leafMask] = await Promise.all([
    fetch(geometryUrl),
    new THREE.TextureLoader().loadAsync(textureUrl.href),
  ]);
  if (!response.ok) throw new Error(`Unable to load detailed tree geometry: ${response.status}`);
  const buffer = await response.arrayBuffer();
  const header = new DataView(buffer);
  const vertexCount = header.getUint32(0, true);
  const indexCount = header.getUint32(4, true);
  let offset = 8;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(buffer, offset, vertexCount * 3), 3));
  offset += vertexCount * 3 * Float32Array.BYTES_PER_ELEMENT;
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(buffer, offset, vertexCount * 3), 3));
  offset += vertexCount * 3 * Float32Array.BYTES_PER_ELEMENT;
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(buffer, offset, vertexCount * 2), 2));
  offset += vertexCount * 2 * Float32Array.BYTES_PER_ELEMENT;
  geometry.setAttribute('canopyDirection', new THREE.Int8BufferAttribute(new Int8Array(buffer, offset, vertexCount * 3), 3, true));
  offset += vertexCount * 3;
  geometry.setAttribute('foliage', new THREE.Uint8BufferAttribute(new Uint8Array(buffer, offset, vertexCount), 1, true));
  offset += vertexCount;
  geometry.setIndex(new THREE.Uint16BufferAttribute(new Uint16Array(buffer, offset, indexCount), 1));
  geometry.computeBoundingSphere();
  leafMask.colorSpace = THREE.NoColorSpace;
  leafMask.anisotropy = 4;
  return { geometry, leafMask };
}

function makeDistantTreeGeometry() {
  const pieces = [];
  const bark = new THREE.Color(0x72513a);
  const leaves = new THREE.Color(0x3d7540);
  const trunk = new THREE.CylinderGeometry(0.17, 0.25, 2.4, 5, 1);
  trunk.translate(0, 1.2, 0);
  pieces.push(addVertexColors(trunk, (_x, y, _z, color) => color.copy(bark).multiplyScalar(0.86 + y * 0.08)));
  for (const [radius, height, y] of [[1.55, 1.8, 2.9], [1.18, 1.9, 4.0], [0.78, 1.8, 5.05]]) {
    const cone = new THREE.ConeGeometry(radius, height, 6, 1);
    cone.translate(0, y, 0);
    pieces.push(addVertexColors(cone, (_x, py, _z, color) => {
      color.copy(leaves).multiplyScalar(0.82 + THREE.MathUtils.clamp((py - 2.2) * 0.08, 0, 0.24));
    }));
  }
  return mergePieces(pieces);
}

function makeCanopyMaterial(leafMask) {
  const uniforms = {
    uTime: { value: 0 },
    uFoliageLightDirection: { value: new THREE.Vector3(0.35, 0.8, 0.45) },
    uLeafMask: { value: leafMask },
    uTrunkColor: { value: new THREE.Color(0x80533a) },
    uFoliageShadowColor: { value: new THREE.Color(0x35452f) },
    uFoliageLitColor: { value: new THREE.Color(0x58933d) },
    uFoliageHighlightColor: { value: new THREE.Color(0xc2cf62) },
  };
  const material = new THREE.MeshLambertMaterial({ alphaTest: 0.5, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `
      attribute float foliage;
      attribute vec3 canopyDirection;
      uniform float uTime;
      varying float vFoliage;
      varying vec3 vCanopyDirection;
      varying vec2 vLeafUv;
      ${shader.vertexShader}
    `
      .replace('#include <begin_vertex>', `
        #include <begin_vertex>
        vFoliage = foliage;
        vCanopyDirection = normalize(mat3(instanceMatrix) * canopyDirection);
        vLeafUv = uv;
        if (foliage > 0.5) {
          float sway = sin(uTime * 0.8 + instanceMatrix[3].x * 0.08 + instanceMatrix[3].z * 0.06
            + position.x * 0.7 + position.z * 0.5) * 0.018 * smoothstep(2.0, 6.0, position.y);
          transformed.x += sway;
          transformed.z += sway * 0.45;
        }
      `);
    shader.fragmentShader = `
      uniform sampler2D uLeafMask;
      uniform vec3 uFoliageLightDirection;
      uniform vec3 uTrunkColor;
      uniform vec3 uFoliageShadowColor;
      uniform vec3 uFoliageLitColor;
      uniform vec3 uFoliageHighlightColor;
      varying float vFoliage;
      varying vec3 vCanopyDirection;
      varying vec2 vLeafUv;
      ${shader.fragmentShader}
    `
      .replace('#include <alphatest_fragment>', `
        diffuseColor.a *= mix(1.0, texture2D(uLeafMask, vLeafUv).g, vFoliage);
        #include <alphatest_fragment>
      `)
      .replace('#include <color_fragment>', `
        #include <color_fragment>
        float lightFacing = dot(normalize(vCanopyDirection), normalize(uFoliageLightDirection));
        float litAmount = smoothstep(-1.0, 2.7, lightFacing);
        vec3 canopyColor = mix(uFoliageShadowColor, uFoliageLitColor, litAmount);
        float highlight = smoothstep(0.5, 1.8, lightFacing);
        canopyColor = mix(canopyColor, uFoliageHighlightColor, highlight);
        diffuseColor.rgb = mix(uTrunkColor, canopyColor, vFoliage);
      `)
      .replace('#include <normal_fragment_begin>', `
        #include <normal_fragment_begin>
        vec3 viewUp = normalize(mat3(viewMatrix) * vec3(0.0, 1.0, 0.0));
        normal = normalize(mix(normal, viewUp, vFoliage));
      `);
  };
  material.customProgramCacheKey = () => 'fluffy-canopy-v1';
  return { material, uniforms };
}

function makeLeafMaskDepthMaterial(leafMask) {
  const uniforms = { uLeafMask: { value: leafMask } };
  const material = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `
      attribute float foliage;
      varying float vFoliage;
      varying vec2 vLeafUv;
      ${shader.vertexShader}
    `
      .replace('#include <begin_vertex>', `
        #include <begin_vertex>
        vFoliage = foliage;
        vLeafUv = uv;
      `);
    shader.fragmentShader = `
      uniform sampler2D uLeafMask;
      varying float vFoliage;
      varying vec2 vLeafUv;
      ${shader.fragmentShader}
    `
      .replace('#include <alphatest_fragment>', `
        diffuseColor.a *= mix(1.0, texture2D(uLeafMask, vLeafUv).g, vFoliage);
        #include <alphatest_fragment>
      `);
  };
  material.customProgramCacheKey = () => 'fluffy-canopy-depth-v1';
  return material;
}

function roadSidePose(z, side, offset) {
  const frame = getRoadFrame(z);
  return {
    x: frame.x + side * offset * Math.cos(frame.heading),
    z: z - side * offset * Math.sin(frame.heading),
    heading: frame.heading,
  };
}

export async function createTrees(scene, physics, RAPIER) {
  let detailedTreeGeometry;
  let leafMask;
  let useDetailedAssets = true;
  try {
    ({ geometry: detailedTreeGeometry, leafMask } = await loadDetailedTreeAssets());
  } catch (error) {
    console.warn('Detailed tree assets unavailable; using procedural trees.', error);
    useDetailedAssets = false;
  }
  const treeMaterial = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradientMap });
  const canopy = useDetailedAssets ? makeCanopyMaterial(leafMask) : null;
  const detailedTrees = new THREE.InstancedMesh(
    useDetailedAssets ? detailedTreeGeometry : makeDistantTreeGeometry(),
    useDetailedAssets ? canopy.material : treeMaterial,
    TREE_DETAIL_SLOTS
  );
  if (useDetailedAssets) {
    detailedTrees.customDepthMaterial = makeLeafMaskDepthMaterial(leafMask);
    detailedTrees.customDistanceMaterial = makeLeafMaskDepthMaterial(leafMask);
  }
  const distantTrees = new THREE.InstancedMesh(
    makeDistantTreeGeometry(),
    treeMaterial,
    TREE_SLOTS * 2
  );
  detailedTrees.castShadow = true;
  detailedTrees.receiveShadow = true;
  distantTrees.castShadow = false;
  distantTrees.receiveShadow = false;
  for (const mesh of [detailedTrees, distantTrees]) {
    mesh.frustumCulled = false;
    scene.add(mesh);
  }

  const dummy = new THREE.Object3D();
  const dirtyMeshes = new Set();
  const treeKeys = new Int32Array(TREE_SLOTS * 2).fill(-2147483648);
  const treeLods = new Int8Array(TREE_SLOTS * 2).fill(-1);
  const colliders = new Map();
  let lastTreeCenter = Number.MIN_SAFE_INTEGER;
  let lastShuffle = 0;

  function setInstance(mesh, slot, x, y, z, heading, scale, heightScale = 1) {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, heading, 0);
    dummy.scale.set(scale, scale * heightScale, scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(slot, dummy.matrix);
    dirtyMeshes.add(mesh);
  }

  function hideInstance(mesh, slot) {
    setInstance(mesh, slot, 0, HIDDEN_Y, 0, 0, 0);
  }

  function treeData(k, side, salt = 0) {
    const hk = salt ? k + salt * 7919 : k;
    if (Math.floor(hash(hk, side + 1) * 12) === 0) return null;
    const cluster = Math.floor(hk / 4);
    if (hash(cluster, side + 17) < 0.26 || hash(hk, side + 23) < 0.12) return null;
    const z = (k + 0.5 + (hash(hk, side + 2) - 0.5) * 0.35) * TREE_SPACING;
    if (z > CITY_Z_MIN - 20 && z < GROUND_START_Z + 10) return null; // the city has its own scenery; the ramp, deck and hill arc are not z-indexed roads
    const offset = THREE.MathUtils.lerp(TREE_MIN_OFFSET, TREE_MAX_OFFSET, hash(hk, side + 3));
    const pose = roadSidePose(z, side, offset);
    return {
      z,
      pose,
      y: terrainHeight(pose.x, pose.z),
      scale: 0.85 + hash(hk, side + 5) * 0.45,
      heightScale: 0.9 + hash(hk, side + 6) * 0.35,
      heading: pose.heading + (hash(hk, side + 7) - 0.5) * 0.5,
    };
  }

  function writeTree(k, side, slot, detailSlot, detailed, salt = 0) {
    const data = treeData(k, side, salt);
    if (detailed) {
      hideInstance(distantTrees, slot);
      if (!data) {
        hideInstance(detailedTrees, detailSlot);
        return;
      }
      setInstance(detailedTrees, detailSlot, data.pose.x, data.y, data.pose.z, data.heading, data.scale, data.heightScale);
    } else {
      if (!data) {
        hideInstance(distantTrees, slot);
        return;
      }
      setInstance(distantTrees, slot, data.pose.x, data.y, data.pose.z, data.heading, data.scale, data.heightScale);
    }
  }

  function addTreeCollider(k, side) {
    const data = treeData(k, side);
    if (!data) return null;
    const body = physics.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(data.pose.x, data.y + 1.05, data.pose.z)
    );
    physics.createCollider(
      RAPIER.ColliderDesc.cylinder(1.05, 0.3).setFriction(0.55).setRestitution(0.05),
      body
    );
    return body;
  }

  function setLighting(time, direction) {
    if (!canopy) return;
    canopy.uniforms.uTime.value = time;
    canopy.uniforms.uFoliageLightDirection.value.copy(direction).normalize();
  }

  function update(vehicleZ, shuffle = 0) {
    const center = Math.floor(vehicleZ / TREE_SPACING);
    if (shuffle !== lastShuffle) {
      for (let n = -TREE_SLOTS / 2; n < TREE_SLOTS / 2; n++) for (const side of [-1, 1]) {
        const slot = ((n + TREE_SLOTS / 2) * 2) + (side < 0 ? 0 : 1);
        const detailSlot = ((n + TREE_DETAIL_RADIUS) * 2) + (side < 0 ? 0 : 1);
        const k = center + n;
        const behind = (k + 0.5) * TREE_SPACING < vehicleZ - 80;
        writeTree(k, side, slot, detailSlot, Math.abs(n) <= TREE_DETAIL_RADIUS, behind ? shuffle : 0);
        treeKeys[slot] = k * 2 + (side < 0 ? 0 : 1); treeLods[slot] = Math.abs(n) <= TREE_DETAIL_RADIUS ? 1 : 0;
      }
      lastShuffle = shuffle;
    }
    for (let n = -TREE_SLOTS / 2; n < TREE_SLOTS / 2; n++) {
      const k = center + n;
      for (const side of [-1, 1]) {
        const slot = ((n + TREE_SLOTS / 2) * 2) + (side < 0 ? 0 : 1);
        const detailSlot = ((n + TREE_DETAIL_RADIUS) * 2) + (side < 0 ? 0 : 1);
        const key = k * 2 + (side < 0 ? 0 : 1);
        const detailed = Math.abs(n) <= TREE_DETAIL_RADIUS;
        const lod = detailed ? 1 : 0;
        if (lastTreeCenter === center && treeKeys[slot] === key && treeLods[slot] === lod) continue;
        writeTree(k, side, slot, detailSlot, detailed);
        treeKeys[slot] = key;
        treeLods[slot] = lod;
      }
    }
    lastTreeCenter = center;

    for (const mesh of dirtyMeshes) mesh.instanceMatrix.needsUpdate = true;
    dirtyMeshes.clear();

    const min = center - Math.ceil(COLLISION_RANGE / TREE_SPACING);
    const max = center + Math.ceil(COLLISION_RANGE / TREE_SPACING);
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

  return { update, setLighting };
}
