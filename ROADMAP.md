# ROADMAP: itsjustanidea

## Pitch

A calm, sunny drive through scenic hills in a delivery van slowly turns into supernatural and paranormal horror. *player_username* is a delivery driver whose route begins recording deliveries before he reaches them. The road, delivery records, and the narration suggest that another version of his route is already happening.

**The horror is never explained outright.** No visible monster, no rendered replacement-driver character, no lore dump. Evidence arrives through impossible chronology, repeating roads, unreliable text, lighting, headlights, and the driver's own van.

WASD driving in towns; typing drives the highway. The same typing system that teaches the game becomes part of the horror.

## Pillars

1. **Calm first.** The opening should feel genuinely pleasant and ordinary.
2. **Driving and typing are the core.** Keep the experience focused on the van, the road, and the story text.
3. **Supernatural horror through systems.** Imply more than is shown. Use the road, delivery sheet, narration, lighting, and headlights.
4. **A cliffhanger, not a lore explanation.** The ending should be frightening and leave the cause ambiguous.
5. **Small and shippable.** Stylized world, free assets, static hosting, zero budget. Prefer one complete polished experience over a sprawling simulator.
6. **Accessible typing.** Easy, Medium, and Hard change pressure and mistake tolerance, never access to story content.

## Non-negotiable scope decisions

- Keep the title **itsjustanidea**.
- Short Mode and Long Mode are separate choices with separate progression.
- Short Mode retains its existing compact ending unless testing proves it needs a small polish pass.
- Long Mode escalates across multiple nights. The final number of nights is undecided; build one complete day-to-night cycle first, then decide from playtesting.
- Headlights are manually controlled by the player.
- No radio system, radio DJ, radio-dependent plot, or radio prompts.
- No walking character, NPCs, conversations, or pedestrian interaction.
- Town gameplay stays vehicle-based: drive with WASD, park at designated places, and optionally refuel/ deliver packages in city stops.
- No literal hundreds of deliveries. Delivery records can imply a long history without simulating hundreds of stops.
- Never show a replacement driver as a character. Let the player infer the connection from evidence.
- No definitive explanation of who or what causes the loop.
- Neural-network experiments and Semantris-style association typing are optional backlog items and must not delay release.
- Audit the existing audio implementation later and polish it near the end; do not assume it is missing or complete without checking the code.
- Do not hotlink assets. Bundle assets locally and record their licences in `CREDITS.md`.

## Working rules

- Before adding a feature, ask whether it serves the pillars above. Otherwise park it in the backlog.
- Re-read the relevant source files before changing a system. The code is authoritative; old checklist text can go stale.
- Every meaningful phase should end with a playable build.
- Do not optimize blindly. Measure frame time/FPS on the Dell Latitude 3490 baseline laptop before and after expensive rendering changes.
- Keep the project a focused driving-and-typing horror game, not an open-world delivery simulator.

---

## Current state

The game is already modularized under `src/game`. Current systems include state, renderer, lighting, world, vehicle, camera, cab interior, audio, input, typing, HUD, day cycle, and horror director modules.

Known implementation details from the current roadmap/source review:

- Vite, Three.js, and Rapier are set up.
- The van model is local at `public/models/truck.glb`.
- WASD town driving and typing-driven highway driving exist, with automatic zone switching.
- The vehicle uses Rapier's raycast vehicle controller through the shared `driveInput`.
- A day/night cycle, toy-car chase camera, tilt-shift look, stylized terrain, trees, city buildings, parked cars, highway scenery, and a cab view exist.
- The horror director has CALM, UNEASY, WRONG, HORROR, and FINALE acts.
- The current Short Mode ending is “Delivery accepted.”, fade to black, “Next driver, please.”, then restart.
- Synthesized engine audio and an audio manager exist. The full audio mix has not yet been audited.
- Recent user testing reported roughly 60 FPS with occasional brief dips to 58 FPS. Profile again after meaningful changes rather than chasing tiny fluctuations.
- Some roadmap items below are unverified or incomplete. Verify them in source and in a playable build before marking them done.

## Priority order

1. Verify the existing build and core driving loop. Fix actual regressions before adding features.
2. Implement and tune manual headlights and night visibility.
3. Finalize typing difficulty and interaction rules.
4. Add a minimal, vehicle-only town stop/parking loop; decide whether refuelling/ delivery earns its complexity.
5. Build one complete Long Mode day-to-night cycle with one effective supernatural event.
6. Expand that tested structure across more nights and develop the replacement-driver mystery.
7. Implement the nightmare sequence and cliffhanger ending.
8. Audit and polish audio, accessibility, performance, menus, credits, and release packaging.

---

## Phase 0: Foundation (mostly complete; verify regressions)

**Done when:** the game starts reliably and the core controls work without blocking bugs.

- [x] Vite, Three.js, and Rapier configured.
- [x] Local van model loads from `public/models`.
- [x] Shared vehicle input layer routes town and highway controls through `driveInput`.
- [x] City driving uses WASD.
- [x] Highway driving uses typing for speed while auto lane-follow handles steering.
- [x] Automatic city-to-highway transition exists.
- [x] Central game state and modular game systems exist.
- [x] Day/night lighting and fog system exists.
- [x] Chase and cab camera profiles exist.
- [x] Pause, reset, mute, and debug controls exist.
- [x] Verify startup, reset, pause/resume, collisions, camera toggles, and zone transitions in the current build.
- [ ] Verify the game remains playable after restarting Short Mode and after changing modes.
- [ ] Verify the new headlight toggle, indicator, and spotlight alignment in chase and cab views.
- [ ] Re-test frame rate after removing the speed-blur pass and darkening the night grade.
- [ ] Confirm no recent merge or scenery changes introduced black-screen, missing-material, or input regressions.

---

## Phase 1: World and driving feel

**Done when:** the player can drive through the town, join the scenic highway, and continue without visible seams or major control problems.

### Road and world

- [x] City zone with low-poly buildings, intersections, streetlights, parked cars, and roadside detail.
- [x] Highway zone with guardrails, signs, and mile markers.
- [x] Hilly terrain and a road corridor.
- [x] Trees with near and distant visual treatments.
- [x] On-ramp trigger switches from WASD driving to highway typing automatically.
- [ ] Verify road/world segments recycle ahead and behind the vehicle. Implement or repair this only if the current build needs it.
- [ ] Verify visibility checks use frustum culling and distance checks sensibly.
- [ ] Add or tune distance-based LOD only where profiling shows it helps.
- [ ] Add a small number of memorable scenic set pieces if the current route needs them: a vista, a valley/water feature, a tunnel/overpass, or a rest stop. Do not add all of them by default.
- [ ] Verify that each zone can change its props or lighting by story act without requiring an open-world system.

### Art direction

Target a stylized miniature/diorama driving game: low-poly environmental design, restrained toon shading, a deliberate palette, strong silhouettes, fog, and a toy-like chase camera. The cab camera should feel more grounded.

- [x] Toy-car chase camera profile and restrained tilt-shift effect.
- [ ] Stylized/toon material treatment and day-cycle colour grading.
- [x] Morning, sunset, night, and sunrise lighting transitions.
- [x] Stylized tree and terrain treatment; no grass props.
- [x] Improved town scenery with varied building facades, roof styles, parked cars, curbs, and pavement details.
- [ ] Add small bushes or plants only if they improve the composition without making the scene visually noisy or expensive.
- [ ] Defer tire tracks, smoke particles, extra traffic, and other optional visual effects until the core experience is complete and profiled.

### Performance

- [x] Dell Latitude 3490 is the baseline test machine.
- [x] Main sun shadow map starts at 1024x1024.
- [ ] Profile GPU costs: shadows, foliage, terrain, pixel ratio, tilt-shift, and post-processing.
- [ ] Profile CPU costs: object count, draw calls, physics, visibility checks, and world generation.
- [ ] Preserve important silhouettes and the cozy visual density. Do not optimize by making the world empty.
- [ ] Keep the game near a stable 60 FPS at 1080p on the baseline laptop where practical. Prioritize visible stutters and actual playability over tiny FPS fluctuations.

---

## Phase 2: Headlights and night driving

**Priority: first major feature after core verification.**

**Done when:** headlights are useful at night, easy to control, and can support a carefully staged horror moment.

- [x] Add a clear player control for switching headlights on and off (F5 key).
- [x] Show a small, unobtrusive HUD indicator for headlight state and make the control discoverable.
- [ ] Create a useful forward beam with a readable road hotspot and gradual falloff. Avoid lighting the entire world like daylight.
- [x] Increase headlight intensity and range after initial playtesting feedback.
- [ ] Tune beam brightness, colour, range, and shadows for the current art style and target hardware.
- [ ] Ensure headlights remain readable in both chase and cab camera profiles.
- [ ] Make manual control reliable through pauses, resets, mode changes, and story transitions.
- [ ] Test dusk, full night, fog, and sunrise.
- [ ] Add scripted supernatural flickers or temporary failures only when the story director requests them. Never make the lights randomly unreliable during normal driving.
- [ ] Create at least one deliberate reveal that is visible only when the beam catches the right part of the road or scenery.
- [ ] Profile performance with headlights on, especially on the baseline laptop.

**Design note:** build ordinary, dependable headlights first. Their later failure matters only if the player has learned to trust them.

---

## Phase 3: Typing experience and accessibility

**Done when:** typing feels fair and readable at different skill levels, and story progression does not require a high WPM.

- [x] Typing advances the highway narrative.
- [x] Correct-key handling, backspace behaviour, typing telemetry, and a learner ramp exist in some form.
- [ ] Re-test character handling, punctuation, capitals, spaces, corrections, and wrong-key behaviour against the actual story text.
- [ ] Confirm the player can pause without losing progress or receiving unfair pressure.
- [ ] Add or verify three difficulty settings:
  - **Easy:** forgiving mistakes, lower pressure, comfortable speed response.
  - **Medium:** intended default balance.
  - **Hard:** less forgiving mistakes and stronger driving pressure, without unfairly hiding story content.
- [ ] Difficulty must affect pressure and mistake tolerance, not which scenes or lore the player can see.
- [ ] Avoid strict WPM gates. A slower typist must still be able to finish the story.
- [ ] Ensure road safety and readability remain fair when text gets unsettling.
- [ ] Verify story and act progression stay consistent for slow and fast typists.
- [ ] Keep the typing presentation clean. A dedicated in-cab dashboard typing display is optional and should only be built if it materially improves readability or immersion.

---

## Phase 4: Town stops and delivery interactions

**Done when:** a town stop feels purposeful without turning the game into an open-world simulator.

- [ ] Keep all town interaction inside the van. No walking character, pedestrian NPCs, conversations, or dialogue trees.
- [ ] Create one simple, readable way to identify a designated parking/delivery spot.
- [ ] Let the player drive to the spot and park within a forgiving trigger area.
- [ ] Trigger delivery progress through a short scripted sequence, the delivery sheet, and/or a typing passage. Avoid building a separate dialogue system.
- [ ] Make returning to driving straightforward and reliable.
- [ ] Decide whether fuel is a real resource. Recommendation: start with parking and delivery first; add simple refuelling only if it creates an interesting decision rather than busywork.
- [ ] Reuse a small number of places and let their text, lighting, or details change as the mystery escalates.
- [ ] Keep town sections short enough that the highway typing and horror remain the core experience.

---

## Phase 5: Short Mode and Long Mode

### Short Mode

**Goal:** preserve a compact, complete introduction to the game.

- [x] Existing Short Mode has a calm-to-horror progression and a restart ending.
- [x] Replaced the previous short placeholder story with the supplied six-act Bellweather script, including repeated-sign contradiction, the road's messages, and the bittersweet false sunrise.
- [ ] Play through it from a clean start and verify the complete experience, including the new Bellweather sign sequence and ending.
- [ ] Check that its ending still lands after the new mode-selection and headlight work.
- [ ] Keep changes to Short Mode small unless playtesting identifies a clear problem.

### Long Mode structure

**Goal:** a longer, multi-night supernatural horror story built from the same core driving and typing systems.

- [ ] Add separate Short Mode and Long Mode selection in the main menu.
- [ ] Give Long Mode its own story progression and ending; do not simply stretch Short Mode's prompts.
- [ ] Build and playtest one complete day-to-night cycle before choosing the final number of nights.
- [ ] Expand to additional nights only after the first cycle is satisfying. Each night should change the mystery or the player's trust, not just repeat the same scare.
- [ ] Make the delivery sheet/records a recurring source of evidence. Entries may show deliveries completed before Elias arrives, impossible timestamps, previous routes, or events he has not experienced.
- [ ] Use a persistent delivery counter or a small set of selected records to imply an enormous history. Do not simulate hundreds of deliveries or force the player to complete hundreds of stops.
- [ ] Escalate from ordinary records, to impossible chronology, to narration that predicts or contradicts what the player sees and does.
- [ ] Keep the identity of the other driver ambiguous: future Elias, previous Elias, another timeline, or something produced by the road are all possible interpretations.
- [ ] Do not show a replacement-driver model. Evidence should come through text, the road, lighting, delivery records, and the van.
- [ ] Make supernatural events authored and paced by the story director. Do not rely on constant random glitches.
- [ ] Use the manual headlights for occasional deliberate moments of uncertainty and revelation.
- [ ] Keep the cause of the phenomenon unexplained.

### Recommended pacing

Use a gradual ramp with room for quiet between major events:

1. **Comfort:** ordinary delivery work, scenic road, dependable van, calm narration.
2. **Unease:** repeated landmarks, small inconsistencies, a delivery record that is slightly wrong.
3. **Contradiction:** the sheet claims a delivery is complete before Elias reaches it; the narration remembers something the player has not done.
4. **Intrusion:** road geometry, signs, lighting, and headlight reveals become impossible to trust.
5. **Night escalation:** records imply other versions of Elias have driven this route. The game never confirms exactly who or what they are.
6. **Nightmare climax:** the delivery is marked complete, but the driver's status is unknown or replaced. Use darkness, brief headlight/engine moments, and disorienting but readable imagery instead of a visible monster.
7. **False relief:** Elias wakes in the van at peaceful dawn. Ordinary ambience and the opening music return, suggesting it was a nightmare.
8. **Final evidence:** the delivery sheet still carries an impossible record/counter. The narration describes Elias checking the mirror without the player choosing to, claims the back seat is empty, then ends with the implication that it was empty yesterday too.
9. **Cliffhanger loop:** fade to black. “GOOD MORNING, ELIAS.” Then: “YOUR FIRST DELIVERY IS ALREADY COMPLETE.” 

These are story targets, not a requirement to implement every beat in one pass. Build the first complete cycle, test its pacing, then add the rest.

---

## Phase 6: Horror implementation and polish

**Done when:** the horror feels authored, escalating, and coherent without relying on a visible monster or constant jump scares.

- [x] Story-driven director with CALM, UNEASY, WRONG, HORROR, and FINALE acts exists.
- [x] World time can be driven by story progress.
- [ ] Re-read the current cab and director code before deciding what is actually missing.
- [ ] Verify whether the existing cab interior is sufficient. Add only the minimum useful detail needed for atmosphere and readability.
- [ ] Use the rear-view mirror only if it supports a specific, effective event and can be implemented reliably.
- [x] Add the first authored repeated-sign event: Bellweather appears twice with the same twelve-mile distance along the uninterrupted highway.
- [x] Reveal each sign when its associated story paragraph begins typing; use two side supports so the pole does not obscure the sign text.
- [x] Remove the motion-blur post-processing pass after performance/readability feedback.
- [x] Remove visible stars while retaining the moon and clouds; deepen night ambience and grading.
- [ ] Verify sign timing, night darkness, moon/cloud visibility, headlight brightness, and FPS in a local playthrough.
- [ ] Add adversarial narration gradually: first strange, then personally specific, then demonstrably wrong about the player's experience.
- [ ] Let vehicle controls become subtly unreliable only during authored events. Keep normal driving trustworthy outside those moments.
- [ ] Use headlight failures, flickers, and reveals sparingly. Preserve player control wherever possible.
- [ ] Avoid a visible monster, an explanatory cutscene, a lore dump, or a confirmed identity for the other driver.
- [ ] Implement the Long Mode nightmare and false-awakening ending.
- [ ] Add accessibility settings for reduced flashing and reduced scare intensity if effects warrant them.
- [ ] Playtest pacing so quiet stretches remain quiet and major moments have room to land.

---

## Phase 7: Audio audit and final audio polish

**Do this after the main gameplay and story shape are stable.** Audio systems already exist, so inspect and test them before adding more.

**Done when:** audio communicates speed, road, time of day, and horror without needing a radio.

- [ ] Audit the current audio manager and all sound hooks. Record what works, what is missing, and what is broken before changing anything.
- [ ] Verify the synthesized engine sound responds sensibly to speed.
- [ ] Review road/tire sound, wind, town ambience, highway ambience, and night ambience. Add only the layers that materially help.
- [ ] Tune the cab/exterior mix if the current camera/audio architecture supports it cleanly.
- [ ] Build a small horror audio vocabulary: silence, distant ambiguous sounds, low ambience, brief mechanical irregularities, and positional sound only where it has a clear purpose.
- [ ] No radio, DJ, radio music loop, or radio-dependent story beat.
- [ ] Add master volume and any necessary separate volume controls.
- [ ] Use only free/licensed audio and record sources in `CREDITS.md`.
- [ ] Keep a playable experience with audio muted. Important story information must remain available through text and visuals.

---

## Phase 8: Ship

**Done when:** a new player can launch the game, understand the controls, finish either mode, and play without major bugs.

- [ ] Main menu with separate Short Mode and Long Mode choices.
- [ ] Settings for typing difficulty, audio, and relevant accessibility options.
- [ ] Credits and asset licences in `CREDITS.md`.
- [x] Vite base path and GitHub Pages deployment configuration exist.
- [x] Van model is bundled locally rather than hotlinked.
- [ ] Confirm all required assets are local and licensed.
- [ ] Verify controls and key hints match the final implementation.
- [ ] Test a clean load, pause/resume, reset, mode switching, and browser refresh.
- [ ] Play through all of Short Mode and the full Long Mode ending.
- [ ] Test with 3-5 people if possible; focus feedback on clarity, typing fairness, horror pacing, and whether the ending is understandable without being explained.
- [ ] Profile the baseline laptop and fix meaningful stutters, bugs, or readability issues.
- [ ] Confirm the game works at common desktop resolutions and remains playable at lower performance.
- [ ] Tag v1.0 only after both modes are complete and the ending is stable.

---

## Optional backlog (must not block release)

- Heuristic tension estimator using existing typing telemetry.
- A tiny TensorFlow.js model only if the heuristic is already useful and there is time.
- Semantris-style word-association mode.
- Tire-track shaders and stylized smoke particles.
- City traffic.
- Extra vehicle models, multiplayer, weather simulation, procedural story, mobile touch controls, level editor, and realistic vehicle simulation.

## Asset and tool policy

- Use free assets with compatible licences, such as Kenney and Quaternius CC0 assets, or properly licensed sources.
- Keep models and audio inside `public/models` and `public/audio` where appropriate.
- Record asset names, sources, and licences in `CREDITS.md`.
- Never hotlink assets in the final build.
- Keep tools and hosting free.

## Open decisions

| Decision | Status |
|---|---|
| Title | **Decided:** itsjustanidea |
| Core loop | **Decided:** WASD in towns, typing on highway |
| Modes | **Decided:** Short and Long are separate |
| Long Mode length | **Open:** decide the number of nights after testing one complete cycle |
| Headlights | **Decided:** manual player control |
| Towns | **Decided:** vehicle-only parking/stops; no walking, NPCs, or conversations |
| Refuelling | **Open:** add only if it adds meaningful choices and cannot soft-lock progress |
| Typing difficulty | **Decided:** Easy/Medium/Hard change pressure and mistake tolerance, not story access |
| Horror premise | **Decided direction:** another Elias-like driver appears to complete deliveries ahead of the player; exact cause stays ambiguous |
| Ending | **Decided:** nightmare/false awakening followed by persistent evidence and a cliffhanger loop |
| Audio | **Open until audit:** inspect existing implementation, then polish near the end |
| Final Long Mode pacing | **Open:** prototype one day-to-night cycle, then expand |
| Neural network and Semantris | **Optional backlog only** |

## Target file structure

Treat this as a guide, not a mandate to create files that already exist or reorganize working code just to match a diagram.

```
src/
  main.js
  game/
    state.js
    vehicle.js
    camera.js
    render.js
    world.js
    typing.js
    story.js
    director.js
    audio.js
    daycycle.js
    input.js
  ui/
    hud.js
public/
  models/
  audio/
CREDITS.md
ROADMAP.md
```


## Story modes and interchange integration

Edit `story/short.md` and `story/long.md`, then run `npm run story` to regenerate `src/game/storyText.js`. Choose short or long mode in the city with **1** or **2** before entering the highway. The original narrative script is preserved in `story/story-script.md`. The separate ramp, merge lane, and cross-highway are implemented in `src/game/interchange.js`.

### Highway layout (`src/game/highwayLayout.js`)

Ramp -> elevated deck (short west stub ending in a barrier; `HW.westX`) -> slow descent -> quarter-circle arc round a big hill (`HW.radius`, `HW.hillHeight`) -> z-indexed ground highway from `GROUND_START_Z`, where props, trees, signs and the road strip carry on procedurally. The terrain now recentres in x as well as z. `npm run check:highway` runs the geometry checks in plain node.
