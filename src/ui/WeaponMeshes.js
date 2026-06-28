import * as THREE from 'three';
import { toon } from '../materials/CelMaterial.js';

// Procedural weapon meshes (GALLERY_SPEC §3). Each weapon is built from primitives
// — no authored GLB files. Used by the Gallery turntable viewer so every weapon
// has a distinct silhouette. Returns a THREE.Group centered at the origin.

function mat(color, opts = {}) {
  return toon({ color, emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.emissiveIntensity ?? 0,
    rim: opts.rim ?? { color: 0xffffff, intensity: 0.4 } });
}

// Shared helpers.
function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z); m.castShadow = true;
  return m;
}
function cyl(rt, rb, h, color, x = 0, y = 0, z = 0, rotX = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 12), mat(color));
  m.position.set(x, y, z); m.rotation.x = rotX; m.castShadow = true;
  return m;
}

const BUILDERS = {
  // Acorn Gun: simple tube + stock + sight + acorn magazine.
  ACORN() {
    const g = new THREE.Group();
    g.add(box(0.12, 0.14, 1.0, 0x6e4a2a, 0, 0, 0));            // barrel
    g.add(box(0.1, 0.18, 0.3, 0x4a3018, 0, -0.14, -0.35));     // stock
    g.add(box(0.04, 0.04, 0.3, 0x2a2018, 0, 0.1, 0.1));        // sight rail
    const acorn = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), mat(0x9a6a35, { emissive: 0x4a3a1a, emissiveIntensity: 0.2 }));
    acorn.position.set(0, -0.12, 0.15); g.add(acorn);          // acorn ammo
    return g;
  },
  // Ganon Rifle: sleek body + glowing crystal core.
  GANON() {
    const g = new THREE.Group();
    g.add(box(0.1, 0.1, 1.2, 0x2a3a4a, 0, 0, 0));
    g.add(box(0.08, 0.14, 0.35, 0x1a2a3a, 0, -0.1, -0.4));
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), mat(0x49e8ff, { emissive: 0x49e8ff, emissiveIntensity: 1.5 }));
    crystal.position.set(0, 0.08, 0.2); g.add(crystal);
    g.add(cyl(0.03, 0.03, 0.4, 0x1a2a3a, 0, 0, 0.55));         // muzzle
    return g;
  },
  // Machine Gun: box body + rotating barrel array.
  MACHINE() {
    const g = new THREE.Group();
    g.add(box(0.14, 0.12, 0.9, 0x4a4a3a, 0, 0, 0));
    g.add(box(0.1, 0.16, 0.3, 0x2a2a20, 0, -0.12, -0.35));
    for (let i = 0; i < 4; i++) {                                // barrel array
      const a = (i / 4) * Math.PI * 2;
      g.add(cyl(0.02, 0.02, 0.35, 0x6a6a5a, Math.cos(a) * 0.05, Math.sin(a) * 0.05, 0.55));
    }
    return g;
  },
  // Boomstick: short fat barrel + drum magazine.
  BOOM() {
    const g = new THREE.Group();
    g.add(cyl(0.1, 0.12, 0.7, 0x5a3a1a, 0, 0, 0, Math.PI / 2));  // fat barrel (laid flat)
    g.add(box(0.1, 0.16, 0.3, 0x3a2a14, 0, -0.14, -0.3));
    const drum = cyl(0.12, 0.12, 0.14, 0x6a4a2a, 0, -0.1, 0.1); // drum mag
    drum.rotation.x = Math.PI / 2; g.add(drum);
    return g;
  },
  // Laser Rifle: long thin body + lens at tip.
  LASER() {
    const g = new THREE.Group();
    g.add(box(0.08, 0.08, 1.3, 0x5a1a2a, 0, 0, 0));
    g.add(box(0.06, 0.12, 0.25, 0x3a0a1a, 0, -0.1, -0.4));
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), mat(0xff3a4a, { emissive: 0xff3a4a, emissiveIntensity: 1.8 }));
    lens.position.set(0, 0, 0.6); g.add(lens);
    return g;
  },
  // Scattergun: double-barrel wide body.
  SHOTGUN() {
    const g = new THREE.Group();
    g.add(cyl(0.05, 0.05, 0.9, 0x6a5a3a, -0.05, 0, 0, Math.PI / 2));
    g.add(cyl(0.05, 0.05, 0.9, 0x6a5a3a, 0.05, 0, 0, Math.PI / 2));
    g.add(box(0.14, 0.16, 0.3, 0x4a3a20, 0, -0.14, -0.35));
    return g;
  },
  // Fire Bullet: red body + flame nozzle.
  FIRE_BULLET() {
    const g = new THREE.Group();
    g.add(box(0.1, 0.12, 0.9, 0x8a2a1a, 0, 0, 0));
    g.add(box(0.08, 0.14, 0.3, 0x5a1a0a, 0, -0.12, -0.35));
    const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 8), mat(0xff5a2a, { emissive: 0xff5a2a, emissiveIntensity: 1.2 }));
    nozzle.position.set(0, 0, 0.55); nozzle.rotation.x = Math.PI / 2; g.add(nozzle);
    return g;
  },
  // Forest Bow: curved limbs + string.
  BOW() {
    const g = new THREE.Group();
    const riser = box(0.06, 0.06, 0.5, 0x5a3a1a, 0, 0, 0);
    g.add(riser);
    for (const sx of [-1, 1]) {
      const limb = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.025, 8, 16, Math.PI * 0.55),
        mat(0x4a2a14));
      limb.position.x = sx * 0.04;
      limb.rotation.z = sx > 0 ? -Math.PI * 0.22 : Math.PI * 0.78;
      g.add(limb);
    }
    // String.
    const stringPts = [new THREE.Vector3(-0.42, 0, 0.2), new THREE.Vector3(0, 0, -0.1), new THREE.Vector3(0.42, 0, 0.2)];
    const stringGeo = new THREE.BufferGeometry().setFromPoints(stringPts);
    g.add(new THREE.Line(stringGeo, new THREE.LineBasicMaterial({ color: 0xcdebb6 })));
    return g;
  },
  // Toroid Cannon: torus accelerator ring + induction coils.
  TOROID() {
    const g = new THREE.Group();
    g.add(box(0.12, 0.1, 0.8, 0x2a3a4a, 0, 0, 0));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.05, 12, 24), mat(0x6ad0ff, { emissive: 0x6ad0ff, emissiveIntensity: 1.4 }));
    ring.position.z = 0.45; g.add(ring);
    for (let i = 0; i < 4; i++) {                                 // induction coils
      const a = (i / 4) * Math.PI * 2;
      g.add(cyl(0.03, 0.03, 0.3, 0x4a5a6a, Math.cos(a) * 0.08, Math.sin(a) * 0.08, 0.1));
    }
    return g;
  },
};

export function buildWeaponMesh(weaponId) {
  const builder = BUILDERS[weaponId] || BUILDERS.ACORN;
  const group = builder();
  // Normalize: center the weapon at origin, feet at 0.
  const box = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3(); box.getSize(size);
  const center = new THREE.Vector3(); box.getCenter(center);
  group.position.sub(center);
  return { group, size };
}
