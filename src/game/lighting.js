import * as THREE from 'three';
import { dayFactors } from './daycycle.js';

const clamp01 = (value) => THREE.MathUtils.clamp(value, 0, 1);
const smooth = (edge0, edge1, value) => THREE.MathUtils.smoothstep(value, edge0, edge1);

function setCycleColor(target, morning, evening, night, eveningBlend, nightBlend) {
  target.copy(morning).lerp(evening, eveningBlend).lerp(night, nightBlend);
}

function createGlowingSquare(color, haloColor) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
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
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float edge = max(abs(p.x), abs(p.y));
        float square = 1.0 - smoothstep(0.88, 0.96, edge);
        float halo = exp(-dot(p, p) * 5.0) * 0.22;
        gl_FragColor = vec4(color * square + haloColor * halo, max(square, halo * 0.7) * opacity);
      }`,
  });
}

// An endless morning -> sunset -> night -> sunrise cycle (see daycycle.js). Sky horizon and fog always share one color.
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
        varying float vH;
        varying float vX;
        void main() {
          vec3 skyColor = mix(bottom, top, smoothstep(-0.05, 0.6, vH));
          float oppositeSide = smoothstep(0.0, 0.75, -vX * sunsetSide);
          float horizonBand = 1.0 - smoothstep(0.02, 0.48, abs(vH));
          float purpleAmount = oppositeSide * horizonBand * sunsetAmount * 0.3;
          gl_FragColor = vec4(mix(skyColor, oppositeHorizon, purpleAmount), 1.0);
        }`,
      vertexShader: `
        varying float vH;
        varying float vX;
        void main() {
          vec3 direction = normalize(position);
          vH = direction.y;
          vX = direction.x;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
    })
  );
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  scene.add(sky);

  const sunDisc = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    createGlowingSquare(0xffffff, 0xff8a36)
  );
  const moonDisc = new THREE.Mesh(
    new THREE.PlaneGeometry(26, 26),
    createGlowingSquare(0xf0f2ff, 0x8999d8)
  );
  sunDisc.renderOrder = 1;
  moonDisc.renderOrder = 1;
  scene.add(sunDisc, moonDisc);

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
  const horizon = new THREE.Color();
  const skyTop = new THREE.Color();
  const sunColor = new THREE.Color();
  const hemiSky = new THREE.Color();
  const hemiGround = new THREE.Color();
  const sunDirection = new THREE.Vector3();
  const moonDirection = new THREE.Vector3();

  const SUN_DAY = 1.65, SUN_EVENING = 0.85;
  const HEMI_DAY = 0.8, HEMI_EVENING = 0.55, HEMI_NIGHT = 0.42;
  const MOON_NIGHT = 0.62;
  const FOG_DAY = 0.0055, FOG_EVENING = 0.0075, FOG_NIGHT = 0.010;
  const SKY_BODY_DISTANCE = 700;

  scene.background = horizon;
  scene.fog = new THREE.FogExp2(horizon, FOG_DAY);

  const lerp = THREE.MathUtils.lerp;
  function update(worldTime, center, fogScale = 1) {
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
    moonDisc.position.copy(center).addScaledVector(moonDirection, SKY_BODY_DISTANCE);
    moonDisc.lookAt(center);
    moonDisc.material.uniforms.opacity.value = moonAmount;
    moonDisc.visible = moonDisc.material.uniforms.opacity.value > 0.001;
  }

  function getKeyLightDirection(target) {
    return target.copy(moon.intensity > sun.intensity ? moonDirection : sunDirection);
  }

  return { update, getKeyLightDirection };
}
