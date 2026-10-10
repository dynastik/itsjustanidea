// Cab interior, built from primitives and sized from the van model's bounds, so it fits whatever
// model is loaded. The exterior is hidden in cab view, so this has to read as a complete little
// room: floor, doors, pillars, roof, dash, wheel, mirror, seats. It is also the Phase 5 horror stage, so the
// pieces that will misbehave (steering wheel, mirror, air freshener, radio) are kept by name.
import * as THREE from 'three';

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });
const M = {
  dark: mat(0x23252b),
  panel: mat(0x33363d),
  trim: mat(0x141518, { roughness: 0.7 }),
  seat: mat(0x4a4f58, { roughness: 0.95 }),
  mirror: mat(0x9fb4c4, { roughness: 0.2, metalness: 0.6 }),
  gauge: mat(0x090b0e, { roughness: 0.65 }),
  radio: mat(0x111111),
  fresh: mat(0x6bd36b, { roughness: 0.6 }),
};

function box(w, h, d, m, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  return mesh;
}

// A thin square beam between two points (pillars, header rail).
function beam(a, b, t, m) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(t, t, a.distanceTo(b)), m);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.lookAt(b);
  return mesh;
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function createCabInterior(vehicle) {
  // root sits at the driver's eye; everything inside is relative to it (x = left, y = up, z = forward)
  const root = new THREE.Group();
  const parts = { spin: null, mirror: null, freshener: null, radioScreen: null };

  function clear() {
    root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    root.clear();
  }

  // bounds: Box3 of the van in chassis space (vehicle.getLocalBounds())
  function layout(bounds) {
    clear();
    const E = vehicle.cabEye;
    root.position.copy(E);
    const add = (o) => { root.add(o); return o; };

    // walls come from the model's width, the rest from the eye position
    const xL = Math.max(bounds.max.x - 0.08 - E.x, 0.35);
    const xR = Math.min(bounds.min.x + 0.08 - E.x, -0.35);
    const xC = (xL + xR) / 2, W = xL - xR;
    const yRoof = clamp(bounds.max.y - 0.08 - E.y, 0.25, 0.7);
    const yFloor = Math.max(-1.0, bounds.min.y + 0.25 - E.y);
    const yDashTop = -0.27;
    const zBack = Math.max(-0.75, bounds.min.z + 0.1 - E.z);
    const zDash = Math.max(0.7, Math.min(1.05, bounds.max.z - 0.05 - E.z));
    const zRoofFront = zDash - 0.63;
    const zMid = (zDash + zBack) / 2, D = zDash - zBack;

    add(box(W + 0.1, 0.05, D, M.dark, xC, yFloor, zMid));                                              // floor
    add(box(W + 0.1, 0.05, zRoofFront - zBack, M.dark, xC, yRoof, (zRoofFront + zBack) / 2));          // roof liner
    add(box(W + 0.1, yRoof - yFloor, 0.05, M.dark, xC, (yRoof + yFloor) / 2, zBack));                  // rear wall
    const doorH = -0.2 - yFloor;
    for (const [x, sign] of [[xL, 1], [xR, -1]]) {
      add(box(0.05, doorH, D, M.panel, x, yFloor + doorH / 2, zMid));                                  // door panel
      add(box(0.09, 0.05, D, M.trim, x - sign * 0.02, -0.2, zMid));                                    // window sill
      add(beam(V(x, yDashTop, zDash), V(x, yRoof, zRoofFront), 0.09, M.trim));                         // A-pillar
      add(beam(V(x, -0.2, zBack), V(x, yRoof, zBack), 0.1, M.trim));                                   // rear pillar
    }
    add(beam(V(xL, yRoof, zRoofFront), V(xR, yRoof, zRoofFront), 0.07, M.trim));                       // windscreen header

    // dash
    const dash = add(box(W, 0.3, 0.5, M.dark, xC, yDashTop - 0.15, zDash - 0.25));
    dash.rotation.x = 0.12;
    add(box(0.55, 0.16, 0.14, M.trim, 0, -0.25, 0.64));                                                // instrument binnacle

    // Unlit instrument faces: keep the dashboard readable without bright emissive circles.
    for (const gx of [-0.12, 0.12]) {
      const g = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.01, 24), M.gauge);
      g.rotation.x = Math.PI / 2;
      g.position.set(gx, -0.25, 0.565);
      add(g);
    }
    parts.radioScreen = add(box(0.3, 0.07, 0.03, M.radio, xR + 0.5, -0.34, zDash - 0.08));             // unlit radio display

    // Flat-bottom steering wheel with a padded rim, designed to read as a modern real-world wheel.
    // The flattened lower arc gives it a recognizable silhouette without pretending to fix camera projection.
    const wheelPivot = add(new THREE.Group());
    wheelPivot.position.set(0, -0.3, 0.44);
    wheelPivot.rotation.x = 0.5;
    const spin = new THREE.Group();
    wheelPivot.add(spin);
    const wheelPoints = [
      V(-0.17, -0.105, 0), V(-0.19, -0.025, 0), V(-0.17, 0.09, 0),
      V(-0.105, 0.16, 0), V(0, 0.18, 0), V(0.105, 0.16, 0),
      V(0.17, 0.09, 0), V(0.19, -0.025, 0), V(0.17, -0.105, 0),
      V(0.105, -0.145, 0), V(0, -0.15, 0), V(-0.105, -0.145, 0),
      V(-0.17, -0.105, 0),
    ];
    const wheelCurve = new THREE.CatmullRomCurve3(wheelPoints, true, 'catmullrom', 0.15);
    spin.add(new THREE.Mesh(new THREE.TubeGeometry(wheelCurve, 64, 0.022, 10, true), M.trim));

    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.04, 20), M.panel);
    hub.rotation.x = Math.PI / 2;
    spin.add(hub);
    for (const a of [Math.PI / 2, Math.PI / 2 + 2.1, Math.PI / 2 - 2.1]) {
      const spoke = box(0.16, 0.025, 0.025, M.trim, Math.cos(a) * 0.075, Math.sin(a) * 0.075, 0);
      spoke.rotation.z = a;
      spin.add(spoke);
    }
    parts.spin = spin;
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 10), M.trim);
    column.rotation.x = Math.PI / 2 + 0.5;
    column.position.set(0, -0.34, 0.6);
    add(column);

    // seats (driver, passenger)
    for (const sx of [0, xR + 0.45]) {
      add(box(0.5, 0.12, 0.5, M.seat, sx, -0.74, -0.2));
      const back = add(box(0.5, 0.62, 0.12, M.seat, sx, -0.45, -0.5));
      back.rotation.x = -0.12;
      add(box(0.26, 0.16, 0.09, M.seat, sx, -0.06, -0.55));
    }

    // rear-view mirror + hanging air freshener (Phase 5 horror props)
    add(beam(V(xC, yRoof - 0.02, 0.48), V(xC, yRoof - 0.15, 0.44), 0.02, M.trim));
    parts.mirror = add(box(0.3, 0.08, 0.03, M.mirror, xC, yRoof - 0.18, 0.43));
    const freshener = new THREE.Group();
    freshener.position.set(xC + 0.2, yRoof - 0.02, 0.4);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 4), M.trim);
    cord.position.y = -0.06;
    const tag = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 4), M.fresh);
    tag.position.y = -0.17;
    freshener.add(cord, tag);
    parts.freshener = add(freshener);
  }

  function setSteeringAngle(angle) {
    if (parts.spin) parts.spin.rotation.z = -angle * 6; // left turn = counter-clockwise for the driver
  }

  function update(dt, v) {
    root.position.copy(vehicle.cabEye); // follows the eye tuner
    setSteeringAngle(v.steerAngle);
    if (parts.freshener) {
      const target = clamp(-v.steerAngle * v.speed * v.speed * 0.025, -0.9, 0.9);
      parts.freshener.rotation.z += (target - parts.freshener.rotation.z) * (1 - Math.exp(-5 * dt));
    }
  }

  layout(vehicle.getLocalBounds());
  return {
    root,
    layout,
    update,
    setSteeringAngle,
    get wheelSpin() { return parts.spin; },
    get mirror() { return parts.mirror; },
    get freshener() { return parts.freshener; },
    get radioScreen() { return parts.radioScreen; },
  };
}