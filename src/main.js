import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

async function main() {
  // --- Rapier needs this before you can use anything from it ---
  await RAPIER.init();

  const gravity = { x: 0.0, y: -9.81, z: 0.0 };
  const world = new RAPIER.World(gravity);

  // --- Three.js basic setup ---
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);

  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(0, 3, 8);
  camera.lookAt(0, 1, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
  sunLight.position.set(5, 10, 5);
  scene.add(sunLight);
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));

  // --- Ground: visual mesh ---
  const groundGeo = new THREE.PlaneGeometry(50, 50);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x4a7c3a });
  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.rotation.x = -Math.PI / 2;
  scene.add(groundMesh);

  // --- Ground: physics body (fixed = doesn't move, infinite mass) ---
  const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const groundCollider = RAPIER.ColliderDesc.cuboid(25, 0.1, 25); // half-extents
  world.createCollider(groundCollider, groundBody);

  // --- Cube: visual mesh ---
  const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
  const cubeMat = new THREE.MeshStandardMaterial({ color: 0xff4444 });
  const cubeMesh = new THREE.Mesh(cubeGeo, cubeMat);
  scene.add(cubeMesh);

  // --- Cube: physics body (dynamic = affected by gravity/forces) ---
  const cubeBodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 5, 0); // start high, drop it
  const cubeBody = world.createRigidBody(cubeBodyDesc);
  const cubeCollider = RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5); // half-extents, matches BoxGeometry(1,1,1)
  world.createCollider(cubeCollider, cubeBody);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // --- Render + physics loop ---
  function animate() {
    requestAnimationFrame(animate);

    world.step(); // advance physics simulation by one frame

    // sync Three.js mesh position/rotation to Rapier body
    const pos = cubeBody.translation();
    const rot = cubeBody.rotation();
    cubeMesh.position.set(pos.x, pos.y, pos.z);
    cubeMesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);

    renderer.render(scene, camera);
  }
  animate();
}

main();