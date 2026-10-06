import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const CAMERA_PROFILES = {
  chase: {
    fov: 70, fovSpeedGain: 0.25, fovSpeedRef: 30,
    distance: 7, height: 3.5, lookHeight: 0.5,
    followSmoothing: 0.001,
    exteriorVisible: true,
    tilt: 2.2,
  },
  cab: {
    fov: 80, fovSpeedGain: 0.15, fovSpeedRef: 30,
    exteriorVisible: false,
  },
  // "Toy car" diorama look: high, far, narrow FOV, a little follow lag, softer tilt-shift.
  toy: {
    fov: 22, fovSpeedGain: 0.05, fovSpeedRef: 30,
    distance: 45, height: 22, lookHeight: 0.5,
    followSmoothing: 0.02,
    exteriorVisible: true,
    tilt: 3.5,
  },
};

export function createCameraRig(camera, domElement, vehicle, cabInterior) {
  const orbit = new OrbitControls(camera, domElement);
  orbit.enabled = false;

  let profileName = 'chase';
  let exteriorProfile = 'chase'; // which exterior look F2 returns to after cab view
  let debug = false;
  let dragging = false;
  let yaw = 0;
  let pitch = 0;

  const pos = new THREE.Vector3(0, 3, 8);
  const look = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const lookDesired = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  domElement.addEventListener('pointerdown', () => { if (!debug) dragging = true; });
  window.addEventListener('pointerup', () => { dragging = false; });
  window.addEventListener('pointermove', (e) => {
    if (!dragging || debug) return;
    yaw -= e.movementX * 0.005;
    pitch = THREE.MathUtils.clamp(pitch + e.movementY * 0.005, -0.4, 0.9);
  });

  // DEV TUNER (cab view only): arrows move the eye (x = left/right, z = forward/back), PageUp/PageDown raise/lower it,
  // Home shows/hides the van body. Paste the logged cabEyeTrim into VEHICLE_CONFIG when it feels right.
  window.addEventListener('keydown', (e) => {
    if (profileName !== 'cab' || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = vehicle.cfg.cabEyeTrim;
    const step = 0.05;
    let moved = true;
    switch (e.key) {
      case 'ArrowLeft': t.x += step; break;   // +x is the van's left
      case 'ArrowRight': t.x -= step; break;
      case 'ArrowUp': t.z += step; break;
      case 'ArrowDown': t.z -= step; break;
      case 'PageUp': t.y += step; break;
      case 'PageDown': t.y -= step; break;
      case 'Home':
        e.preventDefault();
        CAMERA_PROFILES.cab.exteriorVisible = !CAMERA_PROFILES.cab.exteriorVisible;
        vehicle.setExteriorVisible(CAMERA_PROFILES.cab.exteriorVisible);
        console.info('[cab] van body visible:', CAMERA_PROFILES.cab.exteriorVisible);
        return;
      default: moved = false;
    }
    if (!moved) return;
    e.preventDefault();
    if (cabInterior) cabInterior.layout(vehicle.getLocalBounds());
    console.info(`[cab] cabEyeTrim: { x: ${t.x.toFixed(2)}, y: ${t.y.toFixed(2)}, z: ${t.z.toFixed(2)} }`);
  });

  function update(dt) {
    if (debug) { orbit.update(); return; }

    const prof = CAMERA_PROFILES[profileName];
    if (!dragging) {
      const k = Math.exp(-3 * dt);
      yaw *= k;
      pitch *= k;
    }

    const targetFov = prof.fov + Math.min(Math.abs(vehicle.speed), prof.fovSpeedRef) * prof.fovSpeedGain;
    const nf = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.exp(-4 * dt));
    if (Math.abs(nf - camera.fov) > 0.001) {
      camera.fov = nf;
      camera.updateProjectionMatrix();
    }

    const c = vehicle.center;

    if (profileName === 'cab') {
      pos.copy(vehicle.cabEye).applyQuaternion(vehicle.quaternion).add(c);
      dir.set(0, 0, 1).applyQuaternion(vehicle.quaternion).applyAxisAngle(up, yaw);
      dir.y -= pitch * 0.8;
      dir.normalize();
      lookDesired.copy(pos).addScaledVector(dir, 10);
      look.copy(lookDesired);
      camera.position.copy(pos);
      camera.lookAt(look);
      return;
    }

    const a = vehicle.heading + yaw;
    const d = prof.distance;
    desired.set(
      c.x - Math.sin(a) * d * Math.cos(pitch),
      c.y + prof.height + Math.sin(pitch) * d,
      c.z - Math.cos(a) * d * Math.cos(pitch)
    );
    lookDesired.set(c.x, c.y + prof.lookHeight, c.z);

    const f = 1 - Math.pow(prof.followSmoothing, dt);
    pos.lerp(desired, f);
    look.lerp(lookDesired, f);
    camera.position.copy(pos);
    camera.lookAt(look);
  }

  return {
    update,
    get profile() { return profileName; },
    toggleCab() {
      if (profileName === 'cab') profileName = exteriorProfile;
      else { exteriorProfile = profileName; profileName = 'cab'; }
      vehicle.setExteriorVisible(CAMERA_PROFILES[profileName].exteriorVisible);
      if (cabInterior) cabInterior.root.visible = (profileName === 'cab');
    },
    // F3: chase <-> toy-car look (ignored in cab view)
    cycleLook() {
      if (profileName === 'cab') return;
      profileName = exteriorProfile = profileName === 'chase' ? 'toy' : 'chase';
    },
    // how much tilt-shift the current profile wants (0 = none)
    get tilt() { return CAMERA_PROFILES[profileName].tilt ?? 0; },
    setDebug(on) {
      debug = on;
      orbit.enabled = on;
      if (on) {
        orbit.target.copy(vehicle.center);
      } else {
        pos.copy(camera.position);
        look.copy(orbit.target);
      }
    },
  };
}
