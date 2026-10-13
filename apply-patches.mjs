// One-off patcher for the existing game files. Run from the repo root:  node apply-patches.mjs
// Each edit replaces one exact string; it refuses to touch a file if a string is missing or ambiguous, and skips edits already applied.
import fs from 'node:fs';

const EDITS = {
  'src/game/world.js': [
    ["import { createHighwayLayout, GROUND_START_Z } from './highwayLayout.js';",
     "import { createHighwayLayout, GROUND_START_Z } from './highwayLayout.js';\nimport { lotInfluence } from './lotLayout.js';"],
    ["  out.h = influence > 0 ? nat + (roadY - nat) * influence : nat;",
     "  const lot = lotInfluence(x, z, roadCenterX, roadHeight); // the depot lot is graded level with the road\n  if (lot.k > influence) { influence = lot.k; roadY = lot.y; }\n  out.h = influence > 0 ? nat + (roadY - nat) * influence : nat;"],
    ["drivePath: interchange.drivePath, groundStartZ: GROUND_START_Z, layout };",
     "drivePath: interchange.drivePath, exitPath: interchange.exitPath, groundStartZ: GROUND_START_Z, layout };"],
  ],
  'src/game/interchange.js': [
    // the exit ramp becomes a real road (collider) instead of scenery
    ["  makeVisualRibbon(exitLeft, exitRight);", "  makeRibbon(exitLeft, exitRight);"],
    // ...and counts as on-road for grip / audio
    ["  for (const p of highwaySamples) roadXZ.push(p.x, p.z);",
     "  for (const p of highwaySamples) roadXZ.push(p.x, p.z);\n  for (const p of exitCentres) roadXZ.push(p.x, p.z);"],
    ["    drivePath, mergeStartX: P3[0],", "    exitPath, drivePath, mergeStartX: P3[0],"],
    ["  // Is (x, z) on the ramp or the highway ribbon?",
`  // Drive path for the exit sequence (route.js): west end of the deck -> gore -> exit ramp -> onto the city road, heading -z.
  const exitPath = [];
  for (let x = -262; x < -122; x += 6) exitPath.push({ x, z: highwayZ });
  for (let j = 0; j <= 8; j++) { const u = j / 8; exitPath.push({ x: lerp(-122, goreEndX, u), z: lerp(highwayZ, laneZ, smooth01(u)) }); }
  for (const p of exitCentres) exitPath.push({ x: p.x, z: p.z });
  for (let j = 1; j <= 10; j++) { const u = j / 10; const z = lerp(EXIT.taperZ, 82, u); exitPath.push({ x: lerp(cityLaneX(EXIT.taperZ), roadX(z) - 2.25, smooth01(u)), z }); }

  // Is (x, z) on the ramp or the highway ribbon?`],
  ],
  'src/game/vehicle.js': [
    ["  function reset(y = cfg.spawnHeight, heading = 0) {", "  function reset(y = cfg.spawnHeight, heading = 0, x = 0, z = 0, speed = 0) {"],
    ["    body.setTranslation({ x: 0, y, z: 0 }, true);\n    body.setRotation({ x: 0, y: Math.sin(heading / 2), z: 0, w: Math.cos(heading / 2) }, true);\n    body.setLinvel({ x: 0, y: 0, z: 0 }, true);",
     "    body.setTranslation({ x, y, z }, true);\n    body.setRotation({ x: 0, y: Math.sin(heading / 2), z: 0, w: Math.cos(heading / 2) }, true);\n    body.setLinvel({ x: Math.sin(heading) * speed, y: 0, z: Math.cos(heading) * speed }, true);"],
  ],
  'src/game/typing.js': [
    ["import { pickPrompt, resetStory, skipToNextAct, isCaseInsensitive } from './story.js';",
     "import { pickPrompt, resetStory, skipToNextAct, isCaseInsensitive, isStoryFinished } from './story.js';"],
    ["state.storyDone = true;", "if (isStoryFinished()) state.storyDone = true;\n    else state.legDone = true; // long mode: this highway leg is over (route.js takes the exit)"],
  ],
  'src/ui/hud.js': [
    ["const typing = highway && !state.storyDone;", "const typing = highway && !state.storyDone && !state.outro && !state.legDone;"],
  ],
  'src/game/render.js': [
    ["  renderer.shadowMap.enabled = true;", "  renderer.shadowMap.enabled = true;\n  renderer.info.autoReset = false; // the composer renders several passes per frame; render() resets once"],
    ["    render: () => composer.render(),", "    info: renderer.info,\n    render: () => { renderer.info.reset(); composer.render(); },"],
  ],
};

let failed = false;
for (const [file, edits] of Object.entries(EDITS)) {
  if (!fs.existsSync(file)) { console.log(`MISSING  ${file} (run from the repo root)`); failed = true; continue; }
  let text = fs.readFileSync(file, 'utf8');
  const crlf = text.includes('\r\n');
  const fix = (s) => (crlf ? s.replace(/\n/g, '\r\n') : s);
  let next = text, applied = 0, skipped = 0, bad = null;
  for (const [oldS, newS] of edits) {
    const o = fix(oldS), n = fix(newS);
    if (next.includes(n)) { skipped++; continue; } // already applied (the new text usually contains the old)
    const count = next.split(o).length - 1;
    if (count === 1) { next = next.replace(o, () => n); applied++; }
    else { bad = `${count} matches for: ${oldS.split('\n')[0]}`; break; }
  }
  if (bad) { console.log(`FAILED   ${file}: ${bad} (file left untouched)`); failed = true; continue; }
  if (applied) fs.writeFileSync(file, next);
  console.log(`${applied ? 'PATCHED ' : 'OK      '} ${file}: ${applied} applied, ${skipped} already there`);
}
process.exit(failed ? 1 : 0);
