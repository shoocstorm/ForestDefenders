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

  // Giant glowing blueberry + star calyx + ascending updraft ring.
  _buildBounce(def) {
    this._glowMesh(new THREE.SphereGeometry(0.55, 16, 14), this._mat(def.color, 0.7), 0.6);
    const star = this._mat(0x9bff6a, 0.8);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const pt = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.28, 5), star);
      pt.position.set(Math.cos(a) * 0.22, 1.15, Math.sin(a) * 0.22);
      pt.rotation.z = Math.PI; pt.layers.enable(BLOOM_LAYER);
      this.bob.add(pt);
    }
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.05, 8, 24),
      new THREE.MeshBasicMaterial({ color: def.glow, transparent: true, opacity: 0.8 }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.1;
    this.ring.layers.enable(BLOOM_LAYER);
    this.group.add(this.ring);
  }

  // Low green bush studded with red glowing berries.
  _buildVitality(def) {
    this._glowMesh(new THREE.SphereGeometry(0.6, 12, 8), this._mat(0x2f6a2f, 0.15), 0.4).scale.y = 0.7;
    const berry = this._mat(def.color, 0.9);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), berry);
      b.position.set(Math.cos(a) * 0.45, 0.4 + Math.sin(i * 1.7) * 0.18, Math.sin(a) * 0.45);
      b.layers.enable(BLOOM_LAYER);
      this.bob.add(b);
    }
  }

  // Gold-lime orb with short stem/leaf + whirling emerald halo ring.
  _buildTailGuard(def) {
    this._glowMesh(new THREE.SphereGeometry(0.42, 14, 12), this._mat(def.color, 0.85), 0.55);
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 5), this._mat(0x9bff6a, 0.6));
    leaf.position.y = 1.0; leaf.layers.enable(BLOOM_LAYER); this.bob.add(leaf);
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.045, 8, 24),
      new THREE.MeshBasicMaterial({ color: def.glow, transparent: true, opacity: 0.85 }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.55;
    this.ring.layers.enable(BLOOM_LAYER);
    this.group.add(this.ring);
  }

  // Golden moss patch that clings to a tree trunk (flattened glowing dome).
  _buildOakshield(def) {
    const moss = this._glowMesh(new THREE.SphereGeometry(0.55, 12, 10), this._mat(def.color, 0.55), 0.1);
    moss.scale.set(1, 0.5, 0.5);
    for (let i = 0; i < 5; i++) {
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), this._mat(0xfff0a0, 0.9));
      fl.position.set((Math.random() - 0.5) * 0.7, (Math.random() - 0.2) * 0.5, 0.25);
      fl.layers.enable(BLOOM_LAYER); this.bob.add(fl);
    }
  }

  // Flame-shaped leaves + a bright red chili at the tip.
  _buildFlameChili(def) {
    const flame = this._mat(0xff7a2a, 0.7);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.6, 5), flame);
      f.position.set(Math.cos(a) * 0.18, 0.45, Math.sin(a) * 0.18);
      f.rotation.x = Math.cos(a) * 0.3; f.rotation.z = Math.sin(a) * 0.3;
      f.layers.enable(BLOOM_LAYER); this.bob.add(f);
    }
    const chili = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.45, 8), this._mat(def.color, 0.95));
    chili.position.y = 0.95; chili.rotation.x = Math.PI; chili.layers.enable(BLOOM_LAYER);
    this.bob.add(chili);
  }

  // Triggered → go dormant + start respawn timer. Returns the effect to apply.
  consume() {
    this.dormant = true;
    this._respawnT = this.def.respawn;
    this.bob.visible = false;
    if (this.ring) this.ring.visible = false;
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
      }
      return;
    }
    // Breathing bob + pulsing glow + spinning halo.
    this.bob.position.y = 0.04 + Math.sin(this._t * 2.4) * 0.06;
    this.bob.scale.setScalar(1 + Math.sin(this._t * 3) * 0.03);
    this.glow.intensity = 1.8 + Math.sin(this._t * 4) * 0.6;
    if (this.ring) { this.ring.rotation.z = this._t * 1.6; this.ring.scale.setScalar(1 + Math.sin(this._t * 3) * 0.08); }
  }

  dispose() { this.scene.remove(this.group); }
}
