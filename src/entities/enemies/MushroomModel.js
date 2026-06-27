import * as THREE from 'three';

// Procedural mushroom enemy built from primitives (MUSHROOM_BASE_SPEC §2).
// Shared anatomy — plump cap dome with emissive polka dots, stubby stem with a
// cartoon face, gills, and an element-specific prop on top — parameterised by
// colour so each elemental variant reuses the same builder.
//
// Returns { group, capPivot, emissives } where `group` is the squash/death root
// (feet at y=0), `capPivot` drives cap bob/attack tilt, and `emissives` is the
// list of glowing materials EnemyBase spikes white on hit.

const toon = (color, opts = {}) => new THREE.MeshToonMaterial({ color, ...opts });

function addOutline(mesh, scale = 1.07) {
  const out = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({ color: 0x10180f, side: THREE.BackSide }));
  out.scale.setScalar(scale);
  mesh.add(out);
}

export function buildMushroom({ capColor, stemColor, spotColor, emissiveColor, prop = 'none' }) {
  const group = new THREE.Group();
  const emissives = [];

  // --- Stem (stubby cylinder, wider at the base) ---
  const stemMat = toon(stemColor);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.46, 0.62, 14), stemMat);
  stem.position.y = 0.31;
  stem.castShadow = true;
  addOutline(stem, 1.06);
  group.add(stem);

  // --- Face on the stem front (glossy eyes + catch-light + mouth) ---
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), toon(0x0a0a0a));
    eye.position.set(sx * 0.15, 0.36, 0.34);
    eye.scale.z = 0.6;
    group.add(eye);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    glint.position.set(sx * 0.18, 0.4, 0.4);
    group.add(glint);
  }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.018, 8, 14, Math.PI), toon(0x2a1a14));
  mouth.position.set(0, 0.26, 0.38);
  mouth.rotation.x = Math.PI;
  group.add(mouth);

  // --- Gills ring under the cap (faint inner glow) ---
  const gillMat = toon(0xf0e4cf, { emissive: emissiveColor, emissiveIntensity: 0.25 });
  const gills = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.5, 0.12, 16), gillMat);
  gills.position.y = 0.66;
  group.add(gills);
  emissives.push(gillMat);

  // --- Cap pivot (dome + dots + prop) ---
  const capPivot = new THREE.Group();
  capPivot.position.y = 0.7;
  group.add(capPivot);

  const capMat = toon(capColor, { emissive: emissiveColor, emissiveIntensity: 0.35 });
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.66, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
  cap.castShadow = true;
  addOutline(cap, 1.05);
  capPivot.add(cap);
  emissives.push(capMat);

  // Embossed glowing polka dots scattered over the dome.
  const dotMat = new THREE.MeshBasicMaterial({ color: spotColor });
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2;
    const p = 0.3 + Math.random() * 0.9; // polar angle (keep off the rim/top)
    const r = 0.66;
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.06 + Math.random() * 0.04, 8, 8), dotMat);
    dot.position.set(Math.sin(p) * Math.cos(a) * r, Math.cos(p) * r, Math.sin(p) * Math.sin(a) * r);
    dot.scale.z = 0.4;
    dot.lookAt(dot.position.clone().multiplyScalar(2));
    capPivot.add(dot);
  }

  // --- Element prop on top of the cap ---
  if (prop === 'flame') {
    for (let i = 0; i < 3; i++) {
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.12 - i * 0.02, 0.34 - i * 0.05, 8),
        new THREE.MeshBasicMaterial({ color: i === 0 ? 0xffd24a : 0xff6a2a }),
      );
      flame.position.set((i - 1) * 0.14, 0.64 + (i === 0 ? 0.05 : 0), 0);
      capPivot.add(flame);
    }
  } else if (prop === 'twig') {
    for (const sx of [-1, 1]) {
      const twig = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.3, 6), toon(0x6e4a2a));
      twig.position.set(sx * 0.2, 0.62, 0);
      twig.rotation.z = sx * 0.5;
      capPivot.add(twig);
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), toon(0x4f9a3a));
      leaf.position.set(sx * 0.32, 0.74, 0);
      leaf.scale.set(1, 0.4, 0.7);
      capPivot.add(leaf);
    }
  }

  return { group, capPivot, emissives };
}
