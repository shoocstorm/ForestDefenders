import * as THREE from 'three';
import { ARENA } from '../config/Constants.js';
import { randRange, randInt } from '../util/MathUtils.js';
import { Vegetation } from './Vegetation.js';
import { Water } from './Water.js';
import { Lanterns } from './Lanterns.js';
import { BLOOM_LAYER } from '../config/Constants.js';

// Misty Forest arena (LEVELS_SPEC L1). M1 scope: ground, sky, fog, lighting,
// boundary, scattered trees, a raised central platform with stairs, and a
// boss-end landmark placeholder. Set-piece detail expands in M3.
export class Arena {
  constructor(scene) {
    this.scene = scene;
    this.colliders = []; // {type:'cylinder', x, z, r} tree trunks etc. (used later)
    this._build();
  }

  // Per-frame ambient motion: tree sway, water ripple, lantern/ring pulse, fireflies.
  update(dt) {
    this._t = (this._t || 0) + dt;
    this.vegetation?.update(dt);
    this.water?.update(dt);
    this.lanterns?.update(dt);
    if (this._rings) {
      for (const r of this._rings) {
        const s = 1 + Math.sin(this._t * 2 + r.phase) * 0.08;
        r.ring.scale.set(s, s, 1);
        r.ring.material.opacity = 0.55 + Math.sin(this._t * 2 + r.phase) * 0.25;
      }
    }
    if (this.fireflies) {
      const arr = this.fireflies.geometry.attributes.position.array;
      for (let i = 0; i < this._ffSeed.length; i++) {
        const s = this._ffSeed[i];
        arr[i * 3 + 1] += Math.sin(this._t * 1.3 + s) * dt * 0.4;
        arr[i * 3] += Math.cos(this._t * 0.7 + s) * dt * 0.3;
      }
      this.fireflies.geometry.attributes.position.needsUpdate = true;
    }
  }

  _build() {
    const scene = this.scene;

    // --- Sky + fog (pale misty daylight; closer near-plane → depth/mist) ---
    scene.background = new THREE.Color(0xaed2dc);
    scene.fog = new THREE.Fog(0xc2dbe0, 20, 100);

    // --- Lighting: soft daylight + warm fill + hemisphere bounce ---
    const sun = new THREE.DirectionalLight(0xfff2d6, 2.0);
    sun.position.set(-25, 40, -10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 140;
    const s = 55;
    sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
    sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
    sun.shadow.bias = -0.0004;
    scene.add(sun);
    this.sun = sun;

    scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x3a4a2a, 0.9));
    const fill = new THREE.DirectionalLight(0xa0d8ff, 0.35);
    fill.position.set(20, 15, 20);
    scene.add(fill);

    // --- Ground ---
    const groundGeo = new THREE.PlaneGeometry(ARENA.WIDTH, ARENA.LENGTH, 1, 1);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = new THREE.MeshToonMaterial({ color: 0x4f7a3a });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.receiveShadow = true;
    scene.add(ground);

    // Stone path down the center lane (visual).
    const pathGeo = new THREE.PlaneGeometry(4.2, ARENA.LENGTH - 6);
    pathGeo.rotateX(-Math.PI / 2);
    const path = new THREE.Mesh(pathGeo, new THREE.MeshToonMaterial({ color: 0x7d8a72 }));
    path.position.y = 0.01;
    path.receiveShadow = true;
    scene.add(path);

    // --- Boundary walls (low decorative hedges marking the arena edge) ---
    this._boundary();

    // --- Procedural trees scattered off the lane (Vegetation owns colliders) ---
    this.vegetation = new Vegetation(scene);
    for (const c of this.vegetation.colliders) this.colliders.push(c);

    // --- Scenic enchanted pond (SW glade) + path lanterns ---
    this.water = new Water(scene, -9, -12, 4.5);
    this.lanterns = new Lanterns(scene);

    // --- Raised central platform + stairs ---
    this._platform();

    // --- Boss-end landmark: giant violet mushroom ---
    this._bossLandmark();

    // --- Spawn telegraph rings over the east-end spawn zone (emissive, pulsing) ---
    this._rings = [];
    for (let i = 0; i < 3; i++) {
      this._spawnRing(randRange(-9, 9), ARENA.LENGTH / 2 - randRange(7, 14));
    }

    // --- Ambient fireflies drifting near the ground (bloom accents) ---
    this._fireflies();
  }

  _boundary() {
    const mat = new THREE.MeshToonMaterial({ color: 0x2f5a2c });
    const hx = ARENA.WIDTH / 2, hz = ARENA.LENGTH / 2;
    const make = (w, d, x, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, d), mat);
      m.position.set(x, 0.6, z);
      m.castShadow = true; m.receiveShadow = true;
      this.scene.add(m);
    };
    make(ARENA.WIDTH, 0.6, 0, -hz);
    make(ARENA.WIDTH, 0.6, 0, hz);
    make(0.6, ARENA.LENGTH, -hx, 0);
    make(0.6, ARENA.LENGTH, hx, 0);
  }

  _treeMesh(x, z, scale = 1) {
    const tree = new THREE.Group();
    const trunkH = 2.4 * scale;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25 * scale, 0.35 * scale, trunkH, 8),
      new THREE.MeshToonMaterial({ color: 0x6e4a2a })
    );
    trunk.position.y = trunkH / 2;
    trunk.castShadow = true;
    tree.add(trunk);
    // Layered canopy (stylized).
    const canopyMat = new THREE.MeshToonMaterial({ color: 0x3f7d34 });
    for (let i = 0; i < 3; i++) {
      const r = (1.6 - i * 0.35) * scale;
      const c = new THREE.Mesh(new THREE.ConeGeometry(r, 1.5 * scale, 9), canopyMat);
      c.position.y = trunkH + i * 0.9 * scale;
      c.castShadow = true;
      tree.add(c);
    }
    tree.position.set(x, 0, z);
    this.scene.add(tree);
    this.colliders.push({ type: 'cylinder', x, z, r: 0.45 * scale });
    return tree;
  }

  _trees() {
    const lane = 3.5;
    for (let i = 0; i < 26; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = side * randRange(lane, ARENA.WIDTH / 2 - 1.5);
      const z = randRange(-ARENA.LENGTH / 2 + 4, ARENA.LENGTH / 2 - 6);
      this._treeMesh(x, z, randRange(0.8, 1.5));
    }
  }

  _platform() {
    const h = ARENA.PLATFORM_HEIGHT;
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(10, h, 10),
      new THREE.MeshToonMaterial({ color: 0x6b7d5a })
    );
    top.position.set(0, h / 2, 4);
    top.castShadow = true; top.receiveShadow = true;
    this.scene.add(top);
    // Mossy top cap
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(10.2, 0.2, 10.2),
      new THREE.MeshToonMaterial({ color: 0x5a8a3f })
    );
    cap.position.set(0, h + 0.1, 4);
    this.scene.add(cap);
    // Corner pillars
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const pil = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.45, h + 1.2, 8),
        new THREE.MeshToonMaterial({ color: 0x8a8475 })
      );
      pil.position.set(sx * 4.4, (h + 1.2) / 2, 4 + sz * 4.4);
      pil.castShadow = true;
      this.scene.add(pil);
    }
    // Standables: surfaces the player can stand on (top-land) — the platform (with
    // solid sides) plus the ascending stairs (auto-step). Exposed for Player collision.
    this.standables = [
      { minX: -5, maxX: 5, minZ: -1, maxZ: 9, top: h, solid: true }, // platform
    ];

    // Stairs ascend from z=-5 (0.6 high) to z=-1 (3.0, meeting the platform edge).
    const steps = 5;
    for (let i = 0; i < steps; i++) {
      const sh = (steps - i) * (h / steps);
      const z = 4 - 5 - i * 1.0;
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(3, sh, 1.0),
        new THREE.MeshToonMaterial({ color: 0x7d7363 })
      );
      step.position.set(0, sh / 2, z);
      step.castShadow = true; step.receiveShadow = true;
      this.scene.add(step);
      this.standables.push({ minX: -1.5, maxX: 1.5, minZ: z - 0.5, maxZ: z + 0.5, top: sh, solid: false });
    }
    this.platform = top;
  }

  _bossLandmark() {
    const g = new THREE.Group();
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.8, 7, 12),
      new THREE.MeshToonMaterial({ color: 0xe8dcc0 })
    );
    stem.position.y = 3.5;
    stem.castShadow = true;
    g.add(stem);
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(4.5, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshToonMaterial({ color: 0x7a3fa0, emissive: 0x5a1f80, emissiveIntensity: 1.1 })
    );
    cap.position.y = 7;
    cap.castShadow = true;
    cap.layers.enable(BLOOM_LAYER);
    g.add(cap);
    // Glowing spots (bloom accents)
    for (let i = 0; i < 10; i++) {
      const spot = new THREE.Mesh(
        new THREE.SphereGeometry(randRange(0.3, 0.6), 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xc89bff })
      );
      const a = randRange(0, Math.PI * 2), r = randRange(1.5, 3.8);
      spot.position.set(Math.cos(a) * r, 7 + randRange(0.5, 2.5), Math.sin(a) * r * 0.5);
      spot.layers.enable(BLOOM_LAYER);
      g.add(spot);
    }
    g.position.set(0, 0, ARENA.LENGTH / 2 - 4);
    this.scene.add(g);
    // Eerie glow light
    const glow = new THREE.PointLight(0xa060ff, 30, 30, 2);
    glow.position.set(0, 8, ARENA.LENGTH / 2 - 4);
    this.scene.add(glow);
  }

  _spawnRing(x, z) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.6, 0.12, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0x7fff9f, transparent: true, opacity: 0.8 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.05, z);
    ring.layers.enable(BLOOM_LAYER);
    this.scene.add(ring);
    this._rings.push({ ring, phase: Math.random() * Math.PI * 2 });
  }

  // Drifting fireflies near the ground — small bloom-layer points (LEVELS_SPEC §2).
  _fireflies() {
    const n = 70;
    const pos = new Float32Array(n * 3);
    this._ffSeed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * (ARENA.WIDTH - 4);
      pos[i * 3 + 1] = 0.4 + Math.random() * 2.4;
      pos[i * 3 + 2] = (Math.random() - 0.5) * (ARENA.LENGTH - 8);
      this._ffSeed[i] = Math.random() * 100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xfff0a0, size: 0.16, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.fireflies = new THREE.Points(geo, mat);
    this.fireflies.frustumCulled = false;
    this.fireflies.layers.enable(BLOOM_LAYER);
    this.scene.add(this.fireflies);
  }
}
