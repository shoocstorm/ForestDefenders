import * as THREE from 'three';
import { COMBAT, ARENA, elementMultiplier } from '../config/Constants.js';
import { HealthComponent } from '../combat/HealthComponent.js';
import { resolveCircleColliders } from '../util/Collision.js';
import { clamp, damp, dampAngle, randRange, randInt } from '../util/MathUtils.js';

const STATE = { PURSUE: 'pursue', ATTACK: 'attack' };

// Shared enemy: HealthComponent + IDLE/PURSUE/ATTACK AI (ENEMIES_SPEC §3), boids
// separation, anti-stuck veer, hit-squash/flash feedback, and the death sequence
// (gold + spore burst + impact freeze + squash-flop). Subclasses build the model
// (buildModel) and define the attack (performAttack). Stats scale with level by
// (1 + 0.15*level) (ENEMIES_SPEC §5).
//
// Scratch vectors are module-level: enemies update one-at-a-time, never reentrant.
const _to = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _strafe = new THREE.Vector3();
const _sep = new THREE.Vector3();
const _center = new THREE.Vector3();

export class EnemyBase {
  constructor(scene, def, pos, level = 0) {
    this.scene = scene;
    this.def = def;
    this.element = def.element;
    this.role = def.role;
    this.hitRadius = def.hitRadius;

    const s = 1 + COMBAT.LEVEL_SCALE * level;
    this.maxHp = def.hp * s;
    this.speed = def.speed;                  // movement kept un-scaled so it stays readable
    this.attackDamage = def.attackDamage * s;
    this.attackRange = def.attackRange;
    this.attackCooldown = def.attackCooldown;
    this.detectionRange = def.detectionRange;
    this.preferredRange = def.role === 'ranged' ? def.attackRange * 0.8 : 0;

    this.position = new THREE.Vector3().copy(pos);
    this.velocity = new THREE.Vector3();
    this.facing = 0;
    this.state = STATE.PURSUE;
    this.dead = false;
    this.removeMe = false;

    this._attackTimer = randRange(0.3, this.attackCooldown); // stagger first attacks
    this._stuckTimer = 0;
    this._veerSign = Math.random() < 0.5 ? 1 : -1;
    this._lastPos = this.position.clone();
    this._hitFlash = 0;
    this._squash = 0;
    this._deathT = -1;
    this._animTime = randRange(0, 10);

    this.health = new HealthComponent(this.maxHp, { onDeath: () => this._onDied() });
    this.group = new THREE.Group();
    this.group.position.copy(this.position);
    scene.add(this.group);

    this.capPivot = null;
    this._emissives = [];
    this._baseEmissive = [];
    this.buildModel();           // subclass fills this.root, this.capPivot, this._emissives
  }

  // Subclasses call this with a buildMushroom(...) result.
  attachModel({ group, capPivot, emissives }) {
    this.root = group;
    this.capPivot = capPivot;
    this._emissives = emissives;
    this._baseEmissive = emissives.map((m) => m.emissiveIntensity ?? 0);
    this.group.add(group);
  }

  // --- Damage pipeline (COMBAT_SPEC §2). base+element → final HP loss. ---
  takeDamage(baseDamage, attackElement, ctx) {
    if (this.dead) return null;
    this._ctx = ctx;
    const mult = ctx.gameManager.playerDamageMult * elementMultiplier(attackElement, this.element);
    const final = baseDamage * mult;
    this.health.takeDamage(final);
    this._hitFlash = 1;
    if (this._deathT < 0) this._squash = 1;

    let label = null, color = '#ffffff';
    if (mult >= 2.0) { label = 'WEAK!'; color = '#7fff6a'; }
    else if (mult >= 1.5) { label = 'EFFECTIVE'; color = '#ffe24a'; }
    else if (mult <= 0.5) { label = 'RESIST'; color = '#ff6a5a'; }

    _center.copy(this.position).setY(this.position.y + 1.4);
    ctx.damageNumbers.spawn(_center, Math.round(final).toString(), color, label === 'WEAK!');
    if (label) {
      _center.y += 0.32;
      ctx.damageNumbers.spawn(_center, label, color);
    }
    return { final, mult };
  }

  update(dt, ctx) {
    this._ctx = ctx;
    this._animTime += dt;

    if (this._deathT >= 0) { this._updateDeath(dt); return; }

    _to.subVectors(ctx.player.position, this.position); _to.y = 0;
    const dist = _to.length();
    this.state = dist <= this.attackRange ? STATE.ATTACK : STATE.PURSUE;

    this._move(dt, _to, dist, ctx);

    // Integrate + resolve against arena bounds and tree trunks.
    this.position.addScaledVector(this.velocity, dt);
    const half = COMBAT.ENEMY_RADIUS;
    this.position.x = clamp(this.position.x, -ARENA.WIDTH / 2 + half, ARENA.WIDTH / 2 - half);
    this.position.z = clamp(this.position.z, -ARENA.LENGTH / 2 + half, ARENA.LENGTH / 2 - half);
    resolveCircleColliders(this.position, half, ctx.colliders);

    // Anti-stuck: little actual movement while pursuing → flip veer side.
    const moved = this.position.distanceTo(this._lastPos);
    if (this.state === STATE.PURSUE && moved < 0.02 * (dt / (1 / 60))) {
      this._stuckTimer += dt;
      if (this._stuckTimer > 1.3) { this._veerSign *= -1; this._stuckTimer = 0; }
    } else {
      this._stuckTimer = 0;
    }
    this._lastPos.copy(this.position);

    // Attack on cooldown when in range.
    this._attackTimer -= dt;
    if (this.state === STATE.ATTACK && this._attackTimer <= 0) {
      this.performAttack(ctx, _to, dist);
      this._attackTimer = this.attackCooldown;
    }

    // Face the player (XZ).
    if (dist > 0.05) {
      this.facing = dampAngle(this.facing, Math.atan2(_to.x, _to.z), 8, dt);
    }

    this.group.position.copy(this.position);
    this.group.rotation.y = this.facing;
    this._animate(dt);
  }

  _move(dt, to, dist, ctx) {
    _dir.copy(to);
    if (dist > 1e-4) _dir.divideScalar(dist);
    _desired.set(0, 0, 0);

    if (dist > this.preferredRange + 0.4) {
      _desired.addScaledVector(_dir, 0.95);          // close distance
    } else if (this.role === 'ranged' && dist < this.preferredRange - 1.0) {
      _desired.addScaledVector(_dir, -0.9);          // back off to preferred range
    }
    // Strafe commitment (bigger while stuck to escape loops).
    _strafe.set(_dir.z, 0, -_dir.x);
    _desired.addScaledVector(_strafe, (this._stuckTimer > 0 ? 0.6 : 0.12) * this._veerSign);

    // Boids separation from nearby enemies.
    this._separation(ctx.enemies, _sep);
    _desired.add(_sep);

    if (_desired.lengthSq() > 1e-4) _desired.normalize();
    this.velocity.x = _desired.x * this.speed;
    this.velocity.z = _desired.z * this.speed;
  }

  _separation(enemies, out) {
    out.set(0, 0, 0);
    const r = COMBAT.SEPARATION_RADIUS;
    for (const e of enemies) {
      if (e === this || e.dead) continue;
      const dx = this.position.x - e.position.x;
      const dz = this.position.z - e.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        out.x += (dx / d) * (1 - d / r);
        out.z += (dz / d) * (1 - d / r);
      }
    }
    out.multiplyScalar(1.4);
    return out;
  }

  // --- Visual feedback: idle cap bob, hit flash decay, hit squash spring. ---
  _animate(dt) {
    // Hit flash → spike emissive then decay.
    if (this._hitFlash > 0) {
      this._hitFlash = Math.max(0, this._hitFlash - dt * 6);
      for (let i = 0; i < this._emissives.length; i++) {
        this._emissives[i].emissiveIntensity = this._baseEmissive[i] + this._hitFlash * 2.2;
      }
    }
    // Hit squash spring (skip while the death sequence owns root scale).
    if (this._deathT < 0) {
      if (this._squash > 0) this._squash = Math.max(0, this._squash - dt * 7);
      const sq = this._squash;
      this.root?.scale.set(1 + 0.3 * sq, 1 - 0.35 * sq, 1 + 0.3 * sq);
    }
    // Idle cap breathing bob + recover any attack lunge tilt.
    if (this.capPivot) {
      this.capPivot.position.y = 0.7 + Math.sin(this._animTime * 3) * 0.04;
      this.capPivot.rotation.x = damp(this.capPivot.rotation.x, 0, 8, dt);
    }
  }

  // --- Death sequence (ENEMIES_SPEC §7, JUICE_SPEC §9). ---
  _onDied() {
    if (this.dead) return;
    this.dead = true;
    const ctx = this._ctx;
    ctx.gameManager.addKill();
    _center.copy(this.position).setY(this.position.y + 0.6);
    ctx.loot.spawnGold(this.position, randInt(COMBAT.GOLD_MIN ?? 1, COMBAT.GOLD_MAX ?? 5));
    ctx.vfx.spore(_center, this.def.accent ?? 0xffffff);
    ctx.juice.impactFreeze();
    this._deathT = 0;
  }

  // Keyframed squash → stretch → bounce → pop, then retire (JUICE_SPEC §9).
  _updateDeath(dt) {
    this._deathT += dt;
    const t = this._deathT;
    const set = (x, y, z) => this.root?.scale.set(x, y, z);
    // Fade the glow out as it collapses.
    for (let i = 0; i < this._emissives.length; i++) {
      this._emissives[i].emissiveIntensity = this._baseEmissive[i] * clamp(1 - t / 0.4, 0, 1);
    }
    if (t < 0.14) set(1 + (0.6) * (t / 0.14), 1 - 0.6 * (t / 0.14), 1 + 0.6 * (t / 0.14));
    else if (t < 0.30) { const k = (t - 0.14) / 0.16; set(1.6 - 1.1 * k, 0.4 + 1.4 * k, 1.6 - 1.1 * k); }
    else if (t < 0.42) { const k = (t - 0.30) / 0.12; set(0.5 + 0.85 * k, 1.8 - 1.1 * k, 0.5 + 0.85 * k); }
    else if (t < 0.54) { const k = (t - 0.42) / 0.12; set(1.35 + 0.15 * k, 0.7 + 0.8 * k, 1.35 + 0.15 * k); }
    else { this.dispose(); }
  }

  dispose() {
    this.removeMe = true;
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.isMesh) { o.geometry.dispose?.(); }
    });
  }

  // Subclasses override:
  buildModel() {}
  performAttack(ctx, toPlayer, dist) {}
}
