import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
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

const TILT_BLUR = 2.5;       // blur strength at full tilt-shift
const TILT_FOCUS_Y = 0.5;    // the sharp horizontal strip (0 = bottom, 1 = top); the van sits mid-screen

const GRADE_MORNING = { saturation: 1.2, contrast: 1, lift: 0.004, vignette: 0.2, tint: new THREE.Color(1.02, 1.01, 1.0) };
const GRADE_EVENING = { saturation: 1.18, contrast: 1, lift: 0.002, vignette: 0.24, tint: new THREE.Color(1.1, 0.95, 0.86) };
const GRADE_NIGHT = { saturation: 0.8, contrast: 1, lift: 0.003, vignette: 0.28, tint: new THREE.Color(0.94, 0.92, 1.04) };

// Composer: Render -> SMAA -> tilt-shift (H, V) -> colour grade -> Output.
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

  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  });

  let tiltAmount = 0;
  const lerp = THREE.MathUtils.lerp;

  // tilt: 0..1 target (from the camera profile; fades in/out smoothly). worldTime: 0 = morning, 1 = night.
  function setLook({ tilt = 0, worldTime = 0, dt = 0 }) {
    tiltAmount += (tilt - tiltAmount) * (1 - Math.exp(-4 * dt));
    const on = tiltAmount > 0.01;
    hblur.enabled = vblur.enabled = on;
    if (on) {
      hblur.uniforms.h.value = (TILT_BLUR * tiltAmount) / window.innerWidth;
      vblur.uniforms.v.value = (TILT_BLUR * tiltAmount) / window.innerHeight;
    }

    const time = THREE.MathUtils.clamp(worldTime, 0, 1);
    const evening = THREE.MathUtils.smoothstep(time, 0.2, 0.62);
    const night = THREE.MathUtils.smoothstep(time, 0.62, 0.94);
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
  };
}
