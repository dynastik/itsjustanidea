import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { dayFactors } from './daycycle.js';
import { HorizontalTiltShiftShader } from 'three/addons/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/addons/shaders/VerticalTiltShiftShader.js';

// Film-print colour grade: saturation, tint, lifted blacks, vignette. Driven by worldTime (see setLook)
// so it can sour toward dusk, and later toward the horror pivot.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    saturation: { value: 1.2 },
    contrast: { value: 1 },
    tint: { value: new THREE.Color(1, 1, 1) },
    lift: { value: 0.01 },
    vignette: { value: 0.3 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float saturation;
    uniform float contrast;
    uniform vec3 tint;
    uniform float lift;
    uniform float vignette;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      vec3 col = mix(vec3(l), c.rgb, saturation) * tint;
      col = (col - 0.5) * contrast + 0.5;
      col = col * (1.0 - lift) + vec3(lift);                 // lifted blacks
      float d = distance(vUv, vec2(0.5));
      col *= mix(1.0, smoothstep(0.85, 0.25, d), vignette);  // vignette
      gl_FragColor = vec4(col, c.a);
    }`,
};

// Speed-dependent peripheral blur. The centre stays readable; only the outer image gets a
// tiny radial smear, suggesting forward motion without turning the miniature scenery to mush.
const SpeedBlurShader = {
  uniforms: {
    tDiffuse: { value: null },
    amount: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float amount;
    varying vec2 vUv;
    void main() {
      vec2 fromCentre = vUv - vec2(0.5);
      float radius = length(fromCentre);
      vec2 direction = radius > 0.0001 ? fromCentre / radius : vec2(0.0);
      float edgeMask = smoothstep(0.16, 0.72, radius);
      vec2 blur = direction * amount * edgeMask;
      vec4 col = texture2D(tDiffuse, vUv) * 0.4;
      col += texture2D(tDiffuse, vUv + blur) * 0.24;
      col += texture2D(tDiffuse, vUv - blur) * 0.24;
      col += texture2D(tDiffuse, vUv + blur * 2.0) * 0.06;
      col += texture2D(tDiffuse, vUv - blur * 2.0) * 0.06;
      gl_FragColor = col;
    }`,
};

const TILT_FOCUS_Y = 0.5;    // the sharp horizontal strip (0 = bottom, 1 = top); the van sits mid-screen

const GRADE_MORNING = { saturation: 1.2, contrast: 1, lift: 0.004, vignette: 0.2, tint: new THREE.Color(1.02, 1.01, 1.0) };
const GRADE_EVENING = { saturation: 1.18, contrast: 1, lift: 0.002, vignette: 0.24, tint: new THREE.Color(1.1, 0.95, 0.86) };
const GRADE_NIGHT = { saturation: 0.8, contrast: 1, lift: 0.003, vignette: 0.28, tint: new THREE.Color(0.94, 0.92, 1.04) };

// Composer: Render -> SMAA -> tilt-shift (H, V) -> subtle speed blur -> colour grade -> Output.
export function createRenderer(scene, camera) {
  const renderer = new THREE.WebGLRenderer({ antialias: false }); // SMAA replaces MSAA
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  document.body.appendChild(renderer.domElement);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new SMAAPass());

  // Screen-space tilt-shift: blur grows with distance from a horizontal focus strip. Cheaper and cleaner
  // than a depth-based bokeh, and exactly the "miniature" look. Switched off entirely when not wanted.
  const hblur = new ShaderPass(HorizontalTiltShiftShader);
  const vblur = new ShaderPass(VerticalTiltShiftShader);
  hblur.uniforms.r.value = vblur.uniforms.r.value = TILT_FOCUS_Y;
  hblur.enabled = vblur.enabled = false;
  composer.addPass(hblur);
  composer.addPass(vblur);

  const speedBlur = new ShaderPass(SpeedBlurShader);
  composer.addPass(speedBlur);

  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  });

  // Adaptive resolution: if the frame rate sags for a couple of seconds, render at a lower pixel ratio (0.25 steps,
  // never below 0.75); creep back up when it has been smooth for a while. A safety net for weak GPUs, and it
  // stays out of the way (no change) on a machine that holds 60 FPS.
  const maxPixelRatio = Math.min(window.devicePixelRatio, 2);
  let pixelRatio = maxPixelRatio;
  let avgFrame = 1 / 60;
  let slowFor = 0;
  let fastFor = 0;
  let cooldown = 0; // after dropping, do not try to go back up for a while (stops flip-flopping)
  function adapt(dt) {
    if (dt <= 0) return; // paused
    avgFrame += (dt - avgFrame) * 0.05;
    cooldown = Math.max(0, cooldown - dt);
    if (avgFrame > 1 / 45) { slowFor += dt; fastFor = 0; }
    else if (avgFrame < 1 / 57) { fastFor += dt; slowFor = 0; }
    else { slowFor = 0; fastFor = 0; }
    let next = pixelRatio;
    if (slowFor > 2 && pixelRatio > 0.75) next = Math.max(0.75, pixelRatio - 0.25);
    else if (fastFor > 10 && cooldown === 0 && pixelRatio < maxPixelRatio) next = Math.min(maxPixelRatio, pixelRatio + 0.25);
    if (next === pixelRatio) return;
    if (next < pixelRatio) cooldown = 40;
    pixelRatio = next;
    slowFor = fastFor = 0;
    renderer.setPixelRatio(pixelRatio);
    composer.setPixelRatio(pixelRatio);
    if (import.meta.env.DEV) console.info('[render] pixel ratio ->', pixelRatio);
  }

  let tiltAmount = 0;
  const lerp = THREE.MathUtils.lerp;

  // tilt is the target blur radius in CSS pixels (from the camera profile; fades in/out smoothly).
  // worldTime: looping day clock, 0..1 = one full day (see daycycle.js).
  function setLook({ tilt = 0, worldTime = 0, dt = 0, speed = 0 }) {
    tiltAmount += (tilt - tiltAmount) * (1 - Math.exp(-4 * dt));
    const on = tiltAmount > 0.01;
    hblur.enabled = vblur.enabled = on;
    if (on) {
      hblur.uniforms.h.value = tiltAmount / window.innerWidth;
      vblur.uniforms.v.value = tiltAmount / window.innerHeight;
    }

    // vehicle speed is in m/s. Keep the effect off at low speeds and cap it so road text stays legible.
    const speedFactor = THREE.MathUtils.smoothstep(Math.max(0, speed), 5, 24);
    speedBlur.uniforms.amount.value = 0.0025 * speedFactor;

    const { evening, night } = dayFactors(worldTime);
    const u = grade.uniforms;
    u.saturation.value = lerp(lerp(GRADE_MORNING.saturation, GRADE_EVENING.saturation, evening), GRADE_NIGHT.saturation, night);
    u.contrast.value = lerp(lerp(GRADE_MORNING.contrast, GRADE_EVENING.contrast, evening), GRADE_NIGHT.contrast, night);
    u.lift.value = lerp(lerp(GRADE_MORNING.lift, GRADE_EVENING.lift, evening), GRADE_NIGHT.lift, night);
    u.vignette.value = lerp(lerp(GRADE_MORNING.vignette, GRADE_EVENING.vignette, evening), GRADE_NIGHT.vignette, night);
    u.tint.value.copy(GRADE_MORNING.tint).lerp(GRADE_EVENING.tint, evening).lerp(GRADE_NIGHT.tint, night);
  }

  return {
    domElement: renderer.domElement,
    render: () => composer.render(),
    setLook,
    adapt,
  };
}
