import * as THREE from 'three';

const clamp01 = (value) => THREE.MathUtils.clamp(value, 0, 1);
const smooth = (edge0, edge1, value) => THREE.MathUtils.smoothstep(value, edge0, edge1);

function setCycleColor(target, morning, evening, night, eveningBlend, nightBlend) {
  target.copy(morning).lerp(evening, eveningBlend).lerp(night, nightBlend);
}

// A three-stage morning -> sunset -> night cycle. Sky horizon and fog always share one color.
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

  const moon = new THREE.DirectionalLight(0xc9c3ff, 0);
  scene.add(moon);
  const moonTarget = new THREE.Object3D();
  scene.add(moonTarget);
  moon.target = moonTarget;

  const hemi = new THREE.HemisphereLight(0x9ec6ff, 0x6f8f4f, 0.75);
  scene.add(hemi);

  const skyUniforms = {
    top: { value: new THREE.Color() },
    bottom: { value: new THREE.Color() },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(800, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: skyUniforms,
      vertexShader: `
        varying float vH;
        void main() {
          vH = normalize(position).y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 top;
        uniform vec3 bottom;
        varying float vH;
        void main() {
          gl_FragColor = vec4(mix(bottom, top, smoothstep(-0.05, 0.6, vH)), 1.0);
        }`,
    })
  );
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  scene.add(sky);

  const sunDisc = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 16),
    new THREE.MeshBasicMaterial({ color: 0xffd283, transparent: true, depthWrite: false, fog: false, toneMapped: false })
  );
  const moonDisc = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 12),
    new THREE.MeshBasicMaterial({ color: 0xe0d9ff, transparent: true, depthWrite: false, fog: false, toneMapped: false })
  );
  sunDisc.renderOrder = 1;
  moonDisc.renderOrder = 1;
  scene.add(sunDisc, moonDisc);

  const horizonMorning = new THREE.Color(0xb7d7f2);
  const horizonEvening = new THREE.Color(0xf0a06b);
  const horizonNight = new THREE.Color(0x21182f);
  const topMorning = new THREE.Color(0x4b91d0);
  const topEvening = new THREE.Color(0x663b70);
  const topNight = new THREE.Color(0x090713);
  const sunMorning = new THREE.Color(0xffedc4);
  const sunEvening = new THREE.Color(0xff9d4d);
  const sunNight = new THREE.Color(0x271a38);
  const hemiSkyMorning = new THREE.Color(0xa8cefa);
  const hemiSkyEvening = new THREE.Color(0xf2a47a);
  const hemiSkyNight = new THREE.Color(0x524978);
  const hemiGroundMorning = new THREE.Color(0x728b63);
  const hemiGroundEvening = new THREE.Color(0x87614f);
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
  const MOON_NIGHT = 0.3;
  const FOG_DAY = 0.0055, FOG_EVENING = 0.0075, FOG_NIGHT = 0.010;
  const SKY_BODY_DISTANCE = 700;
  const DUSK_START = 0.2, DUSK_END = 0.62;
  const NIGHT_START = 0.62, NIGHT_END = 0.94;

  scene.background = horizon;
  scene.fog = new THREE.FogExp2(horizon, FOG_DAY);

  const lerp = THREE.MathUtils.lerp;
  function update(worldTime, center) {
    const time = clamp01(worldTime);
    const evening = smooth(DUSK_START, DUSK_END, time);
    const night = smooth(NIGHT_START, NIGHT_END, time);
    const sunVisibility = 1 - smooth(0.65, 0.79, time);

    setCycleColor(horizon, horizonMorning, horizonEvening, horizonNight, evening, night);
    scene.fog.color.copy(horizon);
    scene.fog.density = lerp(lerp(FOG_DAY, FOG_EVENING, evening), FOG_NIGHT, night);

    setCycleColor(skyTop, topMorning, topEvening, topNight, evening, night);
    sky.position.copy(center);
    skyUniforms.bottom.value.copy(horizon);
    skyUniforms.top.value.copy(skyTop);

    setCycleColor(sunColor, sunMorning, sunEvening, sunNight, evening, night);
    sun.color.copy(sunColor);
    sun.intensity = lerp(SUN_DAY, SUN_EVENING, evening) * sunVisibility;
    sun.castShadow = sunVisibility > 0.05;
    hemi.color.copy(hemiSkyMorning).lerp(hemiSkyEvening, evening).lerp(hemiSkyNight, night);
    hemi.groundColor.copy(hemiGroundMorning).lerp(hemiGroundEvening, evening).lerp(hemiGroundNight, night);
    hemi.intensity = lerp(lerp(HEMI_DAY, HEMI_EVENING, evening), HEMI_NIGHT, night);

    const sunProgress = clamp01(time / 0.68);
    const sunAzimuth = lerp(-0.3, 0.3, sunProgress);
    const sunElevation = 0.12 + Math.sin(Math.PI * sunProgress) * 0.88;
    sunDirection.set(
      Math.sin(sunAzimuth) * Math.cos(sunElevation),
      Math.sin(sunElevation),
      Math.cos(sunAzimuth) * Math.cos(sunElevation)
    ).normalize();
    sun.position.copy(center).addScaledVector(sunDirection, 40);
    sunTarget.position.copy(center);
    sunDisc.position.copy(center).addScaledVector(sunDirection, SKY_BODY_DISTANCE);
    sunDisc.lookAt(center);
    sunDisc.material.opacity = sunVisibility;
    sunDisc.visible = sunVisibility > 0.001;

    const moonProgress = clamp01((time - 0.65) / 0.35);
    const moonAzimuth = lerp(-0.3, -0.05, moonProgress);
    const moonElevation = lerp(0.12, 0.75, moonProgress);
    moonDirection.set(
      Math.sin(moonAzimuth) * Math.cos(moonElevation),
      Math.sin(moonElevation),
      Math.cos(moonAzimuth) * Math.cos(moonElevation)
    ).normalize();
    moon.position.copy(center).addScaledVector(moonDirection, 40);
    moonTarget.position.copy(center);
    moon.intensity = MOON_NIGHT * smooth(0.67, 0.88, time);
    moonDisc.position.copy(center).addScaledVector(moonDirection, SKY_BODY_DISTANCE);
    moonDisc.lookAt(center);
    moonDisc.material.opacity = smooth(0.67, 0.84, time);
    moonDisc.visible = moonDisc.material.opacity > 0.001;
  }

  return { update };
}
