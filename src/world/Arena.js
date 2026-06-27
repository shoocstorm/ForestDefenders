import * as THREE from 'three';
import { ARENA, BLOOM_LAYER } from '../config/Constants.js';
import { randRange, randInt } from '../util/MathUtils.js';
import { toon } from '../materials/CelMaterial.js';
import { clone } from '../core/Assets.js';
import { Vegetation } from './Vegetation.js';
import { Water } from './Water.js';
import { Lanterns } from './Lanterns.js';

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
    const groundMat = toon({ color: 0x4f7a3a, rim: { color: 0x8fcf6a, intensity: 0.3 } });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.receiveShadow = true;
    scene.add(ground);

    // Stone path down the center lane (visual).
    const pathGeo = new THREE.PlaneGeometry(4.2, ARENA.LENGTH - 6);
    pathGeo.rotateX(-Math.PI / 2);
    const path = new THREE.Mesh(pathGeo, toon({ color: 0x8a9a7e, rim: { color: 0xcfe0c0, intensity: 0.35 } }));
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

    // --- Scattered GLB props: landmark trees, rocks, stumps, ferns (set pieces) ---
    this._scatterProps();

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
    const mat = toon({ color: 0x2f5a2c, rim: { color: 0x4f8a3c, intensity: 0.3 } });
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
      toon({ color: 0x6b7d5a, rim: { color: 0xcfe0b0, intensity: 0.35 } })
    );
    top.position.set(0, h / 2, 4);
    top.castShadow = true; top.receiveShadow = true;
    this.scene.add(top);
    // Mossy top cap
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(10.2, 0.2, 10.2),
      toon({ color: 0x5a8a3f, rim: { color: 0xbfe88a, intensity: 0.4 }, wind: { base: 0.0, freq: 2.4, amp: 0.02 } })
    );
    cap.position.set(0, h + 0.1, 4);
    this.scene.add(cap);
    // Corner pillars
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const pil = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.45, h + 1.2, 8),
        toon({ color: 0x8a8475, rim: { color: 0xcfe0c0, intensity: 0.3 } })
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
        toon({ color: 0x7d7363, rim: { color: 0xcfe0c0, intensity: 0.3 } })
      );
      step.position.set(0, sh / 2, z);
      step.castShadow = true; step.receiveShadow = true;
      this.scene.add(step);
      this.standables.push({ minX: -1.5, maxX: 1.5, minZ: z - 0.5, maxZ: z + 0.5, top: sh, solid: false });
    }
    this.platform = top;
  }

  // "Corrupted Spore Grove" — a colossal mushroom at the east end (LEVELS_SPEC §5.2).
  // Built from the authored boss_mushroom.glb, scaled to a towering landmark and
  // bathed in a violet bloom + point light so it reads as the corrupted source.
  _bossLandmark() {
    const boss = clone('bossShroom');
    const box = new THREE.Box3().setFromObject(boss);
    const size = new THREE.Vector3(); box.getSize(size);
    const targetH = 7.5;
    const s = targetH / Math.max(0.001, size.y);
    boss.scale.setScalar(s);
    boss.position.y = -box.min.y * s;
    boss.position.z = ARENA.LENGTH / 2 - 5;
    // Put every mesh on the bloom layer so its emissive surfaces glow.
    boss.traverse((o) => {
      if (o.isMesh) {
        o.layers.enable(BLOOM_LAYER);
        if (o.material) {
          o.material.emissive = new THREE.Color(0x6a1f9a);
          o.material.emissiveIntensity = Math.max(0.6, o.material.emissiveIntensity ?? 0);
        }
      }
    });
    this.scene.add(boss);
    // Eerie violet glow light over the grove.
    const glow = new THREE.PointLight(0xa060ff, 40, 34, 2);
    glow.position.set(0, 6, ARENA.LENGTH / 2 - 5);
    this.scene.add(glow);
    // Orbiting spore motes for atmosphere (bloom accents).
    const moteGeo = new THREE.SphereGeometry(0.16, 8, 8);
    for (let i = 0; i < 14; i++) {
      const mote = new THREE.Mesh(moteGeo, new THREE.MeshBasicMaterial({ color: 0xc89bff }));
      const a = randRange(0, Math.PI * 2), r = randRange(1.5, 4.5);
      mote.position.set(Math.cos(a) * r, 3 + randRange(0, 4.5), ARENA.LENGTH / 2 - 5 + Math.sin(a) * r * 0.5);
      mote.layers.enable(BLOOM_LAYER);
      this.scene.add(mote);
    }
  }

  // Scatter authored GLB props across the glades (LEVELS_SPEC §5.6 clustered
  // foliage + §3 obstacles). Landmark ancient trees flank the platform; rocks,
  // mossy stumps and ferns break up the ground. Colliders added for the big ones.
  _scatterProps() {
    const scene = this.scene;
    const place = (key, x, z, s, rot, colliderR = 0) => {
      const g = clone(key);
      const box = new THREE.Box3().setFromObject(g);
      const size = new THREE.Vector3(); box.getSize(size);
      const sc = s / Math.max(0.001, size.y);
      g.scale.setScalar(sc);
      g.position.set(x, -box.min.y * sc, z);
      g.rotation.y = rot;
      scene.add(g);
      if (colliderR > 0) this.colliders.push({ type: 'cylinder', x, z, r: colliderR });
      return g;
    };

    // Two towering ancient trees flanking the central platform (landmarks).
    place('ancientTree', -8, 4, 5.5, 0.6, 0.6);
    place('ancientTree', 8, 4, 5.5, -0.5, 0.6);
    // A few pines near the player start for framing.
    place('pine', -4, -26, 4.0, 0.3, 0.4);
    place('pine', 5, -24, 4.6, -0.2, 0.4);

    // Scatter smaller props (rocks, stumps, ferns) off the lane — no colliders.
    const propKeys = ['rock', 'mossStump', 'fern', 'fern', 'grass', 'rock', 'crystalRock'];
    for (let i = 0; i < 26; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = side * randRange(4.5, ARENA.WIDTH / 2 - 1);
      const z = randRange(-ARENA.LENGTH / 2 + 5, ARENA.LENGTH / 2 - 8);
      const key = propKeys[Math.floor(Math.random() * propKeys.length)];
      place(key, x, z, randRange(0.6, 1.2), Math.random() * Math.PI * 2);
    }
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
