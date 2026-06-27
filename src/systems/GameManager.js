// Run-wide game state singleton (GAME_SPEC). M2 scope: gold, kill count, the
// player damage multiplier (level + permanent upgrades feed this later), and the
// campaign level used for enemy stat scaling. Shop/upgrades/save extend this in M5.
export class GameManager {
  constructor() {
    this.gold = 0;
    this.kills = 0;
    this.level = 0;              // campaign level (0-based) → enemy scaling
    this.playerDamageMult = 1.0; // raised by level-ups / Sharpened Tips upgrade
  }

  addGold(n) { this.gold += n; }
  addKill() { this.kills += 1; }
}
