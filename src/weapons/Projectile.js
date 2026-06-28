import * as THREE from 'three';
import { ARENA, BLOOM_LAYER } from '../config/Constants.js';

// Team-aware projectile pool. Player-team shots test against enemies; enemy-team
// shots (e.g. Fire Shroom fireballs) test against the player. Meshes are pooled
// and reused — spawning never allocates geometry after warm-up.
//
// Spawn opts: { team:'player'|'enemy', speed, damage, element, color, radius,
//               lifetime, gravity }.
export class ProjectilePool {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this._geo = new THREE.SphereGeometry(1, 10, 8);
    this._up = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
  }

  _acquire() {
    for (const p of this.items) if (!p.active) return p;
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const mesh = new THREE.Mesh(this._geo, mat);
    mesh.castShadow = false;
    mesh.layers.enable(BLOOM_LAYER); // projectiles glow in the post pipeline
    const light = new THREE.PointLight(0xffffff, 0, 6, 2);
    mesh.add(light);
    const p = {
      active: false, mesh, light, mat,
      pos: new THREE.Vector3(), vel: new THREE.Vector3(),
      damage: 0, element: 'PHYSICAL', team: 'player',
      radius: 0.16, life: 0, gravity: 0,
    };
    this.scene.add(mesh);
    this.items.push(p);
    return p;
  }

  spawn(origin, dir, opts = {}) {
    const p = this._acquire();
    p.active = true;
    p.team = opts.team ?? 'player';
    p.damage = opts.damage ?? 10;
    p.element = opts.element ?? 'PHYSICAL';
    p.radius = opts.radius ?? 0.16;
    p.life = opts.lifetime ?? 3;
    p.gravity = opts.gravity ?? 0;
    // AOE / EMP payloads (explosive + ring weapons). 0 → plain single-target shot.
    p.explodeRadius = opts.explodeRadius ?? 0;
    p.knockback = opts.knockback ?? 0;
    p.empRadius = opts.empRadius ?? 0;
    p.empDuration = opts.empDuration ?? 0;
    p.pos.copy(origin);
    p.vel.copy(dir).normalize().multiplyScalar(opts.speed ?? 20);
    const color = opts.color ?? 0xffffff;
    p.mat.color.setHex(color);
    p.light.color.setHex(color);
    p.light.intensity = 5;
    p.mesh.position.copy(origin);
    p.mesh.scale.setScalar(p.radius);
    p.mesh.visible = true;
    return p;
  }

  update(dt, ctx) {
    const halfX = ARENA.WIDTH / 2, halfZ = ARENA.LENGTH / 2;
    for (const p of this.items) {
      if (!p.active) continue;
      if (p.gravity) p.vel.y -= p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      p.life -= dt;

      let dead = p.life <= 0 || p.pos.y <= 0.05 ||
        Math.abs(p.pos.x) > halfX || Math.abs(p.pos.z) > halfZ;
      const aoe = p.explodeRadius > 0 || p.empRadius > 0;

      if (!dead) {
        if (p.team === 'player') {
          for (const e of ctx.enemies) {
            if (e.dead) continue;
            const rr = p.radius + e.hitRadius;
            if (this._tmp.copy(e.position).setY(e.position.y + 0.6).distanceToSquared(p.pos) < rr * rr) {
              if (!aoe) { // AOE shots detonate below instead of single-target hit
                e.takeDamage(p.damage, p.element, ctx);
                ctx.vfx.hitSpark(p.pos, p.mat.color.getHex());
                ctx.gameManager?.registerAccurateShot?.(); // Sharpshooter achievement
              }
              dead = true;
              break;
            }
          }
        } else {
          // Enemy projectile: test the player, then any attackable animal.
          const player = ctx.player;
          const rr = p.radius + 0.55;
          if (this._tmp.copy(player.position).setY(player.position.y + 0.8).distanceToSquared(p.pos) < rr * rr) {
            player.takeDamage(p.damage, ctx);
            ctx.vfx.hitSpark(p.pos, p.mat.color.getHex());
            dead = true;
          } else if (ctx.animals) {
            for (const a of ctx.animals) {
              if (!a.isAttackable()) continue;
              const ar = p.radius + a.hitRadius;
              if (this._tmp.copy(a.position).setY(a.position.y + 0.4).distanceToSquared(p.pos) < ar * ar) {
                a.takeDamage(p.damage, ctx);
                ctx.vfx.hitSpark(p.pos, p.mat.color.getHex());
                dead = true;
                break;
              }
            }
          }
        }
      }

      if (dead) {
        if (aoe && p.team === 'player') this._detonate(p, ctx);
        p.active = false;
        p.mesh.visible = false;
        p.light.intensity = 0;
      } else {
        p.mesh.position.copy(p.pos);
      }
    }
  }

  // AOE detonation for explosive (Boomstick / Fire Bullet) and ring (Toroid) shots:
  // radial damage + knockback to every enemy in range, plus EMP stun for the ring.
  // Heavy juice — flash, shockwaves, camera shake + hit-stop (JUICE_SPEC §3,6).
  _detonate(p, ctx) {
    const radius = Math.max(p.explodeRadius, p.empRadius);
    const color = p.mat.color.getHex();
    let kills = 0; // 3+ kills in one blast → multi-kill (Shotgun unlock / Combo King)
    for (const e of ctx.enemies) {
      if (e.dead) continue;
      const d = this._tmp.copy(e.position).setY(e.position.y + 0.6).distanceTo(p.pos);
      if (d > radius + e.hitRadius) continue;
      const falloff = 1 - Math.min(1, d / (radius + e.hitRadius));
      e.takeDamage(p.damage * (0.4 + 0.6 * falloff), p.element, ctx);
      ctx.gameManager?.registerAccurateShot?.();
      if (p.knockback) {
        this._up.copy(e.position).sub(p.pos).setY(0).normalize();
        e.applyKnockback?.(this._up, p.knockback * (0.5 + falloff));
      }
      if (p.empDuration) e.stun?.(p.empDuration);
      if (e.dead) kills++; // takeDamage resolves death synchronously
    }
    if (kills >= 3) ctx.onMultiKill?.(kills);
    ctx.vfx.explosion?.(p.pos, color, radius);
    ctx.cameraRig?.addShake?.(0.5);
    ctx.juice?.hitStop?.();
  }
}
