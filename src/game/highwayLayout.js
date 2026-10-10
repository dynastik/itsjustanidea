// Pure layout maths for the cross-highway (no three.js, so scripts/check-highway.mjs can test it in plain node).
//
// Plan view (x -> right, z -> down; the city road runs down the left, the on-ramp joins from the city side):
//
//   west stub  <--  elevated deck  ------------------>  slow descent  --.   hill arc (R)
//   (short, ends in a barrier)      ^ ramp merges here                    \  descends to ground level
//                                                                          |
//                                                                          v   ground road, runs +z forever
//                                                                              (props / trees / signs, all z-indexed)
//
//  1. West stub:    deck height, from westX to the merge. Ends at a barrier (the "other plans" end).
//  2. Deck:         flat at deck height to descentFromX, then eases down `descent` metres towards the hill. The ground
//                   under the deck is kept low (pillars) until clearFromX, then rises to meet the road: the road "gets onto" the hill.
//  3. Hill arc:     a quarter circle (centre ARC_CENTER, radius R) round a big Gaussian hill, descending to ground level.
//  4. Ground road:  from GROUND_START_Z the road is a function of z again (same gentle wiggle as the old road), so the
//                   z-indexed systems (props.js, trees.js, signs.js, the terrain road strip) keep working unchanged.
//
// All "y" values here are TERRAIN-LEVEL (the road surface the ground is graded to). The ribbon mesh sits RIBBON_LIFT above.

const HALF_PI = Math.PI / 2;
const smooth = (x, a, b) => {
  if (x <= a) return 0;
  if (x >= b) return 1;
  const t = (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

export const HW = {
  z: 170,              // the straight deck runs along x at this z
  westX: -120,         // west end of the deck (a barrier closes it). Only a stub: the merge is at x ~ 95-190
  deckRise: 4.5,       // deck height above the city road end
  descentFromX: 200,   // the deck is dead flat until here (the ramp merges onto it before this)
  hillX: 420,          // the arc starts here
  descent: 2.0,        // metres the deck loses between descentFromX and hillX
  clearFromX: 330,     // ground under the deck starts rising here to meet the road at hillX
  radius: 150,         // hill arc radius
  hillHeight: 30,      // peak of the big hill the arc wraps round
  hillSigma: 115,
  groundRamp: 120,     // metres over which the ground road eases into its z-based wiggle
};
export const RIBBON_LIFT = 0.035;                       // ribbon sits this far above the graded terrain
export const GROUND_START_Z = HW.z + HW.radius;         // 320: first z where the road is z-indexed again (multiple of 2.5 on purpose)
export const GROUND_X = HW.hillX + HW.radius;           // 570
export const ARC_CENTER = { x: HW.hillX, z: HW.z + HW.radius };
export const ARC_LENGTH = HALF_PI * HW.radius;

// roadCenterX / roadHeight: the old z-based road functions (world.js), reused for the ground road's wiggle.
export function createHighwayLayout({ startY, roadCenterX, roadHeight }) {
  const deckY = startY + HW.deckRise;
  const baseY = startY + 0.08;                 // ground level under the deck / where the road ends up
  const hillRoadY = deckY - HW.descent;        // road height where it reaches the hill
  const ZE = GROUND_START_Z;
  const CX = ARC_CENTER.x, CZ = ARC_CENTER.z, R = HW.radius;

  const centerY = (x) => deckY - HW.descent * smooth(x, HW.descentFromX, HW.hillX);
  // terrain target under the straight part: low (pillars) until clearFromX, then rises to meet the road
  const underY = (x) => baseY + (centerY(x) - baseY) * smooth(x, HW.clearFromX, HW.hillX);
  const arcY = (a) => hillRoadY + (baseY - hillRoadY) * smooth(a / HALF_PI, 0, 1);
  const arcPoint = (a) => ({ x: CX + R * Math.sin(a), z: CZ - R * Math.cos(a) });
  const arcHeading = (a) => HALF_PI - a;       // heading = atan2(dx, dz): +x is PI/2, +z is 0

  const groundRamp = (z) => smooth(z, ZE, ZE + HW.groundRamp);
  const groundX = (z) => GROUND_X + groundRamp(z) * (roadCenterX(z) - roadCenterX(ZE));
  const groundY = (z) => baseY + groundRamp(z) * (roadHeight(z) - roadHeight(ZE));
  function groundFrame(z) {
    const dz = 0.5;
    const dx = (groundX(z + dz) - groundX(z - dz)) / (2 * dz);
    return { x: groundX(z), heading: Math.atan2(dx, 1), y: groundY(z) };
  }

  // The big hill the arc wraps round (added to the natural terrain in world.js).
  const s2 = HW.hillSigma * HW.hillSigma;
  function hillBump(x, z) {
    const dx = x - CX, dz = z - CZ;
    const r2 = dx * dx + dz * dz;
    if (r2 > 16 * s2) return 0;
    return HW.hillHeight * Math.exp(-r2 / s2);
  }

  // Which highway corridor (if any) is within `reach` of (x, z)? Fills out = { d: distance to the road centre line,
  // y: terrain-level road height there, w: 0..1 weight }. The three pieces never overlap (they split on x / z), and
  // they agree on d and y along their shared edges (x = hillX, z = ZE), so the graded terrain has no seams.
  function corridor(x, z, reach, out) {
    if (x < HW.hillX) {                                   // west stub + straight deck
      const d = Math.abs(z - HW.z);
      if (d >= reach) return false;
      const w = smooth(x, HW.westX - 40, HW.westX);       // the grading fades out past the barrier
      if (w <= 0) return false;
      out.d = d; out.y = underY(x); out.w = w;
      return true;
    }
    if (z >= ZE) {                                        // ground road
      const d = Math.abs(x - groundX(z));
      if (d >= reach) return false;
      out.d = d; out.y = groundY(z); out.w = 1;
      return true;
    }
    const vx = x - CX, vz = z - CZ;                       // hill arc: quadrant x >= CX, z < CZ, angle a in [0, PI/2]
    const d = Math.abs(Math.hypot(vx, vz) - R);
    if (d >= reach) return false;
    out.d = d; out.y = arcY(Math.atan2(vx, -vz)); out.w = 1;
    return true;
  }

  // Centre line of the highway ribbon, terrain-level y: west end -> straight -> arc end. Points are <= ~5 m apart.
  function sampleCenterline({ step = 5, arcSteps = 64 } = {}) {
    const pts = [];
    for (let x = HW.westX; x < HW.hillX - 1e-6; x += step) pts.push({ x, y: centerY(x), z: HW.z });
    for (let i = 0; i <= arcSteps; i++) {
      const a = (i / arcSteps) * HALF_PI;
      const p = arcPoint(a);
      pts.push({ x: p.x, y: arcY(a), z: p.z });
    }
    return pts;
  }

  return {
    deckY, baseY, hillRoadY,
    centerY, underY, arcY, arcPoint, arcHeading,
    groundX, groundY, groundFrame,
    hillBump, corridor, sampleCenterline,
  };
}
