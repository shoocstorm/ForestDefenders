import { ACHIEVEMENTS } from '../config/Constants.js';

// Achievement tracker (ECONOMY_SHOP_SPEC §4). The unlock state lives on the
// GameManager (`achievementsUnlocked`: id → timestamp) so it persists with the
// save; this class just evaluates thresholds against the GM's counters and fires
// `onUnlock(entry)` once per achievement (idempotent). The catalog is data in
// Constants so the gallery/menus can render it.
export class Achievements {
  constructor(onUnlock) {
    this.list = ACHIEVEMENTS;
    this.total = ACHIEVEMENTS.length;
    this.onUnlock = onUnlock;
  }

  isUnlocked(gm, id) { return !!gm.achievementsUnlocked[id]; }
  unlockedCount(gm) { return Object.keys(gm.achievementsUnlocked).length; }

  // Idempotent unlock — returns true only on the first time.
  unlock(gm, id) {
    if (gm.achievementsUnlocked[id]) return false;
    gm.achievementsUnlocked[id] = Date.now();
    const entry = this.list.find((a) => a.id === id);
    if (entry) this.onUnlock?.(entry);
    return true;
  }

  // Check every metric-based achievement against the GM's current counters. Cheap
  // (9 comparisons) so it's safe to call from any counter hook.
  evaluate(gm) {
    for (const a of this.list) {
      if (gm.achievementsUnlocked[a.id]) continue;
      if ((gm[a.metric] ?? 0) >= a.goal) this.unlock(gm, a.id);
    }
  }
}
