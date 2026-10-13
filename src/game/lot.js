// The depot lot: a level asphalt pad with painted bays beside the road at the south end of the city, and the depot building
// behind it. Every run starts in the second bay (lot.spawn). Terrain under it is graded flat by world.js (lotInfluence).
import * as THREE from 'three';
import { getRoadFrame } from './world.js';
import { toonGradientMap } from './toon.js';
import { LOT, LOT_SPAWN } from './lotLayout.js';
import { dayFactors } from './daycycle.js';

const SEG = 4;
const yawQuat = (h) => ({ x: 0, y: Math.sin(h / 2), z: 0, w: Math.cos(h / 2) });
const toon = (params) => new THREE.MeshToonMaterial({ gradientMap: toonGradientMap, ...params });

// a point `off` metres from the road centre towards the lot (same convention as cityLayout.js)
function sidePose(z, off) {
  const f = getRoadFrame(z);
  return { x: f.x + LOT.side * off * Math.cos(f.heading), z: z - LOT.side * off * Math.sin(f.heading), y: f.y, heading: f.heading };
}

function signTexture(text) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 200;
  const g = c.getContext('2d');
  g.fillStyle = '#23303a'; g.fillRect(0, 0, 1024, 200);
  g.strokeStyle = '#e8e2cf'; g.lineWidth = 10; g.strokeRect(8, 8, 1008, 184);
  g.fillStyle = '#f1ecd9'; g.font = 'bold 96px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 512, 104);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createLot(scene, physics, RAPIER) {
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const dummy = new THREE.Object3D();
  dummy.rotation.order = 'YXZ'; // yaw first, then pitch along the road's grade
  const put = (mesh, i, x, y, z, sx, sy, sz, heading, pitch) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(-pitch, heading, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  };
  const flatMat = (color) => toon({ color, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

  // 4 m pad segments, each pitched along the road's grade
  const nSeg = Math.round((LOT.z1 - LOT.z0) / SEG);
  const segs = [];
  for (let i = 0; i < nSeg; i++) {
    const za = LOT.z0 + i * SEG, zb = za + SEG, zc = (za + zb) / 2;
    segs.push({ zc, pitch: Math.atan2(getRoadFrame(zb).y - getRoadFrame(za).y, SEG) });
  }
  const pad = new THREE.InstancedMesh(unit, flatMat(0x45454b), nSeg);
  const padW = LOT.uMax - LOT.uMin;
  segs.forEach((s, i) => {
    const p = sidePose(s.zc, (LOT.uMin + LOT.uMax) / 2);
    put(pad, i, p.x, p.y + 0.01, p.z, padW, 0.07, SEG + 0.06, p.heading, s.pitch);
  });
  pad.receiveShadow = true;
  pad.frustumCulled = false;
  scene.add(pad);

  // painted bays
  const lines = new THREE.InstancedMesh(unit, flatMat(0xe8e8e8), LOT.bayColumns.length * nSeg + LOT.bayLines.length);
  let n = 0;
  for (const u of LOT.bayColumns) {
    for (const s of segs) {
      const p = sidePose(s.zc, u);
      put(lines, n++, p.x, p.y + 0.052, p.z, 0.14, 0.02, SEG + 0.02, p.heading, s.pitch);
    }
  }
  const midU = (LOT.bayColumns[0] + LOT.bayColumns[LOT.bayColumns.length - 1]) / 2;
  const spanU = LOT.bayColumns[LOT.bayColumns.length - 1] - LOT.bayColumns[0] + 0.14;
  for (const z of LOT.bayLines) {
    const p = sidePose(z, midU);
    const pitch = Math.atan2(getRoadFrame(z + 1).y - getRoadFrame(z - 1).y, 2);
    put(lines, n++, p.x, p.y + 0.052, p.z, spanU, 0.02, 0.14, p.heading, pitch);
  }
  lines.count = n;
  lines.instanceMatrix.needsUpdate = true;
  lines.frustumCulled = false;
  scene.add(lines);
  pad.instanceMatrix.needsUpdate = true;

  // depot building (visual group + one fixed collider); local +x points away from the road
  const DEPTH = LOT.depotMax - LOT.depotMin, LEN = 30, H = 6.5;
  const dz = (LOT.z0 + LOT.z1) / 2;
  const dp = sidePose(dz, (LOT.depotMin + LOT.depotMax) / 2);
  const depot = new THREE.Group();
  depot.position.set(dp.x, dp.y, dp.z);
  depot.rotation.y = dp.heading;
  const addBox = (w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    depot.add(m);
    return m;
  };
  addBox(DEPTH, H + 1.5, LEN, toon({ color: 0xb4b3a8 }), 0, H / 2 - 0.75, 0);
  addBox(DEPTH + 0.4, 0.3, LEN + 0.4, toon({ color: 0x6d6f73 }), 0, H + 0.1, 0);
  const doorMat = toon({ color: 0x4a5560 });
  for (const dzz of [-9, 0, 9]) addBox(0.12, 3.6, 5, doorMat, -DEPTH / 2 - 0.04, 1.8, dzz);
  const lampMat = toon({ color: 0x3b3b3b, emissive: 0xffd58a, emissiveIntensity: 0.1 });
  addBox(0.3, 0.2, 1.4, lampMat, -DEPTH / 2 - 0.2, 4.1, 4.5);
  addBox(0.3, 0.2, 1.4, lampMat, -DEPTH / 2 - 0.2, 4.1, -4.5);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.6), new THREE.MeshBasicMaterial({ map: signTexture('DEPOT 4  OUTBOUND') }));
  sign.position.set(-DEPTH / 2 - 0.08, 5.3, 0);
  sign.rotation.y = -Math.PI / 2; // face the road
  depot.add(sign);
  scene.add(depot);
  const body = physics.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(dp.x, dp.y + H / 2, dp.z).setRotation(yawQuat(dp.heading))
  );
  physics.createCollider(RAPIER.ColliderDesc.cuboid(DEPTH / 2, H / 2 + 1, LEN / 2).setFriction(0.4), body);

  const sp = sidePose(LOT_SPAWN.z, LOT_SPAWN.u);
  return {
    spawn: { x: sp.x, y: sp.y + 0.05, z: sp.z, heading: sp.heading },
    update(worldTime) { lampMat.emissiveIntensity = THREE.MathUtils.lerp(0.1, 2.0, dayFactors(worldTime).lamp); },
  };
}
