import * as THREE from 'three';
import { clone, clips } from '../../core/Assets.js';
import { toon, addOutlines } from '../../materials/CelMaterial.js';

// Rescue-animal models (ANIMALS_SPEC §2). Rabbit uses the authored bunny.glb (with
// its idle clip via an AnimationMixer); Hedgehog & Bird are PROCEDURAL (built from
// cel-shaded primitives, so they're light + easy to tune/animate). All return
// { group, bob, wings, mixer } so Animal.js drives them uniformly; GLB animals
// carry bob=null (their idle clip bobs them), procedural ones bob via `bob`.

const GLB = { RABBIT: { key: 'bunny', height: 0.62 } };

function fromGLB(type) {
  const cfg = GLB[type];
  const group = clone(cfg.key);
  const box = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3(); box.getSize(size);
  const s = cfg.height / Math.max(0.001, size.y);
  group.scale.setScalar(s);
  group.position.y = -box.min.y * s;
  group.rotation.y = Math.PI;

  const mixer = new THREE.AnimationMixer(group);
  for (const clip of clips(cfg.key)) mixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity).play();
  return { group, bob: null, wings: null, mixer };
}

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

export function buildAnimal(type, color) {
  if (type === 'RABBIT') return fromGLB(type);
  if (type === 'HEDGEHOG') return buildHedgehog();
  return buildBird(color);
}
