import * as THREE from 'three';
import { ARENA, BLOOM_LAYER, BIOMES } from '../config/Constants.js';
import { randRange, randInt } from '../util/MathUtils.js';
import { toon } from '../materials/CelMaterial.js';
import { clone } from '../core/Assets.js';
import { Vegetation } from './Vegetation.js';
import { Water } from './Water.js';
import { Lanterns } from './Lanterns.js';
import { SkyDecor } from './SkyDecor.js';
import { SkyDome } from './SkyDome.js';
import { GroundFog } from './GroundFog.js';
import { gridMaterial, forceFieldMaterial } from './TechFX.js';
import { fireflyMaterial } from '../materials/DriftParticles.js';
import { FloatingRunestones } from './FloatingRunestones.js';
import { PrismaticSpires } from './PrismaticSpires.js';
import { SpiritWells } from './SpiritWells.js';
import { WillOWisps } from './WillOWisps.js';

// --- Deterministic value noise for the ground's vertex-painted variation ---
function _hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function _vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = _hash2(xi, zi), b = _hash2(xi + 1, zi);
  const c = _hash2(xi, zi + 1), d = _hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function _fbm2(x, z) {
  return _vnoise(x, z) * 0.62 + _vnoise(x * 2.7 + 13.1, z * 2.7 + 7.7) * 0.26 +
    _vnoise(x * 6.3 + 41.3, z * 6.3 + 29.1) * 0.12;
}
const _gc = new THREE.Color(); // scratch for ground vertex painting

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
    this.sky?.update(dt);
    this.skyDome?.update(dt);
    this.mist?.update(dt, this._t);
    this.runestones?.update(dt);
    this.spires?.update(dt);
    this.wells?.update(dt);
    this.wisps?.update(dt);
    // Advance every tech shader (grid + force-field panels).
    if (this._techMats) for (const m of this._techMats) {
      if (m.userData.__uTime) m.userData.__uTime.value = this._t;
    }
    // Floating antigrav props bob + slow-spin; holo cores rotate. Rotation is driven
    // by absolute this._t (all start at rotation 0) rather than `+= dt * speed`, so
    // it can't drift from float accumulation over a long play session.
    if (this._floaters) for (const f of this._floaters) {
      f.obj.position.y = f.baseY + Math.sin(this._t * f.bobSpeed + f.phase) * f.bobAmp;
      f.obj.rotation.y = this._t * f.spin;
    }
    if (this._holoCores) for (const c of this._holoCores) {
      c.rotation.y = this._t * 0.6;
      c.material.opacity = 0.25 + Math.sin(this._t * 2.0 + c.position.x) * 0.1;
    }
    if (this._rings) {
      for (const r of this._rings) {
        const p = Math.sin(this._t * 2 + r.phase);
        const s = 1 + p * 0.08;
        r.outer.scale.set(s, s, 1);
        r.outer.material.opacity = 0.55 + p * 0.25;
        // Inner ring counter-pulses + slowly spins for a holographic read.
        const si = 1 + Math.sin(this._t * 2.6 + r.phase) * 0.12;
        r.inner.scale.set(si, si, 1);
        r.inner.rotation.z = this._t * 0.8;
        r.inner.material.opacity = 0.4 + Math.cos(this._t * 2.6 + r.phase) * 0.25;
      }
    }
    if (this._platformRings) {
      const riseSpeed = 1.5, riseHeight = 9.0;
      const period = riseHeight / riseSpeed;
      for (const r of this._platformRings) {
        const localT = ((this._t / period) + r.phase) % 1;
        r.mesh.position.y = this._platformDeckY + localT * riseHeight;
        const s = 1 + localT * 0.7;
        r.mesh.scale.set(s, s, 1);
        r.mesh.material.opacity = Math.sin(localT * Math.PI) * 0.7;
      }
    }
    if (this.fireflies) {
      // Drift/bob/twinkle is entirely GPU-side now (DriftParticles.js) — just
      // advance the two scalar uniforms instead of rewriting + re-uploading
      // the whole position buffer every frame.
      this.fireflies.material.uniforms.uTime.value = this._t;
      this.fireflies.material.uniforms.uOpacity.value = 0.7 + Math.sin(this._t * 3) * 0.15;
    }
    if (this._landmarkUpdate) this._landmarkUpdate(dt, this._t);
  }

  // Tear down everything this Arena added to the scene (for level transitions).
  dispose() {
    const toRemove = [];
    this.scene.traverse((o) => { if (o.userData.arenaOwned) toRemove.push(o); });
    for (const o of toRemove) {
      this.scene.remove(o);
      // GLB landmark/prop clones (bossShroom, ancientTree, scatter props) share
      // geometry + materials with the cached master asset (see Assets.js) — the
      // whole subtree is skipped rather than disposed, or the next level's clone
      // of the same asset would render blank/corrupt (same hazard as freeing a
      // still-living enemy's shared model).
      if (o.userData.__sharedAsset) continue;
      o.traverse?.((c) => {
        if (!c.isMesh && !c.isPoints) return;
        c.geometry?.dispose?.();
        c.material?.dispose?.();
        // InstancedMesh only: frees its instance-matrix GPU buffer (plain
        // Mesh/Points have no dispose — the optional call no-ops).
        c.dispose?.();
      });
    }
    this.colliders.length = 0;
    this._rings = null;
    this._platformRings = null;
    this.fireflies = null;
    if (this._techMats) for (const m of this._techMats) m.dispose();
    this._techMats = null;
    this._floaters = null;
    this._holoCores = null;
    // Dispose child systems that add their own objects to the scene
    this.vegetation?.dispose();
    this.water?.dispose();
    this.lanterns?.dispose();
    this.sky?.dispose();
    this.skyDome?.dispose();
    this.mist?.dispose();
    this.runestones?.dispose();
    this.spires?.dispose();
    this.wells?.dispose();
    this.wisps?.dispose();
    this.vegetation = null;
    this.water = null;
    this.lanterns = null;
    this.sky = null;
    this.skyDome = null;
    this.mist = null;
    this.runestones = null;
    this.spires = null;
    this.wells = null;
    this.wisps = null;
  }

  // Tag objects so dispose() can find and remove them on a biome switch.
  _add(o) {
    o.userData.arenaOwned = true;
    this.scene.add(o);
    return o;
  }

  _build() {
    const b = this.biome;
    this.tech = b.tech || { accent: b.ring, accentEmissive: b.ring, metal: 0x161922, metalRim: b.ring, panel: 0x232834 };
    this._techMats = [];   // shader materials needing per-frame uTime
    this._floaters = [];   // antigrav props that bob/spin
    this._holoCores = [];  // additive holo discs that rotate/pulse

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
    // Lift shadow samples along the surface normal by ~1 texel — kills the
    // self-shadow stripe acne that PCF filtering picks up on curved toon-shaded
    // surfaces (mushroom caps, tree canopies) without the peter-panning a
    // bigger depth bias would introduce.
    sun.shadow.normalBias = 0.05;
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
    // Subdivided + vertex-painted instead of one flat colour: value-noise
    // patches blend ground -> groundAlt, plus fine luminance grain, a worn
    // track beside the runway, contact darkening under the dais, and a soft
    // falloff toward the boundary walls. Reads as hand-drawn terrain rather
    // than a fill polygon, for ~15k verts built once per level.
    const groundGeo = new THREE.PlaneGeometry(ARENA.WIDTH, ARENA.LENGTH, 96, 160);
    groundGeo.rotateX(-Math.PI / 2);
    {
      const pos = groundGeo.attributes.position;
      const colors = new Float32Array(pos.count * 3);
      const base = new THREE.Color(b.ground);
      const alt = new THREE.Color(b.groundAlt ?? b.ground);
      const ss = THREE.MathUtils.smoothstep;
      const hx = ARENA.WIDTH / 2, hz = ARENA.LENGTH / 2;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        const n = _fbm2(x * 0.09, z * 0.09); // broad biome-colour patches
        const fine = _vnoise(x * 0.45, z * 0.45); // fine grain
        _gc.copy(base).lerp(alt, ss(n, 0.38, 0.72));
        let lum = 0.93 + fine * 0.14;
        // Worn ground beside the runway path (broken up by the fine noise).
        lum *= 1 - 0.12 * (1 - ss(Math.abs(x), 2.0, 4.2)) * (0.55 + 0.45 * fine);
        // Contact shading that grounds the central dais.
        const dd = Math.hypot(x, z - 4);
        lum *= 1 - 0.16 * (1 - ss(dd, 4.5, 8.0));
        // Soft falloff toward the containment walls.
        const edge = Math.max(Math.abs(x) / hx, Math.abs(z) / hz);
        lum *= 1 - 0.14 * ss(edge, 0.72, 1.0);
        colors[i * 3] = _gc.r * lum;
        colors[i * 3 + 1] = _gc.g * lum;
        colors[i * 3 + 2] = _gc.b * lum;
      }
      groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    const groundMat = toon({
      color: 0xffffff, vertexColors: true,
      rim: { color: b.groundRim, intensity: b.groundRimI },
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.receiveShadow = true;
    ground.userData.arenaOwned = true;
    this.scene.add(ground);

    // Central tech runway (replaces the stone path) — emissive accent strip.
    const pathGeo = new THREE.PlaneGeometry(4.2, ARENA.LENGTH - 6);
    pathGeo.rotateX(-Math.PI / 2);
    const path = new THREE.Mesh(pathGeo, toon({
      color: b.path, emissive: this.tech.accentEmissive, emissiveIntensity: 0.15,
      rim: { color: b.pathRim, intensity: 0.6 },
    }));
    path.position.y = 0.012;
    path.receiveShadow = true;
    path.userData.arenaOwned = true;
    this.scene.add(path);

    // --- Holographic grid floor overlay (additive shader plane over ground) ---
    const gridGeo = new THREE.PlaneGeometry(ARENA.WIDTH, ARENA.LENGTH, 1, 1);
    gridGeo.rotateX(-Math.PI / 2);
    const gridMat = gridMaterial(this.tech.accent, { cell: 4.0, sizeX: ARENA.WIDTH, sizeZ: ARENA.LENGTH });
    const grid = new THREE.Mesh(gridGeo, gridMat);
    grid.position.y = 0.03;
    grid.layers.enable(BLOOM_LAYER);
    grid.userData.arenaOwned = true;
    this._techMats.push(gridMat);
    this.scene.add(grid);

    this._boundary();
    this.vegetation = new Vegetation(this.scene, b.trees);
    for (const c of this.vegetation.colliders) this.colliders.push(c);
    this.water = new Water(this.scene, ...b.water.pos, b.water.radius, b.water);
    this.lanterns = new Lanterns(this.scene, b.lantern);
    this.sky = new SkyDecor(this.scene, b);
    this.skyDome = new SkyDome(this.scene, b, b.skyDecor?.bodyPos);
    this.mist = new GroundFog(this.scene, b.mist);
    this._platform();
    this._scatterProps();
    this._bossLandmark();

    // --- Spawn-telegraph rings ---
    this._rings = [];
    for (let i = 0; i < 3; i++) this._spawnRing(randRange(-9, 9), ARENA.LENGTH / 2 - randRange(7, 14));

    this._fireflies();

    // --- Strange world objects ---
    const accent = b.tech?.accent || b.ring;
    this.runestones = new FloatingRunestones(this.scene, { color: accent, count: 3 });
    this.spires = new PrismaticSpires(this.scene, { count: 5, color: accent });
    this.wells = new SpiritWells(this.scene, { color: accent });
    this.wisps = new WillOWisps(this.scene, { color: accent, count: 12 });
  }

  // Energy containment perimeter: a low dark-metal rail, emissive accent posts
  // at intervals, and scrolling force-field panels spanning between them.
  _boundary() {
    const t = this.tech;
    const hx = ARENA.WIDTH / 2, hz = ARENA.LENGTH / 2;
    const railMat = toon({ color: t.metal, rim: { color: t.metalRim, intensity: 0.5 } });
    const postMat = new THREE.MeshToonMaterial({ color: t.accent, emissive: t.accentEmissive, emissiveIntensity: 0.12 });
    const fieldH = 3.6; // force-field height

    // Shared field geometry per axis (different spans for X vs Z walls).
    const ffMatTemplate = () => { const m = forceFieldMaterial(t.accent); this._techMats.push(m); return m; };

    // Emissive posts + caps are collected as transforms and rendered as two
    // InstancedMeshes for the whole perimeter (52 posts + 52 caps here) — was
    // ~104 individual meshes, each also drawn separately in the shadow pass,
    // and each allocating its own identical Cylinder/Sphere geometry.
    const posts = [];
    const postH = fieldH + 0.6;

    // Build one wall along a side. `axis` = 'x' (wall runs along X) or 'z'.
    const wall = (axis, sign) => {
      const len = axis === 'x' ? ARENA.WIDTH : ARENA.LENGTH;
      const cx = axis === 'x' ? 0 : sign * hx;
      const cz = axis === 'x' ? sign * hz : 0;

      // Dark metal floor rail (also a visual kick-plate).
      const railGeo = axis === 'x'
        ? new THREE.BoxGeometry(len, 0.7, 0.7)
        : new THREE.BoxGeometry(0.7, 0.7, len);
      const rail = new THREE.Mesh(railGeo, railMat);
      rail.position.set(cx, 0.35, cz);
      rail.castShadow = true; rail.receiveShadow = true;
      rail.userData.arenaOwned = true;
      this.scene.add(rail);

      // Force-field panel spanning the whole wall.
      const fieldGeo = new THREE.PlaneGeometry(len, fieldH);
      if (axis === 'z') fieldGeo.rotateY(Math.PI / 2);
      const field = new THREE.Mesh(fieldGeo, ffMatTemplate());
      field.position.set(cx, fieldH / 2 + 0.2, cz);
      field.userData.arenaOwned = true;
      this.scene.add(field);

      // Emissive posts at intervals along the wall (transform only — see above).
      const step = 8;
      const n = Math.floor(len / step);
      for (let i = 0; i <= n; i++) {
        const o = -len / 2 + (i * len) / n;
        posts.push(axis === 'x' ? o : cx, axis === 'x' ? cz : o);
      }
    };
    wall('x', -1); wall('x', 1); wall('z', -1); wall('z', 1);

    const count = posts.length / 2;
    const m = new THREE.Matrix4();
    const postIM = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.16, 0.2, postH, 8), postMat, count);
    const capIM = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.22, 10, 8), postMat, count);
    for (let i = 0; i < count; i++) {
      const px = posts[i * 2], pz = posts[i * 2 + 1];
      m.makeTranslation(px, postH / 2, pz);
      postIM.setMatrixAt(i, m);
      m.makeTranslation(px, fieldH + 0.9, pz); // glowing cap
      capIM.setMatrixAt(i, m);
    }
    postIM.castShadow = true;
    postIM.instanceMatrix.needsUpdate = true;
    capIM.instanceMatrix.needsUpdate = true;
    this._add(postIM);
    this._add(capIM);
  }

  _platform() {
    const b = this.biome;
    const h = ARENA.PLATFORM_HEIGHT;
    const cz = 4; // platform centre on Z
    const add = (mesh, x, y, z, shadow = true) => {
      mesh.position.set(x, y, z);
      if (shadow) { mesh.castShadow = true; mesh.receiveShadow = true; }
      mesh.userData.arenaOwned = true;
      this.scene.add(mesh);
      return mesh;
    };
    const t = this.tech;
    const topMat = toon({ color: b.platform.top, rim: { color: b.platform.topRim, intensity: 0.45 } });
    const pillarMat = toon({ color: b.platform.pillar, rim: { color: b.platform.pillarRim, intensity: 0.4 } });
    const stepMat = toon({ color: b.platform.step, rim: { color: b.platform.pillarRim, intensity: 0.4 } });
    const trimMat = new THREE.MeshToonMaterial({ color: t.accent, emissive: t.accentEmissive, emissiveIntensity: 0.15 });
    // Dimmer trim for the dais root (base course) — it sits at eye level right
    // where the player stands, so the full accent glow reads as too hot.
    const rootTrimMat = new THREE.MeshToonMaterial({ color: t.accent, emissive: t.accentEmissive, emissiveIntensity: 0.05 });

    // Glowing accent edge-trim band (a flat emissive ring hugging a course edge).
    const addTrim = (w, y, thick = 0.12, mat = trimMat) => {
      const trim = add(new THREE.Mesh(new THREE.BoxGeometry(w, thick, w), mat), 0, y, cz, false);
      trim.layers.enable(BLOOM_LAYER);
      return trim;
    };

    // Stacked dark-metal dais courses with emissive seams between them.
    add(new THREE.Mesh(new THREE.BoxGeometry(11.2, 0.6, 11.2), stepMat), 0, 0.3, cz);
    addTrim(11.3, 0.62, 0.12, rootTrimMat);
    add(new THREE.Mesh(new THREE.BoxGeometry(10.4, 0.45, 10.4), topMat), 0, 0.825, cz);

    // Main column, inset so base + cornice overhang.
    add(new THREE.Mesh(new THREE.BoxGeometry(9.4, h, 9.4), topMat), 0, h / 2, cz);
    addTrim(9.5, h * 0.55, 0.1);

    // Cornice lip beneath the deck + bright seam.
    add(new THREE.Mesh(new THREE.BoxGeometry(10.4, 0.45, 10.4), stepMat), 0, h - 0.225, cz);
    addTrim(10.5, h + 0.01, 0.14);

    // Deck cap (the standing surface, top at h + 0.2) with an emissive grid inlay.
    add(new THREE.Mesh(
      new THREE.BoxGeometry(10.2, 0.2, 10.2),
      toon({ color: b.platform.cap, rim: { color: b.platform.topRim, intensity: 0.5 } })
    ), 0, h + 0.1, cz, false);
    const deckGrid = add(new THREE.Mesh(
      new THREE.PlaneGeometry(9.6, 9.6),
      gridMaterial(t.accent, { cell: 1.2, sizeX: 9.6, sizeZ: 9.6, scan: 0.0 })
    ), 0, h + 0.21, cz, false);
    deckGrid.rotation.x = -Math.PI / 2;
    deckGrid.layers.enable(BLOOM_LAYER);
    this._techMats.push(deckGrid.material);

    // Light rings rising off the deck toward the sky (replaces the old ground
    // ripple pulse — the deck's own scan is silenced above via `scan: 0`).
    const riseMat = () => new THREE.MeshBasicMaterial({
      color: t.accent, transparent: true, opacity: 0, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this._platformRings = [];
    const riseCount = 4;
    for (let i = 0; i < riseCount; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.05, 8, 40), riseMat());
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, h + 0.2, cz);
      ring.layers.enable(BLOOM_LAYER);
      ring.userData.arenaOwned = true;
      this.scene.add(ring);
      this._platformRings.push({ mesh: ring, phase: i / riseCount });
    }
    this._platformDeckY = h + 0.2;

    // Slow-rotating holographic projector core hovering over the deck.
    const core = add(new THREE.Mesh(
      new THREE.ConeGeometry(1.6, 2.4, 6, 1, true),
      new THREE.MeshBasicMaterial({ color: t.accent, transparent: true, opacity: 0.06,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    ), 0, h + 1.6, cz, false);
    core.layers.enable(BLOOM_LAYER);
    this._holoCores.push(core);

    // Corner light pylons: metal post + stacked emissive accent rings + beacon orb.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const px = sx * 4.5, pz = cz + sz * 4.5;
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, h + 1.2, 8), pillarMat), px, (h + 1.2) / 2, pz);
      for (let r = 0; r < 3; r++) {
        const ring = add(new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.05, 6, 16), trimMat), px, h * 0.4 + r * 0.55, pz);
        ring.rotation.x = Math.PI / 2;
        ring.layers.enable(BLOOM_LAYER);
      }
      const orb = add(new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), trimMat), px, h + 1.45, pz, false);
      orb.layers.enable(BLOOM_LAYER);
    }
    this.standables = [
      // Deck cap's rendered top is h + 0.2 (cap box + grid inlay, see above) —
      // registering just `h` here left the player's feet 0.2 below the visible
      // surface, sinking into the deck on the platform itself.
      { minX: -5, maxX: 5, minZ: -1, maxZ: 9, top: h + 0.2, solid: true },
      // Base dais course ("root") — wider than the deck above it, so it forms a
      // walkable lip around the platform. Without this the player's feet sink
      // into the ledge when standing on the overhang.
      { minX: -5.6, maxX: 5.6, minZ: cz - 5.6, maxZ: cz + 5.6, top: 0.6, solid: false },
      { minX: -5.2, maxX: 5.2, minZ: cz - 5.2, maxZ: cz + 5.2, top: 1.05, solid: false },
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
      // Glowing nosing strip along the front edge of each tread.
      const nosing = new THREE.Mesh(new THREE.BoxGeometry(3, 0.06, 0.08), trimMat);
      nosing.position.set(0, sh + 0.03, z - 0.46);
      nosing.layers.enable(BLOOM_LAYER);
      nosing.userData.arenaOwned = true;
      this.scene.add(nosing);
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

    this._containmentFrame(z);

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

  // Tech containment frame wrapping the boss-end landmark: a holo base disc, a
  // ring of short emissive pylons, and vertical energy-tether beams — reads as a
  // "contained specimen / reactor" regardless of the landmark inside.
  _containmentFrame(z) {
    const t = this.tech;
    const R = 5.5;
    const pylonMat = new THREE.MeshToonMaterial({ color: t.accent, emissive: t.accentEmissive, emissiveIntensity: 0.9 });
    const beamMat = new THREE.MeshBasicMaterial({ color: t.accent, transparent: true, opacity: 0.35,
      blending: THREE.AdditiveBlending, depthWrite: false });

    // Holographic base disc.
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(R + 0.5, 48),
      gridMaterial(t.accent, { cell: 0.9, sizeX: (R + 0.5) * 2, sizeZ: (R + 0.5) * 2 })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(0, 0.06, z);
    disc.layers.enable(BLOOM_LAYER);
    disc.userData.arenaOwned = true;
    this._techMats.push(disc.material);
    this.scene.add(disc);

    // Dark metal base ring.
    const baseRing = new THREE.Mesh(new THREE.TorusGeometry(R, 0.18, 8, 40),
      toon({ color: t.metal, rim: { color: t.metalRim, intensity: 0.6 } }));
    baseRing.rotation.x = Math.PI / 2;
    baseRing.position.set(0, 0.12, z);
    baseRing.userData.arenaOwned = true;
    this.scene.add(baseRing);

    const beamH = 7.0;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const px = Math.cos(a) * R, pz = z + Math.sin(a) * R;
      const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.6, 8), pylonMat);
      pylon.position.set(px, 0.8, pz);
      pylon.castShadow = true;
      pylon.layers.enable(BLOOM_LAYER);
      pylon.userData.arenaOwned = true;
      this.scene.add(pylon);
      // Vertical energy tether rising from each pylon.
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, beamH, 6), beamMat);
      beam.position.set(px, 1.6 + beamH / 2, pz);
      beam.layers.enable(BLOOM_LAYER);
      beam.userData.arenaOwned = true;
      this.scene.add(beam);
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
    boss.userData.__sharedAsset = true; // clone() shares geometry/materials — see dispose()
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
    tree.userData.__sharedAsset = true; // clone() shares geometry/materials — see dispose()
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
    // `colliderR` is optional: when omitted, it's derived from the model's own
    // XZ footprint (correct for solid props like rocks/crates that fill their
    // whole bounding box). Pass it explicitly for props like tree trunks, where
    // the visual footprint (full canopy) is much wider than the part that
    // should actually block movement.
    const place = (key, x, z, s, rot, colliderR) => {
      const g = clone(key);
      const box = new THREE.Box3().setFromObject(g);
      const size = new THREE.Vector3(); box.getSize(size);
      const sc = s / Math.max(0.001, size.y);
      g.scale.setScalar(sc);
      g.position.set(x, -box.min.y * sc, z);
      g.rotation.y = rot;
      g.userData.arenaOwned = true;
      g.userData.__sharedAsset = true; // clone() shares geometry/materials — see dispose()
      scene.add(g);
      const r = colliderR ?? Math.max(size.x, size.z) * sc * 0.5;
      if (r > 0) this.colliders.push({ type: 'cylinder', x, z, r });
      return g;
    };
    // A few overgrown "contained flora" specimens remain for silhouette variety.
    // Pulled out to x=±10 so their canopies clear the platform's 5.6-unit half-width.
    place('ancientTree', -10, 4, 5.5, 0.6, 0.6);
    place('ancientTree', 10, 4, 5.5, -0.5, 0.6);

    // Keep-clear zone around the central platform (dais + steps + corner pylons +
    // flanking trees) so random scatter doesn't pile props onto/beside it.
    const platformClear = (x, z) => Math.abs(x) < 11 && z > -6.5 && z < 10.5;

    // Sci-fi scatter: procedural tech debris + a few crystal/crate clones that
    // already read industrial. Big props push cylinder colliders like before.
    const cloneKeys = ['crystalRock', 'crystalRock', 'supplyCrate'];
    for (let i = 0; i < 84; i++) {
      let x, z, tries = 0;
      do {
        const side = Math.random() < 0.5 ? -1 : 1;
        x = side * randRange(4.5, ARENA.WIDTH / 2 - 1);
        z = randRange(-ARENA.LENGTH / 2 + 5, ARENA.LENGTH / 2 - 8);
      } while (platformClear(x, z) && ++tries < 10);
      if (platformClear(x, z)) continue; // gave up rerolling — skip rather than crowd the platform
      const roll = Math.random();
      if (roll < 0.3) {
        place(cloneKeys[Math.floor(Math.random() * cloneKeys.length)], x, z,
          randRange(0.7, 1.3), Math.random() * Math.PI * 2);
      } else {
        const kinds = ['shard', 'pylon', 'server'];
        this._techProp(kinds[Math.floor(Math.random() * kinds.length)], x, z);
      }
    }
  }

  // Build a small procedural sci-fi prop. 'shard' floats + bobs/spins, 'pylon' is
  // a sensor relay, 'server' is a stacked equipment block. Emissive accent trim
  // joins BLOOM_LAYER. Larger props register a cylinder collider.
  _techProp(kind, x, z) {
    const t = this.tech;
    const g = new THREE.Group();
    // Materials shared by every tech prop (identical params → one shader
    // program; was 3 fresh materials per prop, ~177 unique materials per level,
    // each defeating batching and carrying its own uniform block).
    this._propMats ||= {
      metal: toon({ color: t.metal, rim: { color: t.metalRim, intensity: 0.5 } }),
      panel: toon({ color: t.panel, rim: { color: t.metalRim, intensity: 0.4 } }),
      glow: new THREE.MeshToonMaterial({ color: t.accent, emissive: t.accentEmissive, emissiveIntensity: 1.0 }),
    };
    const { metal: metalMat, panel: panelMat, glow: glowMat } = this._propMats;

    if (kind === 'shard') {
      const s = randRange(0.6, 1.2);
      const body = new THREE.Mesh(new THREE.OctahedronGeometry(s, 0), panelMat);
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(s * 0.45, 0), glowMat);
      core.layers.enable(BLOOM_LAYER);
      g.add(body, core);
      const baseY = randRange(1.2, 2.8);
      g.position.set(x, baseY, z);
      this._floaters.push({ obj: g, baseY, bobAmp: randRange(0.2, 0.5),
        bobSpeed: randRange(0.6, 1.2), phase: Math.random() * Math.PI * 2, spin: randRange(0.2, 0.6) });
    } else if (kind === 'pylon') {
      const h = randRange(1.6, 3.0);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, h, 6), metalMat);
      post.position.y = h / 2; post.castShadow = true;
      const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), glowMat);
      head.position.y = h + 0.2; head.layers.enable(BLOOM_LAYER);
      g.add(post, head);
      g.position.set(x, 0, z);
      this.colliders.push({ type: 'cylinder', x, z, r: 0.3 });
    } else { // server stack
      const w = randRange(0.8, 1.4), h = randRange(1.0, 1.8);
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.8), metalMat);
      body.position.y = h / 2; body.castShadow = true; body.receiveShadow = true;
      g.add(body);
      const rows = Math.max(2, Math.round(h / 0.4));
      for (let r = 0; r < rows; r++) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.04, 0.02), glowMat);
        strip.position.set(0, 0.25 + r * (h - 0.4) / rows, w * 0.41);
        strip.layers.enable(BLOOM_LAYER);
        g.add(strip);
      }
      g.position.set(x, 0, z);
      g.rotation.y = Math.random() * Math.PI * 2;
      this.colliders.push({ type: 'cylinder', x, z, r: w * 0.5 });
    }
    g.userData.arenaOwned = true;
    this.scene.add(g);
    return g;
  }

  _spawnRing(x, z) {
    const col = this.tech.accent;
    const mk = (r, tube, seg) => {
      const m = new THREE.Mesh(
        new THREE.TorusGeometry(r, tube, 8, seg),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8,
          blending: THREE.AdditiveBlending, depthWrite: false })
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.05, z);
      m.layers.enable(BLOOM_LAYER);
      m.userData.arenaOwned = true;
      this.scene.add(m);
      return m;
    };
    const outer = mk(1.6, 0.1, 48);
    // Inner ring is a dashed-look hexagon for a targeting-reticle read.
    const inner = mk(1.0, 0.07, 6);
    this._rings.push({ outer, inner, phase: Math.random() * Math.PI * 2 });
  }

  _fireflies() {
    const b = this.biome;
    const n = b.fireflyN;
    // `pos` doubles as each firefly's baked spawn point — the drift/bob shader
    // (DriftParticles.js) reads it as (x0, baseY, z0) and never gets rewritten.
    const pos = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    const speed = new Float32Array(n);

    const baseColor = new THREE.Color(b.firefly);

    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * (ARENA.WIDTH - 4);
      pos[i * 3 + 1] = 0.3 + Math.random() * 3.0;
      pos[i * 3 + 2] = (Math.random() - 0.5) * (ARENA.LENGTH - 8);
      seed[i] = Math.random() * 100;
      speed[i] = 0.3 + Math.random() * 0.7;

      // Varied colors per firefly - more colorful
      const variedColor = baseColor.clone();
      variedColor.offsetHSL(0, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3);
      colors[i * 3] = variedColor.r;
      colors[i * 3 + 1] = variedColor.g;
      colors[i * 3 + 2] = variedColor.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
    const mat = fireflyMaterial(0.08);
    this.fireflies = new THREE.Points(geo, mat);
    this.fireflies.frustumCulled = false;
    this.fireflies.layers.enable(BLOOM_LAYER);
    this.fireflies.userData.arenaOwned = true;
    this.scene.add(this.fireflies);
  }
}
