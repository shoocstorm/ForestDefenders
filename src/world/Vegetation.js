import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ARENA, VEGETATION } from '../config/Constants.js';
import { toon } from '../materials/CelMaterial.js';

// Stylized procedural trees (threejs-procedural-vegetation, adapted to the cel look).
// A tree is a growth hierarchy — a curved segmented trunk, branches at stratified
// heights with permuted angles, and rounded canopy clumps — merged into two
// geometries (bark + foliage) per tree for a tight draw-call budget. Variation is
// deterministic from a seed (controlled variation, not species drift). Wind is
// shader-driven canopy sway (CelMaterial wind), so update() only advances time.

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Species table (length/radius/taper/branch/canopy character). Each species has
// a `canopy` kind: 'clumps' (broadleaf-style blob clusters), 'tiers' (stacked
// pine cones), 'umbrella' (flat acacia disc), 'bush' (low shrub), 'bare' (dead
// branches, no foliage), 'droop' (willow strands). `paletteLeaf` selects which
// biome palette slot re-skins the foliage ('broadleaf' | 'pine'); `keepBark`
// pins the bark to the species default (birch white, dead grey) instead of the
// biome bark override.
const SPECIES = {
  BROADLEAF: { trunkH: [2.4, 3.6], baseR: 0.28, topR: 0.12, segs: 3, bend: 0.16,
    branches: [2, 4], canopy: 'clumps', canopyCount: [4, 6], canopyR: [0.8, 1.3],
    bark: 0x6e4a2a, leaf: 0x46962f, leaf2: 0x3a7d28, paletteLeaf: 'broadleaf' },
  OAK: { trunkH: [3.0, 4.4], baseR: 0.38, topR: 0.16, segs: 3, bend: 0.12,
    branches: [3, 5], canopy: 'clumps', canopyCount: [7, 10], canopyR: [1.0, 1.7],
    bark: 0x5a3e22, leaf: 0x4f8f2a, leaf2: 0x3e7a22, paletteLeaf: 'broadleaf' },
  PINE: { trunkH: [3.2, 4.6], baseR: 0.24, topR: 0.08, segs: 3, bend: 0.08,
    branches: [0, 0], canopy: 'tiers', bark: 0x5e4326, leaf: 0x2f7a3a, leaf2: 0x276633,
    paletteLeaf: 'pine' },
  BIRCH: { trunkH: [3.8, 5.2], baseR: 0.18, topR: 0.06, segs: 4, bend: 0.06,
    branches: [2, 3], canopy: 'clumps', canopyCount: [3, 5], canopyR: [0.5, 0.85],
    bark: 0xe8e4dc, leaf: 0xa8c24a, leaf2: 0x8fae3a, paletteLeaf: 'broadleaf', keepBark: true },
  ACACIA: { trunkH: [3.0, 4.2], baseR: 0.26, topR: 0.10, segs: 3, bend: 0.18,
    branches: [0, 0], canopy: 'umbrella', bark: 0x6a4a30, leaf: 0x6a8a3a, leaf2: 0x5a7a2e,
    paletteLeaf: 'broadleaf' },
  SHRUB: { trunkH: [0.4, 0.9], baseR: 0.12, topR: 0.06, segs: 1, bend: 0.0,
    branches: [0, 0], canopy: 'bush', bark: 0x4a3a20, leaf: 0x4f8a3a, leaf2: 0x3e7a2e,
    paletteLeaf: 'broadleaf' },
  DEAD: { trunkH: [3.4, 4.8], baseR: 0.22, topR: 0.08, segs: 4, bend: 0.22,
    branches: [4, 6], canopy: 'bare', bark: 0x3a2a1a, leaf: 0x6a5a4a, leaf2: 0x5a4a3a,
    paletteLeaf: 'broadleaf', keepBark: true },
  WILLOW: { trunkH: [2.6, 3.6], baseR: 0.28, topR: 0.10, segs: 3, bend: 0.14,
    branches: [3, 5], canopy: 'droop', bark: 0x6a4a30, leaf: 0x8aac4a, leaf2: 0x7a9c3a,
    paletteLeaf: 'broadleaf' },
};

export class Vegetation {
  constructor(scene, palette) {
    this.scene = scene;
    this.colliders = [];
    this.trees = [];          // { group, phase } for wind
    this._t = 0;
    this.rng = mulberry32(VEGETATION.SEED);
    // Biome palette (SEASONS_SPEC) overrides the species' default leaf/bark colors
    // so the same tree geometry re-skins per biome. Falls back to L1 greens.
    this.palette = palette || SPECIES.BROADLEAF;
    this._build();
  }

  // --- one tree → merged bark + foliage geometry in tree-local space ---
  _buildTree(spec, scale) {
    const R = this.rng;
    const bark = [];
    const foliage = [];
    const leafMat2 = [];

    // Curved segmented trunk: walk up, bending the direction a little each section.
    const trunkH = (spec.trunkH[0] + R() * (spec.trunkH[1] - spec.trunkH[0])) * scale;
    const segH = trunkH / spec.segs;
    const p = new THREE.Vector3(0, 0, 0);
    const d = new THREE.Vector3((R() - 0.5) * 0.18, 1, (R() - 0.5) * 0.18).normalize();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const tips = []; // (point, dir) for branch/canopy attachment
    for (let i = 0; i < spec.segs; i++) {
      const r0 = THREE.MathUtils.lerp(spec.baseR, spec.topR, i / spec.segs) * scale;
      const r1 = THREE.MathUtils.lerp(spec.baseR, spec.topR, (i + 1) / spec.segs) * scale;
      const g = new THREE.CylinderGeometry(r1, r0, segH, 7, 1);
      g.translate(0, segH / 2, 0);
      q.setFromUnitVectors(up, d);
      g.applyQuaternion(q);
      g.translate(p.x, p.y, p.z);
      bark.push(g);
      p.addScaledVector(d, segH);
      tips.push({ p: p.clone(), d: d.clone(), r: r1 });
      // bend the growth direction (gnarliness), keep mostly upward
      d.x += (R() - 0.5) * spec.bend; d.z += (R() - 0.5) * spec.bend; d.normalize();
    }

    if (spec.canopy === 'tiers') {
      // Pine: stacked rounded cones from ~40% height to the top.
      const tiers = 4;
      for (let i = 0; i < tiers; i++) {
        const t = i / (tiers - 1);
        const cr = (1.5 - t * 1.1) * scale;
        const ch = 1.4 * scale;
        const cy = trunkH * (0.4 + t * 0.62);
        const g = new THREE.ConeGeometry(cr, ch, 9, 1);
        g.translate(p.x * (1 - t), cy, p.z * (1 - t));
        foliage.push(g);
      }
    } else if (spec.canopy === 'umbrella') {
      // Acacia: flat wide canopy disc + irregular edge blobs.
      const top = new THREE.Vector3(p.x, trunkH, p.z);
      const r = (2.0 + R() * 0.7) * scale;
      const main = new THREE.IcosahedronGeometry(r, 1);
      main.scale(1.4, 0.35, 1.4);
      main.translate(top.x, top.y + 0.25 * scale, top.z);
      foliage.push(main);
      const edge = 3 + Math.floor(R() * 3);
      for (let i = 0; i < edge; i++) {
        const a = (i / edge) * Math.PI * 2 + R() * 0.5;
        const rr = r * (0.6 + R() * 0.4);
        const b = new THREE.IcosahedronGeometry(r * (0.4 + R() * 0.25), 1);
        b.scale(1.3, 0.35, 1.3);
        b.translate(top.x + Math.cos(a) * rr, top.y + (0.1 + R() * 0.2) * scale, top.z + Math.sin(a) * rr);
        foliage.push(b);
      }
    } else if (spec.canopy === 'bush') {
      // Shrub: cluster of low blobs around the stump (no crown).
      const base = new THREE.Vector3(0, trunkH * 0.6, 0);
      const n = 4 + Math.floor(R() * 3);
      for (let i = 0; i < n; i++) {
        const a = R() * Math.PI * 2;
        const rr = (0.2 + R() * 0.5) * scale;
        const c = base.clone().add(new THREE.Vector3(
          Math.cos(a) * rr, (R() - 0.2) * 0.3 * scale, Math.sin(a) * rr));
        this._blob(foliage, leafMat2, c, (0.45 + R() * 0.35) * scale);
      }
    } else if (spec.canopy === 'bare') {
      // Dead: gnarly bare branches + twigs, no foliage.
      const nB = spec.branches[0] + Math.floor(R() * (spec.branches[1] - spec.branches[0] + 1));
      const angOff = R() * Math.PI * 2;
      for (let b = 0; b < nB; b++) {
        const hT = 0.4 + (b + R() * 0.4) / Math.max(1, nB) * 0.5;
        const base = new THREE.Vector3().copy(p).multiplyScalar(hT);
        base.y = trunkH * hT;
        const ang = angOff + b * (Math.PI * 2 / nB) + (R() - 0.5) * 0.8;
        const bd = new THREE.Vector3(Math.cos(ang), 0.35 + R() * 0.3, Math.sin(ang)).normalize();
        const bl = (1.0 + R() * 0.7) * scale;
        const g = new THREE.CylinderGeometry(spec.topR * 0.5 * scale, spec.topR * scale, bl, 5, 1);
        g.translate(0, bl / 2, 0);
        q.setFromUnitVectors(up, bd); g.applyQuaternion(q);
        g.translate(base.x, base.y, base.z);
        bark.push(g);
        const tip = base.clone().addScaledVector(bd, bl);
        const bl2 = (0.5 + R() * 0.4) * scale;
        const bd2 = bd.clone();
        bd2.x += (R() - 0.5) * 0.7; bd2.y -= 0.25 + R() * 0.2; bd2.z += (R() - 0.5) * 0.7; bd2.normalize();
        const g2 = new THREE.CylinderGeometry(spec.topR * 0.2 * scale, spec.topR * 0.5 * scale, bl2, 5, 1);
        g2.translate(0, bl2 / 2, 0);
        q.setFromUnitVectors(up, bd2); g2.applyQuaternion(q);
        g2.translate(tip.x, tip.y, tip.z);
        bark.push(g2);
      }
    } else if (spec.canopy === 'droop') {
      // Willow: arching branches + drooping cone strands (point-down cones).
      const nB = spec.branches[0] + Math.floor(R() * (spec.branches[1] - spec.branches[0] + 1));
      const angOff = R() * Math.PI * 2;
      for (let b = 0; b < nB; b++) {
        const hT = 0.55 + (b + R() * 0.3) / Math.max(1, nB) * 0.35;
        const base = new THREE.Vector3().copy(p).multiplyScalar(hT);
        base.y = trunkH * hT;
        const ang = angOff + b * (Math.PI * 2 / nB);
        const bd = new THREE.Vector3(Math.cos(ang), 0.5, Math.sin(ang)).normalize();
        const bl = (1.1 + R() * 0.5) * scale;
        const g = new THREE.CylinderGeometry(spec.topR * 0.6 * scale, spec.topR * scale, bl, 6, 1);
        g.translate(0, bl / 2, 0);
        q.setFromUnitVectors(up, bd); g.applyQuaternion(q);
        g.translate(base.x, base.y, base.z);
        bark.push(g);
        const tip = base.clone().addScaledVector(bd, bl);
        const dr = (0.5 + R() * 0.3) * scale;
        const dh = (1.1 + R() * 0.6) * scale;
        const cone = new THREE.ConeGeometry(dr, dh, 8, 1);
        cone.rotateX(Math.PI);
        cone.translate(tip.x, tip.y - dh * 0.3, tip.z);
        foliage.push(cone);
      }
      const top = new THREE.Vector3(p.x, trunkH, p.z);
      const strands = 5 + Math.floor(R() * 3);
      for (let i = 0; i < strands; i++) {
        const a = (i / strands) * Math.PI * 2 + R() * 0.3;
        const dr = (0.35 + R() * 0.2) * scale;
        const dh = (0.9 + R() * 0.5) * scale;
        const cone = new THREE.ConeGeometry(dr, dh, 6, 1);
        cone.rotateX(Math.PI);
        cone.translate(
          top.x + Math.cos(a) * 0.5 * scale, top.y - dh * 0.2, top.z + Math.sin(a) * 0.5 * scale);
        foliage.push(cone);
      }
    } else {
      // 'clumps' (broadleaf / oak / birch): branches at stratified heights + blob crown.
      const nB = spec.branches[0] + Math.floor(R() * (spec.branches[1] - spec.branches[0] + 1));
      const angOff = R() * Math.PI * 2;
      const cR = spec.canopyR || [0.8, 1.3];
      for (let b = 0; b < nB; b++) {
        const hT = 0.55 + (b + R() * 0.4) / Math.max(1, nB) * 0.4; // stratified slot
        const base = new THREE.Vector3().copy(p).multiplyScalar(hT);
        base.y = trunkH * hT;
        const ang = angOff + b * (Math.PI * 2 / nB) + (R() - 0.5) * 0.6; // permuted slot
        const bd = new THREE.Vector3(Math.cos(ang), 0.8, Math.sin(ang)).normalize();
        const bl = (0.8 + R() * 0.6) * scale;
        const g = new THREE.CylinderGeometry(spec.topR * 0.7 * scale, spec.topR * scale, bl, 6, 1);
        g.translate(0, bl / 2, 0);
        q.setFromUnitVectors(up, bd); g.applyQuaternion(q);
        g.translate(base.x, base.y, base.z);
        bark.push(g);
        // canopy blob at the branch tip
        const tip = base.clone().addScaledVector(bd, bl);
        this._blob(foliage, leafMat2, tip, (cR[0] + R() * (cR[1] - cR[0]) * 0.6) * scale);
      }
      // crown clump around the trunk top
      const top = new THREE.Vector3(p.x, trunkH, p.z);
      const cc = spec.canopyCount || [4, 6];
      const blobs = cc[0] + Math.floor(R() * (cc[1] - cc[0] + 1));
      for (let i = 0; i < blobs; i++) {
        const o = new THREE.Vector3((R() - 0.5), (R() - 0.2), (R() - 0.5)).multiplyScalar(0.9 * scale);
        this._blob(foliage, leafMat2, top.clone().add(o), (cR[0] + R() * (cR[1] - cR[0])) * scale);
      }
    }

    const barkGeo = mergeGeometries(bark, false);
    // DEAD trees produce no foliage → empty array. mergeGeometries can't merge
    // nothing, so return null and let _build skip the leaf mesh.
    const leafGeo = foliage.length ? mergeGeometries(foliage, false) : null;
    bark.forEach((g) => g.dispose());
    foliage.forEach((g) => g.dispose());
    return { barkGeo, leafGeo, trunkR: spec.baseR * scale, trunkH };
  }

  _blob(list, _m, center, r) {
    const g = new THREE.IcosahedronGeometry(r, 1);
    // squash slightly + jitter verts a touch for a hand-made look
    g.scale(1, 0.85, 1);
    g.translate(center.x, center.y, center.z);
    list.push(g);
  }

  _outline(mesh) {
    const o = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({ color: 0x12200f, side: THREE.BackSide }));
    o.scale.setScalar(1.035);
    mesh.add(o);
  }

  _build() {
    const lane = 3.5;
    const count = 110; // [~4x] tree density matched to the doubled arena area
    const p = this.palette;
    // Weighted species roll — a varied low-poly forest, not species drift.
    const table = [
      ['BROADLEAF', 16], ['PINE', 16], ['OAK', 14], ['BIRCH', 10],
      ['ACACIA', 8], ['SHRUB', 14], ['DEAD', 6], ['WILLOW', 12],
    ];
    const totalW = table.reduce((s, [, w]) => s + w, 0);
    for (let i = 0; i < count; i++) {
      let r = this.rng() * totalW, specName = table[0][0];
      for (const [name, w] of table) { if ((r -= w) <= 0) { specName = name; break; } }
      const spec = SPECIES[specName];
      const scale = 0.85 + this.rng() * 0.7;
      const side = this.rng() < 0.5 ? -1 : 1;
      const x = side * (lane + this.rng() * (ARENA.WIDTH / 2 - lane - 1.2));
      const z = -ARENA.LENGTH / 2 + 4 + this.rng() * (ARENA.LENGTH - 12);

      const { barkGeo, leafGeo, trunkR, trunkH } = this._buildTree(spec, scale);
      const group = new THREE.Group();
      group.position.set(x, 0, z);
      group.rotation.y = this.rng() * Math.PI * 2;

      // Bark: biome palette overrides unless the species pins its bark
      // (birch white, dead grey are signature traits kept across biomes).
      const barkColor = spec.keepBark ? spec.bark : (p.bark ?? spec.bark);
      const barkRim = p.barkRim ?? 0x88aa60;
      const barkMesh = new THREE.Mesh(barkGeo, toon({ color: barkColor, rim: { color: barkRim, intensity: 0.3 } }));
      barkMesh.castShadow = true; barkMesh.receiveShadow = true;
      this._outline(barkMesh);
      group.add(barkMesh);

      // Foliage: dead trees produce none. Otherwise the species' paletteLeaf slot
      // ('broadleaf' | 'pine') re-skins per biome, falling back to species defaults.
      if (leafGeo) {
        const pk = spec.paletteLeaf || 'broadleaf';
        const pk2 = pk + '2';
        const leafC = this.rng() < 0.5 ? (p[pk] ?? spec.leaf) : (p[pk2] ?? spec.leaf2);
        const leafMesh = new THREE.Mesh(leafGeo, toon({
          color: leafC, rim: { color: 0xbfe88a, intensity: 0.45 },
          wind: { base: trunkH * 0.45, freq: 1.5 + this.rng() * 0.6, amp: 0.07 },
        }));
        leafMesh.castShadow = true;
        this._outline(leafMesh);
        group.add(leafMesh);
      }

      this.scene.add(group);
      this.trees.push({ group, phase: this.rng() * Math.PI * 2 });
      this.colliders.push({ type: 'cylinder', x, z, r: Math.max(0.4, trunkR * 1.4) });
    }
  }

  // Wind is shader-driven (CelMaterial.updateTime advances all wind materials);
  // here we just keep a time reference in case per-tree variation is needed later.
  update(dt) { this._t += dt; }

  dispose() {
    // Remove all tree groups from the scene and dispose their geometries/materials
    for (const t of this.trees) {
      this.scene.remove(t.group);
      t.group.traverse((c) => {
        if (c.isMesh) {
          c.geometry?.dispose?.();
          if (Array.isArray(c.material)) {
            c.material.forEach((m) => m?.dispose?.());
          } else {
            c.material?.dispose?.();
          }
        }
      });
    }
    this.trees.length = 0;
    this.colliders.length = 0;
  }
}
