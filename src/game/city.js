// City zone: low-poly buildings, cross streets, parked cars and streetlights along the flat start
// of the road (z from CITY_Z_MIN to CITY_Z_MAX, see zones.js). Built ONCE from a seeded layout
// (cityLayout.js) and drawn as a handful of InstancedMeshes, so it costs a few draw calls.
// Buildings and parked cars have fixed colliders; windows are a world-space shader pattern, so
// they stay the right size whatever the building's scale, and glow at night.
import * as THREE from 'three';
import { ROAD_HALF_WIDTH, getRoadFrame } from './world.js';
import { toonGradientMap } from './toon.js';
import { generateCityLayout } from './cityLayout.js';
import { dayFactors } from './daycycle.js';

const BUILDING_COLORS = [0xa6b5bc, 0xb8b8ae, 0x9baeb8, 0xc3b6a7, 0x91a1ad, 0xb9b1a6, 0xa5b3a4, 0xaaaeb7].map((c) => new THREE.Color(c));
const BUILDING_ACCENTS = [0x879da7, 0xa18e82, 0x788f9b, 0xb4a28c].map((c) => new THREE.Color(c));
const CAR_COLORS = [0x687985, 0x9d4e48, 0xc0b9a9, 0x495a69, 0x9a9a8a, 0x536b62, 0xd1d0c8].map((c) => new THREE.Color(c));
const FLAT_COLORS = {
  bay: new THREE.Color(0x3a3a40),
  street: new THREE.Color(0x3a3a40),
  walk: new THREE.Color(0xa7a69f),
  curb: new THREE.Color(0xd1cfc6),
  joint: new THREE.Color(0x92928d),
  zebra: new THREE.Color(0xf2f2f2),
};
const CABIN_COLOR = new THREE.Color(0x3d4a5c);
const POLE_COLOR = new THREE.Color(0x4b4f57);
const GLASS_COLOR = new THREE.Color(0x263b50);
const TIRE_COLOR = new THREE.Color(0x24272b);
const HUB_COLOR = new THREE.Color(0xb6b7b0);

const yawQuat = (h) => ({ x: 0, y: Math.sin(h / 2), z: 0, w: Math.cos(h / 2) });
const toon = (params = {}) => new THREE.MeshToonMaterial({ gradientMap: toonGradientMap, ...params });

function makeGableRoofGeometry() {
  const positions = [
    -0.5, 0, -0.5,  -0.5, 0, 0.5,  0, 0.42, 0.5,
    -0.5, 0, -0.5,  0, 0.42, 0.5,  0, 0.42, -0.5,
    0, 0.42, -0.5,  0, 0.42, 0.5,  0.5, 0, 0.5,
    0, 0.42, -0.5,  0.5, 0, 0.5,  0.5, 0, -0.5,
    -0.5, 0, -0.5,  0, 0.42, -0.5,  0.5, 0, -0.5,
    0.5, 0, 0.5,  0, 0.42, 0.5,  -0.5, 0, 0.5,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function makeCarBodyGeometry(style) {
  const profile = [
    [[-0.5, 0.39, 0.40, 0.78], [-0.34, 0.48, 0.68, 0.90], [0.30, 0.48, 0.68, 0.88], [0.5, 0.40, 0.42, 0.76]],
    [[-0.5, 0.42, 0.42, 0.82], [-0.38, 0.49, 0.7, 0.93], [0.35, 0.49, 0.7, 0.94], [0.5, 0.43, 0.48, 0.82]],
    [[-0.5, 0.42, 0.43, 0.83], [-0.36, 0.5, 0.72, 0.98], [0.33, 0.5, 0.72, 0.98], [0.5, 0.42, 0.48, 0.86]],
  ][style];
  const stations = [
    ...profile,
  ];
  const vertices = [];
  const indices = [];
  for (const [z, halfWidth, bottom, top] of stations) {
    vertices.push(-halfWidth, bottom - 0.5, z, halfWidth, bottom - 0.5, z);
    vertices.push(halfWidth, top - 0.5, z, -halfWidth, top - 0.5, z);
  }
  for (let station = 0; station < stations.length - 1; station++) {
    const a = station * 4, b = a + 4;
    for (let edge = 0; edge < 4; edge++) {
      const next = (edge + 1) % 4;
      indices.push(a + edge, a + next, b + next, a + edge, b + next, b + edge);
    }
  }
  indices.push(0, 1, 2, 0, 2, 3);
  const end = (stations.length - 1) * 4;
  indices.push(end, end + 2, end + 1, end, end + 3, end + 2);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makeCabinGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.5, 0, -0.5,  0.5, 0, -0.5,  0.39, 1, -0.24,  -0.39, 1, -0.24,
    -0.5, 0, -0.5, -0.39, 1, -0.24, -0.39, 1, 0.25, -0.5, 0, 0.5,
    0.5, 0, -0.5, 0.5, 0, 0.5, 0.39, 1, 0.25, 0.39, 1, -0.24,
    -0.5, 0, 0.5, -0.5, 0, -0.5, -0.39, 1, -0.24, -0.39, 1, 0.25,
    -0.39, 1, -0.24, 0.39, 1, -0.24, 0.39, 1, 0.25, -0.39, 1, 0.25,
    -0.5, 0, 0.5, 0.5, 0, 0.5, 0.39, 1, 0.25, -0.39, 1, 0.25,
  ], 3));
  geometry.setIndex([
    0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7,
    8, 9, 10, 8, 10, 11, 12, 13, 14, 12, 14, 15,
    16, 17, 18, 16, 18, 19, 20, 21, 22, 20, 22, 23,
  ]);
  geometry.computeVertexNormals();
  return geometry;
}

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

  function placeLocal(mesh, i, c, lx, y, lz, sx, sy, sz, color = null) {
    const cos = Math.cos(c.heading), sin = Math.sin(c.heading);
    setBox(mesh, i, c.x + lx * cos + lz * sin, y, c.z - lx * sin + lz * cos, sx, sy, sz, c.heading, 0, color);
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
          vec2 winCell = vec2(winU / 7.0, vWinPos.y / 5.2);
          vec2 winF = fract(winCell);
          float winMask = step(0.12, winF.x) * step(winF.x, 0.88) * step(0.12, winF.y) * step(winF.y, 0.86);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.075, 0.13, 0.21), winMask);
          winLit = winMask * step(0.4, fract(sin(dot(floor(winCell), vec2(12.9898, 78.233))) * 43758.5453));
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.78, 0.4) * winLit * uNight * 0.9;`);
  };
  buildingMat.customProgramCacheKey = () => 'city-windows-v1';

  const buildings = instanced(unitBox, buildingMat, L.buildings.length, { cast: true });
  const roofMat = toon({ color: 0xffffff });
  const flatRoofs = instanced(unitBox, roofMat, L.buildings.length, { cast: true });
  const parapetCaps = instanced(unitBox, roofMat, L.buildings.length, { cast: true });
  const parapets = instanced(unitBox, roofMat, L.buildings.length * 4, { cast: true });
  const steppedRoofs = instanced(unitBox, roofMat, L.buildings.length, { cast: true });
  const gableRoofs = instanced(makeGableRoofGeometry(), roofMat, L.buildings.length, { cast: true });
  const facadeBands = instanced(unitBox, toon({ color: 0xffffff }), L.buildings.length * 2);
  const tmpColor = new THREE.Color();
  const roofCounts = [0, 0, 0, 0];
  let parapetCount = 0, facadeBandCount = 0;
  L.buildings.forEach((b, i) => {
    const color = BUILDING_COLORS[b.tone % BUILDING_COLORS.length];
    // sunk 0.5 m into the ground so the grade under the footprint never shows a gap
    setBox(buildings, i, b.x, b.y + b.h / 2 - 0.25, b.z, b.d, b.h + 0.5, b.w, b.heading, 0, color);
    const roofColor = tmpColor.copy(color).multiplyScalar(0.62);
    const roofIndex = roofCounts[b.roof]++;
    if (b.roof === 0) {
      setBox(flatRoofs, roofIndex, b.x, b.y + b.h + 0.12, b.z, b.d + 0.25, 0.24, b.w + 0.25, b.heading, 0, roofColor);
    } else if (b.roof === 1) {
      setBox(parapetCaps, roofIndex, b.x, b.y + b.h + 0.08, b.z, b.d + 0.3, 0.16, b.w + 0.3, b.heading, 0, roofColor);
      const y = b.y + b.h + 0.27;
      const rim = 0.18;
      const xRim = b.d + 0.3, zRim = b.w + 0.3;
      const offsets = [
        [-xRim / 2, y, 0, rim, 0.28, zRim],
        [xRim / 2, y, 0, rim, 0.28, zRim],
        [0, y, -zRim / 2, xRim, 0.28, rim],
        [0, y, zRim / 2, xRim, 0.28, rim],
      ];
      for (const [lx, ry, lz, sx, sy, sz] of offsets) {
        placeLocal(parapets, parapetCount++, b, lx, ry, lz, sx, sy, sz, roofColor);
      }
    } else if (b.roof === 2) {
      setBox(steppedRoofs, roofIndex, b.x, b.y + b.h + 0.24, b.z, b.d * 0.76, 0.48, b.w * 0.76, b.heading, 0, roofColor);
    } else {
      setBox(gableRoofs, roofIndex, b.x, b.y + b.h, b.z, b.d + 0.2, Math.min(2.2, b.d * 0.12), b.w + 0.2, b.heading, 0, roofColor);
    }

    const frontX = -b.side * (b.d / 2 + 0.025);
    for (const zOffset of [-b.w * 0.37, b.w * 0.37]) {
      placeLocal(facadeBands, facadeBandCount++, b, frontX, b.y + b.h / 2 - 0.05, zOffset, 0.06, b.h - 0.1, 0.3,
        BUILDING_ACCENTS[(b.tone + (zOffset > 0 ? 1 : 0)) % BUILDING_ACCENTS.length]);
    }
    const body = physics.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(b.x, b.y + b.h / 2, b.z).setRotation(yawQuat(b.heading))
    );
    physics.createCollider(RAPIER.ColliderDesc.cuboid(b.d / 2, b.h / 2 + 1, b.w / 2).setFriction(0.4).setRestitution(0.05), body);
  });
  flatRoofs.count = roofCounts[0];
  parapetCaps.count = roofCounts[1];
  parapets.count = parapetCount;
  steppedRoofs.count = roofCounts[2];
  gableRoofs.count = roofCounts[3];
  facadeBands.count = facadeBandCount;
  for (const mesh of [buildings, flatRoofs, parapetCaps, parapets, steppedRoofs, gableRoofs, facadeBands]) finish(mesh);

  // ---------- parked cars ----------
  const carStyles = [
    { width: 1.65, length: 3.65, bodyHeight: 0.9, cabinWidth: 1.34, cabinHeight: 0.68, cabinLength: 1.9, wheelBase: 0.27 },
    { width: 1.72, length: 4.15, bodyHeight: 0.88, cabinWidth: 1.36, cabinHeight: 0.69, cabinLength: 1.9, wheelBase: 0.31 },
    { width: 1.82, length: 4.0, bodyHeight: 0.92, cabinWidth: 1.48, cabinHeight: 0.76, cabinLength: 2.0, wheelBase: 0.3 },
  ];
  const carsByStyle = carStyles.map((_, style) => L.cars.filter((car) => car.style === style));
  const carBodies = carStyles.map((_, style) =>
    instanced(makeCarBodyGeometry(style), toon({ color: 0xffffff }), carsByStyle[style].length, { cast: true })
  );
  const cabinGeometry = makeCabinGeometry();
  const carCabins = instanced(cabinGeometry, toon({ color: 0xffffff }), L.cars.length, { cast: true });
  const carRoofs = instanced(unitBox, toon({ color: 0xffffff }), L.cars.length, { cast: true });
  const wheelGeometry = new THREE.CylinderGeometry(0.24, 0.24, 0.15, 8).rotateZ(Math.PI / 2);
  const wheelHubsGeometry = new THREE.CylinderGeometry(0.12, 0.12, 0.16, 8).rotateZ(Math.PI / 2);
  const carWheels = instanced(wheelGeometry, toon({ color: TIRE_COLOR }), L.cars.length * 4);
  const wheelHubs = instanced(wheelHubsGeometry, toon({ color: HUB_COLOR }), L.cars.length * 4);
  const bumpers = instanced(unitBox, toon({ color: 0x44484b }), L.cars.length * 2);
  const headlights = instanced(unitBox, toon({ color: 0xe9d9ad, emissive: 0x44351d, emissiveIntensity: 0.15 }), L.cars.length * 2);
  const taillights = instanced(unitBox, toon({ color: 0x9f4741, emissive: 0x32110e, emissiveIntensity: 0.12 }), L.cars.length * 2);
  const mirrors = instanced(unitBox, toon({ color: 0x4e5961 }), L.cars.length * 2);

  const styleCursors = [0, 0, 0];
  L.cars.forEach((c, i) => {
    const shape = carStyles[c.style];
    const base = c.y + 0.035;
    const carColor = CAR_COLORS[c.tone % CAR_COLORS.length];
    const bodySlot = styleCursors[c.style]++;
    setBox(carBodies[c.style], bodySlot, c.x, base + 0.57, c.z, shape.width, shape.bodyHeight, shape.length, c.heading, 0, carColor);

    const cabinX = -0.04, cabinZ = -0.035;
    dummy.position.set(
      c.x + cabinX * Math.cos(c.heading) + cabinZ * Math.sin(c.heading),
      base + 0.6,
      c.z - cabinX * Math.sin(c.heading) + cabinZ * Math.cos(c.heading)
    );
    dummy.rotation.set(0, c.heading, 0);
    dummy.scale.set(shape.cabinWidth, shape.cabinHeight, shape.cabinLength);
    dummy.updateMatrix();
    carCabins.setMatrixAt(i, dummy.matrix);
    carCabins.setColorAt(i, GLASS_COLOR);
    setBox(carRoofs, i, c.x + cabinX * Math.cos(c.heading) + cabinZ * Math.sin(c.heading),
      base + 0.6 + shape.cabinHeight + 0.025,
      c.z - cabinX * Math.sin(c.heading) + cabinZ * Math.cos(c.heading),
      shape.cabinWidth * 0.78, 0.07, shape.cabinLength * 0.5, c.heading, 0, carColor);

    for (const axle of [-1, 1]) {
      const z = axle * shape.length * shape.wheelBase;
      for (const side of [-1, 1]) {
        const slot = i * 4 + (axle < 0 ? 0 : 2) + (side < 0 ? 0 : 1);
        const x = side * (shape.width * 0.47);
        placeLocal(carWheels, slot, c, x, base + 0.24, z, 1, 1, 1);
        placeLocal(wheelHubs, slot, c, x + side * 0.012, base + 0.24, z, 1, 1, 1);
      }
    }
    for (const axle of [-1, 1]) {
      const sign = axle > 0 ? 1 : -1;
      const z = sign * (shape.length * 0.48);
      placeLocal(bumpers, i * 2 + (sign > 0 ? 0 : 1), c, 0, base + 0.36, z, shape.width * 0.86, 0.13, 0.12);
      for (const side of [-1, 1]) {
        const index = i * 2 + (side < 0 ? 0 : 1);
        placeLocal(sign > 0 ? headlights : taillights, index, c, side * shape.width * 0.31, base + 0.59, sign * (shape.length * 0.49), 0.17, 0.11, 0.055);
      }
    }
    for (const side of [-1, 1]) {
      placeLocal(mirrors, i * 2 + (side < 0 ? 0 : 1), c, side * (shape.width * 0.52), base + 0.81, 0.1, 0.16, 0.1, 0.2);
    }

    const body = physics.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(c.x, base + 0.56, c.z).setRotation(yawQuat(c.heading))
    );
    physics.createCollider(RAPIER.ColliderDesc.cuboid(shape.width / 2, 0.56, shape.length / 2).setFriction(0.4).setRestitution(0.1), body);
  });
  carBodies.forEach((mesh, style) => { mesh.count = carsByStyle[style].length; });
  for (const mesh of [...carBodies, carCabins, carRoofs, carWheels, wheelHubs, bumpers, headlights, taillights, mirrors]) finish(mesh);

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

  // worldTime is the looping day clock shared with render.js / lighting.js (see daycycle.js)
  function update(worldTime) {
    const { night, lamp } = dayFactors(worldTime);
    nightUniform.value = night;
    lampMat.emissiveIntensity = THREE.MathUtils.lerp(0.08, 2.0, lamp);
  }

  return { update };
}
