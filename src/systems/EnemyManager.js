import { SpatialGrid } from '../util/SpatialGrid.js';
import { COMBAT } from '../config/Constants.js';

// Owns the live enemy list: spawning, per-frame updates, and reaping retired
// enemies. Exposes the list on ctx so each enemy can read its neighbours for
// boids separation. The 3-wave spawner (LEVELS_SPEC) is layered on top in M3.
export class EnemyManager {
  constructor(scene) {
    this.scene = scene;
    this.enemies = [];
    // Cell size tuned for the hottest query (boids separation radius, run every
    // enemy every frame); the wider tactic-neighbor scan just walks more cells.
    // Rebuilt from scratch each frame in update() — see SpatialGrid.js.
    this.grid = new SpatialGrid(COMBAT.SEPARATION_RADIUS * 2);
    // Recomputed each frame in update() alongside the grid build (a pass over
    // `enemies` we already have to do), so the getter below is O(1) instead of
    // re-scanning the full list on every read (HUD reads it every frame).
    this._aliveCount = 0;
  }

  spawn(EnemyClass, pos, level = 0) {
    const e = new EnemyClass(this.scene, pos, level);
    this.enemies.push(e);
    return e;
  }

  get aliveCount() { return this._aliveCount; }

  update(dt, ctx) {
    ctx.enemies = this.enemies; // expose for separation / projectile hit-tests
    this.grid.clear();
    this._aliveCount = 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      this.grid.insert(e, e.position.x, e.position.z);
      this._aliveCount++;
    }
    ctx.enemyGrid = this.grid; // broad-phase neighbor queries (EnemyBase, Projectile)
    for (const e of this.enemies) e.update(dt, ctx);
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].removeMe) this.enemies.splice(i, 1);
    }
  }
}
