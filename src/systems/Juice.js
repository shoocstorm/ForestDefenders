import { JUICE } from '../config/Constants.js';

// Global time-scale controller (JUICE_SPEC §3–5). Drives hit-stop, slow-mo and
// per-kill impact freeze by dipping `timeScale`, which Game multiplies into the
// simulation delta. A single effect runs at a time (token guard): a new effect
// only takes over if it requests a *deeper* freeze than what's already settling.
export class Juice {
  constructor() {
    this.timeScale = 1;
    this.reduceMotion = false;
    this._hold = 0;        // seconds left at the frozen scale before ramping back
    this._restore = JUICE.IMPACT_RESTORE;
  }

  _begin(scale, hold, restore) {
    if (this.reduceMotion) return;
    // Collapse overlapping calls: ignore a shallower freeze while one is active.
    if (this.timeScale < 0.999 && scale > this.timeScale) return;
    this.timeScale = scale;
    this._hold = hold;
    this._restore = Math.max(0.001, restore);
  }

  impactFreeze(freeze = JUICE.IMPACT_FREEZE, restore = JUICE.IMPACT_RESTORE) {
    if (freeze > 0) this._begin(0.0001, freeze, restore);
  }
  hitStop(strength = JUICE.HIT_STOP, dur = JUICE.HIT_STOP_DUR) {
    this._begin(strength, dur, JUICE.HIT_STOP_DUR);
  }
  slowMo(scale = JUICE.SLOW_MO, dur = JUICE.SLOW_MO_DUR) {
    this._begin(scale, dur, 0.25);
  }

  // Advance with *real* (unscaled) dt so the freeze itself lasts a wall-clock duration.
  update(realDt) {
    if (this._hold > 0) {
      this._hold -= realDt;
    } else if (this.timeScale < 1) {
      this.timeScale = Math.min(1, this.timeScale + realDt / this._restore);
    }
  }
}
