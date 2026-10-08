// Pure layout maths for the city zone (no three.js, so it can be unit-tested in plain node).
// Everything is generated once from a fixed seed: the city is the same every run, and the horror
// can later re-use or corrupt it on purpose.
import { CITY_Z_MIN, CITY_Z_MAX, CITY_BAY_WIDTH, CITY_WALK_WIDTH } from './zones.js';

export const STREETS = [-96, -32, 32];  // cross-street centres (z)
export const STREET_W = 10;
export const CURB = 0.16;
export const SEG_LEN = 4;               // sidewalk / bay segment length (m)

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// frameAt(z) -> { x, y, heading } of the road centre line. roadHalf = half width of the road.
export function generateCityLayout({ frameAt, roadHalf, seed = 20240501 }) {
  const rand = mulberry32(seed);
  const BAY_IN = roadHalf;
  const BAY_OUT = BAY_IN + CITY_BAY_WIDTH;
  const WALK_OUT = BAY_OUT + CITY_WALK_WIDTH;
  const BUILD_IN = WALK_OUT + 0.8;

  // a point `offset` metres to one side of the road centre (side +1 = +x / left when facing +z)
  const sidePose = (z, side, offset) => {
    const f = frameAt(z);
    return {
      x: f.x + side * offset * Math.cos(f.heading),
      z: z - side * offset * Math.sin(f.heading),
      y: f.y,
      heading: f.heading,
    };
  };

  // blocks sit between the cross streets
  const edges = [CITY_Z_MIN, ...STREETS.flatMap((s) => [s - STREET_W / 2, s + STREET_W / 2]), CITY_Z_MAX];
  const blocks = [];
  for (let i = 0; i < edges.length; i += 2) blocks.push([edges[i], edges[i + 1]]);

  const out = { buildings: [], cars: [], lamps: [], flats: [], blocks, BAY_IN, BAY_OUT, WALK_OUT, BUILD_IN };

  for (const [z0, z1] of blocks) {
    for (const side of [1, -1]) {
      // buildings along the frontage, with narrow alleys between them
      let z = z0 + 1;
      while (z < z1 - 8) {
        const w = Math.min(10 + rand() * 7, z1 - z - 1);
        if (w < 7) break;
        const d = 14 + rand() * 10;
        const h = 8 + Math.pow(rand(), 1.8) * 17; // mostly low-rise, a few taller landmarks
        const roofRoll = rand();
        const roof = h < 13 && roofRoll < 0.22 ? 3 : roofRoll < 0.38 ? 2 : roofRoll < 0.7 ? 1 : 0;
        const p = sidePose(z + w / 2, side, BUILD_IN + d / 2);
        out.buildings.push({
          x: p.x, y: p.y, z: p.z, w, d, h, heading: p.heading,
          tone: Math.floor(rand() * 8), roof, side,
        });
        z += w + 2.4; // alley: wide enough that the road's curve can't push neighbours into each other
      }

      // parked cars in the bay
      for (let cz = z0 + 4; cz < z1 - 4; cz += 6.5 + rand() * 5) {
        if (rand() < 0.4) continue;
        const p = sidePose(cz, side, BAY_IN + CITY_BAY_WIDTH / 2);
        out.cars.push({
          x: p.x, y: p.y, z: p.z, heading: p.heading,
          tone: Math.floor(rand() * 7), style: Math.floor(rand() * 3),
        });
      }

      // streetlights on the sidewalk, every 24 m
      for (let lz = z0 + 6; lz < z1 - 3; lz += 24) {
        const p = sidePose(lz, side, BAY_OUT + 0.6);
        out.lamps.push({ x: p.x, y: p.y + CURB, z: p.z, heading: p.heading, side });
      }

      // paved strips: bay (road-level asphalt) and sidewalk (raised), as short pitched segments
      for (let zs = z0; zs < z1 - 0.01; zs += SEG_LEN) {
        const za = zs, zb = Math.min(zs + SEG_LEN, z1), len = zb - za, zc = (za + zb) / 2;
        const ya = frameAt(za).y, yb = frameAt(zb).y;
        const pitch = Math.atan2(yb - ya, len);
        const bay = sidePose(zc, side, BAY_IN + CITY_BAY_WIDTH / 2);
        out.flats.push({ kind: 'bay', x: bay.x, y: bay.y, z: bay.z, sx: CITY_BAY_WIDTH, sy: 0.07, sz: len + 0.06, heading: bay.heading, pitch });
        const walk = sidePose(zc, side, BAY_OUT + CITY_WALK_WIDTH / 2);
        out.flats.push({ kind: 'walk', x: walk.x, y: walk.y + CURB - 0.17, z: walk.z, sx: CITY_WALK_WIDTH, sy: 0.34, sz: len + 0.06, heading: walk.heading, pitch });
        const curb = sidePose(zc, side, BAY_OUT);
        out.flats.push({ kind: 'curb', x: curb.x, y: curb.y + CURB / 2, z: curb.z, sx: 0.18, sy: CURB, sz: len + 0.06, heading: curb.heading, pitch });
        if (zs > z0) {
          const joint = sidePose(zs, side, BAY_OUT + CITY_WALK_WIDTH / 2);
          out.flats.push({ kind: 'joint', x: joint.x, y: joint.y + CURB + 0.006, z: joint.z, sx: CITY_WALK_WIDTH, sy: 0.012, sz: 0.035, heading: joint.heading, pitch: 0 });
        }
      }
    }
  }

  // cross streets (+ zebra crossings on the main road either side of each junction)
  for (const s of STREETS) {
    const f = frameAt(s);
    const pitch = Math.atan2(frameAt(s + STREET_W / 2).y - frameAt(s - STREET_W / 2).y, STREET_W);
    out.flats.push({ kind: 'street', x: f.x, y: f.y + 0.02, z: s, sx: 140, sy: 0.07, sz: STREET_W, heading: 0, pitch });
    for (const dz of [-(STREET_W / 2 + 1.6), STREET_W / 2 + 1.6]) {
      for (let ox = -3.5; ox <= 3.5; ox += 1) {
        const p = sidePose(s + dz, 1, ox);
        out.flats.push({ kind: 'zebra', x: p.x, y: p.y + 0.04, z: p.z, sx: 0.5, sy: 0.02, sz: 2.4, heading: p.heading, pitch: 0 });
      }
    }
  }
  return out;
}
