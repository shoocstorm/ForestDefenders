import { EnemyBase } from '../EnemyBase.js';
import { buildMushroom } from './MushroomModel.js';
import { ENEMY_DEFS } from '../../config/Constants.js';

// Wood Shroom (ENEMIES_SPEC §2) — WOOD melee. Closes distance and deals instant
// vine-slash damage on its attack cooldown when the player is inside range.
export class WoodShroom extends EnemyBase {
  constructor(scene, pos, level = 0) {
    super(scene, ENEMY_DEFS.WOOD_SHROOM, pos, level);
  }

  buildModel() {
    this.attachModel(buildMushroom('WOOD_SHROOM'));
  }

  performAttack(ctx, target, toTarget, dist) {
    if (dist <= this.attackRange) {
      target.takeDamage(this.attackDamage, ctx);
      // Quick cap lunge for readability.
      if (this.capPivot) this.capPivot.rotation.x = -0.5;
    }
  }
}
