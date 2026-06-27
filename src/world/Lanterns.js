import * as THREE from 'three';
import { ARENA, BLOOM_LAYER } from '../config/Constants.js';

// Fairy lanterns alternating along the stone path (LEVELS_SPEC §5.4) — mossy posts
// topped with a warm glowing orb; every other one is lit (emissive + point light +
// bloom layer) and pulses gently. The lit orbs are the path's main bloom accents.
export class Lanterns {
  constructor(scene) {
    this._t = 0;
    this.lit = [];
    const postMat = new THREE.MeshToonMaterial({ color: 0x4a5a3a });
    const orbGeo = new THREE.IcosahedronGeometry(0.18, 1);

    let idx = 0;
    for (let z = -ARENA.LENGTH / 2 + 8; z <= ARENA.LENGTH / 2 - 8; z += 6, idx++) {
      const side = idx % 2 === 0 ? -1 : 1;
      const x = side * 2.8;
      const lit = idx % 2 === 0;

      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 1.4, 6), postMat);
      post.position.set(x, 0.7, z);
      post.castShadow = true;
      scene.add(post);

      const orb = new THREE.Mesh(orbGeo, new THREE.MeshStandardMaterial({
        color: lit ? 0xffd98a : 0x6a6a55,
        emissive: lit ? 0xffb24a : 0x222018,
        emissiveIntensity: lit ? 1.6 : 0.15,
      }));
      orb.position.set(x, 1.5, z);
      scene.add(orb);

      if (lit) {
        orb.layers.enable(BLOOM_LAYER);
        const light = new THREE.PointLight(0xffb86a, 3.0, 7, 2);
        light.position.set(x, 1.5, z);
        scene.add(light);
        this.lit.push({ orb, light, phase: Math.random() * Math.PI * 2, baseE: 1.6, baseI: 3.0 });
      }
    }
  }

  update(dt) {
    this._t += dt;
    for (const l of this.lit) {
      const p = 0.85 + Math.sin(this._t * 2.2 + l.phase) * 0.15;
      l.orb.material.emissiveIntensity = l.baseE * p;
      l.light.intensity = l.baseI * p;
    }
  }
}
