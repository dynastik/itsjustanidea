// Blocky flat clouds on one big plane that follows the vehicle: a single draw call, no textures, discarded
// where empty. Cloud pattern is a function of WORLD position, so clouds stay put while you drive past
// them and drift slowly with the wind. Colours come from the day cycle (white by day, orange/pink at
// sunset, dark blue at night), so they catch the sunset like in the reference.
import * as THREE from 'three';

const HEIGHT = 150;       // metres above the vehicle
const SIZE = 2000;
const FADE_START = 500;   // clouds melt into the horizon between these distances
const FADE_END = 950;
const WIND = new THREE.Vector2(3, 1.2); // m/s

export function createClouds(scene) {
  const uniforms = {
    lit: { value: new THREE.Color(1, 1, 1) },
    dark: { value: new THREE.Color(0.8, 0.85, 0.95) },
    uTime: { value: 0 },
    uOpacity: { value: 0.9 },
    uCenter: { value: new THREE.Vector2() },
    uWind: { value: WIND },
    uFade: { value: new THREE.Vector2(FADE_START, FADE_END) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    vertexShader: `
      varying vec2 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform vec3 lit;
      uniform vec3 dark;
      uniform float uTime;
      uniform float uOpacity;
      uniform vec2 uCenter;
      uniform vec2 uWind;
      uniform vec2 uFade;
      varying vec2 vWorld;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        float d = length(vWorld - uCenter);
        float fade = 1.0 - smoothstep(uFade.x, uFade.y, d);
        if (fade < 0.01) discard;
        vec2 wp = vWorld + uWind * uTime;
        vec2 cell = floor(wp / vec2(70.0, 50.0));
        float n = hash(cell) * 0.65 + hash(floor(cell / 3.0)) * 0.35; // big clumps made of small blocks
        if (n < 0.6) discard;
        vec3 col = mix(lit, dark, hash(cell + 7.7) * 0.7);
        gl_FragColor = vec4(col, uOpacity * fade);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE).rotateX(-Math.PI / 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 0; // after the sun/moon (renderOrder -0.5) so clouds drift in front of them
  scene.add(mesh);

  return {
    update(center, time, lit, dark, opacity) {
      mesh.position.set(center.x, center.y + HEIGHT, center.z);
      uniforms.uCenter.value.set(center.x, center.z);
      uniforms.uTime.value = time;
      uniforms.lit.value.copy(lit);
      uniforms.dark.value.copy(dark);
      uniforms.uOpacity.value = opacity;
    },
  };
}
