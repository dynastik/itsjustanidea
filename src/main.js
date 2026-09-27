import * as THREE from 'three';
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
  document.body.appendChild(renderer.domElement);

  const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
  sunLight.position.set(5, 10, 5);
  scene.add(sunLight);
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));

  const groundGeo = new THREE.PlaneGeometry(200, 200);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x4a7c3a });
  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.rotation.x = -Math.PI / 2;
  scene.add(groundMesh);

  const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(RAPIER.ColliderDesc.cuboid(100, 0.1, 100), groundBody);

  const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
  const cubeMat = new THREE.MeshStandardMaterial({ color: 0xff4444 });
  const cubeMesh = new THREE.Mesh(cubeGeo, cubeMat);
  scene.add(cubeMesh);

  const cubeBodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0, 1, 0)
    .lockRotations()
    .setLinearDamping(1.5);
  const cubeBody = world.createRigidBody(cubeBodyDesc);
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5), cubeBody);

  // ===================== MODE SYSTEM =====================
  let mode = 'city'; // 'city' or 'highway'
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
  let highwayForce = 0; // decays over time, refilled by correct words
  const highwayMaxSpeed = 20; // faster than city, it's a highway
  const highwayBoost = 30; // force applied on word completion
  const highwayDamping = 0.6; // how fast the boost fades (per second, roughly)

  function pickNewWord() {
    targetWord = wordBank[Math.floor(Math.random() * wordBank.length)];
    typedBuffer = '';
    updateTypingUI();
  }

  function updateTypingUI() {
    // render target word with typed portion highlighted vs remaining
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

    // mode switch always active
    if (key === 'm') {
      setMode(mode === 'city' ? 'highway' : 'city');
      return;
    }

    if (mode === 'city') {
      if (key in keys) keys[key] = true;
      return;
    }

    if (mode === 'highway') {
      if (key.length !== 1 || !/[a-z]/.test(key)) return; // ignore non-letter keys
      if (!typingStartTime) typingStartTime = performance.now();

      const expectedChar = targetWord[typedBuffer.length];
      keystrokesTotal++;
      if (key === expectedChar) {
        keystrokesCorrect++;
        typedBuffer += key;
      }
      // wrong key: counted against accuracy, buffer does NOT advance (must retype correctly)

      if (typedBuffer === targetWord) {
        wordsCompleted++;
        highwayForce = highwayBoost; // apply a burst of forward force
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
      cubeBody.resetForces(true);
      cubeBody.addForce({ x: forceX, y: 0, z: forceZ }, true);
      clampSpeed(maxSpeed);
    } else {
      // highway mode: straight line, force comes from typing bursts that decay
      cubeBody.resetForces(true);
      const forceZ = Math.cos(heading) * highwayForce;
      const forceX = Math.sin(heading) * highwayForce;
      cubeBody.addForce({ x: forceX, y: 0, z: forceZ }, true);
      highwayForce = Math.max(0, highwayForce - highwayForce * highwayDamping * dt);
      clampSpeed(highwayMaxSpeed);
    }

    const halfAngle = heading / 2;
    cubeBody.setRotation(
      { x: 0, y: Math.sin(halfAngle), z: 0, w: Math.cos(halfAngle) },
      true
    );

    world.step();

    const pos = cubeBody.translation();
    const rot = cubeBody.rotation();
    cubeMesh.position.set(pos.x, pos.y, pos.z);
    cubeMesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);

    const camOffset = new THREE.Vector3(
      -Math.sin(heading) * 6,
      3,
      -Math.cos(heading) * 6
    );
    camera.position.set(
      cubeMesh.position.x + camOffset.x,
      cubeMesh.position.y + camOffset.y,
      cubeMesh.position.z + camOffset.z
    );
    camera.lookAt(cubeMesh.position);

    renderer.render(scene, camera);
  }

  function clampSpeed(cap) {
    const vel = cubeBody.linvel();
    const horizSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    if (horizSpeed > cap) {
      const scale = cap / horizSpeed;
      cubeBody.setLinvel({ x: vel.x * scale, y: vel.y, z: vel.z * scale }, true);
    }
  }

  animate();
}

main();