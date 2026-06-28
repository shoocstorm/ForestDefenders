import * as THREE from 'three';
import { EnemyBase } from '../EnemyBase.js';
import { buildMushroom } from './MushroomModel.js';
import { ENEMY_DEFS } from '../../config/Constants.js';

// Metal Shroom (ENEMIES_SPEC §2) — METAL tank. High HP, slow, resists PHYSICAL
// (0.5×). A heavy melee spike-shot: close-range slam that hits hard but slow.
const _hit = new THREE.Vector3();

export class MetalShroom extends EnemyBase {
  constructor(scene, pos, level = 0) {
    super(scene, ENEMY_DEFS.METAL_SHROOM, pos, level);
  }

  buildModel() {
    this.attachModel(buildMushroom('METAL_SHROOM'));
  }

  performAttack(ctx, target, toTarget, dist) {
    if (dist > this.attackRange) return;
    // Heavy slam: tanky wind-up, AoE spike damage + shake.
    if (this.capPivot) this.capPivot.rotation.x = -0.7;
    target.takeDamage(this.attackDamage, ctx);
    ctx.cameraRig.addShake(0.4);
    ctx.juice.hitStop();
    _hit.copy(this.position).setY(0.1);
    ctx.vfx.spore(_hit, 0xb0b8c0);
  }
}
