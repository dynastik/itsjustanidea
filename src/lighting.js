import * as THREE from 'three';

// Day -> dusk look, keyed entirely off worldTime (0..1).
export function createLighting(scene) {
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.castShadow = true;
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 60;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.001;
  scene.add(sun);

  const sunTarget = new THREE.Object3D();
  scene.add(sunTarget);
  sun.target = sunTarget;

  const ambient = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambient);

  const skyDay = new THREE.Color(0x87ceeb);
  const skyDusk = new THREE.Color(0x2b1f38);
  const sunColorDay = new THREE.Color(0xffffff);
  const sunColorDusk = new THREE.Color(0x9aa0c8);
  const tmpSky = new THREE.Color(skyDay);

  const SUN_DAY = 1.5, SUN_DUSK = 0.35;
  const AMB_DAY = 0.4, AMB_DUSK = 0.12;
  const FOG_NEAR_DAY = 120, FOG_FAR_DAY = 320;
  const FOG_NEAR_DUSK = 15, FOG_FAR_DUSK = 70;

  scene.background = tmpSky;
  scene.fog = new THREE.Fog(skyDay.clone(), FOG_NEAR_DAY, FOG_FAR_DAY);

  const lerp = THREE.MathUtils.lerp;

  function update(worldTime, center) {
    tmpSky.copy(skyDay).lerp(skyDusk, worldTime); // scene.background is this same object
    scene.fog.color.copy(tmpSky);
    scene.fog.near = lerp(FOG_NEAR_DAY, FOG_NEAR_DUSK, worldTime);
    scene.fog.far = lerp(FOG_FAR_DAY, FOG_FAR_DUSK, worldTime);

    sun.color.copy(sunColorDay).lerp(sunColorDusk, worldTime);
    sun.intensity = lerp(SUN_DAY, SUN_DUSK, worldTime);
    ambient.intensity = lerp(AMB_DAY, AMB_DUSK, worldTime);

    // shadow frustum follows the vehicle
    sun.position.set(center.x + 15, 21, center.z + 10);
    sunTarget.position.set(center.x, 1, center.z);
  }

  return { update };
}
