import * as THREE from 'three';
import { BLOOM_LAYER, ARENA } from '../config/Constants.js';

// Will-o'-wisps — 12 wandering glowing orbs that drift in sinuous 3D paths
// across the arena. Each wisp is a small emissive sphere on the bloom layer
// with a soft trailing scale-pulse. No point lights (pure material glow +
// bloom), so they're essentially free. They wander within the arena bounds,
// wrapping to the opposite edge when they stray too far.

const WISP_COUNT = 12;
const WANDER_SPEED = 1.8;

export class WillOWisps {
  constructor(scene, { color = 0x7fff9f, count = WISP_COUNT } = {}) {
    this.scene = scene;
    this._t = 0;
    this._wisps = [];
    this._geos = [];
    this._mats = [];

    const orbGeo = new THREE.SphereGeometry(0.12, 8, 6);
    // Soft glow halo — a larger transparent sphere around the orb.
    const haloGeo = new THREE.SphereGeometry(0.28, 8, 6);

    const halfW = ARENA.WIDTH / 2 - 2;
    const halfL = ARENA.LENGTH / 2 - 4;

    for (let i = 0; i < count; i++) {
      const hue = (i / count) * 360;
      const col = new THREE.Color().setHSL(hue / 360, 0.6, 0.7);

      // Core orb — solid emissive bloom.
      const orbMat = new THREE.MeshBasicMaterial({
        color: col, toneMapped: false,
      });
      const orb = new THREE.Mesh(orbGeo, orbMat);
      orb.layers.enable(BLOOM_LAYER);

      // Halo — translucent additive glow that pulses.
      const haloMat = new THREE.MeshBasicMaterial({
        color: col, transparent: true, opacity: 0.25,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.layers.enable(BLOOM_LAYER);

      const group = new THREE.Group();
      group.add(orb, halo);

      // Wander parameters first — the anchor must keep the WHOLE orbit clear
      // of the central platform (|x|<8, -7<z<12), or the glow crowds the deck.
      const ampX = 3 + Math.random() * 5;
      const ampZ = 4 + Math.random() * 6;
      let bx, bz, tries = 0;
      do {
        bx = (Math.random() - 0.5) * halfW * 2;
        bz = (Math.random() - 0.5) * halfL * 2;
      } while (!(Math.abs(bx) - ampX > 8 || bz - ampZ > 12 || bz + ampZ < -7) && ++tries < 30);
      group.position.set(bx, 1.5 + Math.random() * 4, bz);

      group.userData.arenaOwned = true;
      scene.add(group);

      this._wisps.push({
        group, halo, haloMat,
        // 3D wander parameters — each wisp has independent sin-wave frequencies
        // for x/y/z drift, creating unique organic paths.
        freqX: 0.3 + Math.random() * 0.4,
        freqY: 0.2 + Math.random() * 0.3,
        freqZ: 0.25 + Math.random() * 0.35,
        baseX: bx, baseZ: bz, ampX, ampZ,
        ampY: 0.8 + Math.random() * 1.5,
        phase: Math.random() * Math.PI * 2,
        baseY: 1.5 + Math.random() * 4,
        pulsePhase: Math.random() * Math.PI * 2,
      });
      this._mats.push(orbMat, haloMat);
    }
    this._geos.push(orbGeo, haloGeo);
  }

  update(dt) {
    this._t += dt;
    for (const w of this._wisps) {
      const t = this._t;
      // Sinuous 3D drift path around the wisp's own anchor (it used to orbit
      // the world origin, so all 12 piled up on the central platform).
      w.group.position.x = w.baseX + Math.sin(t * w.freqX + w.phase) * w.ampX;
      w.group.position.y = w.baseY + Math.sin(t * w.freqY + w.phase * 1.3) * w.ampY;
      w.group.position.z = w.baseZ + Math.cos(t * w.freqZ + w.phase * 0.7) * w.ampZ;

      // Wrap within arena bounds (soft teleport to opposite side).
      if (w.group.position.x > ARENA.WIDTH / 2) w.group.position.x = -ARENA.WIDTH / 2 + 1;
      if (w.group.position.x < -ARENA.WIDTH / 2) w.group.position.x = ARENA.WIDTH / 2 - 1;
      if (w.group.position.z > ARENA.LENGTH / 2) w.group.position.z = -ARENA.LENGTH / 2 + 2;
      if (w.group.position.z < -ARENA.LENGTH / 2) w.group.position.z = ARENA.LENGTH / 2 - 2;

      // Halo pulse — breathes in and out.
      const pulse = 0.13 + Math.sin(t * 2.2 + w.pulsePhase) * 0.07;
      w.haloMat.opacity = pulse;
      const sc = 1 + Math.sin(t * 1.8 + w.pulsePhase) * 0.15;
      w.halo.scale.setScalar(sc);
    }
  }

  dispose() {
    for (const w of this._wisps) this.scene.remove(w.group);
    for (const g of this._geos) g.dispose();
    for (const m of this._mats) m.dispose();
    this._wisps.length = 0;
    this._geos.length = 0;
    this._mats.length = 0;
  }
}
