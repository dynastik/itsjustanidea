// Pure layout for the depot lot where every run starts (no three.js: shared by cityLayout.js, world.js terrain grading and lot.js).
// The lot sits beside the road at the south end of the city, on the left-hand side facing +z. Coordinates: u = metres from the road
// centre line towards the lot, z = along the road.
export const LOT = {
  side: 1,
  z0: -156, z1: -120,          // aligned to the city's 4 m segments
  uMin: 4.5, uMax: 22.5,       // asphalt pad
  depotMin: 23.5, depotMax: 32.5, // depot building footprint (behind the pad)
  fade: 6,                     // terrain blends back to the hills over this distance
  bayLines: [-152, -145.5, -139, -132.5, -126], // cross lines between parking bays
  bayColumns: [6.75, 10.25, 13.75, 17.25],      // lines running along the road
};
export const LOT_SPAWN = { u: 8.5, z: -142.25 }; // middle of the second bay in the first column

const smooth = (t) => t * t * (3 - 2 * t);
const _out = { k: 0, y: 0 };

// Terrain grading: inside the lot the ground is exactly the road's height at that z (so the pad is level across and follows the
// road's grade along it). Returns a shared object { k: 0..1 influence, y }.
export function lotInfluence(x, z, roadCenterX, roadHeight) {
  _out.k = 0;
  const F = LOT.fade;
  if (z < LOT.z0 - F || z > LOT.z1 + F) return _out;
  const u = (x - roadCenterX(z)) * LOT.side;
  const u0 = LOT.uMin - 0.5, u1 = LOT.depotMax + 2;
  if (u < u0 - F || u > u1 + F) return _out;
  const dz = Math.max(LOT.z0 - z, z - LOT.z1, 0);
  const du = Math.max(u0 - u, u - u1, 0);
  const k = 1 - Math.max(dz, du) / F;
  if (k <= 0) return _out;
  _out.k = smooth(Math.min(k, 1));
  _out.y = roadHeight(z);
  return _out;
}
