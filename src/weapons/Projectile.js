import * as THREE from 'three';
import { ARENA } from '../config/Constants.js';

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

      if (!dead) {
        if (p.team === 'player') {
          for (const e of ctx.enemies) {
            if (e.dead) continue;
            const rr = p.radius + e.hitRadius;
            if (this._tmp.copy(e.position).setY(e.position.y + 0.6).distanceToSquared(p.pos) < rr * rr) {
              e.takeDamage(p.damage, p.element, ctx);
              ctx.vfx.hitSpark(p.pos, p.mat.color.getHex());
              dead = true;
              break;
            }
          }
        } else {
          const player = ctx.player;
          const rr = p.radius + 0.55;
          if (this._tmp.copy(player.position).setY(player.position.y + 0.8).distanceToSquared(p.pos) < rr * rr) {
            player.takeDamage(p.damage, ctx);
            ctx.vfx.hitSpark(p.pos, p.mat.color.getHex());
            dead = true;
          }
        }
      }

      if (dead) {
        p.active = false;
        p.mesh.visible = false;
        p.light.intensity = 0;
      } else {
        p.mesh.position.copy(p.pos);
      }
    }
  }
}
