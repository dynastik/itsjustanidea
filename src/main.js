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

  const groundGeo = new THREE.PlaneGeometry(50, 50);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x4a7c3a });
  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.rotation.x = -Math.PI / 2;
  scene.add(groundMesh);

  const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(RAPIER.ColliderDesc.cuboid(25, 0.1, 25), groundBody);

  // --- Cube: now representing our "car" ---
  const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
  const cubeMat = new THREE.MeshStandardMaterial({ color: 0xff4444 });
  const cubeMesh = new THREE.Mesh(cubeGeo, cubeMat);
  scene.add(cubeMesh);

  const cubeBodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0, 1, 0)
    .lockRotations(); // prevent it from tumbling over — we only want it to steer, not tip
  const cubeBody = world.createRigidBody(cubeBodyDesc);
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5), cubeBody);

  // --- Keyboard input tracking ---
  const keys = { w: false, a: false, s: false, d: false };
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() in keys) keys[e.key.toLowerCase()] = true;
  });
  window.addEventListener('keyup', (e) => {
    if (e.key.toLowerCase() in keys) keys[e.key.toLowerCase()] = false;
  });

  // --- Movement tuning ---
  let heading = 0; // which way the "car" is facing, in radians
  const turnSpeed = 2.0; // radians/sec
  const driveForce = 15; // how hard we push forward/back

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta(); // seconds since last frame, keeps movement frame-rate independent

    // --- Steering: A/D rotate heading, only while moving feels more car-like,
    // but let's keep it simple for now and allow turning any time ---
    if (keys.a) heading += turnSpeed * dt;
    if (keys.d) heading -= turnSpeed * dt;

    // --- Driving: W/S apply force along the current heading direction ---
    let forceMagnitude = 0;
    if (keys.w) forceMagnitude = driveForce;
    if (keys.s) forceMagnitude = -driveForce * 0.6; // reverse is weaker, like a real car

    const forceX = Math.sin(heading) * forceMagnitude;
    const forceZ = Math.cos(heading) * forceMagnitude;
    cubeBody.resetForces(true);
    cubeBody.addForce({ x: forceX, y: 0, z: forceZ }, true);

    // manually set rotation to match heading (since we locked physics rotation)
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

    // --- Camera follows behind the cube, chase-cam style ---
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
  animate();
}

main();