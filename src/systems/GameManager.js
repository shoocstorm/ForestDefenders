import { BUFFS, RESCUE_RANKS } from '../config/Constants.js';

// Run-wide game state (GAME_SPEC). M3 adds rescue buffs (shield/speed/reveal),
// animal-loss tracking, and end-of-level rescue scoring on top of M2's gold/kills.
// Shop/upgrades/save extend this in M5.
export class GameManager {
  constructor() {
    this.reset();
  }

  reset() {
    this.gold = 0;
    this.kills = 0;
    this.level = 0;              // campaign level → enemy scaling
    this.playerDamageMult = 1.0;
    // Rescue buffs (COMBAT_SPEC §5)
    this.shield = 0;            // absorbed before HP
    this.speedMult = 1.0;
    this.reveal = false;
    this.buffs = new Set();     // active buff names for HUD icons
    this.animalsLost = 0;
  }

  addGold(n) { this.gold += n; }
  addKill() { this.kills += 1; }
  onAnimalLost() { this.animalsLost += 1; }

  grantBuff(buff) {
    if (buff === 'SHIELD') this.shield += BUFFS.SHIELD_POWER;
    else if (buff === 'SPEED') this.speedMult = BUFFS.SPEED_MULT;
    else if (buff === 'REVEAL') this.reveal = true;
    this.buffs.add(buff);
  }

  // Shield soaks damage first; returns the HP-damage that gets through.
  absorbWithShield(amount) {
    if (this.shield <= 0) return amount;
    const soaked = Math.min(this.shield, amount);
    this.shield -= soaked;
    if (this.shield <= 0) this.buffs.delete('SHIELD');
    return amount - soaked;
  }

  // Rescue rank from animals saved (ANIMALS_SPEC §6); awards bonus gold once.
  computeRank(saved) {
    const r = RESCUE_RANKS.find((x) => saved >= x.min) ?? RESCUE_RANKS[RESCUE_RANKS.length - 1];
    this.addGold(r.bonus);
    return { ...r, saved };
  }
}
