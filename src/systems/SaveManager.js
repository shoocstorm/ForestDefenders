// Persistent meta-progression store (ECONOMY_SHOP_SPEC §6). Backed by
// localStorage under a single JSON blob; the browser is our `forestdefender_save.json`.
// GameManager owns the schema (toSave/loadSave); this just reads/writes/clears it.
const KEY = 'forestdefender_save';
const VERSION = 1;

export class SaveManager {
  constructor() {
    this._storage = this._probe();
  }

  // Some embeddings (private mode, headless) throw on localStorage access — fall
  // back to an in-memory shim so the game still runs (save just won't persist).
  _probe() {
    try {
      const t = '__fd_probe__';
      window.localStorage.setItem(t, '1');
      window.localStorage.removeItem(t);
      return window.localStorage;
    } catch {
      const mem = new Map();
      return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
    }
  }

  has() { return this._storage.getItem(KEY) != null; }

  load() {
    try {
      const raw = this._storage.getItem(KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return data && data.version === VERSION ? data : null;
    } catch {
      return null;
    }
  }

  save(data) {
    try {
      this._storage.setItem(KEY, JSON.stringify({ version: VERSION, ...data }));
      return true;
    } catch {
      return false;
    }
  }

  delete() { this._storage.removeItem(KEY); }
}
