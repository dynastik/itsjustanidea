import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const FIXED_DT = 1 / 60;

// Every model/vehicle-specific number lives here. Swapping the van = editing this object.
// TUNING GUIDE (all numbers are first guesses, expect a tuning pass):
//  - car bounces/wallows      -> suspension.stiffness / compression / relaxation
//  - too much body roll       -> body.comOffsetY more negative (lower centre of mass)
//  - understeer / oversteer   -> tires.frictionSlipFront vs frictionSlipRear
//  - too slow / too twitchy   -> handling.engineForce, steerFalloffSpeed
//  - model floats or sinks    -> modelYOffset
export const VEHICLE_CONFIG = {
  modelUrl: `${import.meta.env.BASE_URL}models/truck.glb`,
  modelYOffset: -0.72,
  spawnHeight: 1.2,
  wheelbase: 1.8,
  trackWidth: 1.2,
  colliderHalfExtents: { x: 0.6, y: 0.6, z: 1.2 },
  wheelAnimSpeedScale: 0.6,
  cabCameraOffset: { x: 0.3, y: 0.8, z: 0.3 },  // PLACEHOLDER: driver's head, local to chassis centre
  mirrorOffset: { x: 0, y: 1.2, z: 0.7 },       // PLACEHOLDER: rear-view mirror (Phase 5)
  body: {
    mass: 1200,
    comOffsetY: -0.35,     // low centre of mass = arcade-stable
    linearDamping: 0.05,
    angularDamping: 0.8,
  },
  suspension: {
    restLength: 0.35,
    wheelRadius: 0.3,
    connectionY: -0.44,    // chosen so the chassis rests ~1.0 above ground
    stiffness: 28,         // Rapier/Bullet stiffness is per unit mass; ~24-30 gives ~9cm sag on 1200kg
    compression: 4.5,
    relaxation: 3.5,
    maxTravel: 0.3,
    maxForce: 60000,
  },
  tires: {
    frictionSlipFront: 9,
    frictionSlipRear: 8,   // slightly lower rear grip = mild, forgiving oversteer
    sideFrictionStiffness: 1.0,
  },
  handling: {
    engineForce: 16000,    // total N, split across 4 wheels (AWD for forgiveness)
    brakeForce: 22000,
    reverseForce: 7000,
    coastForce: 1800,      // engine braking / rolling resistance when off the pedals
    maxSpeed: 30,
    reverseMaxSpeed: 6,
    maxSteerAngle: 0.55,
    steerFalloffSpeed: 20, // steering lock halves at this speed
    steerLerpSpeed: 5,
    offRoad: { gripFactor: 0.55, speedFactor: 0.5, dragForce: 4000 },
    // Rapier's sign conventions are easy to get backwards. With autoCalibrate on, the vehicle
    // checks the first throttle press and the first real turn, flips these if needed and logs
    // a console warning telling you what to hardcode here.
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

  new GLTFLoader().load(
    cfg.modelUrl,
    (gltf) => {
      const model = gltf.scene;
      model.position.y = cfg.modelYOffset;
      model.traverse((c) => {
        if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; }
      });
      exterior.add(model);

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
      { x: 0, y: -1, z: 0 },   // suspension direction
      { x: -1, y: 0, z: 0 },   // axle
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

  const self = {
    cfg,
    visual,
    center: new THREE.Vector3(0, cfg.spawnHeight, 0), // interpolated render pose
    quaternion: new THREE.Quaternion(),
    heading: 0,       // yaw, radians (0 = +z, positive turns toward +x)
    speed: 0,         // forward speed, m/s (negative = reversing)
    steerAngle: 0,
    step,
    capture,
    updateVisual,
    reset,
    maxSteerAtSpeed,
    setExteriorVisible: (v) => { exterior.visible = v; },
    setDebugVisible: (v) => { debugBox.visible = v; },
  };

  const cal = {
    engineSign: h.engineSign,
    steerSign: h.steerSign,
    engineDone: !h.autoCalibrate,
    steerDone: !h.autoCalibrate,
    armed: false,
    steerTimer: 0,
  };
  let flipTimer = 0;

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

  function calibrate(dt, input, v) {
    if (contactCount() < 3) return;

    if (!cal.engineDone) {
      if (input.throttle < 0.1 && Math.abs(v) < 0.5) cal.armed = true;
      if (cal.armed && input.throttle > 0.5) {
        if (v > 1.5) {
          cal.engineDone = true;
        } else if (v < -1.5) {
          cal.engineSign *= -1;
          cal.engineDone = true;
          console.warn('[vehicle] engine force sign was backwards. Set VEHICLE_CONFIG.handling.engineSign =', cal.engineSign);
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

  // One fixed physics step's worth of driving. Call BEFORE physics.step().
  function step(dt, input, surface) {
    const v = forwardSpeed();
    const off = surface.offRoad;

    // surface grip
    const grip = off ? h.offRoad.gripFactor : 1;
    if (grip !== lastGrip) {
      lastGrip = grip;
      for (let i = 0; i < 4; i++) {
        ctrl.setWheelFrictionSlip(i, (i < 2 ? tr.frictionSlipFront : tr.frictionSlipRear) * grip);
      }
    }

    // steering (speed-sensitive lock, smoothed)
    const target = input.steer * maxSteerAtSpeed(Math.abs(v));
    self.steerAngle += (target - self.steerAngle) * Math.min(h.steerLerpSpeed * dt, 1);
    ctrl.setWheelSteering(0, self.steerAngle * cal.steerSign);
    ctrl.setWheelSteering(1, self.steerAngle * cal.steerSign);

    // longitudinal force in newtons, + = forward. Braking is done with reversed engine force
    // so every force uses the same (true newton) units.
    const cap = Math.min(input.speedCap ?? h.maxSpeed, h.maxSpeed) * (off ? h.offRoad.speedFactor : 1);
    const t = input.throttle;
    const moving = clamp(Math.abs(v) / 0.5, 0, 1) * Math.sign(v); // fades to 0 at standstill, no jitter
    let F = 0;

    if (t > 0) {
      F += h.engineForce * t * clamp(1 - v / cap, 0, 1);
    } else if (t < 0) {
      if (v > 0.5) F -= h.brakeForce * -t;
      else F -= h.reverseForce * -t * clamp(1 - -v / h.reverseMaxSpeed, 0, 1);
    }
    if (input.brake > 0) F -= h.brakeForce * input.brake * moving;
    if (t === 0 && input.brake === 0) F -= h.coastForce * moving;
    if (v > cap) F -= h.brakeForce * 0.25 * clamp((v - cap) / 3, 0, 1);
    if (off) F -= h.offRoad.dragForce * moving;

    const perWheel = (F / 4) * cal.engineSign;
    for (let i = 0; i < 4; i++) ctrl.setWheelEngineForce(i, perWheel);

    calibrate(dt, input, v);

    // roll-over recovery: upside down for 1.5s -> set upright
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

  // Call AFTER physics.step(): remember previous/current pose for render interpolation.
  function capture() {
    prevPos.copy(curPos);
    prevQuat.copy(curQuat);
    const p = body.translation();
    const r = body.rotation();
    curPos.set(p.x, p.y, p.z);
    curQuat.set(r.x, r.y, r.z, r.w);
    self.speed = forwardSpeed();
  }

  // Call once per rendered frame. alpha = leftover accumulator / FIXED_DT.
  function updateVisual(alpha, dt) {
    self.center.lerpVectors(prevPos, curPos, alpha);
    self.quaternion.slerpQuaternions(prevQuat, curQuat, alpha);
    self.heading = yawOf(self.quaternion);

    visual.position.copy(self.center);
    visual.quaternion.copy(self.quaternion);
    debugBox.position.copy(self.center);
    debugBox.quaternion.copy(self.quaternion);

    if (mixer && wheelAction) {
      wheelAction.timeScale = Math.abs(self.speed) * cfg.wheelAnimSpeedScale;
      mixer.update(dt);
    }
  }

  function reset() {
    body.setTranslation({ x: 0, y: cfg.spawnHeight, z: 0 }, true);
    body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    self.steerAngle = 0;
    flipTimer = 0;
    capture();
    capture();
    updateVisual(1, 0);
  }

  capture();
  capture();
  updateVisual(1, 0);
  return self;
}