import * as THREE from 'three';
import { Plant } from '../entities/Plant.js';
import { PLANTS, PLANT_PLACEMENT } from '../config/Constants.js';

const _v = new THREE.Vector3();

// Spawns + updates the level's interactive plants and routes their triggers
// (PLANTS_SPEC). Touch plants fire when the player walks into range; shoot plants
// fire when a player projectile passes through them; `both` accept either. Effects
// are dispatched to the Player / GameManager here so Plant stays a dumb prop.
export class PlantManager {
  constructor(scene) {
    this.scene = scene;
    this.plants = PLANT_PLACEMENT.map((p) => new Plant(scene, PLANTS[p.type], p.pos));
  }

  update(dt, ctx) {
    const player = ctx.player;
    for (const plant of this.plants) {
      plant.update(dt);
      if (plant.dormant) continue;

      // Touch trigger: player body overlaps the plant (XZ + a little vertical slack).
      if (plant.canTouch) {
        const dx = player.position.x - plant.position.x;
        const dz = player.position.z - plant.position.z;
        const dy = player.position.y - plant.position.y;
        const r = plant.hitRadius + 0.6;
        if (dx * dx + dz * dz < r * r && Math.abs(dy) < 2.2) { this._trigger(plant, ctx); continue; }
      }

      // Shoot trigger: any active player projectile inside the plant volume.
      if (plant.canShoot && ctx.projectiles) {
        _v.copy(plant.position).setY(plant.position.y + 0.6);
        const r = plant.hitRadius + 0.3;
        for (const p of ctx.projectiles.items) {
          if (!p.active || p.team !== 'player') continue;
          if (p.pos.distanceToSquared(_v) < r * r) {
            p.active = false; p.mesh.visible = false; p.light.intensity = 0;
            this._trigger(plant, ctx);
            break;
          }
        }
      }
    }
  }

  _trigger(plant, ctx) {
    const effect = plant.consume();
    const gm = ctx.gameManager, player = ctx.player;

    if (effect.doubleJump) player.unlockDoubleJump?.();
    if (effect.bounce) player.bounce?.(effect.bounce);
    if (effect.heal) player.heal?.(effect.heal);
    if (effect.tailGuard) gm.grantTimedBuff('TAIL_GUARD', effect.tailGuard);
    if (effect.hitShield) { gm.hitShield += effect.hitShield; gm.buffs.add('OAKSHIELD'); }
    if (effect.fireRounds) gm.fireRounds += effect.fireRounds;

    // Exciting power-up fanfare, flavoured by what the hero just gained.
    const kind = effect.heal ? 'heal'
      : (effect.hitShield || effect.tailGuard) ? 'shield'
      : 'buff';
    ctx.audio?.powerUp?.(kind);

    // Feedback: burst at the plant + a floating label in its glow colour.
    _v.copy(plant.position).setY(plant.position.y + 0.7);
    ctx.vfx?.spore?.(_v, plant.def.glow);
    ctx.vfx?.hitSpark?.(_v, plant.def.glow);
    const col = '#' + plant.def.glow.toString(16).padStart(6, '0');
    ctx.damageNumbers?.spawn?.(_v, plant.def.label, col, true);
    if (effect.heal) {
      _v.y += 0.3;
      ctx.damageNumbers?.spawn?.(_v, `+${effect.heal} HP`, '#76d35a');
    }
  }

  dispose() { for (const p of this.plants) p.dispose(); }
}
