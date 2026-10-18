import * as THREE from 'three';
import { BLOOM_LAYER } from '../config/Constants.js';

// Spirit wells — 2 ground-level swirling vortex pools. Each well is a flat
// disc with a spiral shader pattern that rotates, plus a rising particle
// Points cloud of ethereal wisps. Positioned near the water pond to form
// a "sacred water" zone.

const WELL_COUNT = 2;
const PARTICLE_N = 24; // per well — enough for atmosphere, not enough to cost

export class SpiritWells {
  constructor(scene, { color = 0x7fff9f, positions = [[-6, 0.05, -8], [6, 0.05, -16]] } = {}) {
    this.scene = scene;
    this._t = 0;
    this._wells = [];
    this._geos = [];
    this._mats = [];

    const discGeo = new THREE.CircleGeometry(2.2, 32);
    discGeo.rotateX(-Math.PI / 2); // face up.

    const particleGeo = new THREE.BufferGeometry();
    const positions2 = new Float32Array(PARTICLE_N * 3);
    const speeds = new Float32Array(PARTICLE_N);
    const phases = new Float32Array(PARTICLE_N);

    for (let w = 0; w < WELL_COUNT; w++) {
      const [px, py, pz] = positions[w] || [w === 0 ? -6 : 6, 0.05, w === 0 ? -8 : -16];
      const group = new THREE.Group();
      group.position.set(px, py, pz);

      // Vortex disc — additive spiral pattern.
      const discMat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.26,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
        side: THREE.DoubleSide,
      });
      const disc = new THREE.Mesh(discGeo, discMat);
      group.add(disc); // not bloomed — a 2.2-radius additive pad bloomed into a bright ground blob

      // Rising particle cloud — small glowing Points drifting upward from the
      // well centre, fading out as they rise.
      const pGeo = new THREE.BufferGeometry();
      const pPos = new Float32Array(PARTICLE_N * 3);
      const pSizes = new Float32Array(PARTICLE_N);
      const pPhase = new Float32Array(PARTICLE_N);
      for (let i = 0; i < PARTICLE_N; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 1.5;
        pPos[i * 3] = Math.cos(a) * r;
        pPos[i * 3 + 1] = Math.random() * 3.5; // start scattered vertically
        pPos[i * 3 + 2] = Math.sin(a) * r;
        pSizes[i] = 0.12 + Math.random() * 0.15;
        pPhase[i] = Math.random() * Math.PI * 2;
      }
      pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
      pGeo.setAttribute('size', new THREE.BufferAttribute(pSizes, 1));

      const pMat = new THREE.PointsMaterial({
        color, size: 0.18, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false,
        toneMapped: false, sizeAttenuation: true,
      });
      const particles = new THREE.Points(pGeo, pMat);
      particles.layers.enable(BLOOM_LAYER);
      particles.frustumCulled = false;
      group.add(particles);

      group.userData.arenaOwned = true;
      scene.add(group);

      this._wells.push({
        group, disc, particles, discMat, pMat, pGeo,
        pPos, pPhase,
        pos: new THREE.Vector3(px, py, pz),
      });
      this._mats.push(discMat, pMat);
    }
    this._geos.push(discGeo);
  }

  update(dt) {
    this._t += dt;
    for (const w of this._wells) {
      // Spin the vortex disc.
      w.disc.rotation.y = this._t * 0.8;
      // Pulse disc opacity.
      w.discMat.opacity = 0.2 + Math.sin(this._t * 1.6 + w.pos.x) * 0.07;

      // Animate rising particles: each particle drifts upward, wrapping
      // back to the ground when it exceeds the well height.
      const pos = w.pGeo.attributes.position;
      for (let i = 0; i < PARTICLE_N; i++) {
        const i3 = i * 3;
        const speed = 0.6 + (i % 5) * 0.12;
        pos.array[i3 + 1] += dt * speed;
        // Wrap back to ground when too high.
        if (pos.array[i3 + 1] > 3.5) pos.array[i3 + 1] = 0;
        // Gentle orbital drift.
        const a = this._t * 0.3 + w.pPhase[i];
        pos.array[i3] += Math.cos(a) * dt * 0.15;
        pos.array[i3 + 2] += Math.sin(a) * dt * 0.15;
        // Keep within the well radius.
        const r = Math.sqrt(pos.array[i3] ** 2 + pos.array[i3 + 2] ** 2);
        if (r > 2.0) {
          pos.array[i3] *= 0.95;
          pos.array[i3 + 2] *= 0.95;
        }
      }
      pos.needsUpdate = true;
      // Particle opacity fades as they rise.
      w.pMat.opacity = 0.4 + Math.sin(this._t * 1.2 + w.pos.x) * 0.1;
    }
  }

  dispose() {
    for (const w of this._wells) {
      this.scene.remove(w.group);
      w.pGeo.dispose();
    }
    for (const g of this._geos) g.dispose();
    for (const m of this._mats) m.dispose();
    this._wells.length = 0;
    this._geos.length = 0;
    this._mats.length = 0;
  }
}
