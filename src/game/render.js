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
    uniform vec3 tint;
    uniform float lift;
    uniform float vignette;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      vec3 col = mix(vec3(l), c.rgb, saturation) * tint;
      col = col * (1.0 - lift) + vec3(lift);                 // lifted blacks
      float d = distance(vUv, vec2(0.5));
      col *= mix(1.0, smoothstep(0.85, 0.25, d), vignette);  // vignette
      gl_FragColor = vec4(col, c.a);
    }`,
};

const TILT_BLUR = 2.5;       // blur strength at full tilt-shift
const TILT_FOCUS_Y = 0.5;    // the sharp horizontal strip (0 = bottom, 1 = top); the van sits mid-screen

const GRADE_DAY = { saturation: 1.25, lift: 0.008, vignette: 0.25, tint: new THREE.Color(1.04, 1.0, 0.93) };
const GRADE_DUSK = { saturation: 0.8, lift: 0.025, vignette: 0.5, tint: new THREE.Color(0.96, 0.92, 0.87) };

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

  // tilt: 0..1 target (from the camera profile; fades in/out smoothly). worldTime: 0 = day, 1 = dusk.
  function setLook({ tilt = 0, worldTime = 0, dt = 0 }) {
    tiltAmount += (tilt - tiltAmount) * (1 - Math.exp(-4 * dt));
    const on = tiltAmount > 0.01;
    hblur.enabled = vblur.enabled = on;
    if (on) {
      hblur.uniforms.h.value = (TILT_BLUR * tiltAmount) / window.innerWidth;
      vblur.uniforms.v.value = (TILT_BLUR * tiltAmount) / window.innerHeight;
    }

    const u = grade.uniforms;
    u.saturation.value = lerp(GRADE_DAY.saturation, GRADE_DUSK.saturation, worldTime);
    u.lift.value = lerp(GRADE_DAY.lift, GRADE_DUSK.lift, worldTime);
    u.vignette.value = lerp(GRADE_DAY.vignette, GRADE_DUSK.vignette, worldTime);
    u.tint.value.copy(GRADE_DAY.tint).lerp(GRADE_DUSK.tint, worldTime);
  }

  return {
    domElement: renderer.domElement,
    render: () => composer.render(),
    setLook,
  };
}
