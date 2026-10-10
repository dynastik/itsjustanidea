import './style.css';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

import { state, setMode, onModeChange } from './game/state.js';
import { createRenderer } from './game/render.js';
import { createLighting } from './game/lighting.js';
import { createWorld } from './game/world.js';
import { createProps } from './game/props.js';
import { createTrees } from './game/trees.js';
import { createCity } from './game/city.js';
import { createVehicle, FIXED_DT } from './game/vehicle.js';
import { createCameraRig } from './game/camera.js';
import { createCabInterior } from './game/cabin.js';
import { createAudio } from './game/audio.js';
import { createInput, createDriveInput, writeHighwayInput } from './game/input.js';
import { beginTypingSession, handleTypingKey, handleTypingBackspace, getTelemetry, getKeyLog, skipActDev } from './game/typing.js';
import { getStoryTime, getStoryMode, setStoryMode, getAct } from './game/story.js';
import { LONG_DAY_SECONDS, dayFactors } from './game/daycycle.js';
import { createSigns } from './game/signs.js';
import { HIGHWAY_ZONE_Z, ZONE_HYSTERESIS } from './game/zones.js';
import { createHud } from './ui/hud.js';
import { createEnding } from './ui/ending.js';
import * as director from './game/director.js';

const MAX_STEPS_PER_FRAME = 5;

async function main() {
  await RAPIER.init();
  const physics = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  physics.timestep = FIXED_DT;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);

  const gfx = createRenderer(scene, camera);
  const lighting = createLighting(scene);
  const world = createWorld(scene, physics, RAPIER);
  const props = createProps(scene, physics, RAPIER);
  const trees = await createTrees(scene, physics, RAPIER);
  const city = createCity(scene, physics, RAPIER);
  const signs = createSigns(scene);
  const vehicle = createVehicle(scene, physics, RAPIER);

  // Manual forward-facing headlights. They are attached to the van, and the player toggles them with F5.
  // Keep shadow casting off here: the two local spotlights should illuminate the road without doubling shadow cost.
  const headlights = [-0.34, 0.34].map((x) => {
    const light = new THREE.SpotLight(0xffe8c2, 42, 82, Math.PI / 7, 0.72, 1.2);
    light.position.set(x, 0.12, 1.05);
    light.castShadow = false;
    const target = new THREE.Object3D();
    target.position.set(x * 1.8, -0.7, 34);
    vehicle.visual.add(light, target);
    light.target = target;
    light.visible = false;
    return light;
  });
  function toggleHeadlights() {
    state.headlightsOn = !state.headlightsOn;
    headlights.forEach((light) => { light.visible = state.headlightsOn; });
  }

  // Cab interior rides on the van and is laid out from the model's size once the model has loaded
  // (and again after the ride height is measured).
  const cabin = createCabInterior(vehicle);
  vehicle.visual.add(cabin.root);
  cabin.root.visible = false; // shown only in cab view
  vehicle.onModelReady(() => cabin.layout(vehicle.getLocalBounds()));

  const rig = createCameraRig(camera, gfx.domElement, vehicle, cabin);
  const audio = createAudio();
  const hud = createHud();
  const ending = createEnding();
  const driveInput = createDriveInput();

  let accumulator = 0;
  let prevSpeed = 0;
  let lastStoryTarget = null;
  let storySignCount = 0;
  const treeLightDirection = new THREE.Vector3();

  // Spawn on the road, pointing along it.
  function spawn() {
    const f = world.getRoadFrame(0);
    vehicle.reset(f.y + vehicle.cfg.spawnHeight, f.heading);
    world.update(0, 0);
    props.update(0);
    props.showStorySign(-1);
    trees.update(0);
  }
  spawn();

  onModeChange((m) => {
    if (m !== 'highway') return;
    state.highwayEnteredAt = state.time;
    state.highwayEntrySpeed = Math.max(vehicle.speed, 0);
    beginTypingSession();
  });

  // Dev console: window.typingTelemetry.summary() / .log() / .logJson() for tuning pacing and the Phase 6 estimator.
  if (import.meta.env.DEV) {
    window.typingTelemetry = { summary: getTelemetry, log: getKeyLog, logJson: () => JSON.stringify(getKeyLog()) };
  }

  function advanceClock(frac) { let t=state.worldTime+frac; if(t>=1){state.dayIndex=(state.dayIndex||0)+Math.floor(t);t%=1;} state.worldTime=t; }

  // Full restart: back to the city on a bright morning with the story rewound. Also what the ending calls.
  function fullReset() {
    spawn();
    beginTypingSession({ restartStory: true });
    input.clearHeld();
    state.worldTime = 0;
    state.dayIndex = 0;
    state.headlightsOn = false;
    lastStoryTarget = null;
    storySignCount = 0;
    props.showStorySign(-1);
    headlights.forEach((light) => { light.visible = false; });
    state.zoneAuto = true;
    state.highwayEnteredAt = -Infinity;
    state.storyDone = false;
    prevSpeed = 0;
    director.reset();
    setMode('city');
  }

  const input = createInput({
    typeKey: handleTypingKey,
    typeBackspace: handleTypingBackspace,
    toggleCab: () => rig.toggleCab(),
    cycleLook: () => rig.cycleLook(),
    toggleMute: () => audio.toggleMute(),
    toggleHeadlights,
    togglePause: () => { state.paused = !state.paused; },
    toggleDebug: () => {
      state.debug = !state.debug;
      rig.setDebug(state.debug);
      vehicle.setDebugVisible(state.debug);
    },
    // Dev-only: Tab jumps between zones. Not registered in release builds (Vite sets DEV=false there).
    devSwitchMode: import.meta.env.DEV ? () => {
      state.zoneAuto = false; // otherwise the zone logic flips you straight back
      setMode(state.mode === 'city' ? 'highway' : 'city');
    } : undefined,
    setStoryMode: (mode) => { if (state.highwayEnteredAt !== -Infinity || getStoryMode() === mode) return; setStoryMode(mode); fullReset(); },
    skipTime: import.meta.env.DEV ? () => { if (getStoryMode() === 'short') skipActDev(); else advanceClock(0.125); } : undefined,
    reset: fullReset,
  });

  function updateZoneMode() {
    if (!state.zoneAuto) return;
    const z = vehicle.center.z;
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

    state.time += dt;
    if (getStoryMode() === 'short') { const target=getStoryTime(state.typing.buffer.length); state.worldTime+=(target-state.worldTime)*(1-Math.exp(-dt/3)); }
    else if(state.mode==='highway'&&!state.storyDone) advanceClock(dt/LONG_DAY_SECONDS);
    updateZoneMode();
    director.update(vehicle.center.z);
    if (state.storyDone && !ending.active) {
      state.loops++;
      ending.play(fullReset);
    }

    // keep terrain + props alive around the van BEFORE stepping physics, so there is always ground
    world.update(vehicle.center.x, vehicle.center.z);
    props.update(vehicle.center.z);
    // Reveal each overhead sign when its actual sign text becomes the active typing prompt.
    // Spawn it ahead of the van so the player can see it while typing, regardless of world distance.
    const storyTarget = state.typing.target;
    if (storyTarget !== lastStoryTarget) {
      if (storyTarget === 'WELCOME TO BELLWEATHER.') {
        props.showStorySign(Math.min(storySignCount, 1), world.getAheadPose(vehicle.center.x, vehicle.center.z, 70));
        storySignCount = Math.min(storySignCount + 1, 2);
      } else if (storyTarget === 'He checked the road behind him in the mirror. There had been no turn. No junction. No reason he could think of to have circled back.') {
        props.showStorySign(-1);
      }
      lastStoryTarget = storyTarget;
    }
    const act=getAct(), wrongWorld=act==='wrong'||act==='horror'||act==='finale';
    trees.update(vehicle.center.z,wrongWorld?1+Math.floor(state.time/12):0);
    signs.update(vehicle.center.z,act,dayFactors(state.worldTime).night);

    const surface = world.surfaceAt(vehicle.center.x, vehicle.center.z);
    if (state.mode === 'city') input.writeCity(driveInput, vehicle.speed);
    else writeHighwayInput(driveInput, vehicle, world);

    // fixed-timestep physics, render pose interpolated between steps
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      vehicle.step(FIXED_DT, driveInput, surface);
      physics.step();
      vehicle.capture();
      accumulator -= FIXED_DT;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) accumulator = 0; // don't spiral after a hitch
    vehicle.updateVisual(accumulator / FIXED_DT, dt);
    state.speed = vehicle.speed;
    cabin.update(dt, vehicle, driveInput);

    // impact detection: a big one-frame speed loss that wasn't braking
    if (dt > 0) {
      const drop = prevSpeed - vehicle.speed;
      if (prevSpeed > 4 && drop > 3) audio.bump(drop);
    }
    prevSpeed = vehicle.speed;

    audio.update(dt, {
      speed: vehicle.speed,
      throttle: driveInput.throttle,
      offRoad: surface.offRoad,
      paused: state.paused,
    });

    city.update(state.worldTime);
    lighting.update(state.worldTime, vehicle.center, rig.profile === 'toy' ? 0.16 : 1, state.time);
    trees.setLighting(state.time, lighting.getKeyLightDirection(treeLightDirection));
    rig.update(dt);
    hud.update();
    gfx.setLook({ tilt: rig.tilt, worldTime: state.worldTime, dt });
    gfx.adapt(dt);
    gfx.render();
  }
  animate();
}

// Show any startup/runtime error on screen so a white page is never a mystery again.
let fatalShown = false;
function showFatal(e) {
  console.error(e);
  if (fatalShown) return;
  fatalShown = true;
  const pre = document.createElement('pre');
  pre.style.cssText = 'position:fixed;inset:0;z-index:99;margin:0;padding:16px;background:#200;color:#faa;font:14px monospace;white-space:pre-wrap;overflow:auto';
  pre.textContent = 'ERROR:\n' + ((e && (e.stack || e.message)) || e);
  document.body.appendChild(pre);
}
window.addEventListener('error', (ev) => showFatal(ev.error || ev.message));
window.addEventListener('unhandledrejection', (ev) => showFatal(ev.reason));
main().catch(showFatal);