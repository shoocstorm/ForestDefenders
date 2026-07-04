import * as THREE from 'three';
import { buildWeaponMesh } from './WeaponMeshes.js';
import { buildMushroom } from '../entities/enemies/MushroomModel.js';
import {
  WEAPONS, WEAPON_ORDER, WEAPON_UNLOCK_HINTS,
  ENEMY_DEFS, ENEMY_ORDER, ENEMY_FIRST_SEEN_HINTS,
  ATTACK_ELEMENTS, elementMultiplier,
} from '../config/Constants.js';

// Per-element accent colours for the badge — union of every weapon + enemy
// element (mirrors the smaller per-file copies in HUD.js/Backpack.js).
const ELEMENT_COLORS = {
  NATURE: '#b6e36a', ENERGY: '#49e8ff', PHYSICAL: '#ffd27a',
  FIRE: '#ff7a30', WOOD: '#8fe04a', EARTH: '#e0a83a',
  ICE: '#7ab3ff', WATER: '#4ea8ff', METAL: '#b0b8c0',
};
const ROLE_LABEL = { melee: '⚔ Melee', ranged: '🏹 Ranged', boss: '👑 Boss' };
const LOCKED_COLOR = 0x1a2230;

// Gallery (GALLERY_SPEC) — a 3D model viewer accessible via hotkey G, with two
// tabs: WEAPONS (all 9 weapons) and ENEMIES (all 6 mushroom types, using the
// exact same models the game spawns via buildMushroom()). Cycles items on a
// dark turntable with rim lighting; locked/undiscovered entries show as a dark
// silhouette with "???" and a hint. Uses a separate lightweight Three.js scene
// + renderer overlaid on the game canvas.
export class Gallery {
  constructor(weapons, gameManager) {
    this.weapons = weapons;         // WeaponManager's roster (for current index)
    this.gm = gameManager;
    this.isOpen = false;
    this.mode = 'weapons';          // 'weapons' | 'enemies'
    this.index = 0;
    this._turntable = null;
    this._curMesh = null;
    this._curMixer = null;
    this._curKind = null;
    this._curOwnsMaterials = false;

    this._buildDom();
    this._sceneBuilt = false;
  }

  _buildDom() {
    this.root = document.createElement('div');
    this.root.style.cssText =
      'position:fixed;inset:0;z-index:38;display:none;' +
      'font-family:"Rajdhani","Trebuchet MS",system-ui,sans-serif;color:#eaf7df;';
    this.root.innerHTML = `
      <style>
        @keyframes fd-grid-pan{to{background-position:0 44px,44px 0;}}
        #gal-bg{position:absolute;inset:0;background:radial-gradient(circle at 50% 38%,#102338,#02060c 84%);}
        #gal-bg::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:.5;
          background:
            linear-gradient(var(--fd-grid,#4fe3ff14) 1px,#0000 1px) 0 0/44px 44px,
            linear-gradient(90deg,var(--fd-grid,#4fe3ff14) 1px,#0000 1px) 0 0/44px 44px;
          -webkit-mask-image:radial-gradient(circle at 50% 42%,#000 0,#0000 72%);
          mask-image:radial-gradient(circle at 50% 42%,#000 0,#0000 72%);
          animation:fd-grid-pan 9s linear infinite;}
        #gal-canvas{position:absolute;inset:0;}
        #gal-panel{position:absolute;right:0;top:0;bottom:0;width:min(340px,42vw);
          padding:calc(28px + env(safe-area-inset-top)) calc(24px + env(safe-area-inset-right))
            calc(28px + env(safe-area-inset-bottom)) 24px;
          background:var(--fd-panel,linear-gradient(158deg,#0f1d2cf6,#060d17fb));
          border-left:1px solid var(--fd-edge,#4fe3ff3a);
          display:flex;flex-direction:column;gap:12px;backdrop-filter:blur(8px);box-sizing:border-box;
          box-shadow:inset 0 0 44px #03111c90,inset 0 1px 0 #8fe6ff33;}
        #gal-panel::after{content:"";position:absolute;top:0;left:18%;right:18%;height:2px;pointer-events:none;
          background:linear-gradient(90deg,#0000,var(--fd-cyan,#4fe3ff),#0000);
          box-shadow:0 0 12px #4fe3ffaa;z-index:5;}
        #gal-panel::before{content:"";position:absolute;inset:7px;pointer-events:none;z-index:4;opacity:.85;
          background:
            linear-gradient(var(--fd-cyan,#4fe3ff),var(--fd-cyan,#4fe3ff)) left top/16px 2px no-repeat,
            linear-gradient(var(--fd-cyan,#4fe3ff),var(--fd-cyan,#4fe3ff)) left top/2px 16px no-repeat,
            linear-gradient(var(--fd-cyan,#4fe3ff),var(--fd-cyan,#4fe3ff)) right top/16px 2px no-repeat,
            linear-gradient(var(--fd-cyan,#4fe3ff),var(--fd-cyan,#4fe3ff)) right top/2px 16px no-repeat,
            linear-gradient(var(--fd-cyan,#4fe3ff),var(--fd-cyan,#4fe3ff)) left bottom/16px 2px no-repeat,
            linear-gradient(var(--fd-cyan,#4fe3ff),var(--fd-cyan,#4fe3ff)) left bottom/2px 16px no-repeat,
            linear-gradient(var(--fd-cyan,#4fe3ff),var(--fd-cyan,#4fe3ff)) right bottom/16px 2px no-repeat,
            linear-gradient(var(--fd-cyan,#4fe3ff),var(--fd-cyan,#4fe3ff)) right bottom/2px 16px no-repeat;
          filter:drop-shadow(0 0 4px #4fe3ff88);}
        #gal-tabs{display:flex;gap:8px;}
        .gal-tab{pointer-events:auto;cursor:pointer;flex:1;text-align:center;font-size:12px;font-weight:800;
          letter-spacing:1.5px;padding:7px 10px;border-radius:8px;background:#0a1622aa;
          border:1px solid var(--fd-edge-soft,#4fe3ff1f);color:#7fa6c8;text-transform:uppercase;transition:all .15s;}
        .gal-tab:hover{border-color:#4fe3ff66;}
        .gal-tab.active{background:#10283a;color:#fff;box-shadow:0 -2px 14px -4px #4fe3ffaa;border-color:var(--fd-cyan,#4fe3ff);}
        #gal-title{font-size:24px;font-weight:800;letter-spacing:1px;margin-bottom:-4px;text-transform:uppercase;
          color:var(--fd-cyan,#4fe3ff);text-shadow:0 2px 0 #0008,0 0 20px #4fe3ff66;}
        #gal-badges{display:flex;gap:8px;flex-wrap:wrap;}
        .gal-badge{font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;
          padding:4px 10px;border-radius:20px;border:1px solid #ffffff2a;}
        .gal-badge.role{color:var(--fd-cyan,#4fe3ff);border-color:var(--fd-edge,#4fe3ff3a);background:#4fe3ff14;}
        #gal-stats{font-size:14px;line-height:1.8;}
        #gal-stats b{color:var(--fd-gold,#ffd24a);}
        #gal-tags{display:flex;gap:6px;flex-wrap:wrap;}
        .gal-tag{font-size:10px;font-weight:800;letter-spacing:.5px;padding:3px 9px;border-radius:12px;
          border:1px solid;text-transform:uppercase;}
        .gal-tag.weak{color:#7fff6a;border-color:#7fff6a55;background:#7fff6a14;}
        .gal-tag.resist{color:#ff6a5a;border-color:#ff6a5a55;background:#ff6a5a14;}
        #gal-note{font-size:12px;opacity:0.75;line-height:1.5;margin-top:2px;
          padding:8px 10px;background:#ffffff08;border-radius:8px;border:1px solid var(--fd-edge-soft,#4fe3ff1f);}
        #gal-nav{display:flex;gap:10px;justify-content:center;margin-top:auto;}
        .gal-btn{pointer-events:auto;cursor:pointer;padding:10px 18px;font-size:13px;font-weight:800;
          letter-spacing:1px;text-transform:uppercase;color:var(--fd-cyan-ink,#042430);border:none;border-radius:22px;
          background:linear-gradient(90deg,#7defff,#1f9fdf);
          box-shadow:0 5px 0 var(--fd-cyan-deep,#0a4a63),0 7px 14px #0006,0 0 16px -4px #4fe3ff77;
          transition:transform .1s,box-shadow .1s,filter .15s;}
        .gal-btn:hover{filter:brightness(1.08);}
        .gal-btn:active{transform:translateY(3px);box-shadow:0 2px 0 var(--fd-cyan-deep,#0a4a63);}
        #gal-close{pointer-events:auto;cursor:pointer;margin-top:10px;align-self:center;
          padding:9px 22px;font-size:13px;font-weight:800;letter-spacing:1px;text-transform:uppercase;
          color:var(--fd-cyan,#4fe3ff);border:1px solid var(--fd-edge,#4fe3ff3a);border-radius:22px;background:#0a1726cc;
          transition:background .15s,border-color .15s;}
        #gal-close:hover{background:#102536;border-color:#4fe3ff99;box-shadow:inset 0 0 18px -6px #4fe3ffaa;}
        #gal-close:active{transform:translateY(2px);}
        #gal-hint{position:absolute;left:50%;bottom:20px;transform:translateX(-50%);
          font-size:12px;color:var(--fd-ink-dim,#86a8c6);text-align:center;letter-spacing:.5px;}

        @media (max-height:480px){
          #gal-panel{width:min(280px,46vw);padding:calc(14px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right))
            calc(14px + env(safe-area-inset-bottom)) 16px;gap:7px;}
          .gal-tab{padding:5px 8px;font-size:10px;}
          #gal-title{font-size:18px;}
          .gal-badge{font-size:10px;padding:3px 8px;}
          #gal-stats{font-size:12px;line-height:1.5;}
          #gal-note{font-size:11px;padding:6px 8px;}
          .gal-btn{padding:7px 12px;font-size:12px;}
          #gal-close{padding:6px 16px;font-size:12px;margin-top:8px;}
          #gal-hint{bottom:8px;font-size:10px;}
        }
      </style>
      <div id="gal-bg"></div>
      <canvas id="gal-canvas"></canvas>
      <div id="gal-panel">
        <div id="gal-tabs">
          <div class="gal-tab active" data-mode="weapons">Weapons</div>
          <div class="gal-tab" data-mode="enemies">Enemies</div>
        </div>
        <div id="gal-title">Acorn Gun</div>
        <div id="gal-badges">
          <span id="gal-element" class="gal-badge">NATURE</span>
          <span id="gal-role" class="gal-badge role" style="display:none"></span>
        </div>
        <div id="gal-stats"></div>
        <div id="gal-tags"></div>
        <div id="gal-note"></div>
        <div id="gal-nav">
          <button class="gal-btn" id="gal-prev">◀ PREV</button>
          <button class="gal-btn" id="gal-next">NEXT ▶</button>
        </div>
        <div id="gal-close">✕ Close</div>
      </div>
      <div id="gal-hint">A / D or arrows to cycle · G to close</div>`;
    document.body.appendChild(this.root);
    this.titleEl = this.root.querySelector('#gal-title');
    this.elementEl = this.root.querySelector('#gal-element');
    this.roleEl = this.root.querySelector('#gal-role');
    this.statsEl = this.root.querySelector('#gal-stats');
    this.tagsEl = this.root.querySelector('#gal-tags');
    this.noteEl = this.root.querySelector('#gal-note');
    this.canvas = this.root.querySelector('#gal-canvas');
    this.prevBtn = this.root.querySelector('#gal-prev');
    this.nextBtn = this.root.querySelector('#gal-next');
    this.tabsEl = this.root.querySelector('#gal-tabs');

    this.prevBtn.addEventListener('click', () => this._cycle(-1));
    this.nextBtn.addEventListener('click', () => this._cycle(1));
    // Tappable close (touch devices have no keyboard for the G hotkey).
    this.root.querySelector('#gal-close').addEventListener('click', () => this.close());

    this.tabsEl.querySelectorAll('.gal-tab').forEach((el) =>
      el.addEventListener('click', () => this._setMode(el.dataset.mode)));

    // Keyboard: A/D + arrow keys cycle the current tab's roster while open.
    // Attached to window so focus doesn't need to be on the canvas/buttons.
    this._onKey = (e) => {
      if (!this.isOpen) return;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') { this._cycle(-1); e.preventDefault(); }
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') { this._cycle(1); e.preventDefault(); }
    };
    window.addEventListener('keydown', this._onKey);
  }

  _buildScene() {
    this.gScene = new THREE.Scene();
    this.gCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 50);
    this.gCamera.position.set(0, 0.5, 3.2);
    this.gCamera.lookAt(0, 0, 0);

    // Rim lighting (GALLERY_SPEC §4: rim lighting to show off geometry).
    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(2, 3, 2);
    this.gScene.add(key);
    const rim = new THREE.DirectionalLight(0x49e8ff, 1.5);
    rim.position.set(-3, 1, -2);
    this.gScene.add(rim);
    const fill = new THREE.DirectionalLight(0xffd24a, 0.7);
    fill.position.set(0, -2, 2);
    this.gScene.add(fill);
    // Ambient hemi keeps the weapon's shadowed side readable so the model never
    // sinks into the dark backdrop (gallery has its own renderer — no tone mapping).
    this.gScene.add(new THREE.HemisphereLight(0x8aa6c8, 0x24242f, 0.75));

    // Turntable: a disc that rotates with the item on top, plus a thin cyan
    // "scanner" ring on its rim for a sci-fi display-pedestal look.
    const discGeo = new THREE.CylinderGeometry(0.9, 1.0, 0.08, 32);
    const discMat = new THREE.MeshStandardMaterial({ color: 0x1a2a3a, metalness: 0.8, roughness: 0.3 });
    this._turntable = new THREE.Mesh(discGeo, discMat);
    this._turntable.position.y = -0.6;
    this._turntable.receiveShadow = true;
    this.gScene.add(this._turntable);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.92, 0.012, 8, 48),
      new THREE.MeshBasicMaterial({ color: 0x4fe3ff, transparent: true, opacity: 0.85 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.56;
    this.gScene.add(ring);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    key.castShadow = true;

    this._resize();
    window.addEventListener('resize', () => { if (this.isOpen) this._resize(); });
    this._sceneBuilt = true;
  }

  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.gCamera.aspect = w / h;
    this.gCamera.updateProjectionMatrix();
  }

  open() {
    if (!this._sceneBuilt) this._buildScene();  // lazy: avoid a second WebGL ctx until needed
    this.isOpen = true;
    this.root.style.display = 'block';
    this._showItem();
    this._loop();
  }

  close() {
    this.isOpen = false;
    this.root.style.display = 'none';
    this._disposeCurrent();
  }

  _setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.index = 0;
    this.tabsEl.querySelectorAll('.gal-tab').forEach((el) => el.classList.toggle('active', el.dataset.mode === mode));
    this._showItem();
  }

  _roster() { return this.mode === 'weapons' ? WEAPON_ORDER : ENEMY_ORDER; }

  _cycle(dir) {
    const roster = this._roster();
    this.index = (this.index + dir + roster.length) % roster.length;
    this._showItem();
  }

  // Free the outgoing mesh's GPU resources before it's replaced/closed.
  // Weapon geometries are always freshly built per call (safe to dispose), but
  // their materials are shared via WeaponMeshes.js's module-level caches — never
  // dispose those. Enemy models built via buildMushroom() report `ownsMaterials`
  // (true only for the procedural types); GLB-cloned enemies share geometry with
  // the live master asset cache and must not be touched (mirrors EnemyBase.dispose).
  _disposeCurrent() {
    if (this._curMesh) {
      this.gScene?.remove(this._curMesh);
      if (this._curKind === 'weapon') {
        this._curMesh.traverse((o) => { if (o.isMesh) o.geometry?.dispose?.(); });
      } else if (this._curKind === 'enemy' && this._curOwnsMaterials) {
        this._curMesh.traverse((o) => {
          if (!o.isMesh) return;
          o.geometry?.dispose?.();
          if (!o.userData.__isOutline) o.material?.dispose?.();
        });
      }
    }
    this._curMesh = null;
    this._curMixer = null;
    this._curKind = null;
    this._curOwnsMaterials = false;
  }

  _showItem() {
    this._disposeCurrent();
    if (this.mode === 'weapons') this._showWeapon();
    else this._showEnemy();
  }

  _setElementBadge(element) {
    const c = ELEMENT_COLORS[element] || '#cfe8b0';
    this.elementEl.textContent = element;
    this.elementEl.style.color = c;
    this.elementEl.style.borderColor = c;
    this.elementEl.style.background = c + '22';
  }

  // Tag chips: which attack elements this enemy is weak/resistant to, derived
  // from the same ELEMENT_MATRIX the combat damage pipeline uses.
  _weakResistTags(targetElement) {
    const tags = [];
    for (const atk of ATTACK_ELEMENTS) {
      const mult = elementMultiplier(atk, targetElement);
      if (mult >= 1.5) tags.push(`<span class="gal-tag weak">Weak: ${atk}</span>`);
      else if (mult <= 0.5) tags.push(`<span class="gal-tag resist">Resists: ${atk}</span>`);
    }
    return tags.join('');
  }

  _showWeapon() {
    const id = WEAPON_ORDER[this.index];
    const def = WEAPONS[id];
    const unlocked = this.gm.isWeaponUnlocked(id);
    this.titleEl.textContent = unlocked ? def.name : '???';
    this._setElementBadge(def.element);
    this.roleEl.style.display = 'none';
    this.tagsEl.innerHTML = '';

    const { group } = buildWeaponMesh(id);
    if (!unlocked) {
      group.traverse((o) => { if (o.isMesh) o.material = new THREE.MeshBasicMaterial({ color: LOCKED_COLOR }); });
    }
    // Scale to fit nicely in view.
    const box = new THREE.Box3().setFromObject(group);
    const size = new THREE.Vector3(); box.getSize(size);
    const sc = 1.2 / Math.max(0.3, size.length());
    group.scale.setScalar(sc);
    group.position.y = 0.2;
    group.rotation.y = -0.3;
    this.gScene.add(group);
    this._curMesh = group;
    this._curKind = 'weapon';

    if (unlocked) {
      this.statsEl.innerHTML =
        `Damage <b>${def.damage}</b><br>` +
        `Fire rate <b>${def.cooldown > 0 ? (1 / def.cooldown).toFixed(1) : '∞'}/s</b><br>` +
        `Mode <b>${def.mode}</b>`;
      this.noteEl.textContent = '';
      this.noteEl.style.display = 'none';
    } else {
      this.statsEl.innerHTML = '<span style="opacity:0.4">Locked</span>';
      this.noteEl.textContent = '🔒 ' + (WEAPON_UNLOCK_HINTS[id] || 'Unknown');
      this.noteEl.style.display = 'block';
    }
  }

  _showEnemy() {
    const type = ENEMY_ORDER[this.index];
    const def = ENEMY_DEFS[type];
    const seen = this.gm.hasSeenEnemy(type);
    this.titleEl.textContent = seen ? def.name : '???';
    this._setElementBadge(def.element);
    this.roleEl.textContent = ROLE_LABEL[def.role] || def.role;
    this.roleEl.style.display = 'inline-block';

    // Same model-building path the game itself uses — feet normalized to
    // local y=0 for every type (GLB-cloned Wood Shroom and procedural alike).
    // buildMushroom() already bakes its own scale/position onto the returned
    // group (to reach its gameplay height with feet at y=0); wrap it in an
    // outer group rather than overwriting that transform, so the two scale
    // steps compound instead of clobbering each other.
    const { group: inner, mixer, ownsMaterials } = buildMushroom(type);
    if (!seen) {
      inner.traverse((o) => { if (o.isMesh) o.material = new THREE.MeshBasicMaterial({ color: LOCKED_COLOR }); });
    }
    const group = new THREE.Group();
    group.add(inner);
    const box = new THREE.Box3().setFromObject(inner);
    const size = new THREE.Vector3(); box.getSize(size);
    const sc = 1.6 / Math.max(0.3, size.y);
    group.scale.setScalar(sc);
    group.position.set(0, -0.56, 0); // feet on the turntable's top surface
    group.rotation.y = 0.4;
    this.gScene.add(group);
    this._curMesh = group;
    this._curMixer = mixer; // idle clip keeps playing even on the locked silhouette
    this._curKind = 'enemy';
    this._curOwnsMaterials = ownsMaterials;

    if (seen) {
      this.statsEl.innerHTML =
        `HP <b>${def.hp}</b><br>` +
        `Speed <b>${def.speed}</b><br>` +
        `Attack <b>${def.attackDamage}</b><br>` +
        `Range <b>${def.attackRange}</b>`;
      this.tagsEl.innerHTML = this._weakResistTags(def.element);
      this.noteEl.textContent = def.blurb || '';
      this.noteEl.style.display = 'block';
    } else {
      this.statsEl.innerHTML = '<span style="opacity:0.4">Undiscovered</span>';
      this.tagsEl.innerHTML = '';
      this.noteEl.textContent = '🔒 First appears: ' + (ENEMY_FIRST_SEEN_HINTS[type] || 'Unknown');
      this.noteEl.style.display = 'block';
    }
  }

  _loop() {
    if (!this.isOpen) return;
    requestAnimationFrame(() => this._loop());
    const dt = 1 / 60;
    if (this._curMesh) this._curMesh.rotation.y += dt * 0.6;
    if (this._curMixer) this._curMixer.update(dt);
    if (this._turntable) this._turntable.rotation.y += dt * 0.6;
    this.renderer.render(this.gScene, this.gCamera);
  }
}
