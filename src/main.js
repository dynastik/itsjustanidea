import './style.css';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

import { state, setMode, onModeChange } from './game/state.js';
import { createRenderer } from './game/render.js';
import { createLighting } from './game/lighting.js';
import { createWorld } from './game/world.js';
import { createVehicle } from './game/vehicle.js';
import { createCameraRig } from './game/camera.js';
import { createInput, createDriveInput, writeHighwayInput } from './game/input.js';
import { pickNewWord, handleTypingKey, resetTyping } from './game/typing.js';
import { createHud } from './ui/hud.js';

const DAY_LENGTH_SECONDS = 180; // wall-clock for testing. TODO Phase 5: distance/story driven

// Placeholder zone switch. TODO Phase 2: on-ramp trigger volume.
const HIGHWAY_ZONE_Z = 80;
const ZONE_HYSTERESIS = 10;

async function main() {
  await RAPIER.init();
  const physics = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);

  const gfx = createRenderer(scene, camera);
  const lighting = createLighting(scene);
  const world = createWorld(scene, physics, RAPIER);
  const vehicle = createVehicle(scene, physics, RAPIER);
  const rig = createCameraRig(camera, gfx.domElement, vehicle);
  const hud = createHud();
  const driveInput = createDriveInput();

  onModeChange((m) => { if (m === 'highway') pickNewWord(); });

  const input = createInput({
    typeKey: handleTypingKey,
    toggleCab: () => rig.toggleCab(),
    togglePause: () => { state.paused = !state.paused; },
    toggleDebug: () => {
      state.debug = !state.debug;
      rig.setDebug(state.debug);
      vehicle.setDebugVisible(state.debug);
    },
    devSwitchMode: () => {
      state.zoneAuto = false; // otherwise the zone logic flips you straight back
      setMode(state.mode === 'city' ? 'highway' : 'city');
    },
    reset: () => {
      vehicle.reset();
      resetTyping();
      input.clearHeld();
      state.worldTime = 0;
      state.zoneAuto = true;
      setMode('city');
    },
  });

  function updateZoneMode() {
    if (!state.zoneAuto) return;
    const z = vehicle.rearAxle.z;
    if (state.mode === 'city' && z > HIGHWAY_ZONE_Z + ZONE_HYSTERESIS) setMode('highway');
    else if (state.mode === 'highway' && z < HIGHWAY_ZONE_Z - ZONE_HYSTERESIS) setMode('city');
  }

  let last = performance.now();
  function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    let dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (state.paused) dt = 0; // everything below is dt-driven, so this freezes the sim

    state.worldTime = Math.min(state.worldTime + dt / DAY_LENGTH_SECONDS, 1);
    updateZoneMode();

    if (state.mode === 'city') input.writeCity(driveInput, vehicle.speed);
    else writeHighwayInput(driveInput, vehicle);

    vehicle.update(dt, driveInput);
    physics.step();
    state.speed = vehicle.speed;

    world.update(vehicle.center.x, vehicle.center.z);
    lighting.update(state.worldTime, vehicle.center);
    rig.update(dt);
    hud.update();
    gfx.render();
  }
  animate();
}

main();
