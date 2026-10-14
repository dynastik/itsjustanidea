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
import { createInput, createDriveInput } from './game/input.js';
import { beginTypingSession, handleTypingKey, handleTypingBackspace, getTelemetry, getKeyLog, skipActDev } from './game/typing.js';
import { cycleDifficulty } from './game/difficulty.js';
import { createHeadlights } from './game/headlights.js';
import { createStops } from './game/stops.js';
import { createSheet } from './ui/sheet.js';
import { getStoryTime, getStoryMode, setStoryMode, getAct, getLongClock } from './game/story.js';
import { dayFactors } from './game/daycycle.js';
import { createLot } from './game/lot.js';
import { createRoute } from './game/route.js';
import { createReturnScenery } from './game/returnScenery.js';
import { createSigns } from './game/signs.js';
import { HIGHWAY_ZONE_Z, ZONE_HYSTERESIS } from './game/zones.js';
import { createHud } from './ui/hud.js';
import { createEnding } from './ui/ending.js';
import { createMenu } from './ui/menu.js';
import { createPerf } from './ui/perf.js';
import { createTouchControls } from './ui/touchControls.js';
import * as director from './game/director.js';

const MAX_STEPS_PER_FRAME = 5;
const SIGN_TEXT = 'WELCOME TO BELLWEATHER.';
const SIGN_LINGER_PROMPTS = 3; // the second gantry stays up for this many prompts after its text, then goes
// How loud the horror drone is per act (audio.setMood).
const ACT_MOOD = { calm: 0, uneasy: 0.1, wrong: 0.45, horror: 1, finale: 0.25 };

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
  const trees = await createTrees(scene, physics, RAPIER, world.layout);
  const city = createCity(scene, physics, RAPIER);
  const lot = createLot(scene, physics, RAPIER);
  if (world.layout.returnRoad) createReturnScenery(scene, world.layout.returnRoad);
  const signs = createSigns(scene);
  const vehicle = createVehicle(scene, physics, RAPIER);

  // Manual headlights with smooth fades and authored story flickers.
  const headlights = createHeadlights(vehicle);

  // Cab interior rides on the van and is laid out from the model's size once the model has loaded
  // (and again after the ride height is measured).
  const cabin = createCabInterior(vehicle);
  vehicle.visual.add(cabin.root);
  cabin.root.visible = false;
  vehicle.onModelReady(() => cabin.layout(vehicle.getLocalBounds()));

  const rig = createCameraRig(camera, gfx.domElement, vehicle, cabin);
  const audio = createAudio();
  const hud = createHud();
  const ending = createEnding();
  const stops = createStops(scene, world.getRoadFrame);
  const sheet = createSheet();
  const perf = createPerf(gfx.info);
  const driveInput = createDriveInput();

  const route = createRoute({ world, vehicle, stops, placeVan });
  // The highway is a loop (ramp, deck, hill arc, ground road, return road, west stub): the lane-follower tracks that whole path.
  const ringRoad = { drivePath: world.ringPath || world.drivePath, groundStartZ: world.ringPath ? Infinity : world.groundStartZ, getRoadFrame: world.getRoadFrame };
  let accumulator = 0;
  let clockTotal = getStoryMode() === 'long' ? getLongClock(0) : 0; // long mode: continuous day clock, 1.0 = one day
  const CLOCK_SLEW = 0.1; // max clock speed (days per second) when the story jumps ahead between legs
  let prevSpeed = 0;
  let lastStoryTarget = null;
  let storySignCount = 0;
  let promptsSinceSign = 0;
  const treeLightDirection = new THREE.Vector3();

  // Teleport the van and re-centre everything that is streamed around it (terrain, props, trees).
  function placeVan(x, y, z, heading, speed = 0) {
    vehicle.reset(y, heading, x, z, speed);
    world.update(x, z, true);
    props.update(z);
    props.showStorySign(-1);
    trees.update(z, 0, x);
  }

  // Every run starts in a bay of the depot lot.
  function spawn() {
    const s = lot.spawn;
    placeVan(s.x, s.y + vehicle.cfg.spawnHeight, s.z, s.heading);
  }
  spawn();

  onModeChange((m) => {
    if (m !== 'highway') return;
    state.highwayEnteredAt = state.time;
    state.highwayEntrySpeed = Math.max(vehicle.speed, 0);
    beginTypingSession();
  });

  if (import.meta.env.DEV) {
    window.typingTelemetry = { summary: getTelemetry, log: getKeyLog, logJson: () => JSON.stringify(getKeyLog()) };
  }

  function fullReset() {
    spawn();
    beginTypingSession({ restartStory: true });
    input.clearHeld();
    clockTotal = getStoryMode() === 'long' ? getLongClock(0) : 0;
    state.dayIndex = Math.floor(clockTotal);
    state.worldTime = clockTotal - state.dayIndex;
    headlights.reset();
    route.reset();
    lastStoryTarget = null;
    storySignCount = 0;
    promptsSinceSign = 0;
    props.showStorySign(-1);
    state.highwayEnteredAt = -Infinity;
    state.storyDone = false;
    prevSpeed = 0;
    director.reset();
    setMode('city');
  }

  // Menu first: it registers its key handler before the game's, so it owns the keyboard while open.
  // It opens immediately and pauses the game until "Start driving" (that click also unlocks audio).
  const menu = createMenu({
    onStoryMode: (mode) => { if (getStoryMode() === mode) return; setStoryMode(mode); fullReset(); },
    onVolume: (v) => audio.setVolume(v),
    onMute: (m) => audio.setMuted(m),
    getMuted: () => audio.getMuted(),
  });

  const input = createInput({
    typeKey: handleTypingKey,
    typeBackspace: handleTypingBackspace,
    toggleCab: () => rig.toggleCab(),
    cycleLook: () => rig.cycleLook(),
    toggleMute: () => audio.toggleMute(),
    smartShift: () => vehicle.smartShift(),
    shiftUp: () => vehicle.shiftUp(),
    shiftDown: () => vehicle.shiftDown(),
    toggleAutoShift: () => vehicle.toggleAutoShift(),
    toggleHeadlights: () => headlights.toggle(),
    cycleDifficulty,
    togglePause: () => { state.paused = !state.paused; },
    toggleDebug: () => {
      state.debug = !state.debug;
      rig.setDebug(state.debug);
      vehicle.setDebugVisible(state.debug);
    },
    devSwitchMode: import.meta.env.DEV ? () => {
      state.zoneAuto = false;
      setMode(state.mode === 'city' ? 'highway' : 'city');
    } : undefined,
    setStoryMode: (mode) => { if (state.highwayEnteredAt !== -Infinity || getStoryMode() === mode) return; setStoryMode(mode); fullReset(); },
    skipTime: import.meta.env.DEV ? () => skipActDev() : undefined,
    reset: fullReset,
  });
  const touchControls = createTouchControls(input, {
    typeKey: handleTypingKey,
    typeBackspace: handleTypingBackspace,
    openMenu: () => menu.open(),
    setTouchAutoShift: (enabled) => vehicle.setTouchAutoShift(enabled),
    setTouchReverse: (enabled) => vehicle.setTouchReverse(enabled),
    canChangeTouchDirection: () => vehicle.canChangeTouchDirection(),
    isTouchReverse: () => vehicle.transmission.gear === 'R',
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
    if (state.paused) dt = 0;

    state.time += dt;
    if (getStoryMode() === 'short') { const target=getStoryTime(state.typing.buffer.length); state.worldTime+=(target-state.worldTime)*(1-Math.exp(-dt/3)); }
    else {
      // long mode: the day clock follows typing progress inside the current leg; between legs it sweeps on to the next leg's start
      const target = getLongClock(state.typing.buffer.length);
      const step = THREE.MathUtils.clamp((target - clockTotal) * (1 - Math.exp(-dt / 3)), -CLOCK_SLEW * dt, CLOCK_SLEW * dt);
      clockTotal += step;
      state.dayIndex = Math.floor(clockTotal);
      state.worldTime = clockTotal - state.dayIndex;
    }
    updateZoneMode();
    route.update(dt);
    touchControls.update();
    director.update(vehicle.center.z);
    if (state.storyDone && !ending.active) {
      state.loops++;
      ending.play(fullReset);
    }

    world.update(vehicle.center.x, vehicle.center.z);
    props.update(vehicle.center.z);
    // Reveal each overhead sign when its actual sign text becomes the active typing prompt. The second one is taken
    // down a few prompts later (the old exact-paragraph match never fired, so it stayed up for the whole run).
    const storyTarget = state.typing.target;
    if (storyTarget !== lastStoryTarget) {
      if (storyTarget === SIGN_TEXT) {
        props.showStorySign(Math.min(storySignCount, 1), world.getAheadPose(vehicle.center.x, vehicle.center.z, 70));
        storySignCount = Math.min(storySignCount + 1, 2);
        promptsSinceSign = 0;
      } else if (storySignCount >= 2 && ++promptsSinceSign >= SIGN_LINGER_PROMPTS) {
        props.showStorySign(-1);
        storySignCount = 3; // stop checking until the next reset
      }
      if (storyTarget && state.typing.source === 'message') audio.sting();
      director.cueHeadlights(storyTarget, state.time, state.headlightsOn);
      lastStoryTarget = storyTarget;
    }
    const act=getAct(), wrongWorld=act==='wrong'||act==='horror'||act==='finale';
    trees.update(vehicle.center.z,wrongWorld?1+Math.floor(state.time/12):0,vehicle.center.x);
    signs.update(vehicle.center.z,act,dayFactors(state.worldTime).night);

    const surface = world.surfaceAt(vehicle.center.x, vehicle.center.z);
    if (route.controlling) route.drive(driveInput, () => input.writeHighway(driveInput, vehicle, ringRoad));
    else if (state.mode === 'city') input.writeCity(driveInput, vehicle.speed);
    else input.writeHighway(driveInput, vehicle, ringRoad);

    // Highway story progression is typing-driven again: prompts only advance when completed.
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      vehicle.step(FIXED_DT, driveInput, surface);
      physics.step();
      vehicle.capture();
      accumulator -= FIXED_DT;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) accumulator = 0;
    vehicle.updateVisual(accumulator / FIXED_DT, dt);
    state.speed = vehicle.speed;
    state.transmission = vehicle.transmission;
    cabin.update(dt, vehicle, driveInput);
    stops.update(dt, vehicle.center, vehicle.speed, state.mode === 'city');

    if (dt > 0) {
      const drop = prevSpeed - vehicle.speed;
      if (prevSpeed > 4 && drop > 3) audio.bump(drop);
    }
    prevSpeed = vehicle.speed;

    audio.setMood(ACT_MOOD[act] ?? 0);
    audio.update(dt, {
      speed: vehicle.speed,
      throttle: driveInput.throttle,
      offRoad: surface.offRoad,
      paused: state.paused,
      ...vehicle.transmission,
    });

    city.update(state.worldTime);
    lot.update(state.worldTime);
    lighting.update(state.worldTime, vehicle.center, rig.profile === 'toy' ? 0.16 : 1, state.time);
    trees.setLighting(state.time, lighting.getKeyLightDirection(treeLightDirection));
    headlights.update(dt, state.time);
    rig.update(dt);
    hud.update();
    sheet.update();
    perf.update(dt);
    gfx.setLook({ tilt: rig.tilt, worldTime: state.worldTime, dt });
    gfx.adapt(dt);
    gfx.render();
  }
  animate();
  document.getElementById('loading')?.remove();
}

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
