import { Weapon } from './Weapon.js';
import { WEAPONS, WEAPON_ORDER } from '../config/Constants.js';

// Holds the player's full weapon roster and the active selection (WEAPONS_SPEC §5).
// All 9 are instantiated, but only those in the `unlocked` set (owned by the
// GameManager, persisted in the save) can be selected or cycled to — locked
// weapons are skipped by next/prev and rejected by select (ECONOMY_SHOP_SPEC §3).
export class WeaponManager {
  constructor(unlocked) {
    this.weapons = WEAPON_ORDER.map((k) => new Weapon(WEAPONS[k]));
    this.unlocked = unlocked; // Set<weaponId> shared with GameManager
    this.index = this._firstUnlocked();
  }

  get current() { return this.weapons[this.index]; }

  isUnlocked(i) { return this.unlocked.has(this.weapons[i].def.id); }

  _firstUnlocked() {
    for (let i = 0; i < this.weapons.length; i++) if (this.isUnlocked(i)) return i;
    return 0;
  }

  // Cycle to the next/prev *unlocked* weapon, wrapping. Returns the new weapon, or
  // null if nothing changed (only one unlocked).
  next() { return this._step(1); }
  prev() { return this._step(-1); }
  _step(dir) {
    const n = this.weapons.length;
    for (let k = 1; k <= n; k++) {
      const i = (this.index + dir * k + n * k) % n;
      if (this.isUnlocked(i)) return this.select(i);
    }
    return null;
  }

  select(i) {
    if (i < 0 || i >= this.weapons.length || i === this.index || !this.isUnlocked(i)) return null;
    this.index = i;
    return this.current; // non-null signals "weapon actually changed" to the caller
  }

  // Add magazine reserve ammo to a weapon by id (shop ammo packs).
  addReserve(id, amount) {
    const w = this.weapons.find((x) => x.def.id === id);
    w?.addReserve?.(amount);
  }
}
