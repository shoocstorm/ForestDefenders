import * as THREE from 'three';
import { BLOOM_LAYER } from '../config/Constants.js';

// Floating runestone clusters — 3 groups of 3 hovering rune-carved stones
// that orbit their cluster centre, emit a soft glow, and pulse gently.
// Positioned near the boss landmark to frame the end of the arena.

const _up = new THREE.Vector3(0, 1, 0);
const _col = new THREE.Color();

export class FloatingRunestones {
  constructor(scene, { color = 0x7fff9f, count = 3, radius = 1.2, spread = 8 } = {}) {
    this.scene = scene;
    this._t = 0;
    this._clusters = [];
    this._geos = [];
    this._mats = [];

    // Shared geometry: a flat rune stone (box-ish with bevel) — one geometry,
    // cloned per stone (GPU instance, cheap).
    const baseGeo = new THREE.CylinderGeometry(0.35, 0.42, 0.12, 6);
    // Carve "runes" by adding a second narrower box on top as the rune face.
    const runeGeo = new THREE.CylinderGeometry(0.22, 0.24, 0.04, 6);

    for (let c = 0; c < count; c++) {
      const cluster = new THREE.Group();
      const cx = (c - 1) * spread;
      const cz = 48 + Math.sin(c * 2.7) * 6;
      cluster.position.set(cx, 2.8 + Math.random() * 1.2, cz);

      for (let s = 0; s < 3; s++) {
        const angle = (s / 3) * Math.PI * 2;
        const sx = Math.cos(angle) * radius;
        const sz = Math.sin(angle) * radius;
        const sy = (s - 1) * 0.35;

        // Stone body — dark stone material.
        const bodyMat = new THREE.MeshStandardMaterial({
          color: 0x2a2e38, roughness: 0.8, metalness: 0.2,
          emissive: color, emissiveIntensity: 0.06,
        });
        const body = new THREE.Mesh(baseGeo, bodyMat);
        body.position.set(sx, sy, sz);
        body.castShadow = true;

        // Rune face — additive emissive that pulses.
        const runeMat = new THREE.MeshBasicMaterial({
          color, transparent: true, opacity: 0.65,
          blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
        });
        const rune = new THREE.Mesh(runeGeo, runeMat);
        rune.position.set(sx, sy + 0.08, sz);
        rune.layers.enable(BLOOM_LAYER);

        cluster.add(body, rune);
        this._mats.push(bodyMat, runeMat);
      }

      cluster.userData.arenaOwned = true;
      scene.add(cluster);
      this._clusters.push({
        group: cluster,
        phase: c * 1.9,
        bobSpeed: 0.8 + c * 0.15,
        orbitSpeed: 0.25 + c * 0.08,
        baseY: cluster.position.y,
      });
    }
    this._geos.push(baseGeo, runeGeo);
  }

  update(dt) {
    this._t += dt;
    for (const cl of this._clusters) {
      // Bob gently.
      cl.group.position.y = cl.baseY + Math.sin(this._t * cl.bobSpeed + cl.phase) * 0.18;
      // Slow orbit around vertical axis.
      cl.group.rotation.y = this._t * cl.orbitSpeed;
      // Pulse rune emissive.
      const pulse = 0.5 + Math.sin(this._t * 1.8 + cl.phase) * 0.2;
      for (const c of cl.group.children) {
        if (c.material?.blending === THREE.AdditiveBlending) {
          c.material.opacity = pulse;
        }
      }
    }
  }

  dispose() {
    for (const cl of this._clusters) this.scene.remove(cl.group);
    for (const g of this._geos) g.dispose();
    for (const m of this._mats) m.dispose();
    this._clusters.length = 0;
    this._geos.length = 0;
    this._mats.length = 0;
  }
}
