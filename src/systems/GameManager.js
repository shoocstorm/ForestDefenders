import {
  BUFFS, RESCUE_RANKS, ECONOMY, UPGRADES, UPGRADE_MAX_TIER, LEVEL_UP,
  DEFAULT_WEAPON_UNLOCKS, PLAYER,
} from '../config/Constants.js';

// Run-wide + meta game state (GAME_SPEC, ECONOMY_SHOP_SPEC). M5 splits state into
// two lifetimes:
//   • META — gold, player level, permanent upgrades, weapon unlocks, achievement
//     counters. Persists across levels and saves (reset only on a brand-new game).
//   • RUN  — shield, buffs, per-run speed/fire-round/hit-shield boosts, kills.
//     Wiped at the start of every level via resetRun().
// Derived stats (max HP, damage mult, move-speed mult) are recomputed from level +
// upgrades by applyDerived(); the shop/level-up just bump the inputs and re-derive.
export class GameManager {
  constructor() {
    this.resetMeta();
    this.resetRun();
  }

  // --- Brand-new game: wipe everything (no save / "delete save"). ---
  resetMeta() {
    this.gold = ECONOMY.STARTING_GOLD;
    this.playerLevel = 1;
    this.level = 0;                     // campaign level → enemy scaling + biome (L1=0, L2=1, L3=2)
    this.upgrades = { DAMAGE: 0, HP: 0, SPEED: 0 };
    this.unlockedWeapons = new Set(DEFAULT_WEAPON_UNLOCKS);
    this.clearedLevelsMask = 0;
    this.currentWeapon = 0;
    this.goldenKeys = 0;
    // Audio settings (AUDIO_SPEC §5).
    this.settings = { vol_master: 0.9, vol_sfx: 0.9, vol_music: 0.6, vol_ambient: 0.65 };
    // Achievement counters (ECONOMY_SHOP_SPEC §4.2).
    this.enemiesDefeatedTotal = 0;
    this.rescuedAnimalsTotal = 0;
    this.goldCollectedTotal = 0;
    this.goldSpentTotal = 0;
    this.bossesDefeated = 0;
    this.multiKills = 0;
    this.accurateShots = 0;
    this.achievementsUnlocked = {};     // id → unlock timestamp
    // Derived (recomputed by applyDerived).
    this.playerDamageMult = 1.0;
    this.maxHp = PLAYER.MAX_HP;
  }

  // --- New level: clear per-run boosts, keep meta-progression. ---
  resetRun() {
    this.kills = 0;
    this.shield = 0;                    // Hedgehog / Shield Charge point pool
    this.hitShield = 0;                 // Oakshield Moss: absorbs N whole hits
    this.runSpeedBonus = 0;             // Rabbit buff + Speed Boost steps
    this.fireRounds = 0;                // Flame Chili / Fire Rounds: fire-element shots left
    this.reveal = false;
    this.buffs = new Set();             // active buff names for HUD pills
    this.timedBuffs = {};               // name → seconds remaining (e.g. TAIL_GUARD)
    this.animalsLost = 0;
  }

  // === Derived stats (ECONOMY_SHOP_SPEC §2.1, §5) ==========================
  get speedMult() {
    return 1 + this.upgrades.SPEED * UPGRADES.SPEED.per + this.runSpeedBonus;
  }

  // Push max-HP + damage to the player. `keepRatio` preserves current HP fraction
  // when max changes mid-run (shop HP upgrade); level-up full-heals separately.
  applyDerived(player, { fullHeal = false } = {}) {
    this.playerDamageMult = 1
      + (this.playerLevel - 1) * LEVEL_UP.DAMAGE_PER_LEVEL
      + this.upgrades.DAMAGE * UPGRADES.DAMAGE.per;
    const newMax = PLAYER.MAX_HP
      + (this.playerLevel - 1) * LEVEL_UP.HP_PER_LEVEL
      + this.upgrades.HP * UPGRADES.HP.per;
    if (player) {
      const ratio = this.maxHp > 0 ? player.hp / this.maxHp : 1;
      player.maxHp = newMax;
      player.hp = fullHeal ? newMax : Math.min(newMax, Math.round(ratio * newMax) || newMax);
    }
    this.maxHp = newMax;
  }

  // === Gold (ECONOMY_SHOP_SPEC §1) =========================================
  addGold(n) {
    this.gold += n;
    if (n > 0) { this.goldCollectedTotal += n; this.achievements?.evaluate(this); }
  }
  spendGold(n) {
    if (this.gold < n) return false;
    this.gold -= n;
    this.goldSpentTotal += n;
    this.achievements?.evaluate(this);
    return true;
  }

  // === Shop transactions (ECONOMY_SHOP_SPEC §2) ============================
  upgradeTier(id) { return this.upgrades[id] ?? 0; }
  upgradePrice(id) {
    const u = UPGRADES[id], tier = this.upgradeTier(id);
    return tier >= UPGRADE_MAX_TIER ? null : u.prices[tier];
  }
  buyUpgrade(id, player) {
    const price = this.upgradePrice(id);
    if (price == null || !this.spendGold(price)) return false;
    this.upgrades[id] += 1;
    this.applyDerived(player);
    return true;
  }

  // Apply a consumable's effect (CONSUMABLES[].effect). `player`/`weapons` let
  // ammo/heal effects reach the right systems. Returns true if it did something.
  applyConsumable(effect, player, weapons) {
    if (effect.heal) player?.heal?.(effect.heal);
    if (effect.shield) this.shield += effect.shield;
    if (effect.speedStep) this.runSpeedBonus += effect.speedStep;
    if (effect.tailGuard) this.grantTimedBuff('TAIL_GUARD', effect.tailGuard);
    if (effect.fireRounds) this.fireRounds += effect.fireRounds;
    if (effect.hitShield) this.hitShield += effect.hitShield;
    if (effect.ammo && weapons) weapons.addReserve(effect.ammo.weapon, effect.ammo.amount);
    return true;
  }

  // === Run buffs ===========================================================
  addKill() { this.kills += 1; }
  onAnimalLost() { this.animalsLost += 1; }

  grantBuff(buff) {
    if (buff === 'SHIELD') this.shield += BUFFS.SHIELD_POWER;
    else if (buff === 'SPEED') this.runSpeedBonus += BUFFS.SPEED_MULT - 1;
    else if (buff === 'REVEAL') this.reveal = true;
    this.buffs.add(buff);
  }

  grantTimedBuff(name, seconds) {
    this.timedBuffs[name] = Math.max(this.timedBuffs[name] ?? 0, seconds);
    this.buffs.add(name);
  }

  updateTimers(dt) {
    for (const name in this.timedBuffs) {
      this.timedBuffs[name] -= dt;
      if (this.timedBuffs[name] <= 0) { delete this.timedBuffs[name]; this.buffs.delete(name); }
    }
  }

  // Shield soaks damage first; returns the HP-damage that gets through. Oakshield
  // (hit-shield) absorbs a whole hit before the point shield is touched.
  absorbWithShield(amount) {
    if (this.hitShield > 0) {
      this.hitShield -= 1;
      if (this.hitShield <= 0) this.buffs.delete('OAKSHIELD');
      return 0;
    }
    if (this.shield <= 0) return amount;
    const soaked = Math.min(this.shield, amount);
    this.shield -= soaked;
    if (this.shield <= 0) this.buffs.delete('SHIELD');
    return amount - soaked;
  }

  // === Achievement counter hooks (ECONOMY_SHOP_SPEC §4.2) ==================
  registerEnemyDefeated(enemy) {
    this.enemiesDefeatedTotal += 1;
    if (enemy?.role === 'boss') this.bossesDefeated += 1;
    this.achievements?.evaluate(this);
  }
  registerAnimalRescued() {
    this.rescuedAnimalsTotal += 1;
    this.achievements?.evaluate(this);
  }
  registerMultiKill() {
    this.multiKills += 1;
    this.achievements?.evaluate(this);
  }
  registerAccurateShot() {
    this.accurateShots += 1;
    this.achievements?.evaluate(this);
  }
  registerLevelCleared(n) { this.clearedLevelsMask |= (1 << n); }

  // === Weapon unlocks (ECONOMY_SHOP_SPEC §3) ==============================
  isWeaponUnlocked(id) { return this.unlockedWeapons.has(id); }
  unlockWeapon(id) {
    if (this.unlockedWeapons.has(id)) return false;
    this.unlockedWeapons.add(id);
    return true;
  }

  // === Level-up progression (ECONOMY_SHOP_SPEC §5) =========================
  // Earned when a level is cleared with all animals saved AND HP > 50%.
  tryLevelUp(player, { allRescued }) {
    if (!allRescued || player.hp <= this.maxHp * LEVEL_UP.HP_THRESHOLD) return false;
    this.playerLevel += 1;
    this.applyDerived(player, { fullHeal: true });
    return true;
  }

  // Rescue rank from animals saved (ANIMALS_SPEC §6); awards bonus gold once.
  computeRank(saved) {
    const r = RESCUE_RANKS.find((x) => saved >= x.min) ?? RESCUE_RANKS[RESCUE_RANKS.length - 1];
    this.addGold(r.bonus);
    return { ...r, saved };
  }

  // === Persistence (ECONOMY_SHOP_SPEC §6) =================================
  toSave() {
    return {
      gold: this.gold,
      player_level: this.playerLevel,
      unlocked_levels: this.clearedLevelsMask,
      current_weapon: this.currentWeapon,
      unlocked_weapons: [...this.unlockedWeapons],
      upg_damage_tier: this.upgrades.DAMAGE,
      upg_hp_tier: this.upgrades.HP,
      upg_speed_tier: this.upgrades.SPEED,
      achievements: this.achievementsUnlocked,
      enemies_defeated_total: this.enemiesDefeatedTotal,
      rescued_animals_total: this.rescuedAnimalsTotal,
      gold_collected_total: this.goldCollectedTotal,
      gold_spent_total: this.goldSpentTotal,
      bosses_defeated: this.bossesDefeated,
      multi_kills: this.multiKills,
      accurate_shots: this.accurateShots,
      cleared_levels_mask: this.clearedLevelsMask,
      golden_keys: this.goldenKeys,
      settings: this.settings,
    };
  }

  loadSave(d) {
    if (!d) return;
    this.gold = d.gold ?? this.gold;
    this.playerLevel = d.player_level ?? 1;
    this.clearedLevelsMask = d.cleared_levels_mask ?? d.unlocked_levels ?? 0;
    this.currentWeapon = d.current_weapon ?? 0;
    this.unlockedWeapons = new Set(d.unlocked_weapons?.length ? d.unlocked_weapons : DEFAULT_WEAPON_UNLOCKS);
    this.upgrades.DAMAGE = d.upg_damage_tier ?? 0;
    this.upgrades.HP = d.upg_hp_tier ?? 0;
    this.upgrades.SPEED = d.upg_speed_tier ?? 0;
    this.achievementsUnlocked = d.achievements ?? {};
    this.enemiesDefeatedTotal = d.enemies_defeated_total ?? 0;
    this.rescuedAnimalsTotal = d.rescued_animals_total ?? 0;
    this.goldCollectedTotal = d.gold_collected_total ?? 0;
    this.goldSpentTotal = d.gold_spent_total ?? 0;
    this.bossesDefeated = d.bosses_defeated ?? 0;
    this.multiKills = d.multi_kills ?? 0;
    this.accurateShots = d.accurate_shots ?? 0;
    this.goldenKeys = d.golden_keys ?? 0;
    if (d.settings) this.settings = { ...this.settings, ...d.settings };
  }
}
