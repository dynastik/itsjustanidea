// Patcher for the existing game files (the highway loop). Run from the repo root:  node apply-patches.mjs
// Each edit replaces one exact string. A file is only written if EVERY edit in it matches exactly once (or is already applied),
// so a mismatch never leaves a half-patched file. Handles Windows (CRLF) line endings.
import fs from 'node:fs';

const EDITS = {
  // ---- the ground road ends at GROUND_END_Z; the return road takes over ----
  'src/game/highwayLayout.js': [
    ['export const GROUND_X = HW.hillX + HW.radius;',
     'export const GROUND_X = HW.hillX + HW.radius;\nexport const GROUND_END_Z = GROUND_START_Z + 80; // the z-indexed ground road ends here; returnRoad.js carries on'],
    ['if (z >= ZE) {',
     'if (z > GROUND_END_Z) return false;                   // past the end of the ground road (returnRoad.js has its own corridor)\n    if (z >= ZE) {'],
  ],
  'src/game/world.js': [
    ["import { createHighwayLayout, GROUND_START_Z } from './highwayLayout.js';",
     "import { createHighwayLayout, GROUND_START_Z, GROUND_END_Z } from './highwayLayout.js';\nimport { createReturnRoad } from './returnRoad.js';"],
    ['const layout = createHighwayLayout({ startY: roadHeight(CITY_Z_MAX), roadCenterX, roadHeight });',
     'const layout = createHighwayLayout({ startY: roadHeight(CITY_Z_MAX), roadCenterX, roadHeight });\nlayout.returnRoad = createReturnRoad(layout); // brings the highway back round to the west end of the deck'],
    ['  out.h = influence > 0 ? nat + (roadY - nat) * influence : nat;',
     '  if (layout.returnRoad.corridor(x, z, REACH, hwHit)) { // the return road is graded like the rest of the highway\n    if (hwHit.d < dist) dist = hwHit.d;\n    const k = 1 - sm(hwHit.d, FLAT_DIST, REACH);\n    if (k > influence) { influence = k; roadY = hwHit.y; }\n  }\n  out.h = influence > 0 ? nat + (roadY - nat) * influence : nat;'],
    ['    const vis = z <= CITY_Z_MAX || ground;',
     '    const vis = z <= CITY_Z_MAX || (ground && z <= GROUND_END_Z);'],
    ['    if (z >= GROUND_START_Z) return { offRoad: Math.abs(x - layout.groundX(z)) > ROAD_HALF_WIDTH + 0.3 };',
     '    if (z >= GROUND_START_Z) return { offRoad: Math.abs(x - layout.groundX(z)) > ROAD_HALF_WIDTH + 0.3 && !layout.returnRoad.onRoad(x, z) };'],
    ['    const path = interchange.drivePath;\n    if (z >= GROUND_START_Z) {\n      const f = getRoadFrame(z + dist);\n      return { x: f.x, y: f.y + 0.035, z: z + dist, heading: f.heading };\n    }',
     '    const path = interchange.ringPath; // the whole loop: ramp, deck, arc, ground road, return road, west stub'],
    ['drivePath: interchange.drivePath, exitPath: interchange.exitPath, groundStartZ: GROUND_START_Z, layout };',
     'drivePath: interchange.drivePath, exitPath: interchange.exitPath, ringPath: interchange.ringPath, groundStartZ: GROUND_START_Z, layout };'],
  ],
  'src/game/interchange.js': [
    // the west end of the deck is open: the return road arrives there
    ['  railPieces.push({ body: highway.body, x: highwaySamples[0].x + 0.25, y: highwaySamples[0].y + 0.65, z: highwayZ, yaw: 0, len: half * 2 + 0.4, th: 0.5, h: 1.3 });',
     '  // (the west end of the deck is open now: the return road, returnRoad.js, arrives there)'],
    // exit ramp: no guardrail on the city-road side of the final run, so it really merges
    ['    for (const edge of [exitLeft, exitRight]) {',
     '    for (const edge of [exitLeft, exitRight]) {\n      if (edge === exitLeft && edge[i].z < EXIT.joinZ - 2) continue; // open on the city-road side: that is where the ramp merges'],
    ['  // Is (x, z) on the ramp or the highway ribbon?',
`  // ---------- return road (returnRoad.js): the ground highway's end -> round to the west end of the deck ----------
  const rr = layout.returnRoad;
  const retPts = rr.sample(5).map((p) => V(p.x, p.y + RIBBON_LIFT + 0.012, p.z));
  const retSides = retPts.map((_, i) => sideOf(retPts, i));
  const retMesh = makeVisualRibbon(
    retPts.map((p, i) => p.clone().addScaledVector(retSides[i], -half)),
    retPts.map((p, i) => p.clone().addScaledVector(retSides[i], half))
  );
  retMesh.material.polygonOffsetFactor = -3;
  retMesh.material.polygonOffsetUnits = -3;
  // the whole loop, for the lane-follower: ramp -> deck -> arc -> ground road -> return road -> west stub -> (deck again)
  const groundPts = [];
  for (let gz = HW.z + HW.radius + 5; gz < rr.startZ; gz += 5) groundPts.push(V(layout.groundX(gz), layout.groundY(gz) + RIBBON_LIFT, gz));
  const ringPath = drivePath.concat(groundPts, retPts, highwaySamples.filter((p) => p.x <= taperEndX + 3).map((p) => p.clone()));

  // Is (x, z) on the ramp or the highway ribbon?`],
    ['  for (const p of exitCentres) roadXZ.push(p.x, p.z);',
     '  for (const p of exitCentres) roadXZ.push(p.x, p.z);\n  for (const p of retPts) roadXZ.push(p.x, p.z);'],
    ['    exitPath, drivePath, mergeStartX: P3[0],', '    ringPath, exitPath, drivePath, mergeStartX: P3[0],'],
  ],
  // ---- z-indexed scenery stops where the ground road ends ----
  'src/game/props.js': [
    ["import { GROUND_START_Z } from './highwayLayout.js';", "import { GROUND_START_Z, GROUND_END_Z } from './highwayLayout.js';"],
    ['if (zc < START_Z) { hide(rails, i); hide(posts, i); continue; }', 'if (zc < START_Z || zc > GROUND_END_Z) { hide(rails, i); hide(posts, i); continue; }'],
    ['if (z < START_Z) { hide(plates, slot); hide(markPosts, slot); return; }', 'if (z < START_Z || z > GROUND_END_Z) { hide(plates, slot); hide(markPosts, slot); return; }'],
    ['    if (zc >= START_Z) {', '    if (zc >= START_Z && zc <= GROUND_END_Z) {'],
  ],
  'src/game/trees.js': [
    ["import { GROUND_START_Z, GROUND_X } from './highwayLayout.js';", "import { GROUND_START_Z, GROUND_X, GROUND_END_Z } from './highwayLayout.js';"],
    ['if (z > CITY_Z_MIN - 20 && z < GROUND_START_Z + 10) return null;', 'if ((z > CITY_Z_MIN - 20 && z < GROUND_START_Z + 10) || z > GROUND_END_Z) return null;'],
  ],
  'src/game/signs.js': [
    ["import { GROUND_START_Z } from './highwayLayout.js';", "import { GROUND_START_Z, GROUND_END_Z } from './highwayLayout.js';"],
    ['if (z < START_Z) { s.group.visible = false; return; }', 'if (z < START_Z || z > GROUND_END_Z) { s.group.visible = false; return; }'],
  ],
  // ---- the lane-follower must cope with headings near +-PI (the return road's north run faces -z) ----
  'src/game/input.js': [
    ['      if (ds > 0.5) curvature = (Math.atan2(b.x - p.x, b.z - p.z) - Math.atan2(p.x - a.x, p.z - a.z)) / ds;',
     '      if (ds > 0.5) {\n        const dh = Math.atan2(b.x - p.x, b.z - p.z) - Math.atan2(p.x - a.x, p.z - a.z);\n        curvature = Math.atan2(Math.sin(dh), Math.cos(dh)) / ds;\n      }'],
    ['  const wDes = c.headingResponse * (desiredHeading - vehicle.heading) + curvature * Math.max(vehicle.speed, 0);',
     '  const headingErr = Math.atan2(Math.sin(desiredHeading - vehicle.heading), Math.cos(desiredHeading - vehicle.heading));\n  const wDes = c.headingResponse * headingErr + curvature * Math.max(vehicle.speed, 0);'],
  ],
};

let failed = false;
for (const [file, edits] of Object.entries(EDITS)) {
  if (!fs.existsSync(file)) { console.log(`MISSING  ${file} (run from the repo root)`); failed = true; continue; }
  const text = fs.readFileSync(file, 'utf8');
  const crlf = text.includes('\r\n');
  const fix = (s) => (crlf ? s.replace(/\n/g, '\r\n') : s);
  let next = text, applied = 0, skipped = 0, bad = null;
  for (const [oldS, newS] of edits) {
    const o = fix(oldS), n = fix(newS);
    if (next.includes(n)) { skipped++; continue; } // already applied (the new text usually contains the old)
    const count = next.split(o).length - 1;
    if (count === 1) { next = next.replace(o, () => n); applied++; }
    else { bad = `${count} matches for: ${oldS.split('\n')[0].trim()}`; break; }
  }
  if (bad) { console.log(`FAILED   ${file}: ${bad} (file left untouched)`); failed = true; continue; }
  if (applied) fs.writeFileSync(file, next);
  console.log(`${applied ? 'PATCHED ' : 'OK      '} ${file}: ${applied} applied, ${skipped} already there`);
}
process.exit(failed ? 1 : 0);
