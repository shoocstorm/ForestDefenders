// Shared health pool (COMBAT_SPEC §1). Deliberately "dumb": it only stores HP
// and subtracts already-final damage. The damage *pipeline* (damage mult +
// element matrix) lives in EnemyBase.takeDamage so HealthComponent can be reused
// by player/enemies/animals without baking in attacker-specific scaling.
export class HealthComponent {
  constructor(max, { onDeath, onChange } = {}) {
    this.max = max;
    this.current = max;
    this.onDeath = onDeath;
    this.onChange = onChange;
    this.dead = false;
  }

  get percent() { return this.max > 0 ? this.current / this.max : 0; }
  isAlive() { return this.current > 0; }

  // amount is final damage (post element/mult). Returns the actual HP removed.
  takeDamage(amount) {
    if (this.dead) return 0;
    const before = this.current;
    this.current = Math.max(0, this.current - amount);
    this.onChange?.(this.current, this.max);
    if (this.current <= 0) {
      this.dead = true;
      this.onDeath?.();
    }
    return before - this.current;
  }

  heal(amount) {
    if (this.dead) return;
    this.current = Math.min(this.max, this.current + amount);
    this.onChange?.(this.current, this.max);
  }
}
