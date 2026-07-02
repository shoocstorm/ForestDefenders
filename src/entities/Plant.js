import * as THREE from 'three';
import { BLOOM_LAYER } from '../config/Constants.js';

// An interactive magical plant (PLANTS_SPEC §1). Procedural primitives + an
// emissive bloom accent + a glow light. Some are triggered by walking over them
// (touch), some by shooting them (shoot), some by either (both). After triggering
// it goes dormant (mesh hidden) and respawns after `def.respawn` seconds.
//
// The actual effect dispatch (heal / bounce / buff) lives in PlantManager so this
// class stays a dumb prop. `interactKind()` reports how it can be triggered.
export class Plant {
  constructor(scene, def, pos) {
    this.scene = scene;
    this.def = def;
    this.type = def.id;
    this.position = new THREE.Vector3(...pos);
    this.hitRadius = def.radius;
    this.dormant = false;
    this._respawnT = 0;
    this._t = Math.random() * 10;

    this.group = new THREE.Group();
    this.group.position.copy(this.position);
    scene.add(this.group);

    this.bob = new THREE.Group();
    this.group.add(this.bob);
    this._build(def);

    this.glow = new THREE.PointLight(def.glow, 2.2, 5, 2);
    this.glow.position.y = 0.6;
    this.group.add(this.glow);

    this._buildBeacon(def);
  }

  // Floating "interact here" beacon: a glowing downward chevron ringed by a halo,
  // hovering above the plant so pickups read from across the arena (mirrors the
  // caged-animal rescue beacon). Hidden while the plant is dormant.
  _buildBeacon(def) {
    const beacon = new THREE.Group();
    beacon.position.y = 1.6;
    const mat = new THREE.MeshBasicMaterial({ color: def.glow });
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.3, 4), mat);
    arrow.rotation.x = Math.PI; // point down at the plant
    arrow.layers.enable(BLOOM_LAYER);
    beacon.add(arrow);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.025, 6, 20), mat);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.22;
    ring.layers.enable(BLOOM_LAYER);
    beacon.add(ring);
    this.beacon = beacon;
    this._beaconRing = ring;
    this.group.add(beacon);
  }

  interactKind() { return this.def.interact; } // 'touch' | 'shoot' | 'both'
  get canTouch() { return !this.dormant && this.def.interact !== 'shoot'; }
  get canShoot() { return !this.dormant && this.def.interact !== 'touch'; }

  _mat(color, emissiveBoost = 0.6) {
    const m = new THREE.MeshToonMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: emissiveBoost });
    return m;
  }

  _glowMesh(geo, mat, y = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    m.layers.enable(BLOOM_LAYER);
    this.bob.add(m);
    return m;
  }

  // Generic part placer. `bloom` opts the mesh into the emissive bloom pass;
  // leave it off for solid plant matter (stems, leaves) so glowing fruit reads
  // against a grounded, non-glowing base. Parents to `this.bob` so it bobs.
  _piece(geo, mat, pos = [0, 0, 0], rot = [0, 0, 0], bloom = false) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    m.rotation.set(...rot);
    if (bloom) m.layers.enable(BLOOM_LAYER);
    this.bob.add(m);
    return m;
  }

  // A short woody stem + leaf collar most plants sprout from (grounds the orb).
  _stem(height = 0.5, woodColor = 0x6e4a26, leafColor = 0x3f7a35, leaves = 3) {
    const stem = this._piece(new THREE.CylinderGeometry(0.05, 0.075, height, 6),
      this._mat(woodColor, 0), [0, height / 2, 0]);
    for (let i = 0; i < leaves; i++) {
      const a = (i / leaves) * Math.PI * 2 + 0.4;
      const leaf = this._piece(new THREE.ConeGeometry(0.11, 0.34, 4),
        this._mat(leafColor, 0.1),
        [Math.cos(a) * 0.16, height * 0.55, Math.sin(a) * 0.16],
        [Math.PI / 2.1, -a, Math.cos(a) * 0.5]);
      leaf.scale.set(0.6, 1, 1);
    }
    return stem;
  }

  _build(def) {
    switch (def.id) {
      case 'BOUNCE': return this._buildBounce(def);
      case 'VITALITY': return this._buildVitality(def);
      case 'TAIL_GUARD': return this._buildTailGuard(def);
      case 'OAKSHIELD': return this._buildOakshield(def);
      case 'FLAME_CHILI': return this._buildFlameChili(def);
      default: return this._glowMesh(new THREE.SphereGeometry(0.4, 12, 10), this._mat(def.color), 0.5);
    }
  }

  // Giant glowing blueberry cluster on a leafy stem + star calyx + updraft ring.
  _buildBounce(def) {
    this._stem(0.42, 0x4a5a3a, 0x3f7a35, 3);
    // Main berry, faceted by a low segment count, with two smaller buds clinging.
    this._glowMesh(new THREE.SphereGeometry(0.55, 12, 9), this._mat(def.color, 0.7), 0.62);
    const bud = this._mat(0x2f4ad0, 0.6);
    for (const [bx, by, bz, br] of [[0.42, 0.34, 0.1, 0.2], [-0.36, 0.4, -0.16, 0.16]]) {
      this._piece(new THREE.SphereGeometry(br, 10, 8), bud, [bx, by, bz], [0, 0, 0], true);
    }
    // Crown of calyx leaves curling up off the top of the main berry.
    const star = this._mat(0x9bff6a, 0.8);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this._piece(new THREE.ConeGeometry(0.07, 0.26, 4), star,
        [Math.cos(a) * 0.2, 1.12, Math.sin(a) * 0.2], [0.5, 0, Math.PI]);
    }
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.05, 8, 24),
      new THREE.MeshBasicMaterial({ color: def.glow, transparent: true, opacity: 0.8 }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.1;
    this.ring.layers.enable(BLOOM_LAYER);
    this.group.add(this.ring);
  }

  // Low lumpy green bush studded with red glowing berries + broad leaves.
  _buildVitality(def) {
    // Clustered foliage lobes give a lumpier, leafier silhouette than one sphere.
    const folA = this._mat(0x2f6a2f, 0.12), folB = this._mat(0x3c8038, 0.12);
    this._glowMesh(new THREE.SphereGeometry(0.6, 11, 8), folA, 0.4).scale.set(1, 0.7, 1);
    for (const [lx, ly, lz, lr, lm] of [
      [0.34, 0.46, 0.12, 0.34, folB], [-0.3, 0.5, -0.2, 0.3, folB],
      [0.1, 0.62, -0.34, 0.28, folA], [-0.18, 0.44, 0.36, 0.26, folB]]) {
      this._piece(new THREE.SphereGeometry(lr, 9, 7), lm, [lx, ly, lz], [0, 0, 0], true);
    }
    // A few flat leaf blades fanning out near the base.
    const blade = this._mat(0x4a8a40, 0.1);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      const lf = this._piece(new THREE.ConeGeometry(0.13, 0.4, 4), blade,
        [Math.cos(a) * 0.5, 0.18, Math.sin(a) * 0.5], [Math.PI / 2.2, -a, 0]);
      lf.scale.set(0.55, 1, 1);
    }
    // Glowing berries at varied sizes, with a darker calyx dot on each.
    const berry = this._mat(def.color, 0.9), calyx = this._mat(0x6a2f1f, 0.2);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const r = 0.4 + (i % 2) * 0.08;
      const y = 0.42 + Math.sin(i * 1.7) * 0.2;
      const sz = 0.085 + (i % 3) * 0.02;
      this._piece(new THREE.SphereGeometry(sz, 8, 7), berry, [Math.cos(a) * r, y, Math.sin(a) * r], [0, 0, 0], true);
      this._piece(new THREE.SphereGeometry(sz * 0.35, 5, 4), calyx, [Math.cos(a) * r, y + sz, Math.sin(a) * r]);
    }
  }

  // Gold-lime spiral fruit on a leafy stem + crown leaves + whirling halo ring.
  _buildTailGuard(def) {
    this._stem(0.36, 0x5a6a2a, 0x6a9a2a, 3);
    // Faceted orb with a few raised spiral ridges (segments of a thin torus band).
    this._glowMesh(new THREE.SphereGeometry(0.42, 11, 9), this._mat(def.color, 0.85), 0.58);
    const ridge = this._mat(0xaecf3a, 0.5);
    for (let i = 0; i < 3; i++) {
      const band = this._piece(new THREE.TorusGeometry(0.4, 0.03, 5, 16), ridge, [0, 0.58, 0], [Math.PI / 2, 0, 0], true);
      band.rotation.x = Math.PI / 2 + (i - 1) * 0.5;
    }
    // Curling crown leaves spiralling off the top.
    const crown = this._mat(0x9bff6a, 0.6);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      this._piece(new THREE.ConeGeometry(0.09, 0.3, 4), crown,
        [Math.cos(a) * 0.08, 1.0, Math.sin(a) * 0.08], [0.4, a, a * 0.3], true);
    }
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.045, 8, 24),
      new THREE.MeshBasicMaterial({ color: def.glow, transparent: true, opacity: 0.85 }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.55;
    this.ring.layers.enable(BLOOM_LAYER);
    this.group.add(this.ring);
  }

  // Golden moss patch that clings to a tree trunk: lumpy glowing dome with
  // flecks, sprouting shield-shroom caps, and a couple of dangling fronds.
  _buildOakshield(def) {
    const moss = this._glowMesh(new THREE.SphereGeometry(0.55, 11, 9), this._mat(def.color, 0.55), 0.1);
    moss.scale.set(1, 0.5, 0.5);
    // Secondary moss lumps for an irregular, clinging silhouette.
    const lump = this._mat(0xc4ab32, 0.45);
    for (const [lx, ly, lr] of [[0.36, 0.22, 0.22], [-0.3, -0.04, 0.2], [0.05, -0.18, 0.18]]) {
      this._piece(new THREE.SphereGeometry(lr, 8, 6), lump, [lx, ly, 0.18], [0, 0, 0], true).scale.set(1, 0.6, 0.5);
    }
    // Tiny golden shield-shrooms sprouting from the moss (stem + glowing cap).
    const capMat = this._mat(0xfff0a0, 0.9), stemMat = this._mat(0xe8d486, 0.3);
    for (const [sx, sy] of [[-0.28, 0.18], [0.22, -0.06], [0.0, 0.28]]) {
      this._piece(new THREE.CylinderGeometry(0.018, 0.025, 0.12, 5), stemMat, [sx, sy, 0.28]);
      this._piece(new THREE.SphereGeometry(0.06, 7, 5), capMat, [sx, sy + 0.08, 0.28], [0, 0, 0], true).scale.y = 0.6;
    }
    // Glowing spore flecks scattered over the face.
    const fleck = this._mat(0xfff0a0, 0.9);
    for (let i = 0; i < 6; i++) {
      this._piece(new THREE.SphereGeometry(0.035, 5, 4), fleck,
        [(Math.random() - 0.5) * 0.8, (Math.random() - 0.2) * 0.5, 0.3], [0, 0, 0], true);
    }
  }

  // A fern: arching fronds with leaflets, flame-shaped leaves, a cluster of
  // hanging chilis, and drifting ember dots at the tips.
  _buildFlameChili(def) {
    // Central woody stalk the fronds spray from.
    this._piece(new THREE.CylinderGeometry(0.04, 0.07, 0.5, 6), this._mat(0x7a4a24, 0), [0, 0.25, 0]);
    // Arching fronds: a thin stem with paired leaflets stepping up its length.
    const frondMat = this._mat(0x3f7a35, 0.1), leafletMat = this._mat(0x4a8a40, 0.12);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const dx = Math.cos(a), dz = Math.sin(a);
      const frond = this._piece(new THREE.CylinderGeometry(0.012, 0.022, 0.6, 4), frondMat,
        [dx * 0.18, 0.5, dz * 0.18], [Math.PI / 5, -a, 0]);
      frond.rotation.z = -dx * 0.4;
      for (let k = 1; k <= 3; k++) {
        const lf = this._piece(new THREE.ConeGeometry(0.05, 0.16, 4), leafletMat,
          [dx * (0.18 + k * 0.12), 0.55 + k * 0.12, dz * (0.18 + k * 0.12)], [Math.PI / 2, -a, 0]);
        lf.scale.set(0.5, 1, 1);
      }
    }
    // Flame-shaped emissive leaves rising through the center.
    const flame = this._mat(0xff7a2a, 0.7);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      this._piece(new THREE.ConeGeometry(0.11, 0.52, 5), flame,
        [Math.cos(a) * 0.16, 0.5, Math.sin(a) * 0.16], [Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3], true);
    }
    // Cluster of drooping chilis at the crown + a glowing ember on each tip.
    const chiliMat = this._mat(def.color, 0.95), ember = this._mat(0xffd24a, 1.0);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const cx = Math.cos(a) * 0.12, cz = Math.sin(a) * 0.12;
      this._piece(new THREE.ConeGeometry(0.08, 0.4, 7), chiliMat, [cx, 0.92, cz], [Math.PI - 0.3, a, 0], true);
      this._piece(new THREE.SphereGeometry(0.04, 6, 5), ember, [cx, 0.72, cz], [0, 0, 0], true);
    }
  }

  // Triggered → go dormant + start respawn timer. Returns the effect to apply.
  consume() {
    this.dormant = true;
    this._respawnT = this.def.respawn;
    this.bob.visible = false;
    if (this.ring) this.ring.visible = false;
    if (this.beacon) this.beacon.visible = false;
    this.glow.intensity = 0;
    return this.def.effect;
  }

  update(dt) {
    this._t += dt;
    if (this.dormant) {
      this._respawnT -= dt;
      if (this._respawnT <= 0) {
        this.dormant = false;
        this.bob.visible = true;
        if (this.ring) this.ring.visible = true;
        if (this.beacon) this.beacon.visible = true;
      }
      return;
    }
    // Breathing bob + pulsing glow + spinning halo.
    this.bob.position.y = 0.04 + Math.sin(this._t * 2.4) * 0.06;
    this.bob.scale.setScalar(1 + Math.sin(this._t * 3) * 0.03);
    this.glow.intensity = 1.8 + Math.sin(this._t * 4) * 0.6;
    if (this.ring) { this.ring.rotation.z = this._t * 1.6; this.ring.scale.setScalar(1 + Math.sin(this._t * 3) * 0.08); }
    // Beacon hovers, bobs, and spins its halo to draw the eye.
    if (this.beacon) {
      this.beacon.position.y = 1.6 + Math.sin(this._t * 2) * 0.14;
      this.beacon.rotation.y = this._t * 0.9;
      if (this._beaconRing) this._beaconRing.rotation.z = this._t * 1.8;
    }
  }

  // Every geometry/material here is built fresh per-plant (no shared/cloned
  // assets), so a full traverse-and-dispose is safe and necessary — otherwise
  // every level reload (PlantManager.dispose() on retry/advance) leaks all of
  // this plant's GPU buffers.
  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry?.dispose?.();
      o.material?.dispose?.();
    });
  }
}
