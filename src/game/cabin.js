// Cab interior: steering wheel, dash, seats. Built from simple primitives.
// Phase 5 uses this as the main horror stage, so it stays visible at all times in cab view.

import * as THREE from 'three';

export function createCabInterior(scene) {
  const cabin = new THREE.Group();
  scene.add(cabin);

  // Steering wheel: a torus (rim) + cylinder (hub)
  const wheelRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.3, 0.04, 16, 100),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a })
  );
  wheelRim.position.set(0.3, 0.7, 0.5);
  wheelRim.castShadow = true;
  cabin.add(wheelRim);

  const wheelHub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 0.1, 16),
    new THREE.MeshStandardMaterial({ color: 0x333333 })
  );
  wheelHub.rotation.x = Math.PI / 2;
  wheelHub.position.set(0.3, 0.7, 0.5);
  wheelHub.castShadow = true;
  cabin.add(wheelHub);

  // Dashboard: a simple box
  const dash = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.3, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.7 })
  );
  dash.position.set(0, 0.6, 0.8);
  dash.castShadow = true;
  cabin.add(dash);

  // Gauge cluster: small spheres on the dashboard (placeholder for future LCD/gauges)
  const gaugePositions = [-0.4, 0, 0.4];
  for (const x of gaugePositions) {
    const gauge = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0x1a4d1a, emissive: 0x0d3d0d })
    );
    gauge.position.set(x, 0.68, 0.72);
    gauge.castShadow = true;
    cabin.add(gauge);
  }

  // Seats: two boxes (driver + passenger)
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.8 });
  for (const z of [-0.2, 0.2]) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.6), seatMat);
    seat.position.set(0, 0.3, z);
    seat.castShadow = true;
    cabin.add(seat);
  }

  // Steering wheel rotates with input (Phase 5 will add more detail)
  return {
    root: cabin,
    wheelRim,
    setSteeringAngle: (angle) => {
      wheelRim.rotation.z = -angle * 6; // left turn = counter-clockwise for the driver
    },
  };
}