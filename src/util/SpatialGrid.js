// Uniform grid over the XZ plane for broad-phase proximity queries — boids
// separation, tactic neighbor counts (EnemyBase), and projectile hit-tests
// (Projectile.js) all used to independently scan the full enemy list per query
// (O(n^2) overall, worse as the adaptive Director scales wave sizes up). A single
// grid, rebuilt once per frame and shared via ctx.enemyGrid, turns each of those
// queries into "the handful of entities in nearby cells" instead — no need for a
// proper spatial tree at this game's scale (tens of entities, not thousands).
export class SpatialGrid {
  constructor(cellSize) {
    this.cellSize = cellSize;
    this.cells = new Map(); // packed cell key -> item[]
  }

  // Large odd multiplier keeps (cx, cz) pairs collision-free for any cz well
  // under 100000 — comfortably covers this game's arena at any sane cell size.
  _key(cx, cz) {
    return cx * 100000 + cz;
  }

  clear() {
    this.cells.clear();
  }

  insert(item, x, z) {
    const k = this._key(Math.floor(x / this.cellSize), Math.floor(z / this.cellSize));
    let bucket = this.cells.get(k);
    if (!bucket) { bucket = []; this.cells.set(k, bucket); }
    bucket.push(item);
  }

  // Fills `out` (cleared first, then reused across calls by the caller) with
  // every item in cells overlapping a square of the given radius around (x, z).
  // Broad-phase only — cells are square and the query is a circle, so callers
  // must still do an exact distance check on the results.
  queryNear(x, z, radius, out) {
    out.length = 0;
    const r = Math.ceil(radius / this.cellSize);
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const bucket = this.cells.get(this._key(cx + dx, cz + dz));
        if (bucket) for (const item of bucket) out.push(item);
      }
    }
    return out;
  }
}
