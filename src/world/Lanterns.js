import * as THREE from 'three';
import { ARENA, BLOOM_LAYER } from '../config/Constants.js';

// Light pylons alternating along the central runway (sci-fi reskin of the old
// fairy lanterns). Each is a sleek beacon: a metal base, a slim post, a few
// stacked emissive accent rings, and a glowing beacon orb on top. Every pylon
// is emissive (orb + rings on the bloom layer) and pulses gently — the orbs
// and rings are the runway's main bloom accents.
//
// Dynamic point lights are thinned to every OTHER pylon (brighter, slightly
// wider): ~20 always-on PointLights tax every lit fragment on screen, and with
// decay-2 falloff each light only pools a few units around its own base — the
// unlit pylons still read as lit via their pulsing emissive + bloom.
export class Lanterns {
  constructor(scene, pal) {
    this.scene = scene;
    this._t = 0;
    this.lit = [];
    this.groups = [];        // one group per lantern (cleanup)
    this.sharedGeo = [];     // geometries shared across all lanterns
    this.sharedMat = [];     // materials shared across all lanterns
    const p = pal || {};

    // --- Shared materials (built once, reused by every pylon) ---
    const litColor = p.lit ?? 0xaeffc8;
    const litEmissive = p.litEmissive ?? 0x39ff88;
    const lightColor = p.light ?? 0x7fff9f;
    const lightI = p.lightI ?? 3.4;
    const postMat = new THREE.MeshToonMaterial({ color: p.post ?? 0x1b1f28 }); // dark metal shaft
    const baseMat = new THREE.MeshToonMaterial({ color: p.unlit ?? 0x2a2f38 }); // base block
    const ringMat = new THREE.MeshToonMaterial({ color: litColor, emissive: litEmissive, emissiveIntensity: 1.0 });
    this.sharedMat.push(postMat, baseMat, ringMat);

    // --- Shared geometries ---
    const baseGeo = new THREE.CylinderGeometry(0.26, 0.34, 0.3, 8);    // footing block
    const postGeo = new THREE.CylinderGeometry(0.07, 0.09, 2.0, 6);    // slim shaft
    const ringGeo = new THREE.TorusGeometry(0.18, 0.04, 6, 16);        // glowing accent ring
    const orbGeo = new THREE.IcosahedronGeometry(0.18, 1);             // beacon orb
    const finGeo = new THREE.CylinderGeometry(0.0, 0.12, 0.3, 4);      // top spike
    this.sharedGeo.push(baseGeo, postGeo, ringGeo, orbGeo, finGeo);

    let idx = 0;
    for (let z = -ARENA.LENGTH / 2 + 8; z <= ARENA.LENGTH / 2 - 8; z += 6, idx++) {
      // Skip pylons that would land inside the central platform's footprint
      // (dais centred at z≈4, ~10 wide) — one otherwise spawns embedded in the
      // deck and stacks its point light with the platform's own beacon glow.
      if (z > -2 && z < 10) continue;
      const side = idx % 2 === 0 ? -1 : 1;
      const x = side * 2.8;
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = Math.random() * Math.PI * 2; // break up the repetition

      const base = new THREE.Mesh(baseGeo, baseMat); base.position.y = 0.15;
      base.castShadow = true; base.receiveShadow = true; g.add(base);

      const post = new THREE.Mesh(postGeo, postMat); post.position.y = 1.3;
      post.castShadow = true; g.add(post);

      // Stacked emissive accent rings up the shaft.
      for (let r = 0; r < 3; r++) {
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.y = 0.7 + r * 0.5;
        ring.rotation.x = Math.PI / 2;
        ring.layers.enable(BLOOM_LAYER);
        g.add(ring);
      }

      // Beacon orb — its own material so each can pulse independently.
      const orb = new THREE.Mesh(orbGeo, new THREE.MeshStandardMaterial({
        color: litColor, emissive: litEmissive, emissiveIntensity: 1.6,
      }));
      orb.position.y = 2.35;
      orb.layers.enable(BLOOM_LAYER);
      g.add(orb);

      const fin = new THREE.Mesh(finGeo, ringMat); fin.position.y = 2.65;
      fin.layers.enable(BLOOM_LAYER); g.add(fin);

      // Dynamic light on alternating pylons only (see class comment) — kept
      // ones run brighter/wider so their pool reads the same as before.
      const keepLight = this.lit.length % 2 === 0;
      const baseI = keepLight ? lightI * 1.35 : 0;
      if (keepLight) {
        const light = new THREE.PointLight(lightColor, baseI, 9, 2);
        light.position.y = 2.35;
        g.add(light);
        this.lit.push({ orb, light, phase: Math.random() * Math.PI * 2, baseE: 1.6, baseI });
      } else {
        this.lit.push({ orb, light: null, phase: Math.random() * Math.PI * 2, baseE: 1.6, baseI: 0 });
      }

      scene.add(g);
      this.groups.push(g);
    }
  }

  update(dt) {
    this._t += dt;
    for (const l of this.lit) {
      const p = 0.85 + Math.sin(this._t * 2.2 + l.phase) * 0.15;
      l.orb.material.emissiveIntensity = l.baseE * p;
      if (l.light) l.light.intensity = l.baseI * p;
    }
  }

  dispose() {
    for (const g of this.groups) this.scene.remove(g);
    this.groups.length = 0;
    // Per-orb materials are unique; shared geos/mats disposed once.
    for (const l of this.lit) l.orb.material.dispose();
    this.lit.length = 0;
    for (const geo of this.sharedGeo) geo.dispose();
    for (const mat of this.sharedMat) mat.dispose();
    this.sharedGeo.length = 0;
    this.sharedMat.length = 0;
  }
}
