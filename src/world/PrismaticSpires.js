import * as THREE from 'three';
import { BLOOM_LAYER } from '../config/Constants.js';

const _col = new THREE.Color();
const _col2 = new THREE.Color();

// Prismatic crystal spires — a cluster of 5 tall hexagonal crystal pillars
// that slowly cycle through the rainbow spectrum. Each spire is a tapered
// hexagonal prism (CylinderGeometry with radialSegments=6) with additive
// blending and a colour-shifting emissive. The cluster sits stage-left of
// the central platform as a surreal alien landmark.

const RAINBOW = [
  0xff4466, 0xff8844, 0xffdd33, 0x44ff66,
  0x33bbff, 0x7744ff, 0xcc44ff,
];

export class PrismaticSpires {
  constructor(scene, { count = 5, color = 0x7fff9f } = {}) {
    this.scene = scene;
    this._t = 0;
    this._spires = [];
    this._geos = [];
    this._mats = [];

    // Shared geometry: tapered hexagonal crystal.
    const crystalGeo = new THREE.CylinderGeometry(0.12, 0.35, 2.8, 6, 1);
    crystalGeo.translate(0, 1.4, 0); // base at y=0, tip at y=2.8.

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + 0.3;
      const r = 0.8 + Math.random() * 0.6;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      const h = 1.8 + Math.random() * 1.6;
      const hue = (i / count) * RAINBOW.length;

      // Crystal body — translucent, additive, rainbow-tinted.
      const mat = new THREE.MeshBasicMaterial({
        color: RAINBOW[i % RAINBOW.length],
        transparent: true, opacity: 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
        side: THREE.DoubleSide,
      });

      const spire = new THREE.Mesh(crystalGeo, mat);
      spire.position.set(x, 0, z);
      spire.scale.set(1, h / 2.8, 1); // scale to desired height.
      spire.rotation.y = angle;
      spire.layers.enable(BLOOM_LAYER);
      spire.userData.arenaOwned = true;

      scene.add(spire);
      this._spires.push({
        mesh: spire, mat, hue,
        baseScale: h / 2.8,
        phase: i * 0.8,
      });
      this._mats.push(mat);
    }

    // A small glowing orb at the cluster centre for extra bloom.
    const orbGeo = new THREE.SphereGeometry(0.18, 8, 6);
    const orbMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const orb = new THREE.Mesh(orbGeo, orbMat);
    orb.position.set(0, 1.2, 0);
    orb.layers.enable(BLOOM_LAYER);
    orb.userData.arenaOwned = true;
    scene.add(orb);
    this._orb = orb;
    this._mats.push(orbMat);
    this._geos.push(crystalGeo, orbGeo);
  }

  update(dt) {
    this._t += dt;
    // Cycle the colour spectrum through each spire.
    for (const sp of this._spires) {
      const t = (this._t * 0.4 + sp.hue) % RAINBOW.length;
      const i0 = Math.floor(t) % RAINBOW.length;
      const i1 = (i0 + 1) % RAINBOW.length;
      const frac = t - Math.floor(t);
      _col.set(RAINBOW[i0]).lerp(_col2.set(RAINBOW[i1]), frac);
      sp.mat.color.copy(_col);
      // Gentle sway.
      sp.mesh.rotation.z = Math.sin(this._t * 0.6 + sp.phase) * 0.06;
      // Pulse opacity.
      sp.mat.opacity = 0.45 + Math.sin(this._t * 1.2 + sp.phase) * 0.12;
    }
    // Orb pulse.
    const op = 0.3 + Math.sin(this._t * 2.0) * 0.15;
    this._orb.material.opacity = op;
    this._orb.scale.setScalar(1 + Math.sin(this._t * 1.5) * 0.12);
  }

  dispose() {
    for (const sp of this._spires) this.scene.remove(sp.mesh);
    this.scene.remove(this._orb);
    for (const g of this._geos) g.dispose();
    for (const m of this._mats) m.dispose();
    this._spires.length = 0;
    this._geos.length = 0;
    this._mats.length = 0;
  }
}
