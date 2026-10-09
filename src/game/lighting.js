import * as THREE from 'three';
import { dayFactors } from './daycycle.js';
import { createClouds } from './clouds.js';

const clamp01 = (value) => THREE.MathUtils.clamp(value, 0, 1);
const smooth = (edge0, edge1, value) => THREE.MathUtils.smoothstep(value, edge0, edge1);

function setCycleColor(target, morning, evening, night, eveningBlend, nightBlend) {
  target.copy(morning).lerp(evening, eveningBlend).lerp(night, nightBlend);
}

// A flat glowing square (the sun / moon) with a big soft halo around it. The plane is 3x the body size and the
// square only fills the middle third (SQ), so the halo has room to fade out before the plane edge.
function createGlowingBody(color, haloColor) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    toneMapped: false,
    uniforms: {
      color: { value: new THREE.Color(color) },
      haloColor: { value: new THREE.Color(haloColor) },
      opacity: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 color;
      uniform vec3 haloColor;
      uniform float opacity;
      varying vec2 vUv;
      const float SQ = 0.3333;
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float edge = max(abs(p.x), abs(p.y)) / SQ;
        float square = 1.0 - smoothstep(0.88, 0.96, edge);
        float r2 = dot(p, p);
        float halo = exp(-r2 * 9.0) * 0.30 + exp(-r2 * 45.0) * 0.45;
        gl_FragColor = vec4(color * square + haloColor * halo, max(square, halo) * opacity);
      }`,
  });
}

// An endless morning -> sunset -> night -> sunrise sky (see daycycle.js for the clock).
export function createLighting(scene) {
  const sun = new THREE.DirectionalLight(0xffe7c2, 1.6);
  sun.castShadow = true;
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 60;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.001;
  scene.add(sun);

  const sunTarget = new THREE.Object3D();
  scene.add(sunTarget);
  sun.target = sunTarget;

  const moon = new THREE.DirectionalLight(0xf0f2ff, 0);
  moon.castShadow = false;
  moon.shadow.camera.left = -30;
  moon.shadow.camera.right = 30;
  moon.shadow.camera.top = 30;
  moon.shadow.camera.bottom = -30;
  moon.shadow.camera.near = 1;
  moon.shadow.camera.far = 60;
  moon.shadow.mapSize.set(512, 512);
  moon.shadow.bias = -0.0015;
  scene.add(moon);
  const moonTarget = new THREE.Object3D();
  scene.add(moonTarget);
  moon.target = moonTarget;

  const hemi = new THREE.HemisphereLight(0x9ec6ff, 0x6f8f4f, 0.75);
  scene.add(hemi);

  const skyUniforms = {
    top: { value: new THREE.Color() },
    bottom: { value: new THREE.Color() },
    oppositeHorizon: { value: new THREE.Color(0x966084) },
    sunsetSide: { value: 1 },
    sunsetAmount: { value: 0 },
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    moonDir: { value: new THREE.Vector3(0, 1, 0) },
    sunGlowColor: { value: new THREE.Color(1, 0.9, 0.7) },
    sunGlow: { value: 0 },
    moonGlow: { value: 0 },

  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(800, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: skyUniforms,
      fragmentShader: `
        uniform vec3 top;
        uniform vec3 bottom;
        uniform vec3 oppositeHorizon;
        uniform float sunsetSide;
        uniform float sunsetAmount;
        uniform vec3 sunDir;
        uniform vec3 moonDir;
        uniform vec3 sunGlowColor;
        uniform float sunGlow;
        uniform float moonGlow;
        varying vec3 vDir;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

        // blocky square stars, one grid per cube face so there is no pinching at the poles
        float stars(vec3 dir) {
          vec3 a = abs(dir);
          vec2 uv;
          float face;
          if (a.x > a.y && a.x > a.z) { uv = dir.yz / a.x; face = 0.0; }
          else if (a.y > a.z) { uv = dir.xz / a.y; face = 1.0; }
          else { uv = dir.xy / a.z; face = 2.0; }
          uv *= 34.0;
          vec2 id = floor(uv) + face * 31.7;
          vec2 f = fract(uv) - 0.5;
          float h = hash(id);
          float size = 0.16 + 0.16 * hash(id + 3.1);
          float sq = 1.0 - step(size, max(abs(f.x), abs(f.y)));
          float twinkle = 0.65 + 0.35 * sin(uTime * 2.0 + h * 60.0);
          return step(0.975, h) * sq * twinkle;
        }

        void main() {
          vec3 dir = normalize(vDir);
          float h = dir.y;
          vec3 col = mix(bottom, top, smoothstep(-0.05, 0.6, h));

          // purple on the side opposite the sun at dusk / dawn
          float oppositeSide = smoothstep(0.0, 0.75, -dir.x * sunsetSide);
          float horizonBand = 1.0 - smoothstep(0.02, 0.48, abs(h));
          col = mix(col, oppositeHorizon, oppositeSide * horizonBand * sunsetAmount * 0.3);

          // sun glow: a wide warm wash that spreads further and hugs the horizon as the sun gets low, plus a hot core
          float lowSun = 1.0 - smoothstep(0.0, 0.4, sunDir.y);
          float sd = max(dot(dir, sunDir), 0.0);
          float wide = pow(sd, mix(7.0, 2.6, lowSun));
          float mid = pow(sd, 22.0);
          float core = pow(sd, 140.0);
          float hug = 1.0 + 1.6 * lowSun * (1.0 - smoothstep(0.0, 0.45, abs(h)));
          col += sunGlowColor * (wide * 0.5 + mid * 0.55 + core * 0.9) * hug * sunGlow;
          col = mix(col, sunGlowColor, wide * sunsetAmount * 0.18 * sunGlow);

          // moon glow, cool and quiet
          float md = max(dot(dir, moonDir), 0.0);
          col += vec3(0.5, 0.62, 1.0) * (pow(md, 9.0) * 0.18 + pow(md, 70.0) * 0.45) * moonGlow;

          // stars fade in with the night, only above the horizon, and are drowned out near the moon
          // Stars intentionally disabled for the game's quieter, clouded night sky.

          gl_FragColor = vec4(col, 1.0);
        }`,
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
    })
  );
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  scene.add(sky);

  const sunDisc = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), createGlowingBody(0xffffff, 0xff8a36));
  const moonDisc = new THREE.Mesh(new THREE.PlaneGeometry(78, 78), createGlowingBody(0xf0f2ff, 0x8999d8));
  sunDisc.renderOrder = -0.5; // behind the clouds (renderOrder 0), in front of the sky
  moonDisc.renderOrder = -0.5;
  scene.add(sunDisc, moonDisc);

  const clouds = createClouds(scene);

  const horizonMorning = new THREE.Color(0xb7d7f2);
  const horizonEvening = new THREE.Color(0xff762b);
  const horizonNight = new THREE.Color(0x21182f);
  const topMorning = new THREE.Color(0x4b91d0);
  const topEvening = new THREE.Color(0x70517f);
  const topNight = new THREE.Color(0x090713);
  const sunMorning = new THREE.Color(0xffedc4);
  const sunEvening = new THREE.Color(0xff4f00);
  const sunNight = new THREE.Color(0x271a38);
  const hemiSkyMorning = new THREE.Color(0xa8cefa);
  const hemiSkyEvening = new THREE.Color(0x8ea4d6);
  const hemiSkyNight = new THREE.Color(0x524978);
  const hemiGroundMorning = new THREE.Color(0x728b63);
  const hemiGroundEvening = new THREE.Color(0x66577a);
  const hemiGroundNight = new THREE.Color(0x352b49);
  const glowDay = new THREE.Color(1.0, 0.92, 0.7);
  const glowEvening = new THREE.Color(1.0, 0.5, 0.14);
  const cloudLitDay = new THREE.Color(1.0, 1.0, 1.0);
  const cloudLitEvening = new THREE.Color(1.0, 0.97, 0.92);
  const cloudLitNight = new THREE.Color(0.78, 0.82, 0.94);
  const cloudDarkDay = new THREE.Color(0.91, 0.94, 0.98);
  const cloudDarkEvening = new THREE.Color(0.88, 0.86, 0.9);
  const cloudDarkNight = new THREE.Color(0.63, 0.68, 0.82);
  const horizon = new THREE.Color();
  const skyTop = new THREE.Color();
  const sunColor = new THREE.Color();
  const hemiSky = new THREE.Color();
  const hemiGround = new THREE.Color();
  const cloudLit = new THREE.Color();
  const cloudDark = new THREE.Color();
  const sunDirection = new THREE.Vector3();
  const moonDirection = new THREE.Vector3();

  const SUN_DAY = 1.65, SUN_EVENING = 0.85;
  const HEMI_DAY = 0.8, HEMI_EVENING = 0.5, HEMI_NIGHT = 0.24;
  const MOON_NIGHT = 0.62;
  const FOG_DAY = 0.0055, FOG_EVENING = 0.0075, FOG_NIGHT = 0.010;
  const SKY_BODY_DISTANCE = 700;

  scene.background = horizon;
  scene.fog = new THREE.FogExp2(horizon, FOG_DAY);

  const lerp = THREE.MathUtils.lerp;
  // time = game clock in seconds (star twinkle, cloud drift)
  function update(worldTime, center, fogScale = 1, time = 0) {
    const { evening, night, dayFrac, moonFrac, moonAmount } = dayFactors(worldTime);
    // sun arcs from one side to the other between sunrise (dayFrac 0) and sunset (1), then stays below the horizon
    const sunAzimuth = lerp(-0.3, 0.3, clamp01(dayFrac));
    const sunElevation = dayFrac <= 1 ? -0.1 + 0.82 * Math.sin(Math.PI * dayFrac) : -0.3;
    const sunVisibility = smooth(-0.08, 0.12, sunElevation);

    setCycleColor(horizon, horizonMorning, horizonEvening, horizonNight, evening, night);
    scene.fog.color.copy(horizon);
    scene.fog.density = lerp(lerp(FOG_DAY, FOG_EVENING, evening), FOG_NIGHT, night) * fogScale;

    setCycleColor(skyTop, topMorning, topEvening, topNight, evening, night);
    sky.position.copy(center);
    skyUniforms.bottom.value.copy(horizon);
    skyUniforms.top.value.copy(skyTop);
    skyUniforms.sunsetAmount.value = evening * (1 - night);

    setCycleColor(sunColor, sunMorning, sunEvening, sunNight, evening, night);
    sun.color.copy(sunColor);
    sun.intensity = lerp(SUN_DAY, SUN_EVENING, evening) * sunVisibility;
    sun.castShadow = sunVisibility > 0.05;
    moon.castShadow = night > 0.5;
    hemi.color.copy(hemiSkyMorning).lerp(hemiSkyEvening, evening).lerp(hemiSkyNight, night);
    hemi.groundColor.copy(hemiGroundMorning).lerp(hemiGroundEvening, evening).lerp(hemiGroundNight, night);
    hemi.intensity = lerp(lerp(HEMI_DAY, HEMI_EVENING, evening), HEMI_NIGHT, night);

    sunDirection.set(
      Math.sin(sunAzimuth) * Math.cos(sunElevation),
      Math.sin(sunElevation),
      Math.cos(sunAzimuth) * Math.cos(sunElevation)
    ).normalize();
    sun.position.copy(center).addScaledVector(sunDirection, 40);
    sunTarget.position.copy(center);
    skyUniforms.sunsetSide.value = sunDirection.x < 0 ? -1 : 1;
    skyUniforms.sunDir.value.copy(sunDirection);
    skyUniforms.sunGlowColor.value.copy(glowDay).lerp(glowEvening, evening);
    skyUniforms.sunGlow.value = sunVisibility * lerp(0.4, 1.0, evening);
    sunDisc.position.copy(center).addScaledVector(sunDirection, SKY_BODY_DISTANCE);
    sunDisc.lookAt(center);
    sunDisc.scale.setScalar(1 + evening * 0.8);
    sunDisc.material.uniforms.color.value.set(0xffffff);
    sunDisc.material.uniforms.haloColor.value.copy(sunMorning).lerp(sunEvening, evening);
    sunDisc.material.uniforms.opacity.value = sunVisibility;
    sunDisc.visible = sunVisibility > 0.001;

    const moonAzimuth = lerp(-0.3, 0.1, moonFrac);
    const moonElevation = 0.12 + 0.63 * Math.sin(Math.PI * moonFrac); // rises, peaks, sets before sunrise
    moonDirection.set(
      Math.sin(moonAzimuth) * Math.cos(moonElevation),
      Math.sin(moonElevation),
      Math.cos(moonAzimuth) * Math.cos(moonElevation)
    ).normalize();
    moon.position.copy(center).addScaledVector(moonDirection, 40);
    moonTarget.position.copy(center);
    moon.intensity = MOON_NIGHT * moonAmount;
    skyUniforms.moonDir.value.copy(moonDirection);
    skyUniforms.moonGlow.value = moonAmount;
    moonDisc.position.copy(center).addScaledVector(moonDirection, SKY_BODY_DISTANCE);
    moonDisc.lookAt(center);
    moonDisc.material.uniforms.opacity.value = moonAmount;
    moonDisc.visible = moonAmount > 0.001;

    cloudLit.copy(cloudLitDay).lerp(cloudLitEvening, evening).lerp(cloudLitNight, night);
    cloudDark.copy(cloudDarkDay).lerp(cloudDarkEvening, evening).lerp(cloudDarkNight, night);
    clouds.update(center, time, cloudLit, cloudDark, lerp(1.0, 0.94, night));
  }

  function getKeyLightDirection(target) {
    return target.copy(moon.intensity > sun.intensity ? moonDirection : sunDirection);
  }

  return { update, getKeyLightDirection };
}
