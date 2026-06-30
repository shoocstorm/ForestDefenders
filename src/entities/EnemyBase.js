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
    // Tactical steering (SWARM / FLANK / REGROUP) — re-evaluated on a timer so the
    // choice is cheap and stable instead of thrashing every frame.
    this.tactic = 'swarm';
    this._tacticTimer = randRange(0, 0.5);
    this._allyNear = 0;          // allies inside the tight "pressing crowd" radius
    this._hasPack = false;       // any allies inside the wider regroup radius
    this._allyCx = 0; this._allyCz = 0; // centroid of that wider pack
    this._lastPos = this.position.clone();
    this._hitFlash = 0;
    this._squash = 0;
    this._deathT = -1;
    this._preDeathT = -1;                   // pre-death shake delay before full death effects
    this._stun = 0;                          // EMP / knockback freeze timer (Toroid)
    this._knock = new THREE.Vector3();       // decaying knockback impulse (melee / AOE)
    this._animTime = randRange(0, 10);

    this.health = new HealthComponent(this.maxHp, {}); // Death handled in takeDamage for staged effects
    this.group = new THREE.Group();
    this.group.position.copy(this.position);
    scene.add(this.group);

    this.capPivot = null;
    this._emissives = [];
    this._baseEmissive = [];
    this.buildModel();           // subclass fills this.root, this.capPivot, this._emissives
    if (def.scale) this.group.scale.setScalar(def.scale); // boss is a bigger body
  }

  // Subclasses call this with a buildMushroom(...) result. The optional
  // `mixer`/`actions` let authored GLB clips (idle/walk/attack/hit) drive the
  // enemy; when present, the manual cap bob is skipped to avoid fighting the clip.
  attachModel({ group, capPivot, emissives, mixer, actions }) {
    this.root = group;
    this.capPivot = mixer ? null : capPivot; // clip owns the bob when animating
    this._emissives = emissives;
    this._baseEmissive = emissives.map((m) => m.emissiveIntensity ?? 0);
    this.mixer = mixer || null;
    this.actions = actions || {};
    this._hasAnim = !!mixer;
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
    if (this._deathT < 0 && this._preDeathT < 0) {
      this._squash = 1;
      this._playClip('hit', 0.05);
    }

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

    // Start pre-death sequence instead of immediate death for better juice
    if (!this.health.isAlive() && this._preDeathT < 0 && this._deathT < 0) {
      this._startPreDeath(ctx);
    }

    return { final, mult };
  }

  // Detonate immediately on death — no shrink/wind-down, burst right away.
  _startPreDeath(ctx) {
    this.dead = true; // Mark as dead so they don't keep acting
    ctx.gameManager.addKill(); // Count the kill immediately
    this._onDied(); // Straight to the explosion (skips the pre-death shrink)
  }

  // Knockback impulse (melee / explosive AOE). `dir` is a horizontal unit vector.
  applyKnockback(dir, speed) {
    if (this.dead) return;
    this._knock.addScaledVector(dir, speed);
  }

  // EMP / electric stun (Toroid). Freezes AI + attacks for `duration` seconds.
  stun(duration) {
    if (this.dead) return;
    this._stun = Math.max(this._stun, duration);
  }

  // Slide + decay the knockback impulse (exponential, frame-rate independent).
  _applyKnock(dt) {
    if (this._knock.lengthSq() < 1e-5) { this._knock.set(0, 0, 0); return; }
    this.position.addScaledVector(this._knock, dt);
    this._knock.multiplyScalar(Math.exp(-4 * dt)); // Moderate decay
  }

  update(dt, ctx) {
    this._ctx = ctx;
    this._animTime += dt;

    // Handle pre-death shake phase before full death effects
    if (this._preDeathT >= 0) {
      this._updatePreDeath(dt, ctx);
      return;
    }

    if (this._deathT >= 0) { this._updateDeath(dt); return; }

    // EMP stun (Toroid): frozen — no AI/attacks, knockback still slides + glow pulse.
    if (this._stun > 0) {
      this._stun -= dt;
      this.velocity.set(0, 0, 0);
      this._applyKnock(dt);
      this.group.position.copy(this.position);
      const pulse = 0.5 + 0.5 * Math.sin(this._animTime * 14);
      for (let i = 0; i < this._emissives.length; i++) {
        this._emissives[i].emissiveIntensity = this._baseEmissive[i] + pulse * 0.8;
      }
      return;
    }

    // Target the nearest attackable animal, else the player (ANIMALS_SPEC §5).
    const target = this._selectTarget(ctx);
    this.target = target;
    _to.subVectors(target.position, this.position); _to.y = 0;
    const dist = _to.length();
    this.state = dist <= this.attackRange ? STATE.ATTACK : STATE.PURSUE;

    // Re-pick the steering tactic periodically (cheap; stable between ticks).
    this._tacticTimer -= dt;
    if (this._tacticTimer <= 0) { this._tacticTimer = 0.5; this._chooseTactic(ctx); }

    this._move(dt, _to, dist, ctx);

    // Integrate + resolve against arena bounds and tree trunks (+ knockback slide).
    this.position.addScaledVector(this.velocity, dt);
    this._applyKnock(dt);
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
      this.performAttack(ctx, target, _to, dist);
      // Director aggression tightens/loosens the next attack (narrow, bounded band).
      this._attackTimer = this.attackCooldown / (ctx.director?.aggression ?? 1);
      this._playClip('attack');
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

    const aggro = ctx.director?.aggression ?? 1;

    if (this.tactic === 'regroup' && this._hasPack) {
      // Fall back toward the pack centroid instead of pressing the target. Ranged
      // also keep some distance discipline so they don't drift into melee range.
      _strafe.set(this._allyCx - this.position.x, 0, this._allyCz - this.position.z);
      if (_strafe.lengthSq() > 1e-4) _strafe.normalize();
      _desired.addScaledVector(_strafe, 0.8);
      if (this.role === 'ranged' && dist < this.preferredRange) _desired.addScaledVector(_dir, -0.4);
    } else {
      if (dist > this.preferredRange + 0.4) {
        _desired.addScaledVector(_dir, 0.95 * aggro);  // close distance (aggression-scaled)
      } else if (this.role === 'ranged' && dist < this.preferredRange - 1.0) {
        _desired.addScaledVector(_dir, -0.9);          // back off to preferred range
      }
      // Strafe commitment — flankers arc in hard (off-axis approach), stuck enemies
      // veer wider to escape loops, everyone else keeps a light weave.
      _strafe.set(_dir.z, 0, -_dir.x);
      const strafeW = this.tactic === 'flank' ? 0.7 : (this._stuckTimer > 0 ? 0.6 : 0.12);
      _desired.addScaledVector(_strafe, strafeW * this._veerSign);
    }

    // Boids separation from nearby enemies.
    this._separation(ctx.enemies, _sep);
    _desired.add(_sep);

    if (_desired.lengthSq() > 1e-4) _desired.normalize();
    this.velocity.x = _desired.x * this.speed;
    this.velocity.z = _desired.z * this.speed;
  }

  // Utility pick between SWARM (charge head-on), FLANK (arc in off-axis when a crowd
  // is already pressing), and REGROUP (fall back to the pack when isolated or a
  // low-HP ranged unit). One pass counts allies in a tight + wide radius and the
  // wide-pack centroid; chosen tactic feeds _move's steering blend.
  _chooseTactic(ctx) {
    const TIGHT2 = 5 * 5, WIDE2 = 18 * 18;
    let near = 0, far = 0, cx = 0, cz = 0;
    for (const e of ctx.enemies) {
      if (e === this || e.dead) continue;
      const dx = e.position.x - this.position.x;
      const dz = e.position.z - this.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < WIDE2) { far++; cx += e.position.x; cz += e.position.z; }
      if (d2 < TIGHT2) near++;
    }
    this._allyNear = near;
    this._hasPack = far > 0;
    if (far > 0) { this._allyCx = cx / far; this._allyCz = cz / far; }

    const hp = this.health.percent;
    if (this.role === 'ranged' && hp < 0.4 && this._hasPack) { this.tactic = 'regroup'; return; }
    if (near === 0 && far >= 2) { this.tactic = 'regroup'; return; }      // cut off from the pack
    if (this.role === 'melee' && near >= 2) { this.tactic = 'flank'; return; } // crowd already pressing
    this.tactic = 'swarm';
  }

  // Pick whom to hunt: nearest attackable animal, but switch to the player when
  // they get close (self-defense), and always the player if no animal is valid.
  _selectTarget(ctx) {
    const player = ctx.player;
    const animals = ctx.animals;
    if (!animals || !animals.length) return player;
    let best = null, bestD = Infinity;
    for (const a of animals) {
      // Melee/boss can't reach flying animals (ANIMALS_SPEC §5).
      if (!a.isAttackable() || (a.flying && this.role !== 'ranged')) continue;
      const d = a.position.distanceToSquared(this.position);
      if (d < bestD) { bestD = d; best = a; }
    }
    if (!best) return player;
    const selfDef = this.attackRange * 1.5;
    if (player.position.distanceToSquared(this.position) < selfDef * selfDef) return player;
    return best;
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

  // Crossfade to an authored clip if present (one-shots reset + clamp).
  _playClip(name, fade = 0.18) {
    const a = this.actions[name];
    if (!a || a === this._curClip) return;
    if (name === 'attack' || name === 'hit' || name === 'dying') {
      a.reset().setLoop(THREE.LoopOnce, 1).clampWhenFinished = true;
    }
    if (this._curClip) this._curClip.fadeOut(fade);
    a.setEffectiveWeight(1).fadeIn(fade).play();
    this._curClip = a;
    this._curName = name;
    this._curIsOneShot = name === 'attack' || name === 'hit' || name === 'dying';
  }

  // --- Visual feedback: authored clips, hit flash decay, hit squash spring. ---
  _animate(dt) {
    // Hit flash → spike emissive then decay.
    if (this._hitFlash > 0) {
      this._hitFlash = Math.max(0, this._hitFlash - dt * 6);
      for (let i = 0; i < this._emissives.length; i++) {
        this._emissives[i].emissiveIntensity = this._baseEmissive[i] + this._hitFlash * 2.2;
      }
    }
    // Hit squash spring (skip while pre-death or death sequence owns root scale).
    if (this._deathT < 0 && this._preDeathT < 0) {
      if (this._squash > 0) this._squash = Math.max(0, this._squash - dt * 7);
      const sq = this._squash;
      this.root?.scale.set(1 + 0.3 * sq, 1 - 0.35 * sq, 1 + 0.3 * sq);
    }
    // Authored clips: walk while pursuing, idle otherwise (the clip bobs the cap).
    if (this.mixer) {
      this.mixer.update(dt);
      // Don't let locomotion cut a playing attack/hit one-shot short.
      const oneShotBusy = this._curIsOneShot && this._curClip?.isRunning();
      if (this._deathT < 0 && this._preDeathT < 0 && !oneShotBusy && this.actions.walk && this.actions.idle) {
        const moving = this.state === STATE.PURSUE && this.velocity.lengthSq() > 0.5;
        this._playClip(moving ? 'walk' : 'idle', 0.2);
      }
    } else if (this.capPivot) {
      // Fallback procedural bob for models without authored clips.
      this.capPivot.position.y = (this.capPivot.userData.baseY ?? this.capPivot.position.y) +
        Math.sin(this._animTime * 3) * 0.04;
      this.capPivot.rotation.x = damp(this.capPivot.rotation.x, 0, 8, dt);
    }
  }

  // --- Pre-death phase: enemy gets knocked back, then death effects trigger ---
  _updatePreDeath(dt, ctx) {
    this._preDeathT += dt;

    // Short delay so knockback is visible but snappy
    const PRE_DEATH_DURATION = 0.35;

    // Continue knockback slide - enemy flies away from hit
    this._applyKnock(dt);

    // IMPORTANT: Update group position so knockback is visible!
    this.group.position.copy(this.position);

    // Shrink and fade as they fly - dramatic wind-down before pop
    const t = this._preDeathT / PRE_DEATH_DURATION;
    const scale = 1 - t * 0.4; // Shrink to 60% size
    this.root?.scale.setScalar(scale);

    // Glow intensifies then fades
    const glow = Math.sin(t * Math.PI) * 3;
    for (let i = 0; i < this._emissives.length; i++) {
      this._emissives[i].emissiveIntensity = this._baseEmissive[i] + glow;
    }

    // Transition to full death after delay
    if (this._preDeathT >= PRE_DEATH_DURATION) {
      this._onDied();
    }
  }

  // --- Death sequence (ENEMIES_SPEC §7, JUICE_SPEC §9). ---
  _onDied() {
    if (this._deathT >= 0) return; // Already in death sequence
    this._preDeathT = -1; // Clear pre-death state
    const ctx = this._ctx;
    // Reset root position (we were shaking it in pre-death)
    this.root.position.set(0, 0, 0);
    this.root.rotation.x = 0;
    this.root.rotation.z = 0;

    // Spawn spore at ground level so it NEVER blocks FP camera
    _center.copy(this.position).setY(0.05);
    ctx.vfx.spore(_center, this.def.accent ?? 0xffffff);

    // Delay gold spawn so it doesn't clutter with particles
    setTimeout(() => {
      if (!this.removeMe) {
        ctx.loot.spawnGold(this.position, randInt(COMBAT.GOLD_MIN ?? 1, COMBAT.GOLD_MAX ?? 5));
      }
    }, 200); // Gold spawns 200ms after particles

    // Bosses get dramatic slow-mo; regular kills get a light impact freeze.
    if (this.role === 'boss') ctx.juice.slowMo();
    else ctx.juice.impactFreeze();
    ctx.onEnemyDied?.(this);
    this._deathT = 0;
    // Freeze authored clips so the manual squash-flop death owns the pose.
    this.mixer?.stopAllAction();
  }

  // Keyframed squash → stretch → bounce → pop, then retire (JUICE_SPEC §9).
  _updateDeath(dt) {
    this._deathT += dt;
    const t = this._deathT;
    const set = (x, y, z) => this.root?.scale.set(x, y, z);
    // White-hot emissive flash at the instant of detonation, fading as it collapses.
    const flash = t < 0.06 ? (1 - t / 0.06) * 6 : 0;
    for (let i = 0; i < this._emissives.length; i++) {
      this._emissives[i].emissiveIntensity = this._baseEmissive[i] * clamp(1 - t / 0.25, 0, 1) + flash;
    }
    // Chaotic tumble + a brief pop-up arc as the body is blown apart.
    if (this.root) {
      this.root.rotation.y += dt * 16;
      this.root.rotation.x += dt * 7;
      this.root.position.y = Math.sin(clamp(t / 0.32, 0, 1) * Math.PI) * 0.55;
    }
    if (t < 0.08) set(1 + (0.6) * (t / 0.08), 1 - 0.6 * (t / 0.08), 1 + 0.6 * (t / 0.08));
    else if (t < 0.18) { const k = (t - 0.08) / 0.10; set(1.6 - 1.1 * k, 0.4 + 1.4 * k, 1.6 - 1.1 * k); }
    else if (t < 0.25) { const k = (t - 0.18) / 0.07; set(0.5 + 0.85 * k, 1.8 - 1.1 * k, 0.5 + 0.85 * k); }
    else if (t < 0.32) { const k = (t - 0.25) / 0.07; set(1.35 + 0.15 * k, 0.7 + 0.8 * k, 1.35 + 0.15 * k); }
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
  performAttack(ctx, target, toTarget, dist) {}
}
