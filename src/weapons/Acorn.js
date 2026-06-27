import { Weapon } from './Weapon.js';
import { WEAPONS } from '../config/Constants.js';

// Acorn Gun (WEAPONS_SPEC §3.0) — default NATURE single-shot. Inherits the base
// fire/cooldown/recoil pipeline unchanged; exists as its own class so M4 weapons
// can each override _fire (spread, charge, beam) behind a common interface.
export class Acorn extends Weapon {
  constructor() {
    super(WEAPONS.ACORN);
  }
}
