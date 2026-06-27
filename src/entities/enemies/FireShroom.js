import * as THREE from 'three';
import { EnemyBase } from '../EnemyBase.js';
import { buildMushroom } from './MushroomModel.js';
import { ENEMY_DEFS } from '../../config/Constants.js';

// Fire Shroom (ENEMIES_SPEC §2) — FIRE ranged. Holds at its preferred range and
// lobs a fireball projectile (enemy team) at the player on cooldown.
const _spawn = new THREE.Vector3();
const _aim = new THREE.Vector3();

export class FireShroom extends EnemyBase {
  constructor(scene, pos, level = 0) {
    super(scene, ENEMY_DEFS.FIRE_SHROOM, pos, level);
  }

  buildModel() {
    this.attachModel(buildMushroom('FIRE_SHROOM'));
  }

  performAttack(ctx, target, toTarget, dist) {
    _spawn.copy(this.position).setY(this.position.y + 1.0);
    _aim.copy(target.position).setY(target.position.y + 0.8).sub(_spawn).normalize();
    ctx.projectiles.spawn(_spawn, _aim, {
      team: 'enemy',
      speed: this.def.projectileSpeed,
      damage: this.attackDamage,
      element: 'FIRE',
      color: 0xff6a2a,
      radius: 0.22,
      lifetime: 4,
    });
    ctx.vfx.muzzleFlash(_spawn, 0xff7a30);
    if (this.capPivot) this.capPivot.rotation.x = -0.4;
  }
}
