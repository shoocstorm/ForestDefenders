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

// Push a circle (pos.x/pos.z, radius) out of the sides of any solid platform
// box ({minX, maxX, minZ, maxZ, top, solid}) whose body it's currently below —
// so ground-bound movers (player, enemies) can't walk through the platform
// instead of around it. Shared by Player (auto-stepping onto the deck) and
// EnemyBase (which never climbs, so this always just walls it off).
export function resolvePlatformSides(pos, radius, standables) {
  for (const s of standables) {
    // Margin must clear the gap between the top stair (which lands you just
    // below the deck's true surface) and this standable's top, or the side
    // push fires on the last step and walls the mover off instead of letting
    // vertical auto-step carry it up onto the deck.
    if (!s.solid || pos.y >= s.top - 0.3) continue;
    if (pos.x <= s.minX - radius || pos.x >= s.maxX + radius) continue;
    if (pos.z <= s.minZ - radius || pos.z >= s.maxZ + radius) continue;
    const dxL = pos.x - (s.minX - radius);
    const dxR = (s.maxX + radius) - pos.x;
    const dzL = pos.z - (s.minZ - radius);
    const dzR = (s.maxZ + radius) - pos.z;
    const m = Math.min(dxL, dxR, dzL, dzR);
    if (m === dxL) pos.x = s.minX - radius;
    else if (m === dxR) pos.x = s.maxX + radius;
    else if (m === dzL) pos.z = s.minZ - radius;
    else pos.z = s.maxZ + radius;
  }
}
