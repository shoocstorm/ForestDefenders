import * as THREE from 'three';

// Floating combat text (COMBAT_SPEC §3.5 / HUD_SPEC §5). DOM-based: each hit
// spawns a div anchored to a world point that rises and fades over ~0.8s, with
// the world point re-projected to screen space every frame so it tracks the
// camera. Colours: white normal, green WEAK!, yellow EFFECTIVE, red RESIST.
export class DamageNumbers {
  constructor(camera) {
    this.camera = camera;
    this.items = [];
    this.root = document.createElement('div');
    this.root.style.cssText =
      'position:fixed;inset:0;z-index:25;pointer-events:none;overflow:hidden;' +
      'font-family:"Trebuchet MS",system-ui,sans-serif;font-weight:800;';
    document.body.appendChild(this.root);
    this._v = new THREE.Vector3();
  }

  spawn(worldPos, text, color = '#ffffff', big = false) {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText =
      `position:absolute;transform:translate(-50%,-50%);color:${color};` +
      `font-size:${big ? 22 : 16}px;text-shadow:0 2px 3px #000c,0 0 6px ${color}66;` +
      'white-space:nowrap;will-change:transform,opacity;';
    this.root.appendChild(el);
    this.items.push({
      el,
      pos: worldPos.clone(),
      life: 0.85,
      maxLife: 0.85,
      drift: (Math.random() - 0.5) * 0.6,
    });
  }

  update(dt) {
    const w = window.innerWidth, h = window.innerHeight;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      if (it.life <= 0) {
        it.el.remove();
        this.items.splice(i, 1);
        continue;
      }
      it.pos.y += 1.4 * dt;
      it.pos.x += it.drift * dt;
      this._v.copy(it.pos).project(this.camera);
      if (this._v.z > 1) { it.el.style.display = 'none'; continue; }
      it.el.style.display = '';
      it.el.style.left = (this._v.x * 0.5 + 0.5) * w + 'px';
      it.el.style.top = (-this._v.y * 0.5 + 0.5) * h + 'px';
      const t = it.life / it.maxLife;
      it.el.style.opacity = Math.min(1, t * 2);
    }
  }
}
