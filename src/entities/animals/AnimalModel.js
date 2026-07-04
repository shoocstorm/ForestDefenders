import * as THREE from 'three';
import { toon, addOutlines } from '../../materials/CelMaterial.js';

// Rescue-animal models (ANIMALS_SPEC §2). All three are PROCEDURAL (built from
// cel-shaded primitives, so they're light + easy to tune/animate). All return
// { group, bob, wings, ears, mixer } so Animal.js drives them uniformly — bob
// gives a breathing/hop idle, wings flap (bird), ears twitch (rabbit).

// --- Procedural animals (no authored asset). Kept toon-shaded + outlined. ---
const T = (c, o = {}) => toon({ color: c, ...o });
function mesh(geo, mat, parent, pos = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, mat); m.position.set(...pos); m.castShadow = true; parent.add(m); return m;
}

// Hedgehog: round cream-bellied body under a dome of spikes, four stubby legs.
// Built feet-at-0 inside `bob`; Animal._restBob lifts it to its resting float and
// Animal.update bobs `bob.y` for a breathing idle.
function buildHedgehog() {
  const group = new THREE.Group();
  const bob = new THREE.Group(); group.add(bob);

  // Body — squashed egg, cream front fading to a tan back, facing +Z (snout +Z).
  const body = mesh(new THREE.SphereGeometry(0.22, 16, 14), T(0xd9c39a), bob, [0, 0.2, 0]);
  body.scale.set(1.05, 0.9, 1.2);
  // Pointy snout + nose.
  const snout = mesh(new THREE.ConeGeometry(0.09, 0.18, 12), T(0xbfa478), bob, [0, 0.16, 0.22], );
  snout.rotation.x = Math.PI / 2;
  mesh(new THREE.SphereGeometry(0.028, 8, 8), T(0x161310), bob, [0, 0.16, 0.31]); // nose
  for (const sx of [-1, 1]) {
    mesh(new THREE.SphereGeometry(0.032, 8, 8), T(0x161310), bob, [sx * 0.07, 0.24, 0.18]); // eyes
    mesh(new THREE.SphereGeometry(0.04, 8, 8), T(0xbfa478), bob, [sx * 0.13, 0.30, 0.06]);   // ears
    // Stubby legs.
    for (const sz of [-1, 1]) {
      mesh(new THREE.CapsuleGeometry(0.035, 0.05, 3, 6), T(0x8a6b42), bob, [sx * 0.12, 0.04, sz * 0.1]);
    }
  }
  // Spike dome — cones fanned over the back hemisphere (skip the face, +Z front).
  const spikeMat = T(0x6b4f2e);
  const tip = T(0x2c2118);
  for (let ring = 0; ring < 4; ring++) {
    const polar = 0.25 + ring * 0.34;            // down from the pole
    const count = 5 + ring * 3;
    const r = 0.04 + ring * 0.006;
    for (let i = 0; i < count; i++) {
      const az = (i / count) * Math.PI * 2 + ring * 0.4;
      const dx = Math.sin(polar) * Math.sin(az);
      const dy = Math.cos(polar);
      const dz = Math.sin(polar) * Math.cos(az);
      if (dz > 0.45) continue;                   // keep the face clear of spikes
      const spike = mesh(new THREE.ConeGeometry(r, 0.16, 6), ring > 2 ? tip : spikeMat,
        bob, [dx * 0.24, 0.2 + dy * 0.21, dz * 0.27]);
      spike.lookAt(spike.position.clone().add(new THREE.Vector3(dx, dy, dz)));
      spike.rotateX(Math.PI / 2);
    }
  }
  addOutlines(group, { thickness: 0.012 });
  return { group, bob, wings: null, mixer: null };
}
function buildBird(color) {
  const group = new THREE.Group();
  const bob = new THREE.Group(); bob.position.y = 0.0; group.add(bob);
  mesh(new THREE.SphereGeometry(0.22, 14, 12), T(color), bob, [0, 0, 0]);
  mesh(new THREE.SphereGeometry(0.14, 12, 10), T(0xeaf4ff), bob, [0, -0.04, 0.12], );
  const head = mesh(new THREE.SphereGeometry(0.15, 12, 10), T(color), bob, [0, 0.2, 0.08]);
  mesh(new THREE.ConeGeometry(0.05, 0.16, 8), T(0xf2b21a), head, [0, -0.01, 0.16]).rotation.x = Math.PI / 2;
  for (const sx of [-1, 1]) {
    mesh(new THREE.SphereGeometry(0.04, 8, 8), T(0x0a0a0a), head, [sx * 0.07, 0.04, 0.1]);
    mesh(new THREE.SphereGeometry(0.016, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), head, [sx * 0.075, 0.05, 0.115]);
  }
  const wings = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(s * 0.18, 0.02, 0); bob.add(w);
    const wm = mesh(new THREE.SphereGeometry(0.16, 10, 8), T(color), w, [s * 0.12, 0, -0.02]);
    wm.scale.set(1.1, 0.35, 0.8);
    wings.push(w);
  }
  const tail = mesh(new THREE.ConeGeometry(0.1, 0.22, 6), T(color), bob, [0, -0.02, -0.22]);
  tail.rotation.x = -Math.PI / 2.4;
  addOutlines(group, { thickness: 0.015 });
  return { group, bob, wings, mixer: null };
}

// Rabbit: plump cream body, oversized pink-lined ears, cotton tail, big sparkly
// eyes. Built feet-at-0 inside `bob` (Animal._restBob lifts it to its resting
// float, and Animal.update bobs `bob.y` for a breathing/hop idle). The ears are
// separate pivot groups so Animal.update can twitch them independently.
function buildRabbit() {
  const group = new THREE.Group();
  const bob = new THREE.Group(); group.add(bob);
  const cream = T(0xf7f1e4);

  // Body — plump oval, facing +Z (snout +Z).
  const body = mesh(new THREE.SphereGeometry(0.19, 16, 14), cream, bob, [0, 0.21, -0.03]);
  body.scale.set(1.0, 0.95, 1.2);
  // Head + muzzle.
  const head = mesh(new THREE.SphereGeometry(0.135, 16, 14), cream, bob, [0, 0.37, 0.15]);
  mesh(new THREE.SphereGeometry(0.055, 10, 8), T(0xffffff), head, [0, -0.04, 0.1]); // muzzle
  mesh(new THREE.SphereGeometry(0.018, 8, 8), T(0xe8879e), head, [0, -0.02, 0.15]); // nose
  for (const sx of [-1, 1]) {
    mesh(new THREE.SphereGeometry(0.03, 10, 10), T(0x18130f), head, [sx * 0.065, 0.02, 0.095]); // eye
    mesh(new THREE.SphereGeometry(0.011, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), head, [sx * 0.073, 0.033, 0.11]); // sparkle
  }
  // Ears — pivoted at the base (skull) so they can twitch; long capsule + pink inner.
  const ears = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.06, 0.45, 0.08);
    pivot.rotation.z = sx * -0.14;
    bob.add(pivot);
    mesh(new THREE.CapsuleGeometry(0.045, 0.22, 4, 8), cream, pivot, [0, 0.16, 0]);
    mesh(new THREE.CapsuleGeometry(0.024, 0.15, 4, 8), T(0xe8a4b4), pivot, [0, 0.145, 0.026]);
    ears.push(pivot);
  }
  // Cotton tail.
  mesh(new THREE.SphereGeometry(0.075, 12, 10), T(0xffffff), bob, [0, 0.18, -0.24]);
  // Legs — stubby front paws, bigger hind feet.
  for (const sx of [-1, 1]) {
    mesh(new THREE.CapsuleGeometry(0.035, 0.05, 3, 6), cream, bob, [sx * 0.09, 0.055, 0.11]);
    mesh(new THREE.CapsuleGeometry(0.05, 0.09, 3, 6), cream, bob, [sx * 0.12, 0.055, -0.13]);
  }
  addOutlines(group, { thickness: 0.012 });
  return { group, bob, wings: null, ears, mixer: null };
}

export function buildAnimal(type, color) {
  if (type === 'RABBIT') return buildRabbit();
  if (type === 'HEDGEHOG') return buildHedgehog();
  return buildBird(color);
}
