// The return road: pure geometry (no three.js). The ground highway used to run +z forever; now it ends at GROUND_END_Z and this road
// carries on from there: straight on, then three right-hand bends (R = RETURN.radius) back round to the WEST end of the elevated deck,
// where it joins the stub heading east. The van therefore laps: deck -> hill arc -> ground road -> return road -> deck ... and can
// take the exit ramp (x = -105) on any lap, with no teleport.
//
//   start (ground road end, heading +z) --lead--> bend --west--> bend --north--> bend --tail--> deck west end (heading +x)
//
// layout: createHighwayLayout() result (needs groundX, groundY, baseY).
import { HW, GROUND_END_Z } from './highwayLayout.js';

export const RETURN = {
  radius: 150,   // bend radius (the same as the hill arc, so the speed a typist can carry is the same)
  lead: 120,     // straight run south after the ground road ends (raise it to make the lap longer: the north run grows with it)
  tail: 40,      // straight lead-in to the deck's west end
};

const HALF_PI = Math.PI / 2;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth01 = (t) => t * t * (3 - 2 * t);
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function createReturnRoad(layout) {
  const R = RETURN.radius, Lz = RETURN.lead, Le = RETURN.tail;
  const Z0 = GROUND_END_Z, X0 = layout.groundX(Z0);
  const endX = HW.westX, endZ = HW.z;
  const Lw = X0 - R + Le - endX;   // west run
  const Ln = Z0 + Lz - R - endZ;   // north run
  if (Lw < 0 || Ln < 0) throw new Error(`returnRoad: radius/lead do not fit (west ${Lw.toFixed(1)}, north ${Ln.toFixed(1)})`);

  // Build the centre line with a "turtle": heading h = atan2(dx, dz) (0 = +z, -PI/2 = -x). Right turns decrease h.
  const pieces = [];
  let x = X0, z = Z0, h = 0, s = 0;
  const line = (len) => {
    const x1 = x + Math.sin(h) * len, z1 = z + Math.cos(h) * len;
    pieces.push({ kind: 'line', x0: x, z0: z, x1, z1, s0: s, len, h });
    x = x1; z = z1; s += len;
  };
  const turnRight = () => {
    const cx = x - Math.cos(h) * R, cz = z + Math.sin(h) * R; // centre = point + right * R, right = (-cos h, sin h)
    const h1 = h - HALF_PI;
    pieces.push({ kind: 'arc', cx, cz, h0: h, h1, s0: s, len: R * HALF_PI });
    x = cx + Math.cos(h1) * R; z = cz - Math.sin(h1) * R; h = h1; s += R * HALF_PI;
  };
  line(Lz); turnRight(); line(Lw); turnRight(); line(Ln); turnRight(); line(Le);
  const total = s;
  if (Math.hypot(x - endX, z - endZ) > 0.5) console.warn('[returnRoad] does not land on the deck end:', x, z, endX, endZ);

  const yStart = layout.groundY(Z0), yEnd = layout.baseY;
  const yAt = (sv) => yStart + (yEnd - yStart) * smooth01(clamp01(sv / total));

  function pointAt(sv) {
    sv = Math.min(total, Math.max(0, sv));
    let p = pieces[pieces.length - 1];
    for (const q of pieces) if (sv <= q.s0 + q.len) { p = q; break; }
    const u = sv - p.s0;
    if (p.kind === 'line') {
      const t = u / p.len;
      return { x: p.x0 + (p.x1 - p.x0) * t, z: p.z0 + (p.z1 - p.z0) * t, y: yAt(sv), heading: p.h };
    }
    const hh = p.h0 - u / R;
    return { x: p.cx + Math.cos(hh) * R, z: p.cz - Math.sin(hh) * R, y: yAt(sv), heading: hh };
  }

  function sample(step = 5) {
    const pts = [];
    for (let sv = 0; sv < total; sv += step) pts.push(pointAt(sv));
    pts.push(pointAt(total));
    return pts;
  }

  // bounding box (with a margin for the bends) so most terrain samples reject in four comparisons
  let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
  for (const p of sample(20)) { bx0 = Math.min(bx0, p.x); bx1 = Math.max(bx1, p.x); bz0 = Math.min(bz0, p.z); bz1 = Math.max(bz1, p.z); }

  // Same contract as highwayLayout's corridor(): distance to the centre line, terrain-level road height there, weight.
  function corridor(px, pz, reach, out) {
    if (px < bx0 - reach || px > bx1 + reach || pz < bz0 - reach || pz > bz1 + reach) return false;
    let bestD = Infinity, bestS = 0;
    for (const p of pieces) {
      let d, sv;
      if (p.kind === 'line') {
        const dx = p.x1 - p.x0, dz = p.z1 - p.z0;
        const t = clamp01(((px - p.x0) * dx + (pz - p.z0) * dz) / (dx * dx + dz * dz));
        d = Math.hypot(px - (p.x0 + dx * t), pz - (p.z0 + dz * t));
        sv = p.s0 + t * p.len;
      } else {
        const vx = px - p.cx, vz = pz - p.cz;
        const delta = wrapPi(p.h0 - Math.atan2(-vz, vx)); // how far round the bend (0..PI/2) the point's bearing is
        if (delta >= 0 && delta <= HALF_PI) {
          d = Math.abs(Math.hypot(vx, vz) - R);
          sv = p.s0 + delta * R;
        } else {
          const d0 = Math.hypot(px - (p.cx + Math.cos(p.h0) * R), pz - (p.cz - Math.sin(p.h0) * R));
          const d1 = Math.hypot(px - (p.cx + Math.cos(p.h1) * R), pz - (p.cz - Math.sin(p.h1) * R));
          if (d0 < d1) { d = d0; sv = p.s0; } else { d = d1; sv = p.s0 + p.len; }
        }
      }
      if (d < bestD) { bestD = d; bestS = sv; }
    }
    if (bestD >= reach) return false;
    out.d = bestD; out.y = yAt(bestS); out.w = 1;
    return true;
  }

  const tmp = { d: 0, y: 0, w: 0 };
  return {
    startZ: Z0, startX: X0, total, sample, pointAt, corridor,
    onRoad: (px, pz, halfWidth = 5.6) => corridor(px, pz, halfWidth, tmp),
  };
}
