// Readable road signs beside the highway: the story coming true. What they say depends on how wrong the world is
// (story.getAct()), so the same road that read "NEXT EXIT 2 MILES" in the afternoon welcomes you to Bellweather
// twice, forever twelve miles away, and finally welcomes you home.
//
// A handful of sign slots is recycled around the vehicle (one canvas texture per slot, redrawn only when a slot gets
// a new sign), so this costs a few draw calls and no per-frame work beyond moving nothing.
import * as THREE from 'three';
import { ROAD_HALF_WIDTH, getRoadFrame, terrainHeight } from './world.js';
import { GROUND_START_Z } from './highwayLayout.js';

const STEP = 160;            // metres between signs
const SLOTS = 6;
const AHEAD = 4;             // signs kept ahead of the vehicle, the rest behind
const START_Z = GROUND_START_Z + 40; // signs line the ground highway (after the hill arc); none in the city or on the deck
const OFFSET = ROAD_HALF_WIDTH + 3.6;
const W = 256;
const H = 128;

const STYLES = {
  green: { bg: '#1f6b3a', fg: '#f4f4f4', border: '#f4f4f4' },
  white: { bg: '#ededed', fg: '#151515', border: '#151515' },
  brown: { bg: '#6b4423', fg: '#f4ead2', border: '#f4ead2' },
  wood: { bg: '#a9835a', fg: '#2c1b0c', border: '#5a3d22' },
  black: { bg: '#0b0b0d', fg: '#c92a2a', border: '#5a1515' },
};

// Cheap deterministic hash -> [0, 1)
function rnd(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const NORMAL = [
  { lines: ['NEXT EXIT', '2 MILES'], style: 'green' },
  { lines: ['SPEED LIMIT', '60'], style: 'white' },
  { lines: ['REST AREA', '1 MILE'], style: 'green' },
  { lines: ['SCENIC VIEW', 'AHEAD'], style: 'brown' },
  { lines: ['FRESH BREAD', 'NEXT RIGHT'], style: 'wood' },
  { lines: ['DRIVE', 'SAFELY'], style: 'green' },
];

// The repeating stretch (Act III): the first sign again, a newer one, the milestone that never gets closer.
const BELLWEATHER = [
  { lines: ['WELCOME TO', 'BELLWEATHER'], style: 'green' },
  { lines: ['BELLWEATHER', '12 MILES'], style: 'white' },
  { lines: ['WELCOME TO', 'BELLWEATHER'], style: 'brown' }, // "the lettering was different, the sign looked newer"
];

// Content of the k-th sign for a given act. Pure: same (k, act) -> same sign.
export function signContent(k, act) {
  switch (act) {
    case 'uneasy':
      return BELLWEATHER[((k % 3) + 3) % 3];
    case 'wrong':
      return k % 2 === 0 ? { lines: ['BELLWEATHER', '12 MILES'], style: 'white' } : BELLWEATHER[0];
    case 'horror': {
      const pool = [
        { lines: ['NO EXIT'], style: 'black' },
        { lines: ['BELLWEATHER', '12 MILES'], style: 'black' },
        { lines: ['END OF', 'THE ROAD'], style: 'black' },
      ];
      return pool[Math.floor(rnd(k) * pool.length)];
    }
    case 'finale':
      return k % 2 === 0 ? { lines: ['WELCOME', 'HOME'], style: 'green' } : { lines: ['DRIVE', 'SAFELY'], style: 'green' };
    default:
      return NORMAL[Math.floor(rnd(k) * NORMAL.length)];
  }
}

function paint(ctx, content) {
  const st = STYLES[content.style] || STYLES.green;
  ctx.fillStyle = st.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = st.border;
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, W - 16, H - 16);
  ctx.fillStyle = st.fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const n = content.lines.length;
  content.lines.forEach((line, i) => {
    const size = n === 1 ? 44 : i === 0 ? 30 : 38;
    ctx.font = `bold ${size}px monospace`;
    let s = size;
    while (ctx.measureText(line).width > W - 36 && s > 14) { s -= 2; ctx.font = `bold ${s}px monospace`; }
    ctx.fillText(line, W / 2, H / 2 + (i - (n - 1) / 2) * 42);
  });
}

export function createSigns(scene) {
  const boardGeo = new THREE.PlaneGeometry(3.2, 1.6);
  const postGeo = new THREE.BoxGeometry(0.12, 2.6, 0.12);
  const postMat = new THREE.MeshToonMaterial({ color: 0x6b6f75 });
  const slots = [];
  const slotK = new Int32Array(SLOTS).fill(-999999);
  let lastAct = null;

  for (let i = 0; i < SLOTS; i++) {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    const group = new THREE.Group();
    const board = new THREE.Mesh(boardGeo, material);
    board.position.y = 2.9;
    group.add(board);
    for (const x of [-1.2, 1.2]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(x, 1.3, -0.05);
      group.add(post);
    }
    group.visible = false;
    scene.add(group);
    slots.push({ group, canvas, ctx: canvas.getContext('2d'), texture, material });
  }

  function assign(k, slot, act) {
    const z = (k + 0.5) * STEP;
    const s = slots[slot];
    if (z < START_Z) { s.group.visible = false; return; }
    const f = getRoadFrame(z);
    const x = f.x - OFFSET * Math.cos(f.heading);       // right-hand side of the road
    const zz = z + OFFSET * Math.sin(f.heading);
    s.group.position.set(x, terrainHeight(x, zz), zz);
    s.group.rotation.y = f.heading + Math.PI;            // face the oncoming driver
    paint(s.ctx, signContent(k, act));
    s.texture.needsUpdate = true;
    s.group.visible = true;
  }

  // act: story.getAct(); night: 0..1 (signs dim a little in the dark, they are not lit)
  function update(vehicleZ, act, night) {
    // z barely changes on the deck, so signs painted for an earlier act would stay stale: repaint all slots when the act changes
    if (act !== lastAct) { slotK.fill(-999999); lastAct = act; }
    const k0 = Math.floor(vehicleZ / STEP);
    for (let n = -(SLOTS - AHEAD); n < AHEAD; n++) {
      const k = k0 + n;
      const slot = ((k % SLOTS) + SLOTS) % SLOTS;
      if (slotK[slot] !== k) { assign(k, slot, act); slotK[slot] = k; }
    }
    const shade = THREE.MathUtils.lerp(1, 0.55, night);
    for (const s of slots) s.material.color.setScalar(shade);
  }

  return { update };
}
