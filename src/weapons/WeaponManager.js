import { Weapon } from './Weapon.js';
import { WEAPONS, WEAPON_ORDER } from '../config/Constants.js';

// Holds the player's weapon roster and the active selection (WEAPONS_SPEC §5).
// All 9 ship in M4 and are freely cyclable (Q / wheel); unlock gating lands in M5.
// The owning Player plays the HeroModel `switch` dip + retints the gun on change.
export class WeaponManager {
  constructor() {
    this.weapons = WEAPON_ORDER.map((k) => new Weapon(WEAPONS[k]));
    this.index = 0;
  }

  get current() { return this.weapons[this.index]; }

  next() { return this.select((this.index + 1) % this.weapons.length); }
  prev() { return this.select((this.index - 1 + this.weapons.length) % this.weapons.length); }

  select(i) {
    if (i < 0 || i >= this.weapons.length || i === this.index) return null;
    this.index = i;
    return this.current; // non-null signals "weapon actually changed" to the caller
  }
}
