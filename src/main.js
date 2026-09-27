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

  // ===================== DEBUG TOOLS (temporary, remove later) =====================
  let debugMode = false;
  const orbitControls = new OrbitControls(camera, renderer.domElement);
  orbitControls.enabled = false;

  const debugBoxGeo = new THREE.BoxGeometry(1.2, 1.2, 2.4);
  const debugBoxMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true });
  const debugBox = new THREE.Mesh(debugBoxGeo, debugBoxMat);
  scene.add(debugBox);

  const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
  sunLight.position.set(5, 10, 5);
  sunLight.castShadow = true;
  sunLight.shadow.camera.left = -50;
  sunLight.shadow.camera.right = 50;
  sunLight.shadow.camera.top = 50;
  sunLight.shadow.camera.bottom = -50;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 100;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.bias = -0.001;
  scene.add(sunLight);
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));

  // ===================== GROUND WITH STRIPES =====================
  const groundGeo = new THREE.PlaneGeometry(200, 200, 1, 1);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x4a7c3a });
  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  const stripeGroup = new THREE.Group();
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
  for (let i = -100; i < 100; i += 5) {
    const stripeGeo = new THREE.BoxGeometry(0.3, 0.02, 2);
    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.position.set(0, 0.01, i);
    stripeGroup.add(stripe);
  }
  scene.add(stripeGroup);

  const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(RAPIER.ColliderDesc.cuboid(100, 0.1, 100), groundBody);

  // ===================== LOAD TRUCK MODEL =====================
  const truckVisual = new THREE.Group();
  scene.add(truckVisual);

  const TRUCK_Y_OFFSET = -0.72;
  let wheelMeshes = [];

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
        if (child.name.toLowerCase().includes('wheel')) {
          wheelMeshes.push(child);
        }
      });
      truckVisual.add(model);
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

  const truckBodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0, 1, 0)
    .lockRotations()
    .setLinearDamping(1.5);
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

  // ===================== CITY (WASD) DRIVING =====================
  const keys = { w: false, a: false, s: false, d: false };
  let heading = 0;
  const turnSpeed = 2.0;
  const driveForce = 25;
  const maxSpeed = 8;

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
  let highwayForce = 0;
  const highwayMaxSpeed = 20;
  const highwayBoost = 30;
  const highwayDamping = 0.6;

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
        highwayForce = highwayBoost;
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

  const clock = new THREE.Clock();
  const camCurrentPos = new THREE.Vector3(0, 3, 8);
  const camLookTarget = new THREE.Vector3();

  function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();

    if (mode === 'city') {
      if (keys.a) heading += turnSpeed * dt;
      if (keys.d) heading -= turnSpeed * dt;

      let forceMagnitude = 0;
      if (keys.w) forceMagnitude = driveForce;
      if (keys.s) forceMagnitude = -driveForce * 0.6;

      const forceX = Math.sin(heading) * forceMagnitude;
      const forceZ = Math.cos(heading) * forceMagnitude;
      truckBody.resetForces(true);
      truckBody.addForce({ x: forceX, y: 0, z: forceZ }, true);
      clampSpeed(maxSpeed);
    } else {
      truckBody.resetForces(true);
      const forceZ = Math.cos(heading) * highwayForce;
      const forceX = Math.sin(heading) * highwayForce;
      truckBody.addForce({ x: forceX, y: 0, z: forceZ }, true);
      highwayForce = Math.max(0, highwayForce - highwayForce * highwayDamping * dt);
      clampSpeed(highwayMaxSpeed);
    }

    const halfAngle = heading / 2;
    truckBody.setRotation(
      { x: 0, y: Math.sin(halfAngle), z: 0, w: Math.cos(halfAngle) },
      true
    );

    world.step();

    const pos = truckBody.translation();
    const rot = truckBody.rotation();
    truckVisual.position.set(pos.x, pos.y, pos.z);
    truckVisual.quaternion.set(rot.x, rot.y, rot.z, rot.w);

    debugBox.position.set(pos.x, pos.y, pos.z);
    debugBox.quaternion.set(rot.x, rot.y, rot.z, rot.w);

    const vel = truckBody.linvel();
    const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    wheelMeshes.forEach((wheel) => {
      wheel.rotation.x -= speed * dt * 2;
    });

    if (!debugMode) {
      const desiredCamPos = new THREE.Vector3(
        pos.x - Math.sin(heading) * 7,
        pos.y + 3.5,
        pos.z - Math.cos(heading) * 7
      );
      camCurrentPos.lerp(desiredCamPos, 1 - Math.pow(0.001, dt));
      camera.position.copy(camCurrentPos);

      camLookTarget.lerp(new THREE.Vector3(pos.x, pos.y + 0.5, pos.z), 1 - Math.pow(0.001, dt));
      camera.lookAt(camLookTarget);
    } else {
      orbitControls.update();
    }

    renderer.render(scene, camera);
  }

  function clampSpeed(cap) {
    const vel = truckBody.linvel();
    const horizSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    if (horizSpeed > cap) {
      const scale = cap / horizSpeed;
      truckBody.setLinvel({ x: vel.x * scale, y: vel.y, z: vel.z * scale }, true);
    }
  }

  animate();
}

main();