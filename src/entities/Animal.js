import * as THREE from 'three';
import { HealthComponent } from '../combat/HealthComponent.js';
import { buildAnimal } from './animals/AnimalModel.js';
import { clamp, damp } from '../util/MathUtils.js';
import { RESCUE_REWARD } from '../config/Constants.js';

// A rescuable Level 1 animal (ANIMALS_SPEC). Starts CAGED (safe). The player frees it
// with [E] when near → grants its buff plus an instant reward (gold + HP heal), then
// the animal happily floats away and is removed. States: CAGED → RESCUED (→ removed).
const _v = new THREE.Vector3();

export class Animal {
  constructor(scene, def) {
    this.scene = scene;
    this.def = def;
    this.type = def.type;
    this.buff = def.buff;
    this.flying = def.flying;
    this.hitRadius = 0.45;
    this.position = new THREE.Vector3(...def.pos);
    this.state = def.cage ? 'CAGED' : 'FREE';
    this.dead = false;
    this._t = Math.random() * 10;

    this.health = new HealthComponent(def.hp, { onDeath: () => this._die() });

    this.group = new THREE.Group();
    this.group.position.copy(this.position);
    scene.add(this.group);

    const built = buildAnimal(def.type, def.color);
    this.model = built.group;
    this.bob = built.bob;
    this.wings = built.wings;
    this._mixer = built.mixer;
    this.group.add(this.model);

    // Danger glow — reddens and brightens as HP drops while exposed.
    this.glow = new THREE.PointLight(0xff3020, 0, 5, 2);
    this.glow.position.y = 0.6;
    this.group.add(this.glow);

    if (def.cage) this._buildCage();
  }

  _buildCage() {
    const cage = new THREE.Group();
    const barMat = new THREE.MeshToonMaterial({ color: 0x9fb6c8, emissive: 0x2a4a66, emissiveIntensity: 0.5 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 6), barMat);
      bar.position.set(Math.cos(a) * 0.5, 0.55, Math.sin(a) * 0.5);
      cage.add(bar);
    }
    const ringGeo = new THREE.TorusGeometry(0.5, 0.04, 8, 20);
    for (const y of [0.05, 1.05]) {
      const ring = new THREE.Mesh(ringGeo, barMat);
      ring.position.y = y; ring.rotation.x = Math.PI / 2;
      cage.add(ring);
    }
    // Halo sparkle above (emissive — feeds bloom).
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.03, 8, 20),
      new THREE.MeshBasicMaterial({ color: 0xffe9a0 }),
    );
    halo.position.y = 1.35; halo.rotation.x = Math.PI / 2;
    cage.add(halo);
    this.halo = halo;
    this.cage = cage;
    this.group.add(cage);
  }

  isAttackable() {
    return this.state === 'FREE' && this.health.isAlive() && this.position.y <= 2.5;
  }
  get canFree() { return this.state === 'CAGED'; }
  savedAtEnd() { return this.state !== 'DEAD'; }

  // Player damage path (matches Player.takeDamage signature so enemies hit either).
  takeDamage(amount, ctx) {
    if (this.state !== 'FREE' || this.dead) return;
    this.health.takeDamage(amount);
    _v.copy(this.position).setY(this.position.y + 1.0);
    ctx.damageNumbers.spawn(_v, Math.round(amount).toString(), '#ff9a6a');
  }

  free(ctx) {
    if (this.state !== 'CAGED') return;
    this.state = 'RESCUED';
    if (this.cage) { this.group.remove(this.cage); this.cage = null; this.halo = null; }

    // Buff for the level + instant reward (gold + HP heal).
    ctx.gameManager.grantBuff(this.buff);
    const gold = this.def.rewardGold ?? RESCUE_REWARD.GOLD;
    const hp = this.def.rewardHp ?? RESCUE_REWARD.HP;
    ctx.gameManager.addGold(gold);
    ctx.player.heal?.(hp);

    // Feedback: rescue burst + floating reward numbers + gold pulse.
    _v.copy(this.position).setY(this.position.y + 0.6);
    ctx.vfx.rescueBurst(_v);
    ctx.damageNumbers.spawn(_v, `+${gold}`, '#ffd24a', true);
    _v.setY(this.position.y + 1.05);
    ctx.damageNumbers.spawn(_v, `+${hp} HP`, '#76d35a');
    ctx.hud?.pulseGold?.();

    // Float up and vanish.
    this._leaving = true;
    this._leaveT = 0;
  }

  _die() {
    if (this.dead) return;
    this.dead = true;
    this.state = 'DEAD';
    this.glow.intensity = 0;
    this._ctx?.gameManager?.onAnimalLost?.();
    this._ctx?.vfx?.spore(_v.copy(this.position).setY(0.4), 0x88889a);
    this._leaving = true;
    this._leaveT = 0;
  }

  update(dt, ctx) {
    this._ctx = ctx;
    this._t += dt;

    if (this._leaving) {
      // Shrink out — rescued animals also float up happily as they go.
      this._leaveT += dt;
      const s = clamp(1 - this._leaveT * 2, 0, 1);
      this.model.scale.setScalar(s);
      if (!this.dead) this.group.position.y = this.position.y + this._leaveT * 1.8;
      if (this._leaveT > 0.6) { this.scene.remove(this.group); this.removeMe = true; }
      return;
    }

    // Idle life: bob + (bird) wing flap + (caged) halo spin.
    this._mixer?.update(dt);
    if (this.bob) this.bob.position.y = this._restBob() + Math.sin(this._t * 3) * 0.03;
    if (this.wings) for (let i = 0; i < this.wings.length; i++) this.wings[i].rotation.z = (i ? -1 : 1) * (0.3 + Math.sin(this._t * 12) * 0.5);
    if (this.halo) this.halo.rotation.z = this._t * 1.5;

    // Danger glow when exposed and hurt.
    const danger = this.state === 'FREE' ? (1 - this.health.percent) : 0;
    this.glow.intensity = damp(this.glow.intensity, danger * 6, 8, dt);

    this.group.position.copy(this.position);
  }

  _restBob() {
    // Bird body centered; procedural hedgehog is built feet-at-0 (tiny float so the
    // breathing bob doesn't clip the ground); other ground animals offset internally.
    return this.flying ? 0 : (this.type === 'HEDGEHOG' ? 0.04 : 0.22);
  }

  dispose() {
    this.scene.remove(this.group);
  }
}
