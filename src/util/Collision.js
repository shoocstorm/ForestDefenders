// Shared 2D (XZ-plane) collision helpers used by the player and enemies.

// Push a circle (pos.x/pos.z, radius) out of any overlapping cylinder collider
// ({type:'cylinder', x, z, r}). Mutates pos in place. Cheap O(n) sweep — fine
// for the handful of tree trunks per arena.
export function resolveCircleColliders(pos, radius, colliders) {
  for (const c of colliders) {
    if (c.type !== 'cylinder') continue;
    const dx = pos.x - c.x;
    const dz = pos.z - c.z;
    const rr = radius + c.r;
    const d2 = dx * dx + dz * dz;
    if (d2 < rr * rr && d2 > 1e-8) {
      const d = Math.sqrt(d2);
      const push = rr - d;
      pos.x += (dx / d) * push;
      pos.z += (dz / d) * push;
    }
  }
}
