import { DIRECTOR } from '../config/Constants.js';
import { clamp, lerp, invLerp, damp } from '../util/MathUtils.js';

// Adaptive difficulty Director (DIRECTOR tuning in Constants). Holds one smoothed
// `intensity` scalar centered on 1.0 (= current balance) and exposes it as bounded
// multipliers read by WaveManager (spawn size/pacing) and EnemyBase (aggression).
//
// Philosophy: subtle + assistive. Relief is fast (EASE_LAMBDA) and ramp-up is slow
// (RAMP_LAMBDA), so a struggling player gets noticeable breathing room while a
// dominating one is pressured only gently and within a narrow band.
//
// Signals are read straight off live game state each fixed step — no extra hooks:
//   • player HP fraction + frame-to-frame HP drops (damage taken)
//   • wave clear speed (noteWaveStart / noteWaveCleared, fired by WaveManager)
//   • whether the player is at comfortable HP with kill momentum (dominating)
export class Director {
  constructor() {
    this.intensity = 1.0;
    this._lastHp = null;        // player.hp last frame (detect damage drops)
    this._waveStartT = 0;       // elapsed time when the current wave began
    this._elapsed = 0;          // run clock (seconds, sim time)
    this._lastClearFast = false; // last wave was cleared quickly → bias up
    this._lastClearSlow = false; // last wave dragged → bias down
  }

  // Return to neutral balance (called when a fresh level starts). Kept in place so
  // ctx.director and the WaveManager reference stay valid.
  reset() {
    this.intensity = 1.0;
    this._lastHp = null;
    this._waveStartT = 0;
    this._elapsed = 0;
    this._lastClearFast = false;
    this._lastClearSlow = false;
  }

  // WaveManager hooks: time how long each wave takes to clear.
  noteWaveStart() { this._waveStartT = this._elapsed; }
  noteWaveCleared() {
    const took = this._elapsed - this._waveStartT;
    this._lastClearFast = took <= DIRECTOR.FAST_CLEAR_SEC;
    this._lastClearSlow = took >= DIRECTOR.SLOW_CLEAR_SEC;
  }

  update(dt, ctx) {
    this._elapsed += dt;
    const player = ctx.player;
    if (!player) return;

    const hpFrac = player.maxHp > 0 ? player.hp / player.maxHp : 1;

    // Detect damage taken since last frame → transient downward pull on target.
    let damageBias = 0;
    if (this._lastHp != null && player.hp < this._lastHp && !player.dead) {
      const lost = (this._lastHp - player.hp) / Math.max(1, player.maxHp);
      damageBias = -lost * DIRECTOR.DAMAGE_EASE * 60; // per-hit nudge (frame-rate scaled)
    }
    this._lastHp = player.hp;

    // Resolve a target intensity from the current situation.
    let target = 1.0;
    if (hpFrac <= DIRECTOR.NEAR_DEATH_HP) {
      target = DIRECTOR.INTENSITY_MIN;                       // near death → full relief
    } else if (hpFrac >= DIRECTOR.COMFORT_HP && this._lastClearFast) {
      target = DIRECTOR.INTENSITY_MAX;                       // healthy + fast clears → ramp
    } else {
      // Glide target with HP: low HP biases down, high HP biases slightly up.
      target = lerp(DIRECTOR.INTENSITY_MIN, DIRECTOR.INTENSITY_MAX,
        clamp(invLerp(DIRECTOR.NEAR_DEATH_HP, DIRECTOR.COMFORT_HP, hpFrac), 0, 1));
      if (this._lastClearSlow) target = Math.min(target, 1.0);
    }
    target = clamp(target + damageBias, DIRECTOR.INTENSITY_MIN, DIRECTOR.INTENSITY_MAX);

    // Asymmetric easing: drop fast (relief), rise slow (gentle ramp).
    const lambda = target < this.intensity ? DIRECTOR.EASE_LAMBDA : DIRECTOR.RAMP_LAMBDA;
    this.intensity = damp(this.intensity, target, lambda, dt);
  }

  // --- Bounded outputs read by other systems --------------------------------
  // Normalized [0..1] position of intensity within its band.
  get _t() {
    return clamp(invLerp(DIRECTOR.INTENSITY_MIN, DIRECTOR.INTENSITY_MAX, this.intensity), 0, 1);
  }
  get spawnCountMult() { return lerp(DIRECTOR.SPAWN_COUNT_MIN, DIRECTOR.SPAWN_COUNT_MAX, this._t); }
  get spawnDelayMult() { return lerp(DIRECTOR.SPAWN_DELAY_MAX, DIRECTOR.SPAWN_DELAY_MIN, this._t); }
  get aggression() { return lerp(DIRECTOR.AGGRO_MIN, DIRECTOR.AGGRO_MAX, this._t); }
}
