import * as THREE from 'three';

const CELL = 250;
const RADIUS = 3;
const BLOCKS_PER_CLOUD = 5;
const CLOUD_SLOTS = (RADIUS * 2 + 1) ** 2 * BLOCKS_PER_CLOUD;
const HEIGHT = 95;
const FADE_START = 500;
const FADE_END = 950;
const WIND = new THREE.Vector2(2.2, 1.1);

function hash(x, z, salt = 0) {
  const value = Math.sin(x * 127.1 + z * 311.7 + salt * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

export function createClouds(scene) {
  const uniforms = {
    uLit: { value: new THREE.Color(1, 1, 1) },
    uDark: { value: new THREE.Color(0.76, 0.83, 0.93) },
    uCenter: { value: new THREE.Vector2() },
    uFade: { value: new THREE.Vector2(FADE_START, FADE_END) },
  };
  const material = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    vertexColors: true,
    transparent: true,
    opacity: 1,
    depthWrite: true,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vCloudPosition;
        varying vec3 vCloudNormal;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 cloudWorld = vec4(transformed, 1.0);
        vec3 cloudNormal = objectNormal;
        #ifdef USE_INSTANCING
          cloudWorld = instanceMatrix * cloudWorld;
          cloudNormal = mat3(instanceMatrix) * cloudNormal;
        #endif
        cloudWorld = modelMatrix * cloudWorld;
        vCloudPosition = cloudWorld.xyz;
        vCloudNormal = normalize(mat3(modelMatrix) * cloudNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uLit;
        uniform vec3 uDark;
        uniform vec2 uCenter;
        uniform vec2 uFade;
        varying vec3 vCloudPosition;
        varying vec3 vCloudNormal;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float topLight = smoothstep(0.2, 0.9, vCloudNormal.y);
        diffuseColor.rgb *= mix(uDark, uLit, topLight);
        float cloudDistance = length(vCloudPosition.xz - uCenter);
        if (cloudDistance >= uFade.y) discard;
        diffuseColor.a *= 1.0 - smoothstep(uFade.x, uFade.y, cloudDistance);`);
  };
  material.customProgramCacheKey = () => 'voxel-clouds-v1';

  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, CLOUD_SLOTS);
  mesh.frustumCulled = false;
  mesh.renderOrder = 0;
  scene.add(mesh);

  const dummy = new THREE.Object3D();
  const white = new THREE.Color(1, 1, 1);
  function update(center, time, lit, dark, opacity) {
    const driftX = WIND.x * time;
    const driftZ = WIND.y * time;
    const cellX = Math.floor((center.x + driftX) / CELL);
    const cellZ = Math.floor((center.z + driftZ) / CELL);
    let slot = 0;

    for (let dz = -RADIUS; dz <= RADIUS; dz++) {
      for (let dx = -RADIUS; dx <= RADIUS; dx++) {
        const gx = cellX + dx;
        const gz = cellZ + dz;
        if (hash(gx, gz) < 0.76) continue;

        const cloudX = (gx + 0.5 + (hash(gx, gz, 1) - 0.5) * 0.56) * CELL - driftX;
        const cloudZ = (gz + 0.5 + (hash(gx, gz, 2) - 0.5) * 0.56) * CELL - driftZ;
        const width = 34 + hash(gx, gz, 3) * 34;
        const depth = 28 + hash(gx, gz, 4) * 32;
        const height = 12 + hash(gx, gz, 5) * 12;
        const y = center.y + HEIGHT + hash(gx, gz, 6) * 20;
        const blocks = [
          [0, 0, 0, width, height * 0.62, depth],
          [-width * 0.27, height * 0.42, 0, width * 0.46, height * 0.56, depth * 0.68],
          [width * 0.25, height * 0.35, -depth * 0.03, width * 0.5, height * 0.52, depth * 0.72],
          [-width * 0.04, height * 0.82, 0, width * 0.54, height * 0.52, depth * 0.61],
          [width * 0.3, height * 0.63, depth * 0.04, width * 0.34, height * 0.4, depth * 0.42],
        ];

        for (const [ox, oy, oz, sx, sy, sz] of blocks) {
          dummy.position.set(cloudX + ox - center.x, y + oy - center.y, cloudZ + oz - center.z);
          // Keep the game's chunky voxel-cloud silhouette; only the palette changes.
          dummy.scale.set(sx, sy, sz);
          dummy.updateMatrix();
          mesh.setMatrixAt(slot, dummy.matrix);
          mesh.setColorAt(slot, white);
          slot++;
        }
      }
    }

    mesh.count = slot;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    uniforms.uCenter.value.set(center.x, center.z);
    uniforms.uLit.value.copy(lit);
    uniforms.uDark.value.copy(dark);
    material.opacity = opacity;
  }

  return { update };
}
