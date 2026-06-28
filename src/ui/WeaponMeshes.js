import * as THREE from 'three';
import { toon, addOutlines } from '../materials/CelMaterial.js';

// Procedural weapon meshes (GALLERY_SPEC §3). Each weapon is hand-built from
// primitives — no authored GLB files — but with enough silhouette, secondary
// detail and material variety that every weapon reads as a distinct, finished
// object on the Gallery turntable. Returns a THREE.Group centered at origin.
//
// Convention: the barrel points toward +Z (forward), the grip/stock sit behind
// (-Z) and below (-Y). Build everything in this local frame; buildWeaponMesh()
// recenters and the Gallery scales to fit.

// --- Palette: shared material tones so weapons feel like one armoury ----------
const TONE = {
  steel:   0x8b94a0, steelDark: 0x4a5159, gunmetal: 0x2c3138,
  wood:    0x6e4a2a, woodDark: 0x4a3018, woodLight: 0x8a5e36,
  brass:   0xc79a4a, copper: 0xb06a3a,
  rubber:  0x202428, leather: 0x3a2a1c,
  bone:    0xd8cba6, sinew: 0xb9c79a,
};

// Cache materials by signature so the whole gallery shares a handful of programs.
const _matCache = new Map();
function mat(color, opts = {}) {
  const key = `${color}|${opts.emissive ?? 0}|${opts.emissiveIntensity ?? 0}|${opts.metalRim ? 1 : 0}|${opts.transparent ? 1 : 0}`;
  let m = _matCache.get(key);
  if (!m) {
    m = toon({
      color,
      emissive: opts.emissive ?? 0x000000,
      emissiveIntensity: opts.emissiveIntensity ?? 0,
      transparent: opts.transparent ?? false,
      // Metal surfaces get a brighter, tighter rim; organic/wood a soft warm one.
      rim: opts.rim ?? (opts.metalRim
        ? { color: 0xcfe6ff, power: 2.6, intensity: 0.7 }
        : { color: 0xfff0d0, power: 3.4, intensity: 0.4 }),
    });
    if (opts.transparent) m.opacity = opts.opacity ?? 0.5;
    _matCache.set(key, m);
  }
  return m;
}

// --- Primitive helpers --------------------------------------------------------
function mesh(geo, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
}
function box(w, h, d, color, x, y, z, opts) {
  return mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts), x, y, z);
}
// Cylinder whose axis runs along Z by default (barrels point forward).
function tube(rt, rb, len, color, x, y, z, opts) {
  const o = mesh(new THREE.CylinderGeometry(rt, rb, len, opts?.seg ?? 16), mat(color, opts), x, y, z);
  o.rotation.x = Math.PI / 2;
  return o;
}
// Cylinder along Y (for drums, magazines, posts).
function postY(rt, rb, len, color, x, y, z, opts) {
  return mesh(new THREE.CylinderGeometry(rt, rb, len, opts?.seg ?? 16), mat(color, opts), x, y, z);
}
function sphere(r, color, x, y, z, opts) {
  return mesh(new THREE.SphereGeometry(r, opts?.seg ?? 16, opts?.seg ?? 12), mat(color, opts), x, y, z);
}

// A lathe-turned barrel with a flared muzzle and a couple of reinforcing rings —
// reads far richer than a plain cylinder. `pts` are [radius, z] pairs.
function lathedBarrel(profile, color, opts) {
  const v = profile.map((p) => new THREE.Vector2(p[0], p[1]));
  const geo = new THREE.LatheGeometry(v, opts?.seg ?? 20);
  geo.rotateX(Math.PI / 2); // lathe spins around Y → reorient to Z axis
  const o = mesh(geo, mat(color, opts), 0, 0, 0);
  return o;
}

// Rounded slab via a small extruded, bevelled shape — used for receivers/grips
// so bodies don't look like raw cubes.
function roundedSlab(w, h, d, radius, color, x, y, z, opts) {
  const s = new THREE.Shape();
  const hw = w / 2, hh = h / 2, r = Math.min(radius, hw, hh);
  s.moveTo(-hw + r, -hh);
  s.lineTo(hw - r, -hh); s.quadraticCurveTo(hw, -hh, hw, -hh + r);
  s.lineTo(hw, hh - r);  s.quadraticCurveTo(hw, hh, hw - r, hh);
  s.lineTo(-hw + r, hh); s.quadraticCurveTo(-hw, hh, -hw, hh - r);
  s.lineTo(-hw, -hh + r);s.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  const geo = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, steps: 1 });
  geo.translate(0, 0, -d / 2);
  return mesh(geo, mat(color, opts), x, y, z);
}

// --- Reusable furniture: a pistol grip + trigger guard, oriented down/back. ----
function gripModule(color, opts) {
  const g = new THREE.Group();
  const grip = roundedSlab(0.11, 0.34, 0.13, 0.05, color, 0, -0.2, -0.32, opts);
  grip.rotation.x = 0.32; // rake the grip back
  g.add(grip);
  // Trigger guard: a thin torus arc under the receiver.
  const guard = mesh(new THREE.TorusGeometry(0.07, 0.014, 8, 16, Math.PI), mat(TONE.steelDark, { metalRim: true }), 0, -0.08, -0.18);
  guard.rotation.x = Math.PI / 2; guard.rotation.z = Math.PI;
  g.add(guard);
  // Trigger blade.
  g.add(box(0.02, 0.06, 0.02, TONE.steel, 0, -0.1, -0.2, { metalRim: true }));
  return g;
}

// A shoulder stock with a rubber butt-pad.
function stockModule(color, opts) {
  const g = new THREE.Group();
  g.add(roundedSlab(0.1, 0.16, 0.42, 0.05, color, 0, -0.06, -0.62, opts));
  g.add(box(0.11, 0.22, 0.05, TONE.rubber, 0, -0.05, -0.84, { metalRim: false })); // butt-pad
  return g;
}

// Picatinny-style top rail with notches.
function railModule(len, color) {
  const g = new THREE.Group();
  g.add(box(0.05, 0.025, len, color, 0, 0, 0, { metalRim: true }));
  const n = Math.max(3, Math.floor(len / 0.07));
  for (let i = 0; i < n; i++) {
    g.add(box(0.052, 0.03, 0.018, color, 0, 0.02, -len / 2 + 0.04 + i * (len / n), { metalRim: true }));
  }
  return g;
}

// A small holographic-ish sight block.
function sightModule(color, glow) {
  const g = new THREE.Group();
  g.add(box(0.06, 0.08, 0.07, TONE.gunmetal, 0, 0.07, 0, { metalRim: true }));
  const lens = box(0.05, 0.06, 0.012, glow, 0, 0.08, 0.035, { emissive: glow, emissiveIntensity: 1.2, transparent: true, opacity: 0.7 });
  g.add(lens);
  return g;
}

const BUILDERS = {
  // Acorn Gun — warm wooden carbine, brass fittings, an acorn nestled in a feed.
  ACORN() {
    const g = new THREE.Group();
    g.add(lathedBarrel([
      [0.0, -0.5], [0.07, -0.5], [0.07, 0.32], [0.085, 0.34],
      [0.085, 0.42], [0.065, 0.44], [0.065, 0.5], [0.0, 0.5],
    ], TONE.wood, { metalRim: false }));
    g.add(roundedSlab(0.16, 0.2, 0.5, 0.06, TONE.woodLight, 0, -0.03, -0.18, { metalRim: false })); // receiver
    g.add(tube(0.025, 0.025, 0.4, TONE.brass, 0, 0.05, 0.0, { metalRim: true })); // under-barrel rod
    const rail = railModule(0.34, TONE.brass); rail.position.set(0, 0.11, 0.0); g.add(rail);
    g.add(gripModule(TONE.woodDark, { metalRim: false }));
    g.add(stockModule(TONE.woodDark, { metalRim: false }));
    // Acorn in an open feed throat.
    const feed = box(0.13, 0.1, 0.16, TONE.brass, 0, 0.02, 0.12, { metalRim: true }); g.add(feed);
    const acorn = sphere(0.075, 0x9a6a35, 0, 0.12, 0.12, { emissive: 0x4a3a1a, emissiveIntensity: 0.25 });
    acorn.scale.set(1, 1.25, 1); g.add(acorn);
    g.add(postY(0.018, 0.018, 0.07, 0x3a2a14, 0, 0.2, 0.12)); // acorn cap stem
    return g;
  },

  // Ganon Rifle — angular energy rifle with a glowing crystal core + vented shroud.
  GANON() {
    const g = new THREE.Group();
    g.add(roundedSlab(0.16, 0.18, 0.7, 0.05, TONE.gunmetal, 0, 0, -0.05, { metalRim: true }));
    // Vented barrel shroud.
    g.add(tube(0.08, 0.08, 0.55, TONE.steelDark, 0, 0.01, 0.42, { metalRim: true, seg: 18 }));
    for (let i = 0; i < 5; i++) {
      g.add(box(0.18, 0.02, 0.03, TONE.gunmetal, 0, 0.09, 0.26 + i * 0.08, { metalRim: true }));
    }
    g.add(tube(0.034, 0.034, 0.5, TONE.steel, 0, 0.01, 0.5, { metalRim: true })); // inner barrel
    // Crystal core, exposed through the receiver top.
    const crystal = mesh(new THREE.OctahedronGeometry(0.12, 0), mat(0x49e8ff, { emissive: 0x49e8ff, emissiveIntensity: 1.8 }), 0, 0.13, 0.05);
    crystal.scale.set(1, 1.6, 1); g.add(crystal);
    // Energy conduits running back from the core.
    for (const sx of [-1, 1]) g.add(box(0.02, 0.02, 0.5, 0x49e8ff, sx * 0.07, 0.06, -0.1, { emissive: 0x2aa0c0, emissiveIntensity: 1.0 }));
    const sight = sightModule(0x49e8ff, 0x9af0ff); sight.position.set(0, 0.05, -0.18); g.add(sight);
    g.add(gripModule(TONE.gunmetal, { metalRim: true }));
    g.add(stockModule(TONE.steelDark, { metalRim: true }));
    return g;
  },

  // Machine Gun — boxy support weapon, rotary barrel cluster, ammo drum + belt.
  MACHINE() {
    const g = new THREE.Group();
    g.add(roundedSlab(0.2, 0.2, 0.66, 0.05, TONE.steelDark, 0, 0, -0.08, { metalRim: true }));
    // Rotary barrel cluster on a hub.
    const hub = tube(0.09, 0.09, 0.1, TONE.gunmetal, 0, 0, 0.3, { metalRim: true }); g.add(hub);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.add(tube(0.022, 0.022, 0.5, TONE.steel, Math.cos(a) * 0.06, Math.sin(a) * 0.06, 0.46, { metalRim: true }));
    }
    g.add(tube(0.05, 0.05, 0.08, TONE.gunmetal, 0, 0, 0.7, { metalRim: true })); // muzzle clamp
    // Top carry-handle.
    const handle = mesh(new THREE.TorusGeometry(0.08, 0.018, 8, 16, Math.PI), mat(TONE.gunmetal, { metalRim: true }), 0, 0.12, -0.1);
    handle.rotation.x = Math.PI / 2; g.add(handle);
    // Ammo drum + a short visible belt.
    const drum = postY(0.16, 0.16, 0.12, TONE.gunmetal, 0.0, -0.16, -0.04, { metalRim: true });
    drum.rotation.z = Math.PI / 2; drum.rotation.x = Math.PI / 2; g.add(drum);
    for (let i = 0; i < 5; i++) g.add(box(0.03, 0.05, 0.02, TONE.brass, -0.06 + i * 0.03, -0.06, 0.02, { metalRim: true }));
    g.add(gripModule(TONE.rubber, { metalRim: false }));
    g.add(box(0.16, 0.05, 0.18, TONE.gunmetal, 0, -0.13, -0.28, { metalRim: true })); // bipod mount stub
    return g;
  },

  // Boomstick — stout break-action grenade gun: fat flared bore + rotary drum.
  BOOM() {
    const g = new THREE.Group();
    g.add(lathedBarrel([
      [0.0, -0.35], [0.11, -0.35], [0.11, 0.25], [0.15, 0.3],
      [0.15, 0.42], [0.12, 0.44], [0.0, 0.44],
    ], 0x6a4326, { metalRim: false }));
    g.add(roundedSlab(0.18, 0.2, 0.32, 0.07, TONE.woodDark, 0, -0.02, -0.24, { metalRim: false }));
    // Six-round rotary drum with visible shell faces.
    const drum = postY(0.16, 0.16, 0.13, TONE.steelDark, 0, 0, -0.06, { metalRim: true });
    drum.rotation.x = Math.PI / 2; g.add(drum);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.add(tube(0.038, 0.038, 0.14, TONE.brass, Math.cos(a) * 0.09, Math.sin(a) * 0.09, -0.06, { metalRim: true }));
    }
    g.add(sphere(0.05, 0xff6a1a, 0, 0, 0.46, { emissive: 0xff6a1a, emissiveIntensity: 0.8 })); // glowing bore charge
    g.add(gripModule(TONE.leather, { metalRim: false }));
    g.add(stockModule(TONE.woodDark, { metalRim: false }));
    return g;
  },

  // Laser Rifle — sleek sci-fi blaster, focusing lens stack + emitter fins.
  LASER() {
    const g = new THREE.Group();
    g.add(roundedSlab(0.13, 0.13, 0.85, 0.055, 0x3a1018, 0, 0, 0.0, { metalRim: true }));
    g.add(tube(0.05, 0.05, 0.6, 0x5a1a2a, 0, 0.0, 0.45, { metalRim: true }));
    // Stacked focusing rings stepping toward the lens.
    for (let i = 0; i < 4; i++) {
      const r = 0.075 - i * 0.012;
      const ring = mesh(new THREE.TorusGeometry(r, 0.015, 8, 18), mat(0xff3a4a, { emissive: 0xff3a4a, emissiveIntensity: 1.3 }), 0, 0, 0.42 + i * 0.09);
      g.add(ring);
    }
    g.add(sphere(0.06, 0xff5a64, 0, 0, 0.82, { emissive: 0xff3a4a, emissiveIntensity: 2.2 })); // emitter lens
    // Heat-sink fins along the top.
    for (let i = 0; i < 6; i++) g.add(box(0.16, 0.06, 0.02, TONE.steelDark, 0, 0.09, -0.2 + i * 0.06, { metalRim: true }));
    const sight = sightModule(0xff3a4a, 0xff9aa4); sight.position.set(0, 0.02, -0.1); g.add(sight);
    g.add(gripModule(TONE.gunmetal, { metalRim: true }));
    g.add(box(0.06, 0.16, 0.22, 0x5a1a2a, 0, -0.04, -0.34, { emissive: 0xff3a4a, emissiveIntensity: 0.5 })); // glowing power cell
    return g;
  },

  // Scattergun — classic double-barrel coach gun, wooden furniture, exposed hammers.
  SHOTGUN() {
    const g = new THREE.Group();
    for (const sx of [-1, 1]) {
      g.add(lathedBarrel([
        [0.0, -0.1], [0.052, -0.1], [0.052, 0.42], [0.06, 0.44], [0.06, 0.48], [0.0, 0.48],
      ], TONE.steelDark, { metalRim: true }).translateX(sx * 0.055));
    }
    g.add(box(0.13, 0.04, 0.5, TONE.steelDark, 0, -0.06, 0.18, { metalRim: true })); // barrel rib joining the two
    // Receiver block with engraving feel + exposed hammers.
    g.add(roundedSlab(0.17, 0.18, 0.26, 0.05, TONE.woodLight, 0, -0.03, -0.24, { metalRim: false }));
    g.add(box(0.15, 0.05, 0.2, TONE.brass, 0, 0.05, -0.18, { metalRim: true }));
    for (const sx of [-1, 1]) g.add(box(0.02, 0.06, 0.03, TONE.gunmetal, sx * 0.04, 0.1, -0.3, { metalRim: true })); // hammers
    g.add(gripModule(TONE.wood, { metalRim: false }));
    // English straight wooden stock.
    g.add(roundedSlab(0.1, 0.16, 0.4, 0.05, TONE.wood, 0, -0.08, -0.6, { metalRim: false }));
    g.add(box(0.11, 0.2, 0.04, TONE.leather, 0, -0.07, -0.82, { metalRim: false }));
    return g;
  },

  // Fire Bullet — incendiary launcher: heat-shrouded barrel, pilot flame, fuel canister.
  FIRE_BULLET() {
    const g = new THREE.Group();
    g.add(roundedSlab(0.15, 0.16, 0.6, 0.05, 0x6a1a0a, 0, 0, -0.05, { metalRim: true }));
    g.add(lathedBarrel([
      [0.0, 0.0], [0.06, 0.0], [0.06, 0.4], [0.09, 0.46], [0.09, 0.54], [0.0, 0.54],
    ], 0x8a2a1a, { metalRim: true }));
    // Heat shroud ribs.
    for (let i = 0; i < 4; i++) g.add(tube(0.085, 0.085, 0.02, TONE.gunmetal, 0, 0.01, 0.12 + i * 0.1, { metalRim: true }));
    // Pilot flame at the muzzle.
    const flame = mesh(new THREE.ConeGeometry(0.07, 0.22, 10), mat(0xff5a2a, { emissive: 0xff7a2a, emissiveIntensity: 2.0, transparent: true, opacity: 0.85 }), 0, 0.01, 0.66);
    flame.rotation.x = Math.PI / 2; g.add(flame);
    g.add(sphere(0.04, 0xffd060, 0, 0.01, 0.6, { emissive: 0xffd060, emissiveIntensity: 2.2 })); // pilot bead
    // Fuel canister slung underneath, with a glowing gauge.
    const tank = postY(0.07, 0.07, 0.34, 0xb03a1a, 0, -0.16, 0.02, { metalRim: true });
    tank.rotation.x = Math.PI / 2; g.add(tank);
    g.add(box(0.04, 0.04, 0.02, 0xff7a2a, 0, -0.1, 0.2, { emissive: 0xff7a2a, emissiveIntensity: 1.4 }));
    g.add(gripModule(TONE.rubber, { metalRim: false }));
    g.add(stockModule(TONE.gunmetal, { metalRim: true }));
    return g;
  },

  // Forest Bow — recurve bow of bone-pale wood, sinew string, an arrow nocked.
  BOW() {
    const g = new THREE.Group();
    // Sculpted riser.
    g.add(roundedSlab(0.07, 0.34, 0.1, 0.03, TONE.woodDark, 0, 0, 0, { metalRim: false }));
    g.add(box(0.05, 0.12, 0.06, TONE.leather, 0.03, 0, 0.04, { metalRim: false })); // grip wrap
    // Recurve limbs — torus arcs, tips curling forward.
    for (const sy of [-1, 1]) {
      const limb = mesh(new THREE.TorusGeometry(0.34, 0.022, 8, 20, Math.PI * 0.6),
        mat(TONE.bone, { metalRim: false }), 0, sy * 0.16, 0);
      limb.rotation.z = sy > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
      limb.rotation.y = Math.PI / 2;
      g.add(limb);
      g.add(sphere(0.03, TONE.sinew, 0, sy * 0.5, 0.06)); // limb tip nock
    }
    // Sinew string (drawn back to a point) + nocked arrow.
    const strPts = [new THREE.Vector3(0, 0.5, 0.06), new THREE.Vector3(0, 0, -0.16), new THREE.Vector3(0, -0.5, 0.06)];
    const strGeo = new THREE.BufferGeometry().setFromPoints(strPts);
    const str = new THREE.Line(strGeo, new THREE.LineBasicMaterial({ color: 0xeaf2d6 }));
    g.add(str);
    // Glowing energy arrow.
    g.add(tube(0.012, 0.012, 0.6, 0xc7a060, 0, 0, 0.05, { metalRim: false })); // shaft
    g.add(mesh(new THREE.ConeGeometry(0.03, 0.1, 8), mat(0x9bff6a, { emissive: 0x9bff6a, emissiveIntensity: 1.8 }), 0, 0, 0.4).rotateX(Math.PI / 2)); // arrowhead
    for (const a of [0, Math.PI * 0.66, Math.PI * 1.33]) { // fletching
      const f = box(0.005, 0.05, 0.08, 0x9bff6a, 0, 0, -0.2, { emissive: 0x4a8a2a, emissiveIntensity: 0.6 });
      f.rotation.z = a; g.add(f);
    }
    return g;
  },

  // Toroid Cannon — heavy rail device: accelerator torus, induction coils, capacitor banks.
  TOROID() {
    const g = new THREE.Group();
    g.add(roundedSlab(0.2, 0.18, 0.62, 0.06, 0x24323e, 0, 0, -0.1, { metalRim: true }));
    // Main accelerator ring with an inner energy torus.
    const ring = mesh(new THREE.TorusGeometry(0.22, 0.055, 14, 28), mat(TONE.steelDark, { metalRim: true }), 0, 0, 0.42);
    g.add(ring);
    const core = mesh(new THREE.TorusGeometry(0.18, 0.025, 12, 28), mat(0x6ad0ff, { emissive: 0x6ad0ff, emissiveIntensity: 1.8 }), 0, 0, 0.42);
    g.add(core);
    // Induction coils orbiting the breech.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const coil = postY(0.035, 0.035, 0.34, 0x49606e, Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0.12, { metalRim: true });
      coil.rotation.x = Math.PI / 2; g.add(coil);
      // Glowing winding rings.
      for (let k = 0; k < 3; k++) g.add(mesh(new THREE.TorusGeometry(0.045, 0.01, 6, 12), mat(0x6ad0ff, { emissive: 0x6ad0ff, emissiveIntensity: 1.2 }), Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0.0 + k * 0.1).rotateX(Math.PI / 2));
    }
    // Capacitor banks on the receiver flanks.
    for (const sx of [-1, 1]) {
      g.add(box(0.05, 0.12, 0.3, TONE.gunmetal, sx * 0.13, 0.02, -0.18, { metalRim: true }));
      g.add(box(0.04, 0.03, 0.26, 0x6ad0ff, sx * 0.155, 0.06, -0.18, { emissive: 0x6ad0ff, emissiveIntensity: 1.0 }));
    }
    g.add(gripModule(TONE.gunmetal, { metalRim: true }));
    g.add(box(0.18, 0.06, 0.16, TONE.steelDark, 0, -0.13, -0.34, { metalRim: true })); // counterweight
    return g;
  },
};

export function buildWeaponMesh(weaponId) {
  const builder = BUILDERS[weaponId] || BUILDERS.ACORN;
  const group = builder();

  // Crisp cel outline so procedural weapons match the rest of the art style.
  // Thin thickness keeps small details (rings, fins, fletching) legible.
  addOutlines(group, { color: 0x14120c, thickness: 0.01 });

  // Normalize: center the weapon at origin.
  const bounds = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3(); bounds.getSize(size);
  const center = new THREE.Vector3(); bounds.getCenter(center);
  group.position.sub(center);
  return { group, size };
}
