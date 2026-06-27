import * as THREE from 'three';

// Procedural rescue-animal models from primitives (ANIMALS_SPEC). Cute, toon-shaded,
// cel outline to match the hero. Returns { group, bob } — `group` has feet at y=0
// (ground animals) / body-centered (bird), `bob` is the part to bob for idle life.

const toon = (color, opts = {}) => new THREE.MeshToonMaterial({ color, ...opts });

function outline(mesh, s = 1.07) {
  const o = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({ color: 0x10180f, side: THREE.BackSide }));
  o.scale.setScalar(s);
  mesh.add(o);
}
function mesh(geo, mat, parent, pos = [0, 0, 0], withOutline = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  m.castShadow = true;
  if (withOutline) outline(m);
  parent.add(m);
  return m;
}

function eyes(parent, sx, y, z, r = 0.05) {
  for (const s of [-1, 1]) {
    mesh(new THREE.SphereGeometry(r, 8, 8), toon(0x0a0a0a), parent, [s * sx, y, z], false);
    mesh(new THREE.SphereGeometry(r * 0.4, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), parent, [s * sx + 0.01, y + 0.02, z + 0.02], false);
  }
}

function buildHedgehog(color) {
  const group = new THREE.Group();
  const bob = new THREE.Group(); bob.position.y = 0.28; group.add(bob);
  // Cream face/body underside
  mesh(new THREE.SphereGeometry(0.3, 14, 12), toon(0xf0dcc0), bob, [0, 0, 0]);
  // Spiny brown back (cluster of cones)
  const spineMat = toon(color);
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2;
    const p = Math.random() * 0.9; // keep spines off the belly
    const r = 0.3;
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 5), spineMat);
    const x = Math.sin(p) * Math.cos(a) * r, y = Math.cos(p) * r, z = Math.sin(p) * Math.sin(a) * r;
    if (y < -0.05 || z < -0.1) continue; // bald belly + face
    c.position.set(x, y, z);
    c.lookAt(c.position.clone().multiplyScalar(2));
    c.castShadow = true;
    bob.add(c);
  }
  // Snout + nose + eyes
  mesh(new THREE.ConeGeometry(0.12, 0.18, 10), toon(0xf0dcc0), bob, [0, -0.02, 0.28]).rotation.x = Math.PI / 2;
  mesh(new THREE.SphereGeometry(0.04, 8, 8), toon(0x2a1a14), bob, [0, -0.02, 0.4], false);
  eyes(bob, 0.1, 0.08, 0.26);
  // Little feet
  for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.06, 8, 6), toon(0x6b5038), group, [s * 0.14, 0.05, 0.1], false);
  return { group, bob };
}

function buildBird(color) {
  const group = new THREE.Group();
  const bob = new THREE.Group(); bob.position.y = 0.0; group.add(bob);
  mesh(new THREE.SphereGeometry(0.22, 14, 12), toon(color), bob, [0, 0, 0]);
  mesh(new THREE.SphereGeometry(0.14, 12, 10), toon(0xeaf4ff), bob, [0, -0.04, 0.12], false); // belly
  // Head
  const head = mesh(new THREE.SphereGeometry(0.15, 12, 10), toon(color), bob, [0, 0.2, 0.08]);
  mesh(new THREE.ConeGeometry(0.05, 0.16, 8), toon(0xf2b21a), head, [0, -0.01, 0.16]).rotation.x = Math.PI / 2;
  eyes(head, 0.07, 0.04, 0.1, 0.04);
  // Wings (flap pivots)
  const wings = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(s * 0.18, 0.02, 0); bob.add(w);
    const wm = mesh(new THREE.SphereGeometry(0.16, 10, 8), toon(color), w, [s * 0.12, 0, -0.02]);
    wm.scale.set(1.1, 0.35, 0.8);
    wings.push(w);
  }
  // Tail
  const tail = mesh(new THREE.ConeGeometry(0.1, 0.22, 6), toon(color), bob, [0, -0.02, -0.22]);
  tail.rotation.x = -Math.PI / 2.4;
  return { group, bob, wings };
}

function buildRabbit(color) {
  const group = new THREE.Group();
  const bob = new THREE.Group(); bob.position.y = 0.22; group.add(bob);
  mesh(new THREE.SphereGeometry(0.26, 14, 12), toon(color), bob, [0, 0, 0]).scale.set(1, 1.1, 1.2);
  // Head
  const head = mesh(new THREE.SphereGeometry(0.18, 12, 10), toon(color), bob, [0, 0.12, 0.24]);
  mesh(new THREE.SphereGeometry(0.1, 10, 8), toon(0xfbeede), head, [0, -0.04, 0.12], false);
  mesh(new THREE.SphereGeometry(0.03, 6, 6), toon(0xd87a8a), head, [0, -0.02, 0.2], false);
  eyes(head, 0.09, 0.03, 0.13, 0.045);
  // Long ears
  for (const s of [-1, 1]) {
    const ear = mesh(new THREE.CapsuleGeometry(0.05, 0.26, 4, 8), toon(color), head, [s * 0.08, 0.28, -0.02]);
    ear.rotation.z = s * 0.18;
    mesh(new THREE.CapsuleGeometry(0.028, 0.2, 4, 8), toon(0xf6cdd6), ear, [0, 0.0, 0.03], false);
  }
  // Tail puff + feet
  mesh(new THREE.SphereGeometry(0.1, 10, 8), toon(0xfdf6ee), bob, [0, -0.02, -0.28], false);
  for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.08, 8, 6), toon(0xfbeede), group, [s * 0.16, 0.06, 0.16], false);
  return { group, bob };
}

export function buildAnimal(type, color) {
  if (type === 'HEDGEHOG') return buildHedgehog(color);
  if (type === 'BIRD') return buildBird(color);
  return buildRabbit(color);
}
