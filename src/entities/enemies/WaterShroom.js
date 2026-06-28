import * as THREE from 'three';
import { EnemyBase } from '../EnemyBase.js';
import { buildMushroom } from './MushroomModel.js';
import { ENEMY_DEFS } from '../../config/Constants.js';

// Water Shroom (ENEMIES_SPEC §2) — WATER controller. Lobs a water-jet projectile
// that pushes the player/animals back on hit (knockback), disrupting positioning.
const _spawn = new THREE.Vector3();
const _aim = new THREE.Vector3();

export class WaterShroom extends EnemyBase {
  constructor(scene, pos, level = 0) {
    super(scene, ENEMY_DEFS.WATER_SHROOM, pos, level);
  }

  buildModel() {
    this.attachModel(buildMushroom('WATER_SHROOM'));
  }

  performAttack(ctx, target, toTarget, dist) {
    _spawn.copy(this.position).setY(this.position.y + 1.0);
    _aim.copy(target.position).setY(target.position.y + 0.8).sub(_spawn).normalize();
    ctx.projectiles.spawn(_spawn, _aim, {
      team: 'enemy',
      speed: this.def.projectileSpeed,
      damage: this.attackDamage,
      element: 'WATER',
      color: 0x4ac8e8,
      radius: 0.24,
      lifetime: 4,
      knockback: this.def.knockback,
    });
    ctx.vfx.muzzleFlash(_spawn, 0x4ac8e8);
    if (this.capPivot) this.capPivot.rotation.x = -0.4;
  }
}
