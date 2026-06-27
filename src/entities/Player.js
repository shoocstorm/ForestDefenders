import * as THREE from 'three';
import { PLAYER, CAMERA, ARENA, COMBAT } from '../config/Constants.js';
import { HeroModel } from './HeroModel.js';
import { Acorn } from '../weapons/Acorn.js';
import { clamp, dampAngle } from '../util/MathUtils.js';

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

    this.weapon = new Acorn();

    this.model = new HeroModel();
    scene.add(this.model.group);
    this.model.group.position.copy(this.position);

    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._wish = new THREE.Vector3();
    this._aim = new THREE.Vector3();
  }

  // Incoming enemy damage (i-framed). On reaching 0 HP the player respawns at the
  // start with full HP (a real defeat screen + run end arrives in M3).
  takeDamage(amount, ctx) {
    if (this._invuln > 0 || amount <= 0) return;
    this.hp = Math.max(0, this.hp - amount);
    this._invuln = COMBAT.PLAYER_IFRAMES;
    this.cameraRig.addShake(0.45);
    ctx?.hud?.flashDamage();
    if (this.hp <= 0) {
      this.hp = this.maxHp;
      this.position.copy(this._spawn);
      this.velocity.set(0, 0, 0);
      this._invuln = 1.5;
    }
  }

  update(dt, input, ctx) {
    const rig = this.cameraRig;
    if (this._invuln > 0) this._invuln -= dt;

    // --- Build camera-relative basis on the ground plane ---
    rig.getAimDirection(this._fwd);
    this._fwd.y = 0;
    if (this._fwd.lengthSq() < 1e-4) this._fwd.set(0, 0, -1);
    this._fwd.normalize();
    this._right.set(this._fwd.z, 0, -this._fwd.x); // right-hand perpendicular

    const axis = input.moveAxis();
    const running = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const speed = PLAYER.SPEED * (running ? PLAYER.RUN_MULT : 1);

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
      } else if (this.jumpsLeft > 0) {
        this.velocity.y = PLAYER.DOUBLE_JUMP_VELOCITY;
        this.jumpsLeft -= 1;
      }
    }

    // --- Gravity + integrate ---
    this.velocity.y -= PLAYER.GRAVITY * dt;
    this.position.addScaledVector(this.velocity, dt);

    // Ground plane at y=0 (M1 flat ground).
    if (this.position.y <= 0) {
      this.position.y = 0;
      this.velocity.y = 0;
      if (!this.grounded) this.jumpsLeft = this.hasDoubleJump ? 2 : 1;
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    // --- Arena bounds ---
    const halfX = ARENA.WIDTH / 2 - PLAYER.RADIUS;
    const halfZ = ARENA.LENGTH / 2 - PLAYER.RADIUS;
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

    // --- Animation ---
    const planarSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    this.speedScale = planarSpeed / PLAYER.SPEED;
    this._animate(dt, moving, running, planarSpeed);

    // --- Weapon firing (left mouse or Z; muzzle origin + camera aim ray) ---
    if (ctx) {
      const firing = input.mouseDown(0) || input.isDown('KeyZ');
      this.weapon.update(dt, firing, {
        origin: this.model.muzzleWorldPosition,
        dir: rig.getAimDirection(this._aim),
        projectiles: ctx.projectiles,
        vfx: ctx.vfx,
        cameraRig: rig,
      });
    }
  }

  _animate(dt, moving, running, planarSpeed) {
    const p = this.model.pivots;
    // Locomotion phase advances with speed; run is faster + bigger.
    const freq = moving ? (running ? 10 : 7) : 2.2;
    this.animTime += dt * freq;
    const t = this.animTime;

    const swing = moving ? (running ? 0.9 : 0.6) : 0.0;
    // Legs alternate fore/aft (bone-local X pitch).
    p.legL.rotation.x = Math.sin(t) * swing;
    p.legR.rotation.x = Math.sin(t + Math.PI) * swing;
    // Arms counter-swing (smaller; right arm braces gun so dampen it).
    p.armL.rotation.x = Math.sin(t + Math.PI) * swing * 0.7;
    p.armR.rotation.x = Math.sin(t) * swing * 0.35;

    // Body bob + slight forward lean when moving/running.
    const bob = moving ? Math.abs(Math.sin(t)) * (running ? 0.07 : 0.04) : Math.sin(t * 0.6) * 0.01;
    p.torso.position.y = 0.52 + bob;
    p.torso.rotation.x = moving ? (running ? 0.18 : 0.1) : 0.0;

    // Airborne: tuck legs forward (simple jump pose).
    if (!this.grounded) {
      p.legL.rotation.x = 0.5;
      p.legR.rotation.x = 0.5;
      p.torso.rotation.x = 0.15;
    }

    // Tail idle sway + lift when running.
    p.tail.rotation.x = -0.3 + Math.sin(t * 0.8) * 0.12 + (running ? 0.25 : 0);
    p.tail.rotation.z = Math.sin(t * 0.6) * 0.1;

    // Head subtle look toward aim pitch in TP/FP.
    p.head.rotation.x = clamp(-this.cameraRig.pitch * 0.3, -0.4, 0.4);
  }
}
