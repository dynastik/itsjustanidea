// Fresh deterministic city masterplan for itsjustanidea.
// Road-first layout: the playable spine and cloverleaf exclusion envelope are authored before
// buildings, parking, pavements and junctions, so scenery cannot occupy the road footprint.
import { CITY_Z_MIN, CITY_Z_MAX, CITY_BAY_WIDTH, CITY_WALK_WIDTH } from './zones.js';

export const STREET_W = 12;
export const CURB = 0.18;
export const SEG_LEN = 4;
export const STREETS = [-132, -84, -36, 12, 60, 108, 156, 204];

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function generateCityLayout({ frameAt, roadHalf, seed = 20261013 }) {
  const rand = mulberry32(seed);
  const BAY_IN = roadHalf;
  const BAY_OUT = BAY_IN + CITY_BAY_WIDTH;
  const WALK_OUT = BAY_OUT + CITY_WALK_WIDTH;
  const BUILD_IN = WALK_OUT + 1.2;
  // Keep the full interchange footprint clear; the four loops and their merge tangents need room.
  const inInterchangeClearance = (z) => z > 52 && z < 238;
  const sidePose = (z, side, offset) => {
    const f = frameAt(z);
    return {
      x: f.x + side * offset * Math.cos(f.heading),
      z: z - side * offset * Math.sin(f.heading),
      y: f.y,
      heading: f.heading,
    };
  };
  const edges = [CITY_Z_MIN, ...STREETS.flatMap((s) => [s - STREET_W / 2, s + STREET_W / 2]), CITY_Z_MAX];
  const blocks = [];
  for (let i = 0; i < edges.length - 1; i++) {
    if (edges[i + 1] - edges[i] > 2) blocks.push([edges[i], edges[i + 1]]);
  }
  const out = {
    buildings: [], cars: [], lamps: [], flats: [], blocks,
    BAY_IN, BAY_OUT, WALK_OUT, BUILD_IN,
  };

  for (const [z0, z1] of blocks) {
    for (const side of [-1, 1]) {
      // Buildings form compact blocks with alleys, varied rooflines, and a few taller landmarks.
      let z = z0 + 2;
      while (z < z1 - 7) {
        const w = Math.min(8 + rand() * 9, z1 - z - 1);
        if (w < 6) break;
        const d = 12 + rand() * 12;
        const h = 7 + Math.pow(rand(), 1.45) * 25;
        const roll = rand();
        const roof = h < 14 && roll < 0.2 ? 3 : roll < 0.38 ? 2 : roll < 0.7 ? 1 : 0;
        const p = sidePose(z + w / 2, side, BUILD_IN + d / 2);
        if (!inInterchangeClearance(p.z)) {
          out.buildings.push({
            x: p.x, y: p.y, z: p.z, w, d, h,
            heading: p.heading, tone: Math.floor(rand() * 8), roof, side,
          });
        }
        z += w + 2.5 + rand() * 1.5;
      }

      for (let z = z0 + 5; z < z1 - 4; z += 7 + rand() * 4) {
        if (rand() < 0.34 || inInterchangeClearance(z)) continue;
        const p = sidePose(z, side, BAY_IN + CITY_BAY_WIDTH / 2);
        out.cars.push({ x: p.x, y: p.y, z: p.z, heading: p.heading, tone: Math.floor(rand() * 7), style: Math.floor(rand() * 3) });
      }

      for (let z = z0 + 8; z < z1 - 4; z += 22) {
        if (inInterchangeClearance(z)) continue;
        const p = sidePose(z, side, BAY_OUT + 0.7);
        out.lamps.push({ x: p.x, y: p.y + CURB, z: p.z, heading: p.heading, side });
      }

      for (let z = z0; z < z1 - 0.01; z += SEG_LEN) {
        const end = Math.min(z + SEG_LEN, z1);
        const len = end - z;
        const mid = (z + end) / 2;
        if (inInterchangeClearance(mid)) continue;
        const ya = frameAt(z).y, yb = frameAt(end).y;
        const pitch = Math.atan2(yb - ya, len);
        const bay = sidePose(mid, side, BAY_IN + CITY_BAY_WIDTH / 2);
        out.flats.push({ kind: 'bay', x: bay.x, y: bay.y, z: bay.z, sx: CITY_BAY_WIDTH, sy: 0.07, sz: len + 0.06, heading: bay.heading, pitch });
        const walk = sidePose(mid, side, BAY_OUT + CITY_WALK_WIDTH / 2);
        out.flats.push({ kind: 'walk', x: walk.x, y: walk.y + CURB - 0.17, z: walk.z, sx: CITY_WALK_WIDTH, sy: 0.34, sz: len + 0.06, heading: walk.heading, pitch });
        const curb = sidePose(mid, side, BAY_OUT);
        out.flats.push({ kind: 'curb', x: curb.x, y: curb.y + CURB / 2, z: curb.z, sx: 0.18, sy: CURB, sz: len + 0.06, heading: curb.heading, pitch });
        if (z > z0) {
          const joint = sidePose(z, side, BAY_OUT + CITY_WALK_WIDTH / 2);
          out.flats.push({ kind: 'joint', x: joint.x, y: joint.y + CURB + 0.006, z: joint.z, sx: CITY_WALK_WIDTH, sy: 0.012, sz: 0.035, heading: joint.heading, pitch: 0 });
        }
      }
    }
  }

  // Full-width cross streets, marked junctions and zebra crossings. The interchange envelope
  // is intentionally left to the grade-separated road geometry instead of being paved over.
  for (const z of STREETS) {
    if (inInterchangeClearance(z)) continue;
    const f = frameAt(z);
    const pitch = Math.atan2(frameAt(z + STREET_W / 2).y - frameAt(z - STREET_W / 2).y, STREET_W);
    out.flats.push({ kind: 'street', x: f.x, y: f.y + 0.02, z, sx: 160, sy: 0.07, sz: STREET_W, heading: 0, pitch });
    for (const dz of [-(STREET_W / 2 + 1.8), STREET_W / 2 + 1.8]) {
      for (let ox = -4; ox <= 4; ox += 0.8) {
        const p = sidePose(z + dz, 1, ox);
        out.flats.push({ kind: 'zebra', x: p.x, y: p.y + 0.045, z: p.z, sx: 0.42, sy: 0.02, sz: 2.5, heading: p.heading, pitch: 0 });
      }
    }
  }
  return out;
}
