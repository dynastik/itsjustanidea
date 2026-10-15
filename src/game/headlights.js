// Manual forward-facing headlights (F5). Only authored story cues can interfere.
import * as THREE from 'three';
import { state } from './state.js';
import { getHeadlightGlitch } from './director.js';

export const HEADLIGHT_CONFIG = {
  color: 0xffe8c2, intensity: 42, distance: 82, angle: Math.PI / 7,
  penumbra: 0.72, decay: 1.2, spacing: 0.34, fadeSpeed: 30,
};
const KEEP_IN_SCENE = true; // toggling light.visible changes the light count and recompiles every lit material (a visible hitch)
// ?beam=single: one centred spotlight instead of two (cheaper on weak GPUs). Set once at load; changing it live would recompile.
const SINGLE_BEAM = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('beam') === 'single';

export function createHeadlights(vehicle) {
  const cfg = HEADLIGHT_CONFIG;
  const lights = (SINGLE_BEAM ? [0] : [-cfg.spacing, cfg.spacing]).map((x) => {
    const light = new THREE.SpotLight(cfg.color, 0, cfg.distance, cfg.angle, cfg.penumbra, cfg.decay);
    light.position.set(x, 0.12, 1.05);
    light.castShadow = false;
    const target = new THREE.Object3D();
    target.position.set(x * 1.8, -0.7, 34);
    vehicle.visual.add(light, target);
    light.target = target;
    light.visible = KEEP_IN_SCENE;
    return light;
  });
  let level = 0;
  function apply() {
    const intensity = level < 0.002 ? 0 : cfg.intensity * level * (SINGLE_BEAM ? 1.7 : 1);
    for (const light of lights) {
      light.intensity = intensity;
      if (!KEEP_IN_SCENE) light.visible = intensity > 0;
    }
  }
  return {
    toggle() { state.headlightsOn = !state.headlightsOn; },
    reset() { state.headlightsOn = false; level = 0; apply(); },
    update(dt, time) {
      const target = state.headlightsOn ? 1 - getHeadlightGlitch(time) : 0;
      level += (target - level) * (1 - Math.exp(-cfg.fadeSpeed * dt));
      apply();
    },
  };
}
