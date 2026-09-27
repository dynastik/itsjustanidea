import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import RAPIER from '@dimforge/rapier3d-compat';

async function main() {
  await RAPIER.init();

  const gravity = { x: 0.0, y: -9.81, z: 0.0 };
  const world = new RAPIER.World(gravity);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);

  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  document.body.appendChild(renderer.domElement);

  // ===================== DEBUG TOOLS =====================
  let debugMode = false;
  const orbitControls = new OrbitControls(camera, renderer.domElement);
  orbitControls.enabled = false;

  const debugBoxGeo = new THREE.BoxGeometry(1.2, 1.2, 2.4);
  const debugBoxMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true });
  const debugBox = new THREE.Mesh(debugBoxGeo, debugBoxMat);
  scene.add(debugBox);

  // ===================== LIGHTING =====================
  const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
  sunLight.castShadow = true;
  sunLight.shadow.camera.left = -30;
  sunLight.shadow.camera.right = 30;
  sunLight.shadow.camera.top = 30;
  sunLight.shadow.camera.bottom = -30;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 60;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.bias = -0.001;
  scene.add(sunLight);

  const sunTarget = new THREE.Object3D();
  scene.add(sunTarget);
  sunLight.target = sunTarget;

  scene.add(new THREE.AmbientLight(0xffffff, 0.4));

  // ===================== GROUND WITH STRIPES =====================
  const groundGeo = new THREE.PlaneGeometry(400, 400, 1, 1);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x4a7c3a });
  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  const stripeGroup = new THREE.Group();
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
  for (let i = -200; i < 200; i += 5) {
    const stripeGeo = new THREE.BoxGeometry(0.3, 0.02, 2);
    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.position.set(0, 0.01, i);
    stripeGroup.add(stripe);
  }
  scene.add(stripeGroup);

  const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(RAPIER.ColliderDesc.cuboid(200, 0.1, 200), groundBody);

  // ===================== LOAD TRUCK MODEL =====================
  const truckVisual = new THREE.Group();
  scene.add(truckVisual);

  const TRUCK_Y_OFFSET = -0.72;
  let mixer = null;
  let wheelAction = null;

  const loader = new GLTFLoader();
  loader.load(
    'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CesiumMilkTruck/glTF-Binary/CesiumMilkTruck.glb',
    (gltf) => {
      const model = gltf.scene;
      model.position.y = TRUCK_Y_OFFSET;
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      truckVisual.add(model);

      if (gltf.animations && gltf.animations.length > 0) {
        mixer = new THREE.AnimationMixer(model);
        wheelAction = mixer.clipAction(gltf.animations[0]);
        wheelAction.play();
        wheelAction.timeScale = 0;
      } else {
        console.warn('No animations found on truck model — wheels will stay static.');
      }
    },
    undefined,
    (error) => {
      console.error('Failed to load truck model:', error);
      const fallbackGeo = new THREE.BoxGeometry(1, 1, 2);
      const fallbackMat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
      const fallback = new THREE.Mesh(fallbackGeo, fallbackMat);
      truckVisual.add(fallback);
    }
  );

  // --- KINEMATIC body: WE fully control its position/rotation each frame,
  // via proper bicycle-model math below, instead of letting Rapier's force/
  // velocity physics decide movement. Still participates in collision for
  // future obstacles. ---
  const truckBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 1, 0);
  const truckBody = world.createRigidBody(truckBodyDesc);
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.6, 0.6, 1.2), truckBody);

  // ===================== MODE SYSTEM =====================
  let mode = 'city';
  const modeLabel = document.getElementById('mode-label');
  const typingPanel = document.getElementById('typing-panel');

  function setMode(newMode) {
    mode = newMode;
    modeLabel.textContent = mode === 'city' ? 'MODE: CITY (WASD)' : 'MODE: HIGHWAY (TYPE)';
    typingPanel.style.display = mode === 'highway' ? 'block' : 'none';
    if (mode === 'highway') pickNewWord();
  }

  // ===================== BICYCLE MODEL STATE =====================
  const keys = { w: false, a: false, s: false, d: false };

  let heading = 0;
  // "rearAxle" is the point that actually moves in a straight-ish line and
  // is the true pivot of rotation — the vehicle's rendered center is offset
  // forward from it by half the wheelbase, which is what makes turns pivot
  // around the rear axle rather than the vehicle's geometric center.
  const rearAxle = { x: 0, z: 0 };
  const wheelbase = 1.8; // distance between front and rear axle, tune to the model's real proportions
  const halfWheelbase = wheelbase / 2;

  let speed = 0; // signed: positive = forward, negative = reverse
  const acceleration = 14; // units/sec^2 while holding W
  const brakeDecel = 20; // units/sec^2 while holding S (braking, or reversing once stopped)
  const dragDecel = 8; // natural coast-down when no input held
  const maxSpeed = 16;
  const reverseMaxSpeed = 6;

  let steerAngle = 0; // current front-wheel angle, radians
  const maxSteerAngle = 0.55; // ~31.5 degrees, typical car max lock
  const steerLerpSpeed = 5; // how fast the wheel turns toward input, not the car itself

  // ===================== HIGHWAY (TYPING) DRIVING =====================
  const wordBank = [
    'sunset', 'highway', 'engine', 'gravel', 'horizon', 'mirror',
    'static', 'exhaust', 'asphalt', 'flicker', 'signal', 'distance',
    'headlight', 'shoulder', 'mileage', 'wander', 'silence', 'radio'
  ];
  let targetWord = '';
  let typedBuffer = '';
  const targetWordEl = document.getElementById('target-word');
  const typedInputEl = document.getElementById('typed-input');
  const statsEl = document.getElementById('stats');

  let wordsCompleted = 0;
  let keystrokesCorrect = 0;
  let keystrokesTotal = 0;
  let typingStartTime = null;
  const highwayMaxSpeed = 26;
  const wordSpeedBoost = 6; // instant speed gain per completed word
  const highwayDrag = 3; // constant coast-down, keeps typing necessary to maintain speed

  function pickNewWord() {
    targetWord = wordBank[Math.floor(Math.random() * wordBank.length)];
    typedBuffer = '';
    updateTypingUI();
  }

  function updateTypingUI() {
    const typedPart = targetWord.slice(0, typedBuffer.length);
    const remainingPart = targetWord.slice(typedBuffer.length);
    const isCorrectSoFar = targetWord.startsWith(typedBuffer);

    targetWordEl.innerHTML = isCorrectSoFar
      ? `<span style="color:#4caf50">${typedPart}</span><span style="color:#333">${remainingPart}</span>`
      : `<span style="color:#f44336">${targetWord}</span>`;

    typedInputEl.textContent = typedBuffer;

    const elapsedMin = typingStartTime ? (performance.now() - typingStartTime) / 60000 : 0;
    const wpm = elapsedMin > 0 ? Math.round((wordsCompleted / elapsedMin)) : 0;
    const accuracy = keystrokesTotal > 0
      ? Math.round((keystrokesCorrect / keystrokesTotal) * 100)
      : 100;
    statsEl.textContent = `WPM: ${wpm} | Accuracy: ${accuracy}%`;
  }

  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();

    if (key === 'm') {
      setMode(mode === 'city' ? 'highway' : 'city');
      return;
    }

    if (key === 'c') {
      debugMode = !debugMode;
      orbitControls.enabled = debugMode;
      return;
    }

    if (mode === 'city') {
      if (key in keys) keys[key] = true;
      return;
    }

    if (mode === 'highway') {
      if (key.length !== 1 || !/[a-z]/.test(key)) return;
      if (!typingStartTime) typingStartTime = performance.now();

      const expectedChar = targetWord[typedBuffer.length];
      keystrokesTotal++;
      if (key === expectedChar) {
        keystrokesCorrect++;
        typedBuffer += key;
      }

      if (typedBuffer === targetWord) {
        wordsCompleted++;
        speed = Math.min(speed + wordSpeedBoost, highwayMaxSpeed);
        pickNewWord();
      } else {
        updateTypingUI();
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (mode === 'city' && key in keys) keys[key] = false;
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  let lastTime = performance.now();
  const camCurrentPos = new THREE.Vector3(0, 3, 8);
  const camLookTarget = new THREE.Vector3();

  function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    if (mode === 'city') {
      // --- steering angle (the wheel), smoothed toward input ---
      let steerTarget = 0;
      if (keys.a) steerTarget = maxSteerAngle;
      if (keys.d) steerTarget = -maxSteerAngle;
      steerAngle += (steerTarget - steerAngle) * Math.min(steerLerpSpeed * dt, 1);

      // --- speed (throttle/brake/drag) ---
      if (keys.w) {
        speed += acceleration * dt;
      } else if (keys.s) {
        speed -= brakeDecel * dt;
      } else if (speed > 0) {
        speed = Math.max(0, speed - dragDecel * dt);
      } else if (speed < 0) {
        speed = Math.min(0, speed + dragDecel * dt);
      }
      speed = Math.max(-reverseMaxSpeed, Math.min(maxSpeed, speed));

      // --- BICYCLE MODEL: this is the actual fix ---
      // Angular velocity is proportional to speed for a given wheel angle —
      // so rotation rate genuinely scales with how fast you're going, and
      // there's no rotation at all when speed is 0, matching a real car.
      const angularVelocity = (speed / wheelbase) * Math.tan(steerAngle);
      heading += angularVelocity * dt;

      // rear axle moves forward along the (now-updated) heading
      rearAxle.x += speed * Math.sin(heading) * dt;
      rearAxle.z += speed * Math.cos(heading) * dt;
    } else {
      // highway: no steering, straight line, speed decays unless fed by typing
      speed = Math.max(0, speed - highwayDrag * dt);
      rearAxle.x += speed * Math.sin(heading) * dt;
      rearAxle.z += speed * Math.cos(heading) * dt;
    }

    // vehicle's rendered/collider center sits half a wheelbase ahead of the
    // rear axle along current heading — this is what makes it visually pivot
    // around the rear axle rather than its own geometric middle
    const centerX = rearAxle.x + halfWheelbase * Math.sin(heading);
    const centerZ = rearAxle.z + halfWheelbase * Math.cos(heading);

    const halfAngle = heading / 2;
    const quat = { x: 0, y: Math.sin(halfAngle), z: 0, w: Math.cos(halfAngle) };

    truckBody.setNextKinematicTranslation({ x: centerX, y: 1, z: centerZ });
    truckBody.setNextKinematicRotation(quat);

    world.step();

    truckVisual.position.set(centerX, 1, centerZ);
    truckVisual.quaternion.set(quat.x, quat.y, quat.z, quat.w);

    debugBox.position.set(centerX, 1, centerZ);
    debugBox.quaternion.set(quat.x, quat.y, quat.z, quat.w);

    sunLight.position.set(centerX + 15, 21, centerZ + 10);
    sunTarget.position.set(centerX, 1, centerZ);

    if (mixer && wheelAction) {
      wheelAction.timeScale = Math.abs(speed) * 0.6;
      mixer.update(dt);
    }

    if (!debugMode) {
      const desiredCamPos = new THREE.Vector3(
        centerX - Math.sin(heading) * 7,
        4.5,
        centerZ - Math.cos(heading) * 7
      );
      camCurrentPos.lerp(desiredCamPos, 1 - Math.pow(0.001, dt));
      camera.position.copy(camCurrentPos);

      camLookTarget.lerp(new THREE.Vector3(centerX, 1.5, centerZ), 1 - Math.pow(0.001, dt));
      camera.lookAt(camLookTarget);
    } else {
      orbitControls.update();
    }

    renderer.render(scene, camera);
  }

  animate();
}

main();