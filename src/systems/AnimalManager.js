import { Animal } from '../entities/Animal.js';
import { ANIMALS } from '../config/Constants.js';

// Owns the three Level 1 rescue animals: spawns them caged, updates them, exposes
// the list on ctx for enemy targeting, and handles the [E]/[F] free interaction
// (nearest caged animal within reach → free + buff). Tracks saved count for scoring.
export class AnimalManager {
  constructor(scene) {
    this.scene = scene;
    this.total = 3;
    this.animals = ['HEDGEHOG', 'BIRD', 'RABBIT'].map((k) => new Animal(scene, ANIMALS[k]));
    this.nearestCaged = null; // current [E] FREE prompt target
    this.rescued = 0;         // animals freed (removed from the list, so tallied here)
  }

  // Rescued animals are removed once they float away, so they're counted via the
  // tally; still-caged animals remain safe and count too.
  get savedCount() { return this.rescued + this.animals.filter((a) => a.state === 'CAGED').length; }
  get freedCount() { return this.rescued; }

  update(dt, ctx) {
    ctx.animals = this.animals;
    for (const a of this.animals) a.update(dt, ctx);
    for (let i = this.animals.length - 1; i >= 0; i--) {
      if (this.animals[i].removeMe) this.animals.splice(i, 1);
    }

    // Free interaction: nearest caged animal within reach, on E/F.
    this.nearestCaged = null;
    let bestD = 2.8 * 2.8;
    const p = ctx.player.position;
    for (const a of this.animals) {
      if (!a.canFree) continue;
      const d = a.position.distanceToSquared(p);
      if (d < bestD) { bestD = d; this.nearestCaged = a; }
    }
    if (this.nearestCaged && ctx.input &&
        (ctx.input.wasPressedSim('KeyE') || ctx.input.wasPressedSim('KeyF'))) {
      // Count it before freeing so the rescue hook (weapon unlocks) sees the
      // updated freedCount (e.g. "all animals rescued" → Fire Bullet).
      const animal = this.nearestCaged;
      this.rescued += 1;
      this.nearestCaged = null;
      animal.free(ctx);
    }
  }
}
