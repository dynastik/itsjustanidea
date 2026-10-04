# ROADMAP: itsjustanidea (working title)

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
- **Performance target:** the primary development/test laptop is a Dell Latitude 3490. Treat it as the baseline machine for performance decisions. The goal is a stable ~60 FPS at 1080p on a typical integrated-GPU configuration; lower FPS on weaker configurations is acceptable if the game remains playable. Do not optimize blindly: measure frame time/FPS on the baseline laptop.

---

## Current state (what the code actually does today)
The code is now split into modules under `src/game` rather than being kept as one giant `main.js`. Current relevant systems include state, renderer, lighting, world, vehicle, camera, cab interior, audio, input, typing, HUD and horror director modules.

Important current facts before continuing Phase 1/2:
- Three.js 0.186, Rapier 0.21 (`rapier3d-compat`), Vite 8.
- `render.js` uses `EffectComposer` with RenderPass + SMAA + OutputPass and caps pixel ratio at 2.
- `lighting.js` currently uses a directional sun with a **2048x2048 shadow map**, an ambient light, day->dusk sky colors, and linear fog. This is a temporary baseline; the target shadow policy is documented below.
- `main.js` already wires `cabin.js` and `director.js`, has automatic city/highway switching, day->dusk world time, pause/reset/debug/mute controls, and the shared `driveInput`.
- The cab interior exists and is hidden until cab view is toggled.
- The exact current implementation is authoritative; do not assume old roadmap descriptions still match the code. Re-read the relevant source files before modifying them.
- Truck model is local at `public/models/truck.glb`; do not hotlink assets.
- Free-look/speed-FOV and other Phase 0 camera items must be verified against the current camera module before marking them complete.

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
- [ ] Free-look camera + speed-based FOV (**regression:** verify/re-add inside the Phase 1 camera module if still absent)

## Phase 1: Structure and driving feel
**Done when:** driving for 2 minutes feels good and the code is split into modules.
- [ ] Split `main.js` into modules (vehicle, camera, world, typing, lighting, ui, input) — continue only if anything is still left to split
- [ ] Central game state object (mode, worldTime, speed, typing stats)
- [ ] `VEHICLE_CONFIG` object (model swap-friendly, see Rules)
- [ ] **Vehicle physics v2 ("slightly realistic"):** dynamic chassis + Rapier's raycast vehicle controller (`world.createVehicleController`): 4 wheels with suspension, tire grip, mass and weight transfer, a little body roll, engine force + brake + steering inputs. Tuned to feel arcade-friendly (forgiving grip, mild oversteer), not a sim. Keep the old bicycle model in git history as a fallback
- [ ] Input layer between the player and the vehicle: all steering/throttle/brake go through one `driveInput` object. City reads WASD into it, highway writes it from typing (auto lane-follow + WPM throttle). This is also where the horror later injects wheel pull and brake lag
- [x] `render.js` module: renderer + `EffectComposer` passthrough (RenderPass + SMAA + OutputPass), replacing `antialias: true`; pixel ratio capped at 2
- [ ] Camera module: chase cam, free-look, speed-based FOV, **cab (first-person) view toggle (V)**, structured as named **camera profiles**
- [x] Cab view v1: camera at the driver's head position, hood/dash visible, no interior model yet, hides the truck's exterior mesh (or uses a simple inside-cab pass) so nothing clips
- [ ] Real road mesh (asphalt + edge lines) distinct from grass; off-road slows you down
- [ ] Tree/prop colliders with collision response (speed loss + bump)
- [ ] HUD: speedometer, cleaner mode label, fix stale key hints in `index.html`
- [ ] Reset (R) and pause (Esc)
- [ ] Web Audio manager + synthesized engine sound (pitch follows speed, no downloads needed)
- [ ] Debug box hidden by default (still toggled with `)

## Phase 2: World
**Done when:** you can drive from the city, up the on-ramp, onto a hilly scenic highway with no visible seams, and the mode switches by itself.

### World generation and visibility strategy
The game is a controlled driving experience, not an open-world free-roam game. Exploit that constraint.

- [ ] Terrain/world is generated only within a bounded active area around the player's road position; do not create a huge fully populated world.
- [ ] Recycle road/world segments ahead and behind the vehicle so the playable world can feel endless without keeping everything alive.
- [ ] Use **camera frustum culling + distance tests** as the primary render visibility checks. Do not run an expensive per-object "perfect cone intersection" calculation every frame.
- [ ] Use **distance-based LOD rings** for scenery. Starting target, to be tuned by profiling:
  - near: full-detail meshes
  - medium: simplified meshes/materials
  - far: very simple silhouettes/cheap meshes
  - very far: fog/background only
- [ ] Keep generation/streaming separate from render visibility. A nearby road/world chunk may exist in memory while most of its objects are culled or represented by a cheaper LOD.
- [ ] Use instancing for repeated scenery (trees, rocks, fence posts, grass clusters, etc.) to reduce draw calls.
- [ ] Preserve important art-directed silhouettes even when strict mathematical visibility would allow culling; visibility optimization must not ruin composition.
- [ ] Prefer road-relative active areas/corridors where useful. The player follows a controlled route, so there is no need for general-purpose open-world streaming logic.

### Terrain, road and zones
- [ ] Terrain: hilly heightfield (noise or authored heightmap), the road is carved/laid along it with smooth grades
- [ ] Terrain collider: Rapier heightfield collider generated from the same height data as the visual terrain mesh, so the raycast vehicle climbs, crests and settles on hills naturally (retune suspension and engine force for grades)
- [ ] Road generator: segments recycled ahead/behind so the road is endless; gentle curves **and elevation**
- [ ] City zone: low-poly buildings, intersections, streetlights, parked cars (flat-ish start area)
- [ ] Highway zone: guardrails, signs, mile markers
- [ ] **Scenic set pieces:** ridge-top vista, valley with a lake or river, distant mountains, a tunnel or overpass, a rest stop (all reused later for horror loops)
- [ ] **Real zone transition:** on-ramp trigger volume switches WASD -> typing automatically (no key press), with a short handoff moment (speed eases, typing UI fades in) so it is never abrupt. Tab dev override removed from release build
- [ ] Prop sets per zone, swappable per "act" (needed for the horror pivot later)

### Art direction
**Target look:** a miniature/diorama driving game with an Art of Rally-inspired environmental design language, but with restrained toon/cel-style shading and hand-painted color choices. Do **not** interpret this as full anime/cartoon cel shading. The goal is a coherent low-poly miniature world with simple, deliberate light bands, a tight palette, strong silhouettes, fog and a toy-like camera.

- [ ] **Art pass 1a, camera look:** "toy-car" chase profile: camera high and far, narrow FOV (about 15-25 degrees), lerped follow with slight lag. Raise the camera enough that hills do not block the view of the truck
- [ ] **Art pass 1b, miniature/tilt-shift:** use a restrained screen-space tilt-shift effect in the chase profile. Top and bottom of the frame should blur while a horizontal band stays relatively sharp. Start with Three.js horizontal/vertical tilt-shift shaders or an equivalent lightweight implementation. Prefer a lightweight tilt-shift treatment over a full cinematic depth-of-field/bokeh system. **Cab view should normally disable the miniature tilt-shift look** so the horror transition can feel more grounded.
- [ ] **Art pass 1c, color grade:** custom grading pass (saturation up, blacks lifted for the film-print look, palette clamp), driven by `worldTime` so the grade can sour during the horror pivot
- [ ] **Art pass 1d, toon materials:** `MeshToonMaterial` with a custom 3-tone gradient map on terrain and props; convert the truck GLB's materials on load (keep color/map, swap material). Use flat shading on custom meshes where it improves the silhouette. Toon shading is a visual style choice, not a reason to increase geometry.
- [ ] **Art pass 1e, fog and sky:** switch to `FogExp2` with fog color locked to the sky color; lerp fog density with `worldTime`. Palette-limited sky (gradient or HDRI), golden-hour lighting
- [ ] **Art pass 1f, lighting and shadows:** harsh directional sun plus a colored `HemisphereLight` (blue sky, warm ground) so shadows stay colorful. Use a tight shadow frustum around the vehicle for useful shadow resolution.
- [ ] **Shadow performance policy:** start with a **1024x1024** main sun shadow map, not 2048x2048. Keep shadow casting focused on important nearby objects. Distant/small scenery should use simplified shadows, receive no shadow, or cast no shadow. A lower-resolution shadow setup such as 512x512 may be tested for cheaper distant/alternative passes if technically useful, but do not build a complex per-object shadow-map system unless profiling proves it is needed.
- [ ] **Trees:** use stylized low-poly trees made from a trunk/branch structure plus **multiple solid foliage clusters**, not one leaf blob. Aim for roughly 5-15 meaningful foliage masses per tree, with several reusable tree variants. Prefer opaque geometry over large amounts of transparent foliage. Instance repeated tree variants where possible.
- [ ] **Grass:** do **not** build realistic blade-by-blade grass. The default approach is a stylized grass ground material/texture plus sparse cross-quad grass clusters in visually important areas. Cross-quad clusters may use alpha-tested textures and `InstancedMesh`. Avoid thousands of individually animated blades. If grass motion is added, keep it subtle and GPU-cheap.
- [ ] **Other vegetation:** bushes and small plants should use a few solid stylized clusters or sparse alpha-tested cards, not dense individual leaves.
- [ ] **Distant vegetation:** aggressively simplify with LOD and let fog/tilt-shift hide transitions.
- [ ] **Art pass 2 (polish, cut early if short on time):** tire-track shader (solid dark marks behind the wheels; on hills use short ribbon decals rather than a flat canvas texture) and stylized particle smoke (`THREE.Points` + `ShaderMaterial`: solid squares/spheres that grow, drift back, shrink and snap-fade, no soft alpha textures)
- [ ] Simple traffic (city only, cars following lanes)

### Performance budget and profiling
- [ ] Treat the Dell Latitude 3490 as the primary baseline test machine.
- [ ] During visual development, measure FPS and frame time on the baseline laptop after major rendering changes.
- [ ] Profile GPU-heavy candidates separately: shadow map size, tilt-shift, foliage overdraw, terrain detail, pixel ratio and post-processing.
- [ ] Profile CPU-heavy candidates separately: object count, draw-call count, world generation/streaming, visibility tests and physics.
- [ ] Keep the scene visually rich by spending geometry where it is noticeable: truck, road, major trees and set pieces. Spend less on grass, distant vegetation and tiny props.
- [ ] Avoid adding post-processing passes just because they are available. Every pass must earn its GPU cost visually.
- [ ] Keep repeated scenery instanced and materials reasonably shared.
- [ ] Do not optimize by removing visually important silhouettes or making the world look empty.

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
- [ ] Performance pass: profile on Dell Latitude 3490; tune pixel ratio, draw calls, shadow map size, instancing, scenery LOD, visibility/generation radius, terrain detail and post-processing
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
| 8 | Art direction | **DECIDED:** miniature/diorama driving style inspired by Art of Rally's low-poly environmental design, with restrained toon shading, a tight hand-painted palette, and tilt-shift in the chase camera. This is not a commitment to exact Art of Rally replication or heavy anime-style cel shading. | Phase 2 |
| 9 | Physics realism | **DECIDED:** "slightly realistic". Rapier raycast vehicle (suspension, grip, weight transfer, roll) tuned arcade-friendly. Not a full sim: no gearbox, tire temperature or damage. Highway typing drives the same controller through `driveInput` | Phase 1 |
| 10 | Terrain method | Noise/heightmap terrain with the road laid on top, generated/recycled around the active road corridor for endless feel. Simplest to loop for horror tricks | Phase 2 |
| 11 | Vehicle model | Keep the current van for now, swap later via `VEHICLE_CONFIG` | Phase 7 |
| 12 | Camera profiles vs the miniature look | **DECIDED:** the toy-car/tilt-shift look is the chase profile only. The cab profile uses a normal wider FOV and normally disables tilt-shift. Calm should feel like a pleasant miniature diorama; horror can move toward the cab and remove the miniature illusion. | Phase 2 |
| 13 | Visibility strategy | **DECIDED:** combine frustum culling + distance checks + distance-based LOD. World generation/streaming is separate and keeps only a bounded active road corridor. Avoid per-object perfect cone calculations every frame unless profiling later proves a specific need. | Phase 2 |
| 14 | Shadow budget | **DECIDED:** start at 1024x1024 for the main sun shadow map. Restrict shadow casting to important nearby objects; distant/small scenery can use 512x512-style simplification if useful, or no shadows. Tune from Dell 3490 profiling. | Phase 2 |
| 15 | Tree style | **DECIDED:** low-poly trunk/branch structure plus multiple solid foliage clusters. No single blob canopy. Reuse/instance variants and use LOD for distance. | Phase 2 |
| 16 | Grass style | **DECIDED:** no realistic blade-by-blade grass. Use a stylized grass ground material/texture plus sparse cross-quad clusters in important areas; alpha-test rather than heavy translucent foliage where possible. | Phase 2 |
| 17 | Performance baseline | **DECIDED:** Dell Latitude 3490 is the primary test machine. Measure FPS/frame time rather than guessing. Keep toon shading and stylization cheap; focus optimization on shadows, foliage overdraw, draw calls, post-processing, terrain and world population. | Phase 2/7 |

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
  game/world.js    (terrain, road, zones, active-area generation/LOD)
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
