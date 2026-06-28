import * as THREE from 'three';

// Floating combat text (COMBAT_SPEC §3.5 / HUD_SPEC §5). DOM-based: each hit
// shows a label anchored to a world point that rises and fades over ~0.85s, with
// the world point re-projected to screen space every frame so it tracks the
// camera. Colours: white normal, green WEAK!, yellow EFFECTIVE, red RESIST.
//
// Perf: under rapid fire (Machine Gun, ~12.5 hits/s, doubled when an element
// label spawns) naive DOM thrashed the main thread two ways — creating/removing
// a node per hit forced style recalcs, and positioning via left/top invalidated
// document layout for every live node every frame. Both showed up as firing
// stutter, worst in L2/L3 where elemental hits add the second label node. Now:
//   • a fixed pool of divs is reused (no create/remove churn),
//   • positioning uses transform: translate3d (compositor-only, no layout),
//   • the live count is capped (oldest recycled) so a bullet-hose can't unbound it.
const MAX_NUMBERS = 28;

export class DamageNumbers {
  constructor(camera) {
    this.camera = camera;
    this.items = [];     // live numbers (subset of the pool)
    this.pool = [];       // all divs, reused
    this.root = document.createElement('div');
    this.root.style.cssText =
      'position:fixed;inset:0;z-index:25;pointer-events:none;overflow:hidden;' +
      'font-family:"Trebuchet MS",system-ui,sans-serif;font-weight:800;';
    document.body.appendChild(this.root);
    this._v = new THREE.Vector3();
  }

  _acquire() {
    for (const it of this.pool) if (!it.active) return it;
    if (this.pool.length >= MAX_NUMBERS) {
      // Recycle the oldest live one rather than grow without bound. Mark it free
      // so spawn() re-registers it in `items`.
      const oldest = this.items.shift();
      oldest.active = false;
      return oldest;
    }
    const el = document.createElement('div');
    el.style.cssText =
      'position:absolute;top:0;left:0;white-space:nowrap;will-change:transform,opacity;' +
      'display:none;';
    this.root.appendChild(el);
    const it = { el, pos: new THREE.Vector3(), life: 0, maxLife: 0.85, drift: 0, active: false };
    this.pool.push(it);
    return it;
  }

  spawn(worldPos, text, color = '#ffffff', big = false) {
    const it = this._acquire();
    const el = it.el;
    el.textContent = text;
    el.style.color = color;
    el.style.fontSize = (big ? 22 : 16) + 'px';
    el.style.textShadow = `0 2px 3px #000c,0 0 6px ${color}66`;
    el.style.display = '';
    it.pos.copy(worldPos);
    it.life = 0.85;
    it.maxLife = 0.85;
    it.drift = (Math.random() - 0.5) * 0.6;
    if (!it.active) { it.active = true; this.items.push(it); }
  }

  update(dt) {
    const w = window.innerWidth, h = window.innerHeight;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      if (it.life <= 0) {
        it.el.style.display = 'none';
        it.active = false;
        this.items.splice(i, 1);
        continue;
      }
      it.pos.y += 1.4 * dt;
      it.pos.x += it.drift * dt;
      this._v.copy(it.pos).project(this.camera);
      if (this._v.z > 1) { it.el.style.display = 'none'; continue; }
      it.el.style.display = '';
      const x = (this._v.x * 0.5 + 0.5) * w;
      const y = (-this._v.y * 0.5 + 0.5) * h;
      // translate3d keeps this on the compositor — no per-frame document layout.
      it.el.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%)`;
      const t = it.life / it.maxLife;
      it.el.style.opacity = Math.min(1, t * 2);
    }
  }
}
