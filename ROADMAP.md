# ROADMAP: Highway Horror (working title)

## Pitch
A calm, sunny drive through scenic hills in a delivery van that slowly, then suddenly, turns into horror.
WASD in the city, typing on the highway. The same typing system that teaches you the game is what later frightens you.
**The horror is never shown head-on.** No monster, no ghost model. Just the cab, the road, and things that are slightly wrong.

## Pillars (the "don't drift" list)
1. **Calm first.** The opening must be genuinely pleasant. Horror only lands if the comfort was real.
2. **Typing is the highway's driving.** One input system carries both gameplay and horror delivery. The text you type *is* the story.
3. **Horror through systems, not just scares.** Audio, fog/light, text, the cab itself, and controls that stop being trustworthy. Implication over depiction.
4. **Small and shippable.** Stylized, free/CC0 assets only, static hosting (GitHub Pages), a 10-15 minute experience. **Budget is zero: every tool, asset and host must be free.**

## Rules
- **Feature test:** before building anything, ask "does this serve pillar 1, 2 or 3?" If not, it goes in the Backlog.
- Every phase ends with a playable, committed build.
- One checklist item per commit. The commit message is the item name.
- Don't start a later phase until the current phase's "Done when" is true (audio prototyping is the one exception).
- **Cut order if time runs short:** Phase 6 (neural nets) -> tire-track/smoke shaders -> traffic -> extra zone variety -> Semantris mode. Never cut audio or the horror pivot.
- **Model-agnostic:** the vehicle is currently a van file named `truck.glb` and may be swapped later. Keep model-specific numbers (Y offset, wheelbase, collider size, cab camera position, mirror position) in one `VEHICLE_CONFIG` object so a swap is a config change, not a rewrite.

---

## Current state (what `main.js` actually does today)
Single ~470-line `main.js`. Stack (from `package.json`): Three.js 0.186, Rapier 0.21 (`rapier3d-compat`), Vite 8. Post-processing (EffectComposer, SMAA, tilt-shift shaders) ships inside `three/addons`, so no new dependencies are needed. Worth knowing before Phase 1:
- Flat 400x400 ground plane with dashed center stripes. No real road, no hills.
- Truck is a **kinematic** body pinned at y=1 (no terrain following, no pitch/roll, no weight transfer, no suspension). This is being replaced by "slightly realistic" physics (Phase 1, Open Decision 9).
- Single `WebGLRenderer` with MeshStandard materials and a linear `Fog`. No post-processing.
- City: WASD bicycle-model steering. Highway: **auto-steers to x=0, speed chases WPM x accuracy.** (Open Decision 1 is effectively implemented.)
- Zone switch is a **placeholder**: crossing z=80 (with hysteresis) flips city/highway automatically. Tab is a dev override.
- Typing accepts only `a-z`, single words from a 16-word bank, wrong keys are counted but ignored.
- Debug: backtick toggles orbit cam + collider box (roadmap previously said C; C is now free for typing/other use).
- `worldTime` (day -> dusk) runs on a **wall-clock timer (180s)**, not distance. Fine for testing, must be decoupled before the horror pivot (see Phase 5).
- Truck already loads from local `public/models/truck.glb` using `BASE_URL` (no hotlink).
- Not present in current `main.js`: free-look camera, speed-based FOV (Phase 0 said done, see note below).
- `index.html` hint text still says "Press M to switch mode" (stale, Tab is the dev key).

---

## Phase 0: Foundation (DONE)
- [x] Repo, Vite, Three.js, Rapier set up
- [x] Truck model loads from `public/models`, wheel animation driven by speed
- [x] Kinematic bicycle-model steering (rear-axle pivot, speed-scaled turning)
- [x] City (WASD) and highway (typing) prototype modes
- [x] Auto zone switch (placeholder z-threshold with hysteresis)
- [x] Highway auto-steer + WPM/accuracy-driven speed
- [x] Shadow follows truck, debug orbit cam (`) + collider box
- [x] Day -> dusk lighting/fog system (`worldTime`)
- [x] Roadside trees (instanced)
- [ ] Free-look camera + speed-based FOV (**regression:** was marked done but is not in the current `main.js`; re-add inside the Phase 1 camera module)

## Phase 1: Structure and driving feel
**Done when:** driving for 2 minutes feels good and the code is split into modules.
- [ ] Split `main.js` into modules (vehicle, camera, world, typing, lighting, ui, input)
- [ ] Central game state object (mode, worldTime, speed, typing stats)
- [ ] `VEHICLE_CONFIG` object (model swap-friendly, see Rules)
- [ ] **Vehicle physics v2 ("slightly realistic"):** dynamic chassis + Rapier's raycast vehicle controller (`world.createVehicleController`): 4 wheels with suspension, tire grip, mass and weight transfer, a little body roll, engine force + brake + steering inputs. Tuned to feel arcade-friendly (forgiving grip, mild oversteer), not a sim. Keep the old bicycle model in git history as a fallback
- [ ] Input layer between the player and the vehicle: all steering/throttle/brake go through one `driveInput` object. City reads WASD into it, highway writes it from typing (auto lane-follow + WPM throttle). This is also where the horror later injects wheel pull and brake lag
- [ ] `render.js` module: renderer + `EffectComposer` set up as a passthrough (RenderPass + SMAA + OutputPass) so Phase 2's look can be added pass by pass. Replaces `antialias: true`; cap pixel ratio at 2
- [x] Camera module: chase cam, free-look, speed-based FOV, **cab (first-person) view toggle (V)**, structured as named **camera profiles** (see Open Decision 12)
- [ ] Cab view v1: camera at the driver's head position, hood/dash visible, no interior model yet, hides the truck's exterior mesh (or uses a simple inside-cab pass) so nothing clips
- [ ] Real road mesh (asphalt + edge lines) distinct from grass; off-road slows you down
- [ ] Tree/prop colliders with collision response (speed loss + bump)
- [ ] HUD: speedometer, cleaner mode label, fix stale key hints in `index.html`
- [ ] Reset (R) and pause (Esc)
- [ ] Web Audio manager + synthesized engine sound (pitch follows speed, no downloads needed)
- [ ] Debug box hidden by default (still toggled with `)

## Phase 2: World
**Done when:** you can drive from the city, up the on-ramp, onto a hilly scenic highway with no visible seams, and the mode switches by itself.
- [ ] Terrain: hilly heightfield (noise or authored heightmap), the road is carved/laid along it with smooth grades
- [ ] Terrain collider: Rapier heightfield collider generated from the same height data as the visual terrain mesh, so the raycast vehicle climbs, crests and settles on hills naturally (retune suspension and engine force for grades)
- [ ] Road generator: segments recycled ahead/behind so the road is endless; gentle curves **and elevation**
- [ ] City zone: low-poly buildings, intersections, streetlights, parked cars (flat-ish start area)
- [ ] Highway zone: guardrails, signs, mile markers
- [ ] **Scenic set pieces:** ridge-top vista, valley with a lake or river, distant mountains, a tunnel or overpass, a rest stop (all reused later for horror loops)
- [ ] **Real zone transition:** on-ramp trigger volume switches WASD -> typing automatically (no key press), with a short handoff moment (speed eases, typing UI fades in) so it is never abrupt. Tab dev override removed from release build
- [ ] Prop sets per zone, swappable per "act" (needed for the horror pivot later)
- [ ] **Art pass 1a, camera look:** "toy-car" chase profile: camera high and far, narrow FOV (about 15-25 degrees), lerped follow with slight lag. Raise the camera enough that hills do not block the view of the truck
- [ ] **Art pass 1b, tilt-shift:** screen-space tilt-shift on the composer (three's `HorizontalTiltShiftShader` / `VerticalTiltShiftShader`) so top and bottom of the frame blur and a horizontal strip stays sharp. Preferred over depth-based `BokehPass`, which blurs by distance and will not give a clean strip, and it is cheaper
- [ ] **Art pass 1c, color grade:** custom grading pass (saturation up, blacks lifted for the film-print look, palette clamp), driven by `worldTime` so the grade can sour during the horror pivot
- [ ] **Art pass 1d, toon materials:** `MeshToonMaterial` with a custom 3-tone gradient map on terrain and props; convert the truck GLB's materials on load (keep color/map, swap material). Flat shading on custom meshes (verify `flatShading` is honored on toon in r186; if not, use non-indexed geometry with face normals)
- [ ] **Art pass 1e, fog and sky:** switch to `FogExp2` with fog color locked to the sky color; lerp fog density with `worldTime` instead of the current near/far values. Palette-limited sky (gradient or HDRI), golden-hour lighting
- [ ] **Art pass 1f, lighting and shadows:** harsh directional sun plus a colored `HemisphereLight` (blue sky, warm ground) so shadows stay colorful; tight shadow frustum around the truck for crisp shadows (confirm the chosen shadow map type still exists in the installed Three version)
- [ ] Trees/props at scale: instanced low-poly cones/cylinders across the terrain, chunked with the road segments
- [ ] Simple traffic (city only, cars following lanes)
- [ ] **Art pass 2 (polish, cut early if short on time):** tire-track shader (solid dark marks behind the wheels; on hills use short ribbon decals rather than a flat canvas texture) and stylized particle smoke (`THREE.Points` + `ShaderMaterial`: solid squares/spheres that grow, drift back, shrink and snap-fade, no soft alpha textures)

## Phase 3: Highway typing v2
**Done when:** a 5-minute highway stretch is fun on its own, before any horror.
- [x] Highway steering decision: auto lane-follow, typing controls speed (already prototyped)
- [ ] **Story as prompts:** highway text is a narrative delivered line by line (see "Story & typing content" below)
- [ ] Full keyboard support: spaces, punctuation, capitals, backspace policy, correct handling of wrong keys (currently only `a-z`, wrong keys ignored)
- [ ] Pluggable prompt sources: story, radio, road signs, CB chatter, "thoughts"
- [ ] Words -> phrases -> sentences; tiers (lowercase -> punctuation -> capitals) as difficulty rises
- [ ] Speed model: WPM sustains speed, accuracy affects stability (wheel jerk, lane drift, and on hills, engine strain uphill)
- [ ] In-cab typing UI (radio/dashboard display instead of floating HTML), designed to work in both chase and cab views
- [ ] Semantris-style association mode (v1: hand-written association lists)
- [ ] Typing telemetry recorder (keystroke timings, error patterns), needed later for pacing
- [ ] Difficulty ramp + tutorial-by-osmosis (no tutorial screens)

## Phase 4: Audio (prototype starts in Phase 1)
**Done when:** you can play with your eyes closed and still tell speed, road type and mood.
- [ ] Layered audio: engine, tires/road, wind, ambient bed, radio
- [ ] Radio system (music loops + DJ text synced with typing prompts)
- [ ] Wire in the sounds you download (free/CC0 only) from `public/audio`, logged in `CREDITS.md`
- [ ] Cab-specific audio: muffled interior mix vs open exterior mix when switching views, rattles, seatbelt/dash sounds
- [ ] Horror audio toolkit: sudden silence, distant sounds, static bursts, low drones, positional panning (sounds from the passenger seat / back of the van)
- [ ] Master volume + mix settings

## Phase 5: The horror pivot (the point of the game)
**Done when:** a first-time player is comfortable for the first few minutes, then unsettled without being told why, and never sees a "monster".
- [ ] Decouple `worldTime` from the wall clock; drive it by distance/story beat (Open Decision 5)
- [ ] Director: state machine CALM -> UNEASY -> WRONG -> HORROR, driven by distance (typing modulates later)
- [ ] **Cab interior model** (built from simple primitives or free CC0 pieces): steering wheel, dash, gauges, seats, air freshener, mirror. It is the main horror stage
- [ ] Cab wrongness list (all implied, nothing shown outright):
  - passenger seat belt clicks, seat compresses, or an item on it shifts
  - hanging object swaying against the motion
  - steering wheel turns slightly on its own
  - dash lights/gauges misbehave, radio speaks a line you did not type
  - reflections in the windshield or window that are almost right
  - something in the corner of view that is gone when you look
- [ ] Rear-view mirror (render target) for the "something is behind you" moments, usable in cab view
- [ ] Subtle world wrongness: prop swaps, radio glitches, typing errors that aren't your fault, sky drifting
- [ ] Typing turns adversarial: wrong prompts, prompts addressed to the player, messages that know things
- [ ] Controls stop being trustworthy: wheel pull, brake lag, phantom steering
- [ ] Environment: fog, lighting, road-loop tricks (same sign twice, road that doesn't end, the same hill again)
- [ ] Climax + ending
- [ ] Accessibility toggle: reduce flashing / scare intensity

## Phase 6: Neural networks (OPTIONAL, must never block release)
- [ ] Heuristic "tension estimator" from typing telemetry (same interface a NN would use)
- [ ] Director uses tension to hold back or escalate
- [ ] Stretch: replace heuristic with a tiny TF.js model trained on your own playtest data (TF.js is free and runs in-browser)
- [ ] Stretch: word-embedding similarity for Semantris (small precomputed vector file, cosine similarity in plain JS)

## Phase 7: Ship
- [ ] Main menu, settings, credits
- [x] Truck loads from local `public/models` (hotlink already removed); just confirm license is logged in `CREDITS.md`
- [ ] Bundle every other asset locally, never hotlink
- [ ] Performance pass: pixel ratio cap, draw calls, shadow map size, instancing, terrain LOD/chunking
- [ ] Vite `base` config + GitHub Pages deploy (`BASE_URL` is already used for the model path)
- [ ] Playtest with 3-5 people, tune calm -> horror timing
- [ ] Tag v1.0

---

## Story & typing content
The highway prompts are the story, so the writing has to do double duty: teach typing and carry the dread.

| Act | Feel | Prompt content | Typing tier |
|-----|------|----------------|-------------|
| 1. Calm | Sunny, scenic, cozy | Short delivery-driver thoughts, radio DJ banter, road sign text, easy words | lowercase words |
| 2. Uneasy | Still nice, something is off | Same voices, but small oddities (a repeated line, a sign with slightly wrong text) | short phrases + punctuation |
| 3. Wrong | Light fading, radio unreliable | Lines that reference the player, the cab, the passenger seat, without saying what it is | sentences + capitals |
| 4. Horror | Dusk/fog, nothing trustworthy | Prompts that address you directly, ones you are afraid to finish typing | full sentences, pressure |

Guidelines: never name the entity, keep the story deniable ("maybe it's just tired driving"), and let *typing the line* be the moment the player commits to the creepy thing. Story length scales to the final playthrough length (decide after Phase 3).

---

## Open decisions
| # | Decision | Status / suggested default | Needed by |
|---|----------|----------------------------|-----------|
| 1 | Highway steering | **DECIDED:** auto lane-follow, typing controls speed, horror uses drift/wheel-jerk | done |
| 2 | Target length | 10-15 minutes, confirm after Phase 3 playtest | Phase 3 |
| 3 | What is the horror? | **DECIDED (direction):** implied presence in the cab, no visible entity, weirdness only. Road loops as a supporting trick | Phase 5 (shapes props/words from Phase 2) |
| 4 | Zone switch | **DECIDED:** automatic on-ramp trigger, no key press | Phase 2 |
| 5 | Pacing trigger: time, distance, or typing performance? | Distance-based, typing modulates later | Phase 5 |
| 6 | Word content | **DECIDED:** story-driven, themed per act | Phase 3 |
| 7 | Platform | Desktop keyboard only | Phase 7 |
| 8 | Art direction | Art of Rally: flat-shaded low-poly, tight palette | Phase 2 |
| 9 | Physics realism | **DECIDED:** "slightly realistic". Rapier raycast vehicle (suspension, grip, weight transfer, roll) tuned arcade-friendly. Not a full sim: no gearbox, tire temperature or damage. Highway typing drives the same controller through `driveInput` | Phase 1 |
| 10 | Terrain method | Noise/heightmap terrain with the road laid on top, chunked for endless feel. Simplest to loop for horror tricks | Phase 2 |
| 11 | Vehicle model | Keep the current van for now, swap later via `VEHICLE_CONFIG` | Phase 7 |
| 12 | Camera profiles vs the tilt-shift look | The toy-car look (far camera, narrow FOV, tilt-shift) is the **chase** profile only. The **cab** profile uses a normal wide FOV with tilt-shift off. Suggested horror use: calm = miniature diorama feel, then the camera drifts toward the cab and the blur collapses, so the world stops feeling like a toy. Confirm this after Art pass 1 | Phase 2 |

## Asset plan (everything free)
- **Vehicles/city/nature:** Kenney.nl, Quaternius (CC0)
- **Sky/lighting:** Poly Haven HDRIs (use 1k versions; blend or tint for the dusk transition)
- **Better truck/van:** Sketchfab, filtered to CC0
- **Audio:** you download from Freesound (filter to CC0) and drop into `public/audio`; synthesized Web Audio for engine/wind (no downloads)
- **Tools, all free:** Vite, Three.js, Rapier, Blender (models/heightmaps), Audacity (audio trimming), GitHub Pages (hosting)
- Commit into `public/models` and `public/audio`, log everything in `CREDITS.md`
- Never hotlink assets in the final build

## Target file structure
```
src/
  main.js          (wiring only)
  game/state.js
  game/vehicle.js  (+ VEHICLE_CONFIG, raycast vehicle, driveInput)
  game/camera.js   (camera profiles: toy chase, free-look, cab)
  game/render.js   (renderer, EffectComposer, tilt-shift, grade, toon materials)
  game/fx.js       (tire tracks, smoke, Art pass 2)
  game/world.js    (terrain, road, zones)
  game/typing.js
  game/story.js    (act text, prompt sources)
  game/director.js (horror pacing)
  game/audio.js
  ui/hud.js
public/models/
public/audio/
CREDITS.md
ROADMAP.md
```

## Backlog (parked, does not serve the pillars)
Multiple vehicles, multiplayer, full day/night cycle, weather, procedural story, mobile touch controls, level editor, fully realistic vehicle dynamics.