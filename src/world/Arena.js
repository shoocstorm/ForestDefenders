import * as THREE from 'three';
import { ARENA, BLOOM_LAYER, BIOMES } from '../config/Constants.js';
import { randRange, randInt } from '../util/MathUtils.js';
import { toon } from '../materials/CelMaterial.js';
import { clone } from '../core/Assets.js';
import { Vegetation } from './Vegetation.js';
import { Water } from './Water.js';
import { Lanterns } from './Lanterns.js';

// Biome-driven arena (LEVELS_SPEC). M1–M5 hard-coded L1 Misty Forest; M6 adds L2
// Ember Hollow + L3 Ancient Grove by re-skinning all 7 set pieces from a BIOMES
// palette (SEASONS_SPEC). The same geometry layout + collider structure is reused;
// only colors, lights, water, landmark, rings, lanterns, and ambient particles
// change per biome. Constructor takes a biome key ('L1' | 'L2' | 'L3').
export class Arena {
  constructor(scene, biomeKey = 'L1') {
    this.scene = scene;
    this.biomeKey = biomeKey;
    this.biome = BIOMES[biomeKey] || BIOMES.L1;
    this.colliders = [];
    this._t = 0;
    this._build();
  }

  // Per-frame ambient motion: tree sway, water ripple, lantern/ring pulse, fireflies.
  update(dt) {
    this._t += dt;
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
    if (this._landmarkUpdate) this._landmarkUpdate(dt, this._t);
  }

  // Tear down everything this Arena added to the scene (for level transitions).
  dispose() {
    const toRemove = [];
    this.scene.traverse((o) => { if (o.userData.arenaOwned) toRemove.push(o); });
    for (const o of toRemove) {
      this.scene.remove(o);
      o.traverse?.((c) => { if (c.isMesh) { c.geometry.dispose?.(); } });
    }
    this.colliders.length = 0;
    this._rings = null;
    this.fireflies = null;
    this.vegetation = null;
    this.water = null;
    this.lanterns = null;
  }

  // Tag objects so dispose() can find and remove them on a biome switch.
  _add(o) {
    o.userData.arenaOwned = true;
    this.scene.add(o);
    return o;
  }

  _build() {
    const b = this.biome;

    // --- Sky + fog ---
    this.scene.background = new THREE.Color(b.sky);
    this.scene.fog = new THREE.Fog(b.fog, b.fogNear, b.fogFar);

    // --- Lighting ---
    const sun = new THREE.DirectionalLight(b.sun.color, b.sun.intensity);
    sun.position.set(...b.sun.pos);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096); // [up from 2048] the larger shadow frustum
    // (±110 over a 2× arena) needs more texels to stay crisp, otherwise softer
    // shadows spread and muddy the lit ground.
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 300; // [2x] covers the doubled arena depth
    const s = 110; // [2x] shadow frustum half-extent matches the larger ground
    sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
    sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
    sun.shadow.bias = -0.0004;
    this._add(sun);
    this.sun = sun;

    const hemi = new THREE.HemisphereLight(b.hemi.sky, b.hemi.ground, b.hemi.intensity);
    hemi.userData.arenaOwned = true;
    this.scene.add(hemi);

    const fill = new THREE.DirectionalLight(b.fill.color, b.fill.intensity);
    fill.position.set(20, 15, 20);
    fill.userData.arenaOwned = true;
    this.scene.add(fill);

    // --- Ground ---
    const groundGeo = new THREE.PlaneGeometry(ARENA.WIDTH, ARENA.LENGTH, 1, 1);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = toon({ color: b.ground, rim: { color: b.groundRim, intensity: b.groundRimI } });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.receiveShadow = true;
    ground.userData.arenaOwned = true;
    this.scene.add(ground);

    // Stone path.
    const pathGeo = new THREE.PlaneGeometry(4.2, ARENA.LENGTH - 6);
    pathGeo.rotateX(-Math.PI / 2);
    const path = new THREE.Mesh(pathGeo, toon({ color: b.path, rim: { color: b.pathRim, intensity: 0.35 } }));
    path.position.y = 0.01;
    path.receiveShadow = true;
    path.userData.arenaOwned = true;
    this.scene.add(path);

    this._boundary();
    this.vegetation = new Vegetation(this.scene, b.trees);
    for (const c of this.vegetation.colliders) this.colliders.push(c);
    this.water = new Water(this.scene, ...b.water.pos, b.water.radius, b.water);
    this.lanterns = new Lanterns(this.scene, b.lantern);
    this._platform();
    this._scatterProps();
    this._bossLandmark();

    // --- Spawn-telegraph rings ---
    this._rings = [];
    for (let i = 0; i < 3; i++) this._spawnRing(randRange(-9, 9), ARENA.LENGTH / 2 - randRange(7, 14));

    this._fireflies();
  }

  _boundary() {
    const b = this.biome;
    const mat = toon({ color: b.boundary, rim: { color: b.boundaryRim, intensity: 0.3 } });
    const hx = ARENA.WIDTH / 2, hz = ARENA.LENGTH / 2;
    const make = (w, d, x, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, d), mat);
      m.position.set(x, 0.6, z);
      m.castShadow = true; m.receiveShadow = true;
      m.userData.arenaOwned = true;
      this.scene.add(m);
    };
    make(ARENA.WIDTH, 0.6, 0, -hz);
    make(ARENA.WIDTH, 0.6, 0, hz);
    make(0.6, ARENA.LENGTH, -hx, 0);
    make(0.6, ARENA.LENGTH, hx, 0);
  }

  _platform() {
    const b = this.biome;
    const h = ARENA.PLATFORM_HEIGHT;
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(10, h, 10),
      toon({ color: b.platform.top, rim: { color: b.platform.topRim, intensity: 0.35 } })
    );
    top.position.set(0, h / 2, 4);
    top.castShadow = true; top.receiveShadow = true;
    top.userData.arenaOwned = true;
    this.scene.add(top);
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(10.2, 0.2, 10.2),
      toon({ color: b.platform.cap, rim: { color: b.platform.topRim, intensity: 0.4 }, wind: { base: 0.0, freq: 2.4, amp: 0.02 } })
    );
    cap.position.set(0, h + 0.1, 4);
    cap.userData.arenaOwned = true;
    this.scene.add(cap);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const pil = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.45, h + 1.2, 8),
        toon({ color: b.platform.pillar, rim: { color: b.platform.pillarRim, intensity: 0.3 } })
      );
      pil.position.set(sx * 4.4, (h + 1.2) / 2, 4 + sz * 4.4);
      pil.castShadow = true;
      pil.userData.arenaOwned = true;
      this.scene.add(pil);
    }
    this.standables = [
      { minX: -5, maxX: 5, minZ: -1, maxZ: 9, top: h, solid: true },
    ];
    const steps = 5;
    for (let i = 0; i < steps; i++) {
      const sh = (steps - i) * (h / steps);
      const z = 4 - 5 - i * 1.0;
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(3, sh, 1.0),
        toon({ color: b.platform.step, rim: { color: b.platform.pillarRim, intensity: 0.3 } })
      );
      step.position.set(0, sh / 2, z);
      step.castShadow = true; step.receiveShadow = true;
      step.userData.arenaOwned = true;
      this.scene.add(step);
      this.standables.push({ minX: -1.5, maxX: 1.5, minZ: z - 0.5, maxZ: z + 0.5, top: sh, solid: false });
    }
  }

  // Boss-end landmark — re-skinned per biome (LEVELS_SPEC §5.2):
  //   mushroom (L1), burning tree (L2), magic portal (L3).
  _bossLandmark() {
    const b = this.biome;
    const lm = b.landmark;
    const z = ARENA.LENGTH / 2 - 5;
    if (lm.type === 'tree') this._burningTreeLandmark(lm, z);
    else if (lm.type === 'portal') this._portalLandmark(lm, z);
    else this._mushroomLandmark(lm, z);

    // Biome glow light over the landmark.
    const glow = new THREE.PointLight(lm.glow, lm.glowI, lm.glowRange, 2);
    glow.position.set(0, 6, z);
    glow.userData.arenaOwned = true;
    this.scene.add(glow);

    // Orbiting spore/ember/wisp motes.
    const moteGeo = new THREE.SphereGeometry(0.16, 8, 8);
    const moteMat = new THREE.MeshBasicMaterial({ color: lm.mote });
    for (let i = 0; i < 14; i++) {
      const mote = new THREE.Mesh(moteGeo, moteMat);
      const a = randRange(0, Math.PI * 2), r = randRange(1.5, 4.5);
      mote.position.set(Math.cos(a) * r, 3 + randRange(0, 4.5), z + Math.sin(a) * r * 0.5);
      mote.layers.enable(BLOOM_LAYER);
      mote.userData.arenaOwned = true;
      this.scene.add(mote);
    }
  }

  _mushroomLandmark(lm, z) {
    const boss = clone('bossShroom');
    const box = new THREE.Box3().setFromObject(boss);
    const size = new THREE.Vector3(); box.getSize(size);
    const targetH = 7.5;
    const s = targetH / Math.max(0.001, size.y);
    boss.scale.setScalar(s);
    boss.position.y = -box.min.y * s;
    boss.position.z = z;
    boss.traverse((o) => {
      if (o.isMesh) {
        o.layers.enable(BLOOM_LAYER);
        if (o.material) {
          o.material.emissive = new THREE.Color(lm.emissive);
          o.material.emissiveIntensity = Math.max(0.6, o.material.emissiveIntensity ?? 0);
        }
      }
    });
    boss.userData.arenaOwned = true;
    this.scene.add(boss);
  }

  // L2: colossal burning tree (ancientTree scaled up, emissive magma + flicker).
  _burningTreeLandmark(lm, z) {
    const tree = clone('ancientTree');
    const box = new THREE.Box3().setFromObject(tree);
    const size = new THREE.Vector3(); box.getSize(size);
    const targetH = 9;
    const s = targetH / Math.max(0.001, size.y);
    tree.scale.setScalar(s);
    tree.position.y = -box.min.y * s;
    tree.position.z = z;
    const flickerLights = [];
    tree.traverse((o) => {
      if (o.isMesh) {
        o.layers.enable(BLOOM_LAYER);
        if (o.material) {
          o.material.emissive = new THREE.Color(lm.emissive);
          o.material.emissiveIntensity = 1.2;
        }
      }
    });
    tree.userData.arenaOwned = true;
    this.scene.add(tree);
    // Flickering fire glow at the base.
    const fireLight = new THREE.PointLight(lm.glow, 15, 18, 2);
    fireLight.position.set(0, 1.5, z);
    fireLight.userData.arenaOwned = true;
    this.scene.add(fireLight);
    flickerLights.push(fireLight);
    this._landmarkUpdate = (dt, t) => {
      const f = 0.7 + Math.sin(t * 13) * 0.15 + Math.sin(t * 7.3) * 0.15;
      fireLight.intensity = 15 * f;
    };
  }

  // L3: luminous magic portal — a glowing torus gateway with a swirling disc.
  _portalLandmark(lm, z) {
    const group = new THREE.Group();
    const torusGeo = new THREE.TorusGeometry(3.0, 0.35, 16, 48);
    const torusMat = new THREE.MeshToonMaterial({ color: lm.glow, emissive: lm.glow, emissiveIntensity: 2.0 });
    const torus = new THREE.Mesh(torusGeo, torusMat);
    torus.position.set(0, 4.5, z);
    torus.layers.enable(BLOOM_LAYER);
    group.add(torus);
    // Swirling inner disc.
    const discGeo = new THREE.CircleGeometry(2.8, 48);
    const discMat = new THREE.MeshBasicMaterial({ color: lm.glow, transparent: true, opacity: 0.35,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.position.set(0, 4.5, z);
    disc.layers.enable(BLOOM_LAYER);
    group.add(disc);
    // Base plinth.
    const baseGeo = new THREE.CylinderGeometry(2.0, 2.4, 0.6, 12);
    const base = new THREE.Mesh(baseGeo, toon({ color: 0x4a4a6a, rim: { color: 0x8a9aaa, intensity: 0.4 } }));
    base.position.set(0, 0.3, z);
    base.castShadow = true; base.receiveShadow = true;
    group.add(base);
    // Runestones around the portal.
    const stoneMat = toon({ color: 0x3a3a5a, rim: { color: lm.glow, intensity: 0.6 } });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const stone = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.8, 0.3), stoneMat);
      stone.position.set(Math.cos(a) * 2.8, 0.9, z + Math.sin(a) * 2.8);
      stone.rotation.y = -a;
      stone.castShadow = true;
      group.add(stone);
    }
    group.userData.arenaOwned = true;
    this.scene.add(group);
    this._landmarkUpdate = (dt, t) => {
      torus.rotation.z += dt * 0.4;
      disc.rotation.z -= dt * 0.8;
      disc.material.opacity = 0.3 + Math.sin(t * 1.5) * 0.1;
    };
  }

  _scatterProps() {
    const b = this.biome;
    const scene = this.scene;
    const place = (key, x, z, s, rot, colliderR = 0) => {
      const g = clone(key);
      const box = new THREE.Box3().setFromObject(g);
      const size = new THREE.Vector3(); box.getSize(size);
      const sc = s / Math.max(0.001, size.y);
      g.scale.setScalar(sc);
      g.position.set(x, -box.min.y * sc, z);
      g.rotation.y = rot;
      g.userData.arenaOwned = true;
      scene.add(g);
      if (colliderR > 0) this.colliders.push({ type: 'cylinder', x, z, r: colliderR });
      return g;
    };
    place('ancientTree', -8, 4, 5.5, 0.6, 0.6);
    place('ancientTree', 8, 4, 5.5, -0.5, 0.6);
    place('pine', -4, -26, 4.0, 0.3, 0.4);
    place('pine', 5, -24, 4.6, -0.2, 0.4);
    const propKeys = ['rock', 'mossStump', 'fern', 'fern', 'grass', 'rock', 'crystalRock'];
    for (let i = 0; i < 78; i++) { // [3x] denser scatter across the larger arena
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
      new THREE.MeshBasicMaterial({ color: this.biome.ring, transparent: true, opacity: 0.8 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.05, z);
    ring.layers.enable(BLOOM_LAYER);
    ring.userData.arenaOwned = true;
    this.scene.add(ring);
    this._rings.push({ ring, phase: Math.random() * Math.PI * 2 });
  }

  _fireflies() {
    const b = this.biome;
    const n = b.fireflyN;
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
      color: b.firefly, size: 0.16, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.fireflies = new THREE.Points(geo, mat);
    this.fireflies.frustumCulled = false;
    this.fireflies.layers.enable(BLOOM_LAYER);
    this.fireflies.userData.arenaOwned = true;
    this.scene.add(this.fireflies);
  }
}
