import * as THREE from 'three';
import { buildWeaponMesh } from './WeaponMeshes.js';
import { WEAPONS, WEAPON_ORDER, WEAPON_UNLOCK_HINTS } from '../config/Constants.js';

// Weapon Gallery (GALLERY_SPEC) — a 3D model viewer accessible via hotkey G.
// Cycles through all 9 weapons on a dark turntable with rim lighting; locked
// weapons show as a dark silhouette with "???" and their unlock hint. Uses a
// separate lightweight Three.js scene + renderer overlaid on the game canvas.
export class Gallery {
  constructor(weapons, gameManager) {
    this.weapons = weapons;         // WeaponManager's roster (for current index)
    this.gm = gameManager;
    this.isOpen = false;
    this.index = 0;
    this._turntable = null;
    this._curMesh = null;

    this._buildDom();
    this._sceneBuilt = false;
  }

  _buildDom() {
    this.root = document.createElement('div');
    this.root.style.cssText =
      'position:fixed;inset:0;z-index:38;display:none;' +
      'font-family:"Trebuchet MS",system-ui,sans-serif;color:#eaf7df;';
    this.root.innerHTML = `
      <style>
        #gal-bg{position:absolute;inset:0;background:radial-gradient(circle at 50% 40%,#1a2c44,#070c16 82%);}
        #gal-canvas{position:absolute;inset:0;}
        #gal-panel{position:absolute;right:0;top:0;bottom:0;width:340px;padding:28px 24px;
          background:linear-gradient(160deg,#0e1f1aee,#08120ce8);border-left:1px solid #ffffff1a;
          display:flex;flex-direction:column;gap:14px;backdrop-filter:blur(8px);}
        #gal-title{font-size:24px;font-weight:800;letter-spacing:1px;margin-bottom:2px;}
        #gal-element{font-size:13px;opacity:0.7;letter-spacing:1px;text-transform:uppercase;}
        #gal-stats{font-size:14px;line-height:1.8;}
        #gal-stats b{color:#ffd24a;}
        #gal-unlock{font-size:12px;opacity:0.65;line-height:1.5;margin-top:4px;
          padding:8px 10px;background:#ffffff08;border-radius:8px;border:1px solid #ffffff14;}
        #gal-nav{display:flex;gap:10px;justify-content:center;margin-top:auto;}
        .gal-btn{pointer-events:auto;cursor:pointer;padding:10px 18px;font-size:14px;font-weight:700;
          color:#eaf7df;border:1px solid #ffffff2a;border-radius:24px;background:#ffffff0a;
          transition:background .15s,border-color .15s;}
        .gal-btn:hover{background:#ffffff1a;border-color:#ffffff4a;}
        #gal-close{pointer-events:auto;cursor:pointer;margin-top:12px;align-self:center;
          padding:9px 22px;font-size:14px;font-weight:800;letter-spacing:1px;color:#eaf7df;
          border:1px solid #ffffff2a;border-radius:24px;background:#ffffff10;
          transition:background .15s,border-color .15s;}
        #gal-close:hover{background:#ffffff1f;border-color:#ffffff4a;}
        #gal-close:active{transform:translateY(2px);}
        #gal-hint{position:absolute;left:50%;bottom:20px;transform:translateX(-50%);
          font-size:12px;opacity:0.4;text-align:center;}
        #gal-locked{display:none;font-size:42px;text-align:center;letter-spacing:6px;
          color:#ffffff40;pointer-events:none;}
      </style>
      <div id="gal-bg"></div>
      <canvas id="gal-canvas"></canvas>
      <div id="gal-panel">
        <div id="gal-title">Acorn Gun</div>
        <div id="gal-element">NATURE</div>
        <div id="gal-stats"></div>
        <div id="gal-unlock"></div>
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
    this.statsEl = this.root.querySelector('#gal-stats');
    this.unlockEl = this.root.querySelector('#gal-unlock');
    this.canvas = this.root.querySelector('#gal-canvas');
    this.prevBtn = this.root.querySelector('#gal-prev');
    this.nextBtn = this.root.querySelector('#gal-next');

    this.prevBtn.addEventListener('click', () => this._cycle(-1));
    this.nextBtn.addEventListener('click', () => this._cycle(1));
    // Tappable close (touch devices have no keyboard for the G hotkey).
    this.root.querySelector('#gal-close').addEventListener('click', () => this.close());

    // Keyboard: A/D + arrow keys cycle weapons while the gallery is open.
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

    // Turntable: a disc that rotates with the weapon on top.
    const discGeo = new THREE.CylinderGeometry(0.9, 1.0, 0.08, 32);
    const discMat = new THREE.MeshStandardMaterial({ color: 0x1a2a3a, metalness: 0.8, roughness: 0.3 });
    this._turntable = new THREE.Mesh(discGeo, discMat);
    this._turntable.position.y = -0.6;
    this._turntable.receiveShadow = true;
    this.gScene.add(this._turntable);

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
    this._showWeapon();
    this._loop();
  }

  close() {
    this.isOpen = false;
    this.root.style.display = 'none';
    if (this._curMesh) { this.gScene.remove(this._curMesh); this._curMesh = null; }
  }

  _cycle(dir) {
    this.index = (this.index + dir + WEAPON_ORDER.length) % WEAPON_ORDER.length;
    this._showWeapon();
  }

  _showWeapon() {
    if (this._curMesh) { this.gScene.remove(this._curMesh); this._curMesh = null; }
    const id = WEAPON_ORDER[this.index];
    const def = WEAPONS[id];
    const unlocked = this.gm.isWeaponUnlocked(id);
    this.titleEl.textContent = unlocked ? def.name : '???';
    this.elementEl.textContent = def.element;

    if (unlocked) {
      const { group } = buildWeaponMesh(id);
      // Scale to fit nicely in view.
      const box = new THREE.Box3().setFromObject(group);
      const size = new THREE.Vector3(); box.getSize(size);
      const sc = 1.2 / Math.max(0.3, size.length());
      group.scale.setScalar(sc);
      group.position.y = 0.2;
      group.rotation.y = -0.3;
      this.gScene.add(group);
      this._curMesh = group;

      this.statsEl.innerHTML =
        `Damage <b>${def.damage}</b><br>` +
        `Fire rate <b>${def.cooldown > 0 ? (1 / def.cooldown).toFixed(1) : '∞'}/s</b><br>` +
        `Mode <b>${def.mode}</b>`;
      this.unlockEl.textContent = '';
      this.unlockEl.style.display = 'none';
    } else {
      // Locked: silhouette with "???" + unlock hint.
      const { group } = buildWeaponMesh(id);
      group.traverse((o) => {
        if (o.isMesh) {
          o.material = new THREE.MeshBasicMaterial({ color: 0x222233 });
        }
      });
      const box = new THREE.Box3().setFromObject(group);
      const size = new THREE.Vector3(); box.getSize(size);
      const sc = 1.2 / Math.max(0.3, size.length());
      group.scale.setScalar(sc);
      group.position.y = 0.2;
      this.gScene.add(group);
      this._curMesh = group;

      this.statsEl.innerHTML = '<span style="opacity:0.4">Locked</span>';
      this.unlockEl.textContent = '🔒 ' + (WEAPON_UNLOCK_HINTS[id] || 'Unknown');
      this.unlockEl.style.display = 'block';
    }
  }

  _loop() {
    if (!this.isOpen) return;
    requestAnimationFrame(() => this._loop());
    const dt = 1 / 60;
    if (this._curMesh) this._curMesh.rotation.y += dt * 0.6;
    if (this._turntable) this._turntable.rotation.y += dt * 0.6;
    this.renderer.render(this.gScene, this.gCamera);
  }
}
