// City zone: low-poly buildings, cross streets, parked cars and streetlights along the flat start
// of the road (z from CITY_Z_MIN to CITY_Z_MAX, see zones.js). Built ONCE from a seeded layout
// (cityLayout.js) and drawn as a handful of InstancedMeshes, so it costs a few draw calls.
// Buildings and parked cars have fixed colliders; windows are a world-space shader pattern, so
// they stay the right size whatever the building's scale, and glow at night.
import * as THREE from 'three';
import { ROAD_HALF_WIDTH, getRoadFrame } from './world.js';
import { toonGradientMap } from './toon.js';
import { generateCityLayout } from './cityLayout.js';

const BUILDING_COLORS = [0xe8b4a0, 0xf0d9a0, 0xa7c7d9, 0xc9d8a6, 0xd9b5d4, 0xf2c9a1, 0x9fb7c9, 0xe2e0d4].map((c) => new THREE.Color(c));
const CAR_COLORS = [0xd9534f, 0x4a90d9, 0xf0c040, 0x5fb878, 0xe8e8e8, 0x8a5fd0, 0x30343c].map((c) => new THREE.Color(c));
const FLAT_COLORS = {
  bay: new THREE.Color(0x3a3a40),
  street: new THREE.Color(0x3a3a40),
  walk: new THREE.Color(0xb9b6ae),
  zebra: new THREE.Color(0xf2f2f2),
};
const CABIN_COLOR = new THREE.Color(0x3d4a5c);
const POLE_COLOR = new THREE.Color(0x4b4f57);

const yawQuat = (h) => ({ x: 0, y: Math.sin(h / 2), z: 0, w: Math.cos(h / 2) });
const toon = (params = {}) => new THREE.MeshToonMaterial({ gradientMap: toonGradientMap, ...params });

export function createCity(scene, physics, RAPIER) {
  const L = generateCityLayout({ frameAt: getRoadFrame, roadHalf: ROAD_HALF_WIDTH });
  const nightUniform = { value: 0 };

  const dummy = new THREE.Object3D();
  dummy.rotation.order = 'YXZ'; // yaw first, then pitch along the road's grade

  function setBox(mesh, i, x, y, z, sx, sy, sz, heading = 0, pitch = 0, color = null) {
    dummy.position.set(x, y, z);
    dummy.rotation.set(-pitch, heading, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    if (color) mesh.setColorAt(i, color);
  }

  function instanced(geometry, material, count, { cast = false } = {}) {
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(count, 1));
    mesh.count = count;
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  }

  function finish(mesh) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  const unitBox = new THREE.BoxGeometry(1, 1, 1);

  // ---------- buildings (+ roofs) ----------
  const buildingMat = toon({ color: 0xffffff });
  buildingMat.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = nightUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWinPos;
        varying vec3 vWinNormal;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 winWorld = vec4(transformed, 1.0);
        vec3 winNormal = objectNormal;
        #ifdef USE_INSTANCING
          winWorld = instanceMatrix * winWorld;
          winNormal = mat3(instanceMatrix) * winNormal;
        #endif
        winWorld = modelMatrix * winWorld;
        vWinPos = winWorld.xyz;
        vWinNormal = normalize(mat3(modelMatrix) * winNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uNight;
        varying vec3 vWinPos;
        varying vec3 vWinNormal;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float winLit = 0.0;
        if (abs(vWinNormal.y) < 0.5) {
          float winU = abs(vWinNormal.x) > 0.5 ? vWinPos.z : vWinPos.x;
          vec2 winCell = vec2(winU / 3.0, vWinPos.y / 3.4);
          vec2 winF = fract(winCell);
          float winMask = step(0.22, winF.x) * step(winF.x, 0.78) * step(0.3, winF.y) * step(winF.y, 0.78);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.18, 0.28), winMask);
          winLit = winMask * step(0.4, fract(sin(dot(floor(winCell), vec2(12.9898, 78.233))) * 43758.5453));
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.78, 0.4) * winLit * uNight * 0.9;`);
  };
  buildingMat.customProgramCacheKey = () => 'city-windows-v1';

  const buildings = instanced(unitBox, buildingMat, L.buildings.length, { cast: true });
  const roofs = instanced(unitBox, toon({ color: 0xffffff }), L.buildings.length, { cast: true });
  const tmpColor = new THREE.Color();
  L.buildings.forEach((b, i) => {
    const color = BUILDING_COLORS[b.tone % BUILDING_COLORS.length];
    // sunk 0.5 m into the ground so the grade under the footprint never shows a gap
    setBox(buildings, i, b.x, b.y + b.h / 2 - 0.25, b.z, b.d, b.h + 0.5, b.w, b.heading, 0, color);
    setBox(roofs, i, b.x, b.y + b.h + 0.25, b.z, b.d + 0.5, 0.5, b.w + 0.5, b.heading, 0, tmpColor.copy(color).multiplyScalar(0.62));
    const body = physics.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(b.x, b.y + b.h / 2, b.z).setRotation(yawQuat(b.heading))
    );
    physics.createCollider(RAPIER.ColliderDesc.cuboid(b.d / 2, b.h / 2 + 1, b.w / 2).setFriction(0.4).setRestitution(0.05), body);
  });
  finish(buildings);
  finish(roofs);

  // ---------- parked cars ----------
  const carBodies = instanced(unitBox, toon({ color: 0xffffff }), L.cars.length, { cast: true });
  const carCabins = instanced(unitBox, toon({ color: 0xffffff }), L.cars.length, { cast: true });
  L.cars.forEach((c, i) => {
    const base = c.y + 0.035 + 0.25;
    setBox(carBodies, i, c.x, base + 0.4, c.z, 1.75, 0.8, 3.8, c.heading, 0, CAR_COLORS[c.tone % CAR_COLORS.length]);
    // cabin sits slightly toward the rear
    const cx = c.x - 0.15 * Math.sin(c.heading);
    const cz = c.z - 0.15 * Math.cos(c.heading);
    setBox(carCabins, i, cx, base + 0.8 + 0.275, cz, 1.5, 0.55, 2.0, c.heading, 0, CABIN_COLOR);
    const body = physics.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(c.x, base + 0.7, c.z).setRotation(yawQuat(c.heading))
    );
    physics.createCollider(RAPIER.ColliderDesc.cuboid(0.88, 0.7, 1.9).setFriction(0.4).setRestitution(0.1), body);
  });
  finish(carBodies);
  finish(carCabins);

  // ---------- streetlights ----------
  const POLE_H = 5.4;
  const poleGeo = new THREE.CylinderGeometry(0.07, 0.1, POLE_H, 6);
  poleGeo.translate(0, POLE_H / 2, 0);
  const poles = instanced(poleGeo, toon({ color: 0xffffff }), L.lamps.length, { cast: true });
  const lampMat = toon({ color: 0x3b3b3b, emissive: 0xffd58a, emissiveIntensity: 0.08 });
  const heads = instanced(new THREE.BoxGeometry(0.35, 0.14, 0.9), lampMat, L.lamps.length);
  L.lamps.forEach((l, i) => {
    dummy.position.set(l.x, l.y, l.z);
    dummy.rotation.set(0, l.heading, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
    poles.setColorAt(i, POLE_COLOR);
    // lamp head hangs over the road: 0.6 m toward the centre line from the pole
    const hx = l.x - l.side * 0.6 * Math.cos(l.heading);
    const hz = l.z + l.side * 0.6 * Math.sin(l.heading);
    dummy.position.set(hx, l.y + POLE_H, hz);
    dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
  });
  finish(poles);
  finish(heads);

  // ---------- paved strips, cross streets, zebra crossings ----------
  const flats = instanced(unitBox, toon({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), L.flats.length);
  L.flats.forEach((f, i) => setBox(flats, i, f.x, f.y, f.z, f.sx, f.sy, f.sz, f.heading, f.pitch, FLAT_COLORS[f.kind]));
  finish(flats);

  // worldTime 0 = morning, 1 = night (same clock as render.js / lighting.js)
  function update(worldTime) {
    nightUniform.value = THREE.MathUtils.smoothstep(worldTime, 0.5, 0.9);
    lampMat.emissiveIntensity = THREE.MathUtils.lerp(0.08, 2.0, THREE.MathUtils.smoothstep(worldTime, 0.4, 0.8));
  }

  return { update };
}
