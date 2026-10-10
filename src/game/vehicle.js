import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { state } from './state.js';
import { toToonMaterial } from './toon.js';

export const FIXED_DT = 1 / 60;

// Every model/vehicle-specific number lives here. Swapping the van = editing this object.
export const VEHICLE_CONFIG = {
  modelUrl: `${import.meta.env.BASE_URL}models/truck.glb`,
  // The model is auto-fitted so its lowest point touches the ground. This is a manual nudge on top
  // of that, in metres (+ = raise). Tune live in debug mode with PageUp / PageDown.
  modelYTrim: 0,
  spawnHeight: 1.0,
  wheelbase: 1.8,
  trackWidth: 1.2,
  colliderHalfExtents: { x: 0.6, y: 0.6, z: 1.2 },
  wheelAnimSpeedScale: 0.6,
  wheelVisualSteer: 0.6,  // how far the front wheels VISUALLY turn, as a fraction of the real steering angle (0.55 rad looked like too much)
  cabEyeTrim: { x: 0, y: 0, z: 0 },             // nudge on top of the auto-placed driver's eye (cab view tuner in camera.js)
  mirrorOffset: { x: 0, y: 1.2, z: 0.7 },       // PLACEHOLDER: rear-view mirror (Phase 5)
  body: {
    mass: 1200,
    comOffsetY: -0.35,
    linearDamping: 0.002,
    angularDamping: 0.8,
  },
  suspension: {
    restLength: 0.35,
    wheelRadius: 0.3,
    connectionY: -0.44,
    stiffness: 28,
    compression: 4.5,
    relaxation: 3.5,
    maxTravel: 0.3,
    maxForce: 60000,
  },
  tires: {
    frictionSlipFront: 9,
    frictionSlipRear: 8,
    sideFrictionStiffness: 1.0,
  },
  handling: {
    engineForce: 16000,
    brakeForce: 22000,
    reverseForce: 7000,
    coastForce: 0,
    maxSpeed: 30,
    reverseMaxSpeed: 3,
    maxSteerAngle: 0.55,
    steerFalloffSpeed: 20,
    steerLerpSpeed: 5,
    offRoad: { gripFactor: 0.55, speedFactor: 1.0, dragForce: 0 },
    engineSign: 1,
    steerSign: 1,
    autoCalibrate: true,
  },
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function createVehicle(scene, physics, RAPIER) {
  const cfg = VEHICLE_CONFIG;
  const h = cfg.handling;
  const s = cfg.suspension;
  const tr = cfg.tires;
  const b = cfg.body;

  // ---------- visuals ----------
  const visual = new THREE.Group();
  scene.add(visual);
  const exterior = new THREE.Group(); // hidden in cab view so nothing clips
  visual.add(exterior);

  let mixer = null;
  let wheelAction = null;
  let modelRoot = null;
  const steerPivots = []; // { pivot, axis } for each front wheel
  // Model bounds in the model's own space (default = the collider box until the model loads).
  const rawBox = new THREE.Box3(new THREE.Vector3(-0.6, -1.0, -1.2), new THREE.Vector3(0.6, 0.6, 1.2));
  const readyCallbacks = [];
  let ready = false;
  const fireReady = () => { for (const cb of readyCallbacks) cb(); };
  const eyeVec = new THREE.Vector3();

  // Where the chassis centre sits above the ground at rest. Starts as a formula, then gets
  // replaced by a real measurement once the van has settled (see measureRide).
  const fit = {
    rideHeight: s.wheelRadius + s.restLength - 9.81 / (4 * s.stiffness) - s.connectionY,
    modelMinY: 0,
    measured: false,
  };

  function applyModelOffset() {
    if (!modelRoot) return;
    modelRoot.position.y = -fit.rideHeight - fit.modelMinY + cfg.modelYTrim;
  }

  // Measure the model's lowest point (in its own space) so it can be dropped onto the ground.
  function measureModel() {
    const sp = visual.position.clone();
    const sq = visual.quaternion.clone();
    visual.position.set(0, 0, 0);
    visual.quaternion.identity();
    modelRoot.position.set(0, 0, 0);
    visual.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(modelRoot);
    visual.position.copy(sp);
    visual.quaternion.copy(sq);
    fit.modelMinY = box.min.y;
    rawBox.copy(box);
    const size = box.getSize(new THREE.Vector3());
    console.info(
      `[vehicle] model size ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)} (w x h x l), lowest point y=${box.min.y.toFixed(2)}`
    );
    applyModelOffset();
  }

  // Front wheels can't be steered by rotating the wheel node itself: the wheel-spin animation
  // overwrites its rotation every frame. So each front wheel gets a pivot parent that only
  // carries the steering yaw. Wheel nodes are found from the animation tracks (whatever the
  // nodes are called), then split front/rear by where they sit along the van.
  function setupSteering(model, clips) {
    const spinNames = new Set();
    const movedNames = new Set();
    for (const clip of clips) {
      for (const track of clip.tracks) {
        const dot = track.name.indexOf('.');
        if (dot < 0) continue;
        const node = track.name.slice(0, dot);
        const prop = track.name.slice(dot + 1);
        if (prop === 'quaternion' || prop.startsWith('rotation')) spinNames.add(node);
        else if (prop === 'position') movedNames.add(node);
      }
    }

    let nodes = [...spinNames].map((n) => model.getObjectByName(n)).filter(Boolean);
    if (nodes.length < 2) { // fallback: guess from names
      nodes = [];
      const re = /wheel|tyre|tire/i;
      model.traverse((o) => {
        if (!re.test(o.name)) return;
        for (let p = o.parent; p; p = p.parent) if (re.test(p.name)) return; // skip nested parts
        nodes.push(o);
      });
    }
    if (nodes.length < 2) {
      console.warn('[vehicle] could not find wheel nodes; front wheels will not steer. See the node list above.');
      return;
    }

    model.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
    const items = nodes.map((n) => {
      const c = new THREE.Box3().setFromObject(n).getCenter(new THREE.Vector3()).applyMatrix4(inv);
      return { n, z: c.z };
    });
    const zs = items.map((i) => i.z);
    const zMax = Math.max(...zs);
    const zMin = Math.min(...zs);
    if (zMax - zMin < 0.2) {
      console.warn('[vehicle] wheel nodes all sit at the same z; cannot tell front from rear.');
      return;
    }
    const mid = (zMax + zMin) / 2;
    const mqInv = model.getWorldQuaternion(new THREE.Quaternion()).invert();

    for (const { n, z } of items) {
      if (z <= mid) continue; // rear wheel
      if (movedNames.has(n.name)) {
        console.warn('[vehicle] wheel node is position-animated, not steering it:', n.name);
        continue;
      }
      const parent = n.parent;
      const pivot = new THREE.Group();
      pivot.name = `${n.name}_steer`;
      pivot.position.copy(n.position);
      parent.add(pivot);
      pivot.add(n);
      n.position.set(0, 0, 0);

      // "up" expressed in the parent's local space, so steering is a yaw even if the model is rotated
      const pq = parent.getWorldQuaternion(new THREE.Quaternion()).premultiply(mqInv);
      const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(pq.invert());
      steerPivots.push({ pivot, axis });
    }
    console.info(`[vehicle] steering ${steerPivots.length} front wheel(s) of ${items.length} found`);
  }

  new GLTFLoader().load(
    cfg.modelUrl,
    (gltf) => {
      const model = gltf.scene;
      model.traverse((c) => {
        if (!c.isMesh) return;
        c.castShadow = true;
        c.receiveShadow = true;
        c.material = Array.isArray(c.material)
          ? c.material.map(toToonMaterial)
          : toToonMaterial(c.material);
      });
      exterior.add(model);
      modelRoot = model;

      const names = [];
      model.traverse((o) => { if (o.name) names.push(o.name); });
      console.info('[vehicle] model nodes:', names.join(', '));

      setupSteering(model, gltf.animations || []);
      measureModel();
      ready = true;
      fireReady();

      if (gltf.animations && gltf.animations.length > 0) {
        mixer = new THREE.AnimationMixer(model);
        wheelAction = mixer.clipAction(gltf.animations[0]);
        wheelAction.play();
        wheelAction.timeScale = 0;
      } else {
        console.warn('No animations on vehicle model: wheels stay static.');
      }
    },
    undefined,
    (err) => {
      console.error('Failed to load vehicle model:', err);
      exterior.add(new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 2),
        new THREE.MeshStandardMaterial({ color: 0xff0000 })
      ));
    }
  );

  // ---------- chassis (dynamic body) ----------
  const half = cfg.colliderHalfExtents;
  const bw = half.x * 2, bh = half.y * 2, bd = half.z * 2;
  const inertia = {
    x: (b.mass / 12) * (bh * bh + bd * bd),
    y: (b.mass / 12) * (bw * bw + bd * bd),
    z: (b.mass / 12) * (bw * bw + bh * bh),
  };
  const body = physics.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, cfg.spawnHeight, 0)
      .setLinearDamping(b.linearDamping)
      .setAngularDamping(b.angularDamping)
      .setCanSleep(false)
      .setAdditionalMassProperties(b.mass, { x: 0, y: b.comOffsetY, z: 0 }, inertia, { x: 0, y: 0, z: 0, w: 1 })
  );
  physics.createCollider(
    RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z).setFriction(0.2).setRestitution(0.05),
    body
  );

  // ---------- raycast vehicle controller ----------
  const ctrl = physics.createVehicleController(body);
  const hx = cfg.trackWidth / 2;
  const hz = cfg.wheelbase / 2;
  // 0,1 = front (steer) | 2,3 = rear
  const wheelPos = [
    { x: -hx, z: hz }, { x: hx, z: hz },
    { x: -hx, z: -hz }, { x: hx, z: -hz },
  ];
  wheelPos.forEach((p, i) => {
    ctrl.addWheel(
      { x: p.x, y: s.connectionY, z: p.z },
      { x: 0, y: -1, z: 0 },
      { x: -1, y: 0, z: 0 },
      s.restLength,
      s.wheelRadius
    );
    ctrl.setWheelSuspensionStiffness(i, s.stiffness);
    ctrl.setWheelSuspensionCompression(i, s.compression);
    ctrl.setWheelSuspensionRelaxation(i, s.relaxation);
    ctrl.setWheelMaxSuspensionTravel(i, s.maxTravel);
    ctrl.setWheelMaxSuspensionForce(i, s.maxForce);
    ctrl.setWheelFrictionSlip(i, i < 2 ? tr.frictionSlipFront : tr.frictionSlipRear);
    ctrl.setWheelSideFrictionStiffness(i, tr.sideFrictionStiffness);
  });
  let lastGrip = 1;

  const debugBox = new THREE.Mesh(
    new THREE.BoxGeometry(bw, bh, bd),
    new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true })
  );
  debugBox.visible = false;
  scene.add(debugBox);

  // ---------- state ----------
  const prevPos = new THREE.Vector3();
  const curPos = new THREE.Vector3();
  const prevQuat = new THREE.Quaternion();
  const curQuat = new THREE.Quaternion();

  // Conservative van gearbox. Speeds are m/s; forward ceilings roughly follow 20/40/60/80/100 km/h.
  const GEAR_NAMES = ['R', 'N', '1', '2', '3', '4', '5'];
  const GEAR_CAPS = [3.0, 0, 5.6, 11.1, 16.7, 22.2, 30.0];
  const GEAR_MIN_SPEED = [0, 0, 0, 5.0, 10.0, 15.5, 22.0];
  // Relative gearbox ratios. Road speed multiplied by the selected ratio drives engine RPM:
  // lower gears rev higher at the same road speed; top gear cruises at lower RPM.
  const GEAR_RATIOS = [3.4, 0, 3.4, 1.72, 1.15, 0.86, 0.58];
  // Relative wheel-torque multiplication after gearing. The ratio itself shapes RPM;
  // this curve keeps the existing handling force scale stable while giving taller gears less pull.
  const GEAR_FORCE = [0.42, 0, 1.0, 0.84, 0.72, 0.62, 0.55];

  const ENGINE_TORQUE_CURVE = [
    [750, 0.48], [950, 0.66], [1250, 0.88], [1550, 1.0],
    [2400, 0.98], [3200, 0.91], [4000, 0.78], [4600, 0.59], [5000, 0.38], [5300, 0.30],
  ];

  function engineTorqueAtRpm(rpm) {
    // Diesel-ish torque curve: builds from idle, peaks in the useful low-mid range,
    // holds briefly, then falls away as the engine approaches the limiter.
    const points = ENGINE_TORQUE_CURVE;
    if (rpm <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      const [r1, t1] = points[i - 1];
      const [r2, t2] = points[i];
      if (rpm <= r2) {
        const x = clamp((rpm - r1) / (r2 - r1), 0, 1);
        return t1 + (t2 - t1) * x;
      }
    }
    return points[points.length - 1][1];
  }
  let gearIndex = 2;
  let shiftTimer = 0;
  let shiftDuration = 0.34;
  let throttleOffTimer = 0;
  let downshiftHoldTimer = 0;
  let coastClutch = 1;
  let shiftCueTimer = 0;
  let shiftCue = '';
  let engineRpm = 850;
  let autoShiftEnabled = false;
  let lugPhase = 0;
  let overRevTimer = 0;
  let limiterPhase = 0;

  function shiftGear(direction, automatic = false) {
    const next = clamp(gearIndex + direction, 0, GEAR_NAMES.length - 1);
    if (next === gearIndex) return false;
    const nextName = GEAR_NAMES[next];
    if (nextName === 'R' && Math.abs(self.speed) > 1.1) return false;
    const speed = Math.abs(self.speed);
    shiftDuration = direction > 0 && next >= 3 && speed < GEAR_MIN_SPEED[next] * 0.78 ? 0.42 : 0.34;
    if (direction < 0 && next >= 2) {
      downshiftHoldTimer = 1.6;
      const nextSpeed = self.speed * (GEAR_NAMES[next] === 'R' ? -1 : 1);
      const targetRpm = 850 + Math.max(0, nextSpeed) * (GEAR_RATIOS[next] / GEAR_RATIOS[2]) * 750;
      // Blip the engine toward the RPM the lower gear needs before the clutch re-engages.
      engineRpm = clamp(engineRpm + Math.max(0, targetRpm - engineRpm) * 0.72, 750, 5300);
    }
    shiftTimer = shiftDuration;
    shiftCue = direction > 0 ? 'UPSHIFT' : 'DOWNSHIFT';
    shiftCueTimer = 0.72;
    if (direction > 0 && next >= 3 && speed < GEAR_MIN_SPEED[next] * 0.78) lugPhase = 0.2;
    if (direction < 0 && next >= 2 && speed > GEAR_CAPS[next] * 0.82) overRevTimer = 0.42;
    gearIndex = next;
    if (!automatic) autoShiftEnabled = false;
    return true;
  }

  function smartShift() {
    // Shift is a one-button gearbox: normally select by road speed, but allow an upshift
    // near the top of the current gear instead of getting stuck on a threshold.
    const kmh = Math.abs(self.speed) * 3.6;
    const currentCap = GEAR_CAPS[gearIndex] * 3.6;
    const nearTop = gearIndex >= 2 && gearIndex < 6 && kmh >= currentCap * 0.72;
    let target = kmh < 18 ? 2 : kmh < 36 ? 3 : kmh < 52 ? 4 : kmh < 72 ? 5 : 6;

    // Add hysteresis around the 3rd/4th boundary so repeated Shift presses don't
    // bounce between gears when speed hovers around 52 km/h.
    if (gearIndex === 5 && kmh >= 47 && kmh < 72) target = 5;
    if (gearIndex === 4 && kmh > 57 && kmh < 72) target = 5;

    // If we're already in the speed-appropriate gear but near its ceiling, the next
    // Shift press upshifts. This lets 3rd -> 4th happen around 43 km/h rather than
    // requiring the player to reach the exact next speed band first.
    if (target === gearIndex && nearTop) target = Math.min(6, gearIndex + 1);
    if (target === gearIndex) return false;

    const direction = target > gearIndex ? 1 : -1;
    const speed = Math.abs(self.speed);
    if (direction < 0 && speed > GEAR_CAPS[target] * 0.92) overRevTimer = 0.3;
    if (direction < 0 && target >= 2) downshiftHoldTimer = 1.6;
    gearIndex = target;
    shiftDuration = 0.34;
    if (direction < 0 && target >= 2) {
      const nextSpeed = self.speed * (GEAR_NAMES[target] === 'R' ? -1 : 1);
      const targetRpm = 850 + Math.max(0, nextSpeed) * (GEAR_RATIOS[target] / GEAR_RATIOS[2]) * 750;
      engineRpm = clamp(engineRpm + Math.max(0, targetRpm - engineRpm) * 0.72, 750, 5300);
    }
    shiftTimer = shiftDuration;
    shiftCue = direction > 0 ? 'UPSHIFT' : 'DOWNSHIFT';
    shiftCueTimer = 0.72;
    lugPhase = 0;
    autoShiftEnabled = false;
    return true;
  }

  function transmission() {
    const gearName = GEAR_NAMES[gearIndex];
    const speedInGear = self.speed * (gearName === 'R' ? -1 : 1);
    const lugging = gearIndex >= 3 && speedInGear < GEAR_MIN_SPEED[gearIndex] * 0.78;
    return { gear: gearName, rpm: Math.round(engineRpm),
      clutch: Math.max(shiftTimer > 0 ? clamp(shiftTimer / shiftDuration, 0, 1) : 0, 1 - coastClutch),
      shift: shiftCueTimer > 0 ? shiftCue : '', lugging,
      overRev: engineRpm >= 4800, auto: false };
  }

  const self = {
    cfg,
    visual,
    center: new THREE.Vector3(0, cfg.spawnHeight, 0),
    quaternion: new THREE.Quaternion(),
    heading: 0,
    speed: 0,
    steerAngle: 0,
    step,
    capture,
    updateVisual,
    reset,
    maxSteerAtSpeed,
    smartShift,
    shiftUp: () => shiftGear(1),
    shiftDown: () => shiftGear(-1),
    toggleAutoShift: () => { autoShiftEnabled = !autoShiftEnabled; return autoShiftEnabled; },
    get transmission() { return transmission(); },
    nudgeModel(dy) { cfg.modelYTrim += dy; applyModelOffset(); return cfg.modelYTrim; },
    getLocalBounds,
    onModelReady(cb) { readyCallbacks.push(cb); if (ready) cb(); },
    // Driver's eye in chassis space: left-hand drive, high in the cab, set back from the front. Placed from
    // the model's size so any model gets a sane default; cabEyeTrim nudges it.
    get cabEye() {
      const bb = getLocalBounds();
      const t = cfg.cabEyeTrim;
      const w = bb.max.x - bb.min.x, hgt = bb.max.y - bb.min.y, len = bb.max.z - bb.min.z;
      return eyeVec.set((bb.min.x + bb.max.x) / 2 + w * 0.25 + t.x, bb.min.y + hgt * 0.68 + t.y, bb.max.z - len * 0.36 + t.z);
    },
    setExteriorVisible: (v) => { exterior.visible = v; },
    setDebugVisible: (v) => { debugBox.visible = v; },
  };

  const cal = {
    engineSign: h.engineSign,
    steerSign: h.steerSign,
    engineDone: !h.autoCalibrate,
    steerDone: !h.autoCalibrate,
    engineTestStartSpeed: null,
    engineTestTimer: 0,
    steerTimer: 0,
  };
  let flipTimer = 0;
  let settleTimer = 0;

  // Model bounds in chassis-local space (after the ground-fit offset), as a Box3.
  function getLocalBounds() {
    const bb = rawBox.clone();
    if (modelRoot) bb.translate(new THREE.Vector3(0, modelRoot.position.y, 0));
    return bb;
  }

  function maxSteerAtSpeed(speed) {
    const r = speed / h.steerFalloffSpeed;
    return h.maxSteerAngle / (1 + r * r);
  }

  function yawOf(q) {
    return Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y));
  }

  function forwardSpeed() {
    const q = body.rotation();
    const lv = body.linvel();
    const fx = 2 * (q.x * q.z + q.w * q.y);
    const fy = 2 * (q.y * q.z - q.w * q.x);
    const fz = 1 - 2 * (q.x * q.x + q.y * q.y);
    return lv.x * fx + lv.y * fy + lv.z * fz;
  }

  function contactCount() {
    let n = 0;
    for (let i = 0; i < 4; i++) if (ctrl.wheelIsInContact(i)) n++;
    return n;
  }

  // Once the van has settled, measure how high the chassis really sits and drop the model onto the ground.
  function measureRide() {
    fit.measured = true;
    try {
      let sum = 0, n = 0;
      for (let i = 0; i < 4; i++) {
        const p = ctrl.wheelContactPoint(i);
        if (p) { sum += p.y; n++; }
      }
      if (n === 4) {
        fit.rideHeight = body.translation().y - sum / 4;
        applyModelOffset();
        console.info(`[vehicle] measured ride height ${fit.rideHeight.toFixed(3)} m`);
        fireReady();
      }
    } catch (e) {
      console.info('[vehicle] ride height measurement unavailable, using formula', fit.rideHeight.toFixed(3));
    }
  }

  function calibrate(dt, input, v) {
    if (contactCount() < 3) return;

    if (!cal.engineDone) {
      if (input.throttle <= 0.5) {
        cal.engineTestStartSpeed = null;
        cal.engineTestTimer = 0;
      } else {
        if (cal.engineTestStartSpeed === null) cal.engineTestStartSpeed = v;
        cal.engineTestTimer += dt;
        const acceleration = v - cal.engineTestStartSpeed;
        if (cal.engineTestTimer > 0.3) {
          if (acceleration > 1.5) {
            cal.engineDone = true;
          } else if (acceleration < -1.5) {
            cal.engineSign *= -1;
            cal.engineDone = true;
            console.warn('[vehicle] engine force sign was backwards. Set VEHICLE_CONFIG.handling.engineSign =', cal.engineSign);
          }
        }
      }
      return;
    }

    if (!cal.steerDone) {
      if (v > 3 && Math.abs(self.steerAngle) > 0.2) cal.steerTimer += dt;
      else cal.steerTimer = 0;
      if (cal.steerTimer > 0.3) {
        const yaw = body.angvel().y;
        if (Math.abs(yaw) > 0.1) {
          if (Math.sign(yaw) !== Math.sign(self.steerAngle)) {
            cal.steerSign *= -1;
            console.warn('[vehicle] steering sign was backwards. Set VEHICLE_CONFIG.handling.steerSign =', cal.steerSign);
          }
          cal.steerDone = true;
        }
      }
    }
  }

  function step(dt, input, surface) {
    const v = forwardSpeed();
    const off = surface.offRoad;

    if (!fit.measured) {
      if (contactCount() === 4 && Math.abs(v) < 0.2) settleTimer += dt;
      else settleTimer = 0;
      if (settleTimer > 1.0) measureRide();
    }

    const grip = off ? h.offRoad.gripFactor : 1;
    if (grip !== lastGrip) {
      lastGrip = grip;
      for (let i = 0; i < 4; i++) {
        ctrl.setWheelFrictionSlip(i, (i < 2 ? tr.frictionSlipFront : tr.frictionSlipRear) * grip);
      }
    }

    const target = input.steer * maxSteerAtSpeed(Math.abs(v));
    self.steerAngle += (target - self.steerAngle) * Math.min(h.steerLerpSpeed * dt, 1);
    ctrl.setWheelSteering(0, self.steerAngle * cal.steerSign);
    ctrl.setWheelSteering(1, self.steerAngle * cal.steerSign);

    if (shiftTimer > 0) shiftTimer = Math.max(0, shiftTimer - dt);
    if (shiftCueTimer > 0) shiftCueTimer = Math.max(0, shiftCueTimer - dt);
    if (overRevTimer > 0) overRevTimer = Math.max(0, overRevTimer - dt);
    if (downshiftHoldTimer > 0) downshiftHoldTimer = Math.max(0, downshiftHoldTimer - dt);

    // S at a standstill selects reverse; pressing W again returns to first gear.
    if (input.throttle < -0.05 && Math.abs(v) < 1.1) gearIndex = 0;
    else if (input.throttle > 0.05 && gearIndex === 0) gearIndex = 2;

    // Both zones use the manual gearbox; highway steering is automated, not shifting.

    const gearName = GEAR_NAMES[gearIndex];
    const direction = gearName === 'R' ? -1 : 1;
    const gearCap = GEAR_CAPS[gearIndex] || 0.1;
    const cap = Math.max(0.1, Math.min(input.speedCap ?? h.maxSpeed, h.maxSpeed, gearCap)) * (off ? h.offRoad.speedFactor : 1);
    const t = clamp(Math.abs(input.throttle), 0, 1);
    const moving = clamp(Math.abs(v) / 0.5, 0, 1) * Math.sign(v);
    const speedInGear = v * direction;
    let F = 0;

    // Lift-off coasting: keep the drivetrain coupled for a short lift, then smoothly
    // disengage the clutch so the van preserves momentum instead of engine-braking forever.
    // Braking, throttle input, shifting, reverse, and near-stop driving all take priority.
    const recentDownshift = downshiftHoldTimer > 0;
    const canFreewheel = gearIndex >= 2 && Math.abs(v) > 2.0 && t <= 0.04
      && input.brake <= 0 && shiftTimer <= 0 && !recentDownshift;
    if (canFreewheel) throttleOffTimer += dt;
    else throttleOffTimer = 0;
    const coastClutchTarget = canFreewheel && throttleOffTimer > 0.85 ? 0 : 1;
    coastClutch += (coastClutchTarget - coastClutch) * (1 - Math.exp(-5.5 * dt));
    coastClutch = clamp(coastClutch, 0, 1);

    const gearMin = GEAR_MIN_SPEED[gearIndex] || 0;
    const ratio = GEAR_RATIOS[gearIndex] || 0;
    // Engine speed follows road speed through the selected gear ratio. Throttle can flare
    // the engine a little at very low road speed, but no longer adds a fixed RPM bonus in every gear.
    const coupledRpm = 850 + Math.max(0, speedInGear) * (ratio / GEAR_RATIOS[2]) * 750;
    const freeRevBlend = gearName === 'N'
      ? 1
      : clamp(1 - Math.max(0, speedInGear) / 2.2, 0, 1) * 0.78;
    const rpmTarget = gearName === 'N' || coastClutch < 0.98
      ? 850 + t * 3900
      : coupledRpm + t * freeRevBlend * 1150;
    const rpmResponse = shiftTimer > 0 ? 13 : (t > 0.05 ? 9 : 6);
    engineRpm += (clamp(rpmTarget, 750, 5300) - engineRpm) * (1 - Math.exp(-rpmResponse * dt));
    engineRpm = clamp(engineRpm, 750, 5300);

    const lugging = gearIndex >= 3 && speedInGear < gearMin * 0.78 && t > 0.04;
    let torque = gearName === 'N' ? 0 : GEAR_FORCE[gearIndex] * engineTorqueAtRpm(engineRpm);
    // Both gear changes and lift-off coasting reduce drivetrain coupling smoothly.
    let shiftCoupling = 1;
    if (shiftTimer > 0) {
      const shiftProgress = 1 - clamp(shiftTimer / shiftDuration, 0, 1);
      shiftCoupling = 0.04 + 0.96 * shiftProgress * shiftProgress * (3 - 2 * shiftProgress);
    }
    torque *= coastClutch * shiftCoupling;
    if (lugging) {
      lugPhase += dt * Math.PI * 2 * 5.0;
      torque *= 0.18 + 0.82 * Math.max(0, Math.sin(lugPhase));
    } else if (gearIndex < 3 || t <= 0.04) lugPhase = 0;
    if (engineRpm >= 5000 && t > 0 && gearName !== 'N') {
      limiterPhase += dt * Math.PI * 2 * 14;
      torque *= Math.sin(limiterPhase) > 0.05 ? 0.16 : 0.72;
    } else limiterPhase = 0;

    if (gearName !== 'N' && t > 0) F += direction * (gearName === 'R' ? h.reverseForce : h.engineForce) * torque * t * clamp(1 - speedInGear / cap, 0, 1);
    // Service brakes are deliberately weaker so downshifting and engine braking matter, while emergency braking still works.
    if (input.brake > 0) F -= h.brakeForce * 0.58 * input.brake * moving;
    if (t <= 0.04 && input.brake === 0) {
      F -= h.coastForce * moving;
      // Engine braking: lower gears resist rolling speed more strongly; neutral coasts freely.
      if (gearName !== 'N' && Math.abs(v) > 0.5) {
        const gearBrake = [0.0002, 0, 0.0003, 0.0002, 0.00015, 0.0001, 0.00005][gearIndex];
        F -= Math.sign(v) * h.engineForce * gearBrake * clamp(Math.abs(v) / 5, 0.2, 1) * coastClutch * shiftCoupling;
      }
    }
    if (overRevTimer > 0 && v !== 0) F -= Math.sign(v) * h.brakeForce * 0.12 * (overRevTimer / 0.42);
    if (gearName !== 'N' && speedInGear > cap) F -= direction * h.brakeForce * 0.30 * clamp((speedInGear - cap) / 2.5, 0, 1);
    if (off) F -= h.offRoad.dragForce * moving;

    const perWheel = (F / 4) * cal.engineSign;
    for (let i = 0; i < 4; i++) ctrl.setWheelEngineForce(i, perWheel);

    calibrate(dt, input, v);

    const q = body.rotation();
    const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
    if (upY < 0.35) {
      flipTimer += dt;
      if (flipTimer > 1.5) {
        const yaw = yawOf(q);
        const p = body.translation();
        body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
        body.setTranslation({ x: p.x, y: p.y + 0.8, z: p.z }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        flipTimer = 0;
      }
    } else {
      flipTimer = 0;
    }

    ctrl.updateVehicle(dt);
  }

  function capture() {
    prevPos.copy(curPos);
    prevQuat.copy(curQuat);
    const p = body.translation();
    const r = body.rotation();
    curPos.set(p.x, p.y, p.z);
    curQuat.set(r.x, r.y, r.z, r.w);
    self.speed = forwardSpeed();
  }

  function updateVisual(alpha, dt) {
    self.center.lerpVectors(prevPos, curPos, alpha);
    self.quaternion.slerpQuaternions(prevQuat, curQuat, alpha);
    self.heading = yawOf(self.quaternion);

    visual.position.copy(self.center);
    visual.quaternion.copy(self.quaternion);
    debugBox.position.copy(self.center);
    debugBox.quaternion.copy(self.quaternion);

    // visual steering: positive steerAngle = left = positive yaw
    for (const p of steerPivots) p.pivot.quaternion.setFromAxisAngle(p.axis, self.steerAngle * cfg.wheelVisualSteer);

    if (mixer && wheelAction) {
      wheelAction.timeScale = self.speed * cfg.wheelAnimSpeedScale; // signed, so wheels spin backwards in reverse
      mixer.update(dt);
    }
  }

  function reset(y = cfg.spawnHeight, heading = 0) {
    gearIndex = 2;
    shiftTimer = 0;
    shiftDuration = 0.34;
    throttleOffTimer = 0;
    downshiftHoldTimer = 0;
    coastClutch = 1;
    shiftCueTimer = 0;
    shiftCue = '';
    engineRpm = 850;
    autoShiftEnabled = false;
    lugPhase = 0;
    overRevTimer = 0;
    limiterPhase = 0;
    body.setTranslation({ x: 0, y, z: 0 }, true);
    body.setRotation({ x: 0, y: Math.sin(heading / 2), z: 0, w: Math.cos(heading / 2) }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    self.steerAngle = 0;
    flipTimer = 0;
    capture();
    capture();
    updateVisual(1, 0);
  }

  // debug-mode tuning: ] raises the van model, [ lowers it (prints the value to paste into VEHICLE_CONFIG)
  window.addEventListener('keydown', (e) => {
    if (!state.debug || (e.key !== '[' && e.key !== ']')) return;
    const t = self.nudgeModel(e.key === ']' ? 0.05 : -0.05);
    console.info(`[vehicle] modelYTrim: ${t.toFixed(2)}  (paste into VEHICLE_CONFIG)`);
  });

  capture();
  capture();
  updateVisual(1, 0);
  return self;
}