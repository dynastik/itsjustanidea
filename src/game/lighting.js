import * as THREE from 'three';

// Day -> dusk look, keyed entirely off worldTime (0..1).
// Fog colour is locked to the sky's horizon colour, so distant terrain melts into the sky with no seam.
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

  // Coloured hemisphere fill (blue from above, green bounce from below) keeps shadows colourful, not grey.
  const hemi = new THREE.HemisphereLight(0x9ec6ff, 0x6f8f4f, 0.75);
  scene.add(hemi);

  // Gradient sky dome, centred on the vehicle. Bottom colour == fog colour.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(800, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } },
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

  const fogDay = new THREE.Color(0xbfd9ea), fogDusk = new THREE.Color(0x151827);
  const topDay = new THREE.Color(0x5fa3e0), topDusk = new THREE.Color(0x090d19);
  const sunColorDay = new THREE.Color(0xffe7c2), sunColorDusk = new THREE.Color(0x9aa0c8);
  const hemiSkyDay = new THREE.Color(0x9ec6ff), hemiSkyDusk = new THREE.Color(0x4a3c6e);
  const hemiGroundDay = new THREE.Color(0x6f8f4f), hemiGroundDusk = new THREE.Color(0x2a2a30);
  const fog = new THREE.Color(fogDay);

  const SUN_DAY = 1.6, SUN_DUSK = 0.35;
  const HEMI_DAY = 0.75, HEMI_DUSK = 0.25;
  // FogExp2: factor = 1 - exp(-(density * distance)^2). Dense enough that the terrain edge (~300 m) is hidden.
  const FOG_DAY = 0.0055, FOG_DUSK = 0.015;

  scene.background = fog; // same object as the fog colour
  scene.fog = new THREE.FogExp2(fog, FOG_DAY);

  const lerp = THREE.MathUtils.lerp;

  function update(worldTime, center) {
    fog.copy(fogDay).lerp(fogDusk, worldTime);
    scene.fog.density = lerp(FOG_DAY, FOG_DUSK, worldTime);

    sky.position.copy(center);
    sky.material.uniforms.bottom.value.copy(fog);
    sky.material.uniforms.top.value.copy(topDay).lerp(topDusk, worldTime);

    sun.color.copy(sunColorDay).lerp(sunColorDusk, worldTime);
    sun.intensity = lerp(SUN_DAY, SUN_DUSK, worldTime);
    hemi.color.copy(hemiSkyDay).lerp(hemiSkyDusk, worldTime);
    hemi.groundColor.copy(hemiGroundDay).lerp(hemiGroundDusk, worldTime);
    hemi.intensity = lerp(HEMI_DAY, HEMI_DUSK, worldTime);

    // low, golden-hour sun; the shadow frustum follows the vehicle
    sun.position.set(center.x + 20, 13, center.z + 11);
    sunTarget.position.set(center.x, 1, center.z);
  }

  return { update };
}
