import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Named camera profiles (Open Decision 12). Phase 2 adds the narrow-FOV "toy car" look
// by tuning the chase profile; the cab profile stays wide with no tilt-shift.
export const CAMERA_PROFILES = {
  chase: {
    fov: 70, fovSpeedGain: 0.25, fovSpeedRef: 30,
    distance: 7, height: 3.5, lookHeight: 0.5,
    followSmoothing: 0.001, // smaller = snappier
    exteriorVisible: true,
  },
  cab: {
    fov: 80, fovSpeedGain: 0.15, fovSpeedRef: 30,
    exteriorVisible: false,
  },
};

export function createCameraRig(camera, domElement, vehicle) {
  const orbit = new OrbitControls(camera, domElement);
  orbit.enabled = false;

  let profileName = 'chase';
  let debug = false;
  let dragging = false;
  let yaw = 0;   // free-look offsets, spring back to 0 on release
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

  function update(dt) {
    if (debug) { orbit.update(); return; }

    const prof = CAMERA_PROFILES[profileName];
    if (!dragging) {
      const k = Math.exp(-3 * dt);
      yaw *= k;
      pitch *= k;
    }

    // speed-based FOV
    const targetFov = prof.fov + Math.min(Math.abs(vehicle.speed), prof.fovSpeedRef) * prof.fovSpeedGain;
    const nf = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.exp(-4 * dt));
    if (Math.abs(nf - camera.fov) > 0.001) {
      camera.fov = nf;
      camera.updateProjectionMatrix();
    }

    const c = vehicle.center;

    if (profileName === 'cab') {
      // Full chassis orientation, so body pitch/roll from the suspension shows up in the cab.
      const o = vehicle.cfg.cabCameraOffset;
      pos.set(o.x, o.y, o.z).applyQuaternion(vehicle.quaternion).add(c);
      dir.set(0, 0, 1).applyQuaternion(vehicle.quaternion).applyAxisAngle(up, yaw);
      dir.y -= pitch * 0.8; // drag down = look down
      dir.normalize();
      lookDesired.copy(pos).addScaledVector(dir, 10);
      look.copy(lookDesired);
      camera.position.copy(pos);
      camera.lookAt(look);
      return;
    }

    // chase (yaw only, so the camera doesn't wobble with the suspension)
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
      profileName = profileName === 'chase' ? 'cab' : 'chase';
      vehicle.setExteriorVisible(CAMERA_PROFILES[profileName].exteriorVisible);
    },
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
