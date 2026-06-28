import * as THREE from 'three';
import { EnemyBase } from '../EnemyBase.js';
import { buildMushroom } from './MushroomModel.js';
import { ENEMY_DEFS } from '../../config/Constants.js';

// Ice Shroom (ENEMIES_SPEC §2) — ICE ranged. Fires a sharp icicle projectile;
// FIRE-vulnerable (2.0×) and ICE-resistant (0.5×) per the element matrix.
const _spawn = new THREE.Vector3();
const _aim = new THREE.Vector3();

export class IceShroom extends EnemyBase {
  constructor(scene, pos, level = 0) {
    super(scene, ENEMY_DEFS.ICE_SHROOM, pos, level);
  }

  buildModel() {
    this.attachModel(buildMushroom('ICE_SHROOM'));
  }

  performAttack(ctx, target, toTarget, dist) {
    _spawn.copy(this.position).setY(this.position.y + 1.0);
    _aim.copy(target.position).setY(target.position.y + 0.8).sub(_spawn).normalize();
    ctx.projectiles.spawn(_spawn, _aim, {
      team: 'enemy',
      speed: this.def.projectileSpeed,
      damage: this.attackDamage,
      element: 'ICE',
      color: 0x9fd8ff,
      radius: 0.18,
      lifetime: 4,
    });
    ctx.vfx.muzzleFlash(_spawn, 0xbfe8ff);
    if (this.capPivot) this.capPivot.rotation.x = -0.4;
  }
}
