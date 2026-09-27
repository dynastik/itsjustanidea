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
  debugBox.visible = false; // was always visible before — only show in debug mode
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

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambientLight);

  // ===================== DAY → DUSK TRANSITION SYSTEM =====================
  // worldTime goes 0 (bright calm day) -> 1 (eerie dusk). This is the seed
  // system the full horror pivot will build on later: lighting, fog, and
  // eventually spawning/behavior can all key off this same value.
  let worldTime = 0;
  const dayLengthSeconds = 180; // tune this — how long until full dusk. Short now for testing.

  const skyDay = new THREE.Color(0x87ceeb);
  const skyDusk = new THREE.Color(0x2b1f38); // muted eerie purple-grey
  const lightColorDay = new THREE.Color(0xffffff);
  const lightColorDusk = new THREE.Color(0x9aa0c8); // cold dim blue
  const lightIntensityDay = 1.5;
  const lightIntensityDusk = 0.35;
  const ambientDay = 0.4;
  const ambientDusk = 0.12;

  scene.fog = new THREE.Fog(skyDay.clone(), 120, 320);
  const fogNearDay = 120, fogFarDay = 320;
  const fogNearDusk = 15, fogFarDusk = 70; // fog closes in a lot at dusk — atmosphere + hides draw distance

  function updateWorldTime(dt) {
    worldTime = Math.min(worldTime + dt / dayLengthSeconds, 1);

    const skyColor = skyDay.clone().lerp(skyDusk, worldTime);
    scene.background = skyColor;
    scene.fog.color.copy(skyColor);
    scene.fog.near = THREE.MathUtils.lerp(fogNearDay, fogNearDusk, worldTime);
    scene.fog.far = THREE.MathUtils.lerp(fogFarDay, fogFarDusk, worldTime);

    sunLight.color.copy(lightColorDay.clone().lerp(lightColorDusk, worldTime));
    sunLight.intensity = THREE.MathUtils.lerp(lightIntensityDay, lightIntensityDusk, worldTime);
    ambientLight.intensity = THREE.MathUtils.lerp(ambientDay, ambientDusk, worldTime);
  }

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

  // ===================== ROADSIDE TREES (instanced for performance) =====================
  const trunkGeo = new THREE.CylinderGeometry(0.15, 0.2, 1.2, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3d2b });
  const leavesGeo = new THREE.ConeGeometry(1.1, 2.2, 7);
  const leavesMat = new THREE.MeshStandardMaterial({ color: 0x2d5a34 });

  const treeCount = 160; // 80 per side
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  const leavesMesh = new THREE.InstancedMesh(leavesGeo, leavesMat, treeCount);
  trunkMesh.castShadow = true;
  leavesMesh.castShadow = true;

  const dummy = new THREE.Object3D();
  let treeIndex = 0;
  for (let side = -1; side <= 1; side += 2) {
    for (let z = -200; z < 200; z += 5) {
      const x = side * (10 + Math.random() * 6); // roadside offset with jitter
      const zJitter = z + (Math.random() - 0.5) * 3;
      const scaleVariation = 0.7 + Math.random() * 0.6;

      dummy.position.set(x, 0.6 * scaleVariation, zJitter);
      dummy.scale.setScalar(scaleVariation);
      dummy.updateMatrix();
      trunkMesh.setMatrixAt(treeIndex, dummy.matrix);

      dummy.position.set(x, (1.2 + 1.1) * scaleVariation, zJitter);
      dummy.updateMatrix();
      leavesMesh.setMatrixAt(treeIndex, dummy.matrix);

      treeIndex++;
      if (treeIndex >= treeCount) break;
    }
    if (treeIndex >= treeCount) break;
  }
  trunkMesh.instanceMatrix.needsUpdate = true;
  leavesMesh.instanceMatrix.needsUpdate = true;
  scene.add(trunkMesh);
  scene.add(leavesMesh);

  // ===================== LOAD TRUCK MODEL =====================
  const truckVisual = new THREE.Group();
  scene.add(truckVisual);

  const TRUCK_Y_OFFSET = -0.72;
  let mixer = null;
  let wheelAction = null;

  const loader = new GLTFLoader();
  loader.load(
    // loads from /public/models/truck.glb — drop truck.glb in that folder
    // (create it if it doesn't exist yet). BASE_URL keeps this working
    // whether you're on localhost or a GitHub Pages subpath.
    `${import.meta.env.BASE_URL}models/truck.glb`,
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

  // ===================== AUTO MODE ZONES (placeholder) =====================
  // TODO: replace with real city/highway environments once those exist.
  // For now, driving far enough down the road auto-switches you into
  // highway mode; hysteresis keeps it from flickering back and forth
  // right at the boundary.
  const HIGHWAY_ZONE_Z = 80;
  const ZONE_HYSTERESIS = 10;

  function updateZoneMode() {
    if (mode === 'city' && rearAxle.z > HIGHWAY_ZONE_Z + ZONE_HYSTERESIS) {
      setMode('highway');
    } else if (mode === 'highway' && rearAxle.z < HIGHWAY_ZONE_Z - ZONE_HYSTERESIS) {
      setMode('city');
    }
  }

  // ===================== BICYCLE MODEL STATE =====================
  const keys = { w: false, a: false, s: false, d: false };

  let heading = 0;
  const rearAxle = { x: 0, z: 0 };
  const wheelbase = 1.8;
  const halfWheelbase = wheelbase / 2;

  let speed = 0;
  const acceleration = 14;
  const brakeDecel = 20;
  const dragDecel = 8;
  const maxSpeed = 16;
  const reverseMaxSpeed = 6;

  let steerAngle = 0;
  const maxSteerAngle = 0.55;
  const steerLerpSpeed = 5;

  // low-speed turn damping: on top of the physically-correct bicycle model,
  // this further suppresses rotation at very low speed, so crawling forward
  // doesn't produce noticeable spin even with full lock applied
  const lowSpeedTurnThreshold = 4; // units/sec — below this, turning scales down further
  function lowSpeedTurnFactor(currentSpeed) {
    return Math.min(Math.abs(currentSpeed) / lowSpeedTurnThreshold, 1);
  }

  // ===================== HIGHWAY (TYPING) DRIVING =====================
  // Highway is hands-off: the truck auto-steers itself, and speed
  // continuously chases a target based on your live WPM + accuracy —
  // no manual acceleration once you're out here.
  const wordBank = [
    'sunset', 'highway', 'engine', 'gravel', 'horizon',
    'static', 'exhaust', 'asphalt', 'flicker', 'signal', 'distance',
    'headlight', 'shoulder', 'wander', 'silence', 'radio'
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

  const highwayMinSpeed = 4;        // idle coasting speed even at 0 WPM
  const highwayMaxSpeed = 26;       // reached at/above highwayWpmForMaxSpeed
  const highwayWpmForMaxSpeed = 60; // tune this as the word bank gets harder
  const highwaySpeedResponse = 2;   // how fast actual speed chases the target
  const steerCenteringGain = 0.04;  // how hard auto-steer pulls back to x=0
  const maxAutoSteer = 0.4;
  const autoSteerResponse = 3;

  function computeWpm() {
    const elapsedMin = typingStartTime ? (performance.now() - typingStartTime) / 60000 : 0;
    return elapsedMin > 0 ? wordsCompleted / elapsedMin : 0;
  }

  function computeAccuracy() {
    return keystrokesTotal > 0 ? keystrokesCorrect / keystrokesTotal : 1;
  }

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

    const wpm = Math.round(computeWpm());
    const accuracy = Math.round(computeAccuracy() * 100);
    statsEl.textContent = `WPM: ${wpm} | Accuracy: ${accuracy}%`;
  }

  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();

    // Debug + dev-only controls live on non-letter keys so they can never
    // collide with typing gameplay, which uses the full alphabet.
    if (key === '`') {
      debugMode = !debugMode;
      orbitControls.enabled = debugMode;
      debugBox.visible = debugMode;
      return;
    }

    if (key === 'tab') {
      e.preventDefault(); // don't let it tab focus off the canvas
      setMode(mode === 'city' ? 'highway' : 'city'); // dev override — real switch is zone-based
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
        pickNewWord();
      } else {
        updateTypingUI();
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (key in keys) keys[key] = false;
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

    updateWorldTime(dt);
    updateZoneMode();

    if (mode === 'city') {
      let steerTarget = 0;
      if (keys.a) steerTarget = maxSteerAngle;
      if (keys.d) steerTarget = -maxSteerAngle;
      steerAngle += (steerTarget - steerAngle) * Math.min(steerLerpSpeed * dt, 1);

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

      const baseAngularVelocity = (speed / wheelbase) * Math.tan(steerAngle);
      const dampedAngularVelocity = baseAngularVelocity * lowSpeedTurnFactor(speed);
      heading += dampedAngularVelocity * dt;

      rearAxle.x += speed * Math.sin(heading) * dt;
      rearAxle.z += speed * Math.cos(heading) * dt;
    } else {
      // HIGHWAY: no WASD input read here at all — auto-steer back toward
      // the road center, and let speed continuously chase a WPM/accuracy
      // derived target instead of jumping on each completed word.
      const centerPull = THREE.MathUtils.clamp(-rearAxle.x * steerCenteringGain, -maxAutoSteer, maxAutoSteer);
      heading += (centerPull - heading) * Math.min(autoSteerResponse * dt, 1);

      const wpmFactor = THREE.MathUtils.clamp(computeWpm() / highwayWpmForMaxSpeed, 0, 1);
      const targetSpeed = THREE.MathUtils.lerp(highwayMinSpeed, highwayMaxSpeed, wpmFactor) * computeAccuracy();
      speed += (targetSpeed - speed) * Math.min(highwaySpeedResponse * dt, 1);

      rearAxle.x += speed * Math.sin(heading) * dt;
      rearAxle.z += speed * Math.cos(heading) * dt;
    }

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