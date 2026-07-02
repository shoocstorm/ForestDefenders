import * as THREE from 'three';

// In-world UI for animals (ANIMALS_SPEC §8, HUD_SPEC §5): a floating HP bar above
// each living animal and an `[E] FREE` prompt over the nearest caged one. DOM
// elements are projected to screen each frame (same technique as DamageNumbers).
const _v = new THREE.Vector3();

export class WorldLabels {
  constructor(camera) {
    this.camera = camera;
    this.map = new Map(); // animal -> {wrap, bar, name, prompt}
    this.root = document.createElement('div');
    this.root.style.cssText =
      'position:fixed;inset:0;z-index:24;pointer-events:none;overflow:hidden;' +
      'font-family:"Trebuchet MS",system-ui,sans-serif;';
    document.body.appendChild(this.root);
  }

  _make(name) {
    const wrap = document.createElement('div');
    // top/left pinned at 0; positioning is done via transform (translate3d)
    // each frame — compositor-only, no per-frame document layout (see
    // DamageNumbers.js, which fixed the same left/top thrash under rapid fire).
    wrap.style.cssText = 'position:absolute;top:0;left:0;text-align:center;will-change:transform;';
    wrap.innerHTML =
      `<div style="font-size:11px;font-weight:800;color:#fff;text-shadow:0 1px 2px #000c;letter-spacing:.5px;">${name}</div>` +
      '<div style="width:64px;height:7px;margin:2px auto 0;background:#0008;border:1px solid #ffffff33;border-radius:4px;overflow:hidden;">' +
      '<div class="b" style="height:100%;width:100%;background:#76d35a;transition:width .15s;"></div></div>' +
      '<div class="p" style="display:none;margin-top:4px;font-size:12px;font-weight:800;color:#ffe9a0;text-shadow:0 1px 3px #000;background:#0b1410cc;border:1px solid #ffe9a055;border-radius:10px;padding:2px 8px;">[E] FREE</div>';
    this.root.appendChild(wrap);
    return { wrap, bar: wrap.querySelector('.b'), prompt: wrap.querySelector('.p') };
  }

  update(animals, nearestCaged) {
    const w = window.innerWidth, h = window.innerHeight;
    const seen = new Set();
    for (const a of animals) {
      if (a.dead) continue;
      seen.add(a);
      let L = this.map.get(a);
      if (!L) { L = this._make(a.type); this.map.set(a, L); }

      _v.copy(a.position); _v.y += a.flying ? 0.6 : 1.05;
      _v.project(this.camera);
      if (_v.z > 1) { L.wrap.style.display = 'none'; continue; }
      L.wrap.style.display = '';
      const x = (_v.x * 0.5 + 0.5) * w;
      const y = (-_v.y * 0.5 + 0.5) * h;
      L.wrap.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-100%)`;

      const pct = Math.max(0, a.health.percent);
      L.bar.style.width = (pct * 100) + '%';
      L.bar.style.background = pct > 0.5 ? '#76d35a' : pct > 0.25 ? '#e8d35a' : '#ff6a5a';
      L.prompt.style.display = a === nearestCaged ? '' : 'none';
    }
    for (const [a, L] of this.map) {
      if (!seen.has(a)) { L.wrap.remove(); this.map.delete(a); }
    }
  }
}
