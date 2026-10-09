import * as THREE from 'three';
import { ROAD_HALF_WIDTH, getRoadFrame, terrainHeight } from './world.js';
import { toonGradientMap } from './toon.js';

// Highway-zone roadside props. Instanced visuals recycled around the vehicle; guardrails also get
// real colliders, but only for the stretch near the vehicle.
const SEG = 10;                    // metres per guardrail segment
const SLOTS = 64;                  // segments kept alive per side (SEG * SLOTS = 640 m)
const COLLIDER_RANGE = 80;
const START_Z = 90;                // props begin where the highway does
const RAIL_OFFSET = ROAD_HALF_WIDTH + 1.6;
const MARK_STEP = 200;
const MARK_SLOTS = 6;

const yawQuat = (h) => ({ x: 0, y: Math.sin(h / 2), z: 0, w: Math.cos(h / 2) });

// A point `offset` metres to one side of the road centre (side +1 = +x / left when facing +z).
function sidePose(z, side, offset) {
  const f = getRoadFrame(z);
  const h = f.heading;
  return { x: f.x + side * offset * Math.cos(h), z: z - side * offset * Math.sin(h), heading: h };
}

export function createProps(scene, physics, RAPIER) {
  const railMat = new THREE.MeshToonMaterial({ color: 0xb9bec5, gradientMap: toonGradientMap });
  const postMat = new THREE.MeshToonMaterial({ color: 0x6b6f75, gradientMap: toonGradientMap });
  const signMat = new THREE.MeshToonMaterial({ color: 0x1f7a3a, gradientMap: toonGradientMap });

  const rails = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.3, SEG), railMat, SLOTS * 2);
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.8, 0.1), postMat, SLOTS * 2);
  const plates = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.7, 0.05), signMat, MARK_SLOTS);
  const markPosts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 2.2, 0.08), postMat, MARK_SLOTS);

  // Story landmarks are revealed by the corresponding typed narration, not visible from the start.
  // These are full overhead highway gantries, with the supports outside the driving lane.
  function makeTownSignTexture(distance, faded = false) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = faded ? '#24583a' : '#1f7041';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = faded ? '#c7c1a4' : '#f0ead7';
    ctx.lineWidth = 14;
    ctx.strokeRect(9, 9, canvas.width - 18, canvas.height - 18);
    ctx.fillStyle = '#f7f2df';
    ctx.textAlign = 'center';
    ctx.font = 'bold 48px monospace';
    ctx.fillText('WELCOME TO', 512, 83);
    ctx.font = 'bold 76px monospace';
    ctx.fillText('BELLWEATHER', 512, 173);
    ctx.font = 'bold 42px monospace';
    ctx.fillText(distance, 512, 247);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
  const storySigns = [
    { z: 230, distance: '12 MILES', faded: false },
    { z: 370, distance: '12 MILES', faded: true },
  ].map(({ z, distance, faded }) => {
    const frame = getRoadFrame(z);
    const group = new THREE.Group();
    group.position.set(frame.x, frame.y, z);
    group.rotation.y = frame.heading;

    const roadSpan = ROAD_HALF_WIDTH + 1.35;
    const supportHeight = 6.6;
    // The two legs sit beyond the road edges, so neither the supports nor the crossbar obscure the lettering.
    for (const x of [-roadSpan, roadSpan]) {
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.2, supportHeight, 0.2), postMat);
      pole.position.set(x, supportHeight / 2, 0);
      group.add(pole);
    }
    const crossbar = new THREE.Mesh(
      new THREE.BoxGeometry(roadSpan * 2 + 0.35, 0.22, 0.22),
      postMat
    );
    crossbar.position.set(0, supportHeight - 0.05, 0);
    group.add(crossbar);

    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(roadSpan * 2 - 0.2, 2.15),
      new THREE.MeshBasicMaterial({ map: makeTownSignTexture(distance, faded), side: THREE.DoubleSide })
    );
    board.position.set(0, 5.15, 0.14);
    board.rotation.y = Math.PI; // Face approaching traffic; otherwise the double-sided plane reads mirrored.
    group.add(board);
    group.visible = false;
    scene.add(group);
    return group;
  });
  function showStorySign(index = -1, aheadZ = null) {
    if (index >= 0 && Number.isFinite(aheadZ)) {
      const frame = getRoadFrame(aheadZ);
      storySigns[index].position.set(frame.x, frame.y, aheadZ);
      storySigns[index].rotation.y = frame.heading;
    }
    storySigns.forEach((sign, i) => { sign.visible = i === index; });
  }
  for (const m of [rails, posts, plates, markPosts]) {
    m.frustumCulled = false; // instances move; the cached bounding sphere would cull them
    scene.add(m);
  }

  const dummy = new THREE.Object3D();
  function put(mesh, i, x, y, z, heading) {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, heading, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }

  const hide = (mesh, i) => put(mesh, i, 0, -1000, 0, 0);

  const slotK = new Int32Array(SLOTS).fill(-999999);
  const markK = new Int32Array(MARK_SLOTS).fill(-999999);

  function writeSegment(k, slot) {
    const zc = (k + 0.5) * SEG;
    for (const side of [-1, 1]) {
      const i = slot * 2 + (side < 0 ? 0 : 1);
      if (zc < START_Z) { hide(rails, i); hide(posts, i); continue; }
      const p = sidePose(zc, side, RAIL_OFFSET);
      put(rails, i, p.x, terrainHeight(p.x, p.z) + 0.6, p.z, p.heading);
      const ps = sidePose(zc - SEG / 2, side, RAIL_OFFSET);
      put(posts, i, ps.x, terrainHeight(ps.x, ps.z) + 0.4, ps.z, ps.heading);
    }
  }

  function writeMarker(m, slot) {
    const z = m * MARK_STEP;
    if (z < START_Z) { hide(plates, slot); hide(markPosts, slot); return; }
    const p = sidePose(z, -1, RAIL_OFFSET + 1.4); // right-hand side of the road
    const y = terrainHeight(p.x, p.z);
    put(markPosts, slot, p.x, y + 1.1, p.z, p.heading);
    put(plates, slot, p.x, y + 2.0, p.z, p.heading);
  }

  // colliders for nearby segments only
  const bodies = new Map();
  function addColliders(k) {
    const zc = (k + 0.5) * SEG;
    const list = [];
    if (zc >= START_Z) {
      for (const side of [-1, 1]) {
        const p = sidePose(zc, side, RAIL_OFFSET);
        const b = physics.createRigidBody(
          RAPIER.RigidBodyDesc.fixed()
            .setTranslation(p.x, terrainHeight(p.x, p.z) + 0.55, p.z)
            .setRotation(yawQuat(p.heading))
        );
        physics.createCollider(RAPIER.ColliderDesc.cuboid(0.12, 0.45, SEG / 2).setFriction(0.3).setRestitution(0.1), b);
        list.push(b);
      }
    }
    bodies.set(k, list);
  }

  function update(z) {
    const k0 = Math.floor(z / SEG);
    let dirty = false;
    for (let n = -SLOTS / 2; n < SLOTS / 2; n++) {
      const k = k0 + n;
      const slot = ((k % SLOTS) + SLOTS) % SLOTS;
      if (slotK[slot] !== k) { writeSegment(k, slot); slotK[slot] = k; dirty = true; }
    }
    const m0 = Math.floor(z / MARK_STEP);
    for (let n = -3; n < 3; n++) {
      const m = m0 + n;
      const slot = ((m % MARK_SLOTS) + MARK_SLOTS) % MARK_SLOTS;
      if (markK[slot] !== m) { writeMarker(m, slot); markK[slot] = m; dirty = true; }
    }
    if (dirty) for (const m of [rails, posts, plates, markPosts]) m.instanceMatrix.needsUpdate = true;

    const lo = k0 - COLLIDER_RANGE / SEG;
    const hi = k0 + COLLIDER_RANGE / SEG;
    for (let k = lo; k <= hi; k++) if (!bodies.has(k)) addColliders(k);
    for (const [k, list] of bodies) {
      if (k < lo || k > hi) {
        for (const b of list) physics.removeRigidBody(b);
        bodies.delete(k);
      }
    }
  }

  return { update, showStorySign };
}