import * as THREE from 'three';
import { PLAYER, CAMERA, ARENA, COMBAT, AIM_ASSIST } from '../config/Constants.js';
import { HeroModel } from './HeroModel.js';
import { Acorn } from '../weapons/Acorn.js';
import { resolveCircleColliders } from '../util/Collision.js';
import { clamp, damp, dampAngle } from '../util/MathUtils.js';

// Player character controller: camera-relative movement, jump + double-jump,
// run, facing toward movement/aim, and a lightweight procedural locomotion
// animator that drives the HeroModel pivots (legs, arms, tail, body bob).
export class Player {
  constructor(scene, cameraRig) {
    this.cameraRig = cameraRig;
    this.position = new THREE.Vector3(0, 0, -ARENA.LENGTH / 2 + 6); // west end
    this.velocity = new THREE.Vector3();
    this.facing = 0;          // yaw of the model
    this.grounded = true;
    this.jumpsLeft = 2;
    this.hasDoubleJump = true; // unlocked by default in M1 for testing
    this.speedScale = 1;       // run blend for animation
    this.animTime = 0;
    this.oneShot = null;       // { name, t, dur } for jump/shot/etc later
    this.hp = PLAYER.MAX_HP;
    this.maxHp = PLAYER.MAX_HP;
    this._invuln = 0;          // i-frame timer after taking a hit
    this._spawn = this.position.clone();
    this.dead = false;

    this.weapon = new Acorn();

    this.model = new HeroModel();
    scene.add(this.model.group);
    this.model.group.position.copy(this.position);

    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._wish = new THREE.Vector3();
    this._aim = new THREE.Vector3();
    this._fireDir = new THREE.Vector3();
    this._aimTarget = new THREE.Vector3();
    this._toEnemy = new THREE.Vector3();

    // World-space point the reticle marks (locked enemy torso, else a point down
    // the aim ray). The HUD projects this so the crosshair sits on the real aim,
    // not pinned to screen-center (which overlaps the hero in third-person).
    this.aimPoint = new THREE.Vector3();
    this.hasLock = false;
  }

  // Find the alive enemy nearest the crosshair: smallest angle to `dir` as seen
  // from `origin`, within the assist cone + range. Stores cos(angle) in _lockAlign
  // (for pull strength). Returns the enemy or null.
  _acquireTarget(origin, dir, ctx) {
    this._lockAlign = -1;
    if (!AIM_ASSIST.ENABLED || !ctx?.enemies) return null;

    const coneCos = Math.cos((AIM_ASSIST.CONE_DEG * Math.PI) / 180);
    const rangeSq = AIM_ASSIST.RANGE * AIM_ASSIST.RANGE;
    let best = null, bestAlign = coneCos;

    for (const e of ctx.enemies) {
      if (e.dead) continue;
      this._aimTarget.copy(e.position).setY(e.position.y + AIM_ASSIST.TARGET_Y);
      this._toEnemy.subVectors(this._aimTarget, origin);
      const distSq = this._toEnemy.lengthSq();
      if (distSq > rangeSq || distSq < 1e-4) continue;
      this._toEnemy.multiplyScalar(1 / Math.sqrt(distSq));
      const align = this._toEnemy.dot(dir); // cos of angle to the crosshair
      if (align > bestAlign) { bestAlign = align; best = e; }
    }
    if (best) this._lockAlign = bestAlign;
    return best;
  }

  // Soft lock-on: rotate the view so the crosshair settles onto the enemy nearest
  // screen-center. Pull strengthens as it nears centre (sticky) and releases when
  // you look away. Drives rig.yaw/pitch directly (mouse-look still composes).
  _focusCrosshair(dt, ctx, rig) {
    if (!AIM_ASSIST.ENABLED || rig.mode === CAMERA.TOP) return;
    const cam = rig.camera.position;
    const camDir = rig.getAimDirection(this._aim);
    const target = this._acquireTarget(cam, camDir, ctx);
    if (!target) return;

    // Desired look direction: from the camera to the target's torso.
    this._aimTarget.copy(target.position).setY(target.position.y + AIM_ASSIST.TARGET_Y);
    const d = this._fireDir.subVectors(this._aimTarget, cam).normalize();
    const desiredYaw = Math.atan2(-d.x, -d.z);
    const desiredPitch = Math.asin(clamp(d.y, -1, 1));

    const coneCos = Math.cos((AIM_ASSIST.CONE_DEG * Math.PI) / 180);
    const t = clamp((this._lockAlign - coneCos) / (1 - coneCos), 0, 1);
    const lambda = AIM_ASSIST.PULL_MIN + (AIM_ASSIST.PULL_MAX - AIM_ASSIST.PULL_MIN) * t;
    rig.yaw = dampAngle(rig.yaw, desiredYaw, lambda, dt);
    rig.pitch = clamp(damp(rig.pitch, desiredPitch, lambda, dt), CAMERA.PITCH_MIN, CAMERA.PITCH_MAX);
  }


  // Incoming enemy damage (i-framed). Shield (Hedgehog buff) soaks first; at 0 HP
  // the player dies → defeat screen via ctx.onPlayerDeath (COMBAT_SPEC §4).
  takeDamage(amount, ctx) {
    if (this._invuln > 0 || amount <= 0 || this.dead) return;
    const through = ctx?.gameManager ? ctx.gameManager.absorbWithShield(amount) : amount;
    this._invuln = COMBAT.PLAYER_IFRAMES;
    this.cameraRig.addShake(0.45);
    ctx?.hud?.flashDamage();
    if (through <= 0) return; // fully shielded
    this.hp = Math.max(0, this.hp - through);
    if (this.hp <= 0) {
      this.dead = true;
      ctx?.onPlayerDeath?.();
    }
  }

  // Restore HP (clamped to max), e.g. as an animal-rescue reward.
  heal(amount) {
    if (this.dead || amount <= 0) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  update(dt, input, ctx) {
    const rig = this.cameraRig;
    if (this._invuln > 0) this._invuln -= dt;

    // --- Aim assist: pull the crosshair onto the targeted enemy (before basis +
    // firing so movement and the shot use the focused view). ---
    this._focusCrosshair(dt, ctx, rig);

    // --- Build camera-relative basis on the ground plane ---
    rig.getAimDirection(this._fwd);
    this._fwd.y = 0;
    if (this._fwd.lengthSq() < 1e-4) this._fwd.set(0, 0, -1);
    this._fwd.normalize();
    this._right.set(-this._fwd.z, 0, this._fwd.x); // screen-right for a -Z forward

    const axis = input.moveAxis();
    const running = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const speedMult = ctx?.gameManager?.speedMult ?? 1; // Rabbit speed buff
    const speed = PLAYER.SPEED * (running ? PLAYER.RUN_MULT : 1) * speedMult;

    this._wish.set(0, 0, 0)
      .addScaledVector(this._fwd, axis.y)
      .addScaledVector(this._right, axis.x);
    const moving = this._wish.lengthSq() > 1e-4;
    if (moving) this._wish.normalize();

    // Horizontal velocity (snappy, arcade feel — instant accel).
    this.velocity.x = this._wish.x * speed;
    this.velocity.z = this._wish.z * speed;

    // --- Jump / double-jump ---
    if (input.wasPressed('Space')) {
      if (this.grounded) {
        this.velocity.y = PLAYER.JUMP_VELOCITY;
        this.grounded = false;
        this.jumpsLeft = this.hasDoubleJump ? 1 : 0;
        this.model.playJump?.();
      } else if (this.jumpsLeft > 0) {
        this.velocity.y = PLAYER.DOUBLE_JUMP_VELOCITY;
        this.jumpsLeft -= 1;
        this.model.playJump?.();
      }
    }

    // --- Gravity + integrate ---
    this.velocity.y -= PLAYER.GRAVITY * dt;
    this.position.addScaledVector(this.velocity, dt);

    // --- Horizontal collision: tree trunks + solid platform sides ---
    const r = PLAYER.RADIUS;
    if (ctx?.colliders) resolveCircleColliders(this.position, r, ctx.colliders);
    const standables = ctx?.standables;
    if (standables) this._resolvePlatformSides(standables, r);

    // --- Vertical: stand on the highest reachable surface (auto-step), else ground ---
    let floorY = 0;
    if (standables) {
      for (const s of standables) {
        if (this.position.x <= s.minX || this.position.x >= s.maxX) continue;
        if (this.position.z <= s.minZ || this.position.z >= s.maxZ) continue;
        // Reachable if we're above it, or close enough below to step up onto it.
        if (s.top > floorY && this.position.y >= s.top - 0.7) floorY = s.top;
      }
    }
    if (this.position.y <= floorY) {
      this.position.y = floorY;
      this.velocity.y = 0;
      if (!this.grounded) this.jumpsLeft = this.hasDoubleJump ? 2 : 1;
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    // --- Arena bounds ---
    const halfX = ARENA.WIDTH / 2 - r;
    const halfZ = ARENA.LENGTH / 2 - r;
    this.position.x = clamp(this.position.x, -halfX, halfX);
    this.position.z = clamp(this.position.z, -halfZ, halfZ);

    // --- Facing: toward movement (or camera forward when idle in non-FP) ---
    let desiredFacing = this.facing;
    if (moving) desiredFacing = Math.atan2(this._wish.x, this._wish.z);
    else if (rig.mode !== CAMERA.TOP) desiredFacing = Math.atan2(this._fwd.x, this._fwd.z);
    this.facing = dampAngle(this.facing, desiredFacing, PLAYER.ROTATION_SPEED, dt);

    // --- Apply transform to model ---
    this.model.group.position.copy(this.position);
    this.model.group.rotation.y = this.facing;
    // First-person: hide the whole hero model so the camera (at eye height inside
    // the head) never sees the inside of its mesh. Firing feedback still comes
    // from the muzzle flash + projectile + camera recoil.
    this.model.setFirstPerson?.(rig.mode === CAMERA.FP);

    // --- Animation: authored clips via the model's AnimationMixer. ---
    const planarSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    this.speedScale = planarSpeed / PLAYER.SPEED;
    this.model.setLocomotion?.({ moving, running, grounded: this.grounded });
    this.model.update?.(dt);

    // --- Weapon firing (left mouse or Z; muzzle origin + camera aim ray) ---
    if (ctx) {
      const firing = input.mouseDown(0) || input.isDown('KeyZ');
      const origin = this.model.muzzleWorldPosition;
      const camDir = rig.getAimDirection(this._aim);

      // Resolve the aim point once (locked enemy torso, else down the camera ray)
      // and reuse it for both the reticle and the shot direction.
      const target = this._acquireTarget(origin, camDir, ctx);
      this.hasLock = !!target;
      if (target) this.aimPoint.copy(target.position).setY(target.position.y + AIM_ASSIST.TARGET_Y);
      else this.aimPoint.copy(origin).addScaledVector(camDir, AIM_ASSIST.RETICLE_DIST);
      const dir = this._fireDir.copy(this.aimPoint).sub(origin).normalize();

      this.weapon.update(dt, firing, {
        origin,
        dir,
        projectiles: ctx.projectiles,
        vfx: ctx.vfx,
        cameraRig: rig,
      });
      if (this.weapon.justFired) this.model.playShot?.();
    }
  }

  // Push the player out of the sides of solid standables (the platform block) when
  // their body is below the top surface — so they can't walk through it.
  _resolvePlatformSides(standables, r) {
    for (const s of standables) {
      if (!s.solid || this.position.y >= s.top - 0.1) continue;
      if (this.position.x <= s.minX - r || this.position.x >= s.maxX + r) continue;
      if (this.position.z <= s.minZ - r || this.position.z >= s.maxZ + r) continue;
      const dxL = this.position.x - (s.minX - r);
      const dxR = (s.maxX + r) - this.position.x;
      const dzL = this.position.z - (s.minZ - r);
      const dzR = (s.maxZ + r) - this.position.z;
      const m = Math.min(dxL, dxR, dzL, dzR);
      if (m === dxL) this.position.x = s.minX - r;
      else if (m === dxR) this.position.x = s.maxX + r;
      else if (m === dzL) this.position.z = s.minZ - r;
      else this.position.z = s.maxZ + r;
    }
  }
}
