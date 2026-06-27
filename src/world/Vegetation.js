import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ARENA, VEGETATION } from '../config/Constants.js';

// Stylized procedural trees (threejs-procedural-vegetation, adapted to the cel look).
// A tree is a growth hierarchy — a curved segmented trunk, branches at stratified
// heights with permuted angles, and rounded canopy clumps — merged into two
// geometries (bark + foliage) per tree for a tight draw-call budget. Variation is
// deterministic from a seed (controlled variation, not species drift). Wind is a
// single explicit scope: whole-tree base sway, applied per-tree in update().

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const toon = (color, opts = {}) => new THREE.MeshToonMaterial({ color, ...opts });

// Species table (length/radius/taper/branch/canopy character).
const SPECIES = {
  BROADLEAF: { trunkH: [2.4, 3.6], baseR: 0.28, topR: 0.12, segs: 3, bend: 0.16,
    branches: [2, 4], canopy: 'clumps', bark: 0x6e4a2a, leaf: 0x46962f, leaf2: 0x3a7d28 },
  PINE: { trunkH: [3.2, 4.6], baseR: 0.24, topR: 0.08, segs: 3, bend: 0.08,
    branches: [0, 0], canopy: 'tiers', bark: 0x5e4326, leaf: 0x2f7a3a, leaf2: 0x276633 },
};

export class Vegetation {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.trees = [];          // { group, phase } for wind
    this._t = 0;
    this.rng = mulberry32(VEGETATION.SEED);
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
    } else {
      // Broadleaf: branches at stratified heights + a clump of rounded blobs.
      const nB = spec.branches[0] + Math.floor(R() * (spec.branches[1] - spec.branches[0] + 1));
      const angOff = R() * Math.PI * 2;
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
        this._blob(foliage, leafMat2, tip, (0.7 + R() * 0.4) * scale);
      }
      // crown clump around the trunk top
      const top = new THREE.Vector3(p.x, trunkH, p.z);
      const blobs = 4 + Math.floor(R() * 3);
      for (let i = 0; i < blobs; i++) {
        const o = new THREE.Vector3((R() - 0.5), (R() - 0.2), (R() - 0.5)).multiplyScalar(0.9 * scale);
        this._blob(foliage, leafMat2, top.clone().add(o), (0.8 + R() * 0.5) * scale);
      }
    }

    const barkGeo = mergeGeometries(bark, false);
    const leafGeo = mergeGeometries(foliage, false);
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
    o.scale.setScalar(1.04);
    mesh.add(o);
  }

  _build() {
    const lane = 3.5;
    const count = 30;
    for (let i = 0; i < count; i++) {
      const spec = this.rng() < 0.55 ? SPECIES.BROADLEAF : SPECIES.PINE;
      const scale = 0.85 + this.rng() * 0.7;
      const side = this.rng() < 0.5 ? -1 : 1;
      const x = side * (lane + this.rng() * (ARENA.WIDTH / 2 - lane - 1.2));
      const z = -ARENA.LENGTH / 2 + 4 + this.rng() * (ARENA.LENGTH - 12);

      const { barkGeo, leafGeo, trunkR } = this._buildTree(spec, scale);
      const group = new THREE.Group();
      group.position.set(x, 0, z);
      group.rotation.y = this.rng() * Math.PI * 2;

      const barkMesh = new THREE.Mesh(barkGeo, toon(spec.bark));
      barkMesh.castShadow = true; barkMesh.receiveShadow = true;
      this._outline(barkMesh);
      group.add(barkMesh);

      const leafMesh = new THREE.Mesh(leafGeo, toon(this.rng() < 0.5 ? spec.leaf : spec.leaf2));
      leafMesh.castShadow = true;
      this._outline(leafMesh);
      group.add(leafMesh);

      this.scene.add(group);
      this.trees.push({ group, phase: this.rng() * Math.PI * 2, amp: 0.012 + this.rng() * 0.014 });
      this.colliders.push({ type: 'cylinder', x, z, r: Math.max(0.4, trunkR * 1.4) });
    }
  }

  // Whole-tree base sway (explicit single wind scope).
  update(dt) {
    this._t += dt;
    for (const t of this.trees) {
      const s = Math.sin(this._t * 1.1 + t.phase) * t.amp;
      t.group.rotation.x = s;
      t.group.rotation.z = Math.cos(this._t * 0.9 + t.phase) * t.amp * 0.7;
    }
  }
}
