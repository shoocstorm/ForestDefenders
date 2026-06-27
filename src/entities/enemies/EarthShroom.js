import * as THREE from 'three';
import { EnemyBase } from '../EnemyBase.js';
import { buildMushroom } from './MushroomModel.js';
import { ENEMY_DEFS } from '../../config/Constants.js';

// Earth Shroom — Level 1 wave-3 boss (ENEMIES_SPEC §2/§3.3). Tanky, slow, with a
// telegraphed ground-slam: a wind-up cap-rear followed by an AoE thump that hits
// anything in range, shakes the camera, and spits a shockwave. (Full underground
// burrow is deferred — the slam reads as the boss beat for M3.) Boss death plays
// slow-mo via EnemyBase._onDied (role==='boss').
const _hit = new THREE.Vector3();

export class EarthShroom extends EnemyBase {
  constructor(scene, pos, level = 0) {
    super(scene, ENEMY_DEFS.EARTH_SHROOM, pos, level);
  }

  buildModel() {
    this.attachModel(buildMushroom('EARTH_SHROOM'));
  }

  performAttack(ctx, target, toTarget, dist) {
    if (dist > this.attackRange) return;
    // Slam: rear the cap, AoE damage in range, shake + shockwave.
    if (this.capPivot) this.capPivot.rotation.x = -0.7;
    target.takeDamage(this.attackDamage, ctx);
    ctx.cameraRig.addShake(0.7);
    ctx.juice.hitStop();
    _hit.copy(this.position).setY(0.1);
    ctx.vfx.spore(_hit, 0xe0a83a); // dust/debris burst stand-in
  }
}
