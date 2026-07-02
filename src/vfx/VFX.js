import * as THREE from 'three';
import { BLOOM_LAYER } from '../config/Constants.js';

// Lightweight particle/light VFX manager. Each effect is a short-lived additive
// THREE.Points cloud (+ optional flash light + expanding shockwave rings) tracked
// in `this.active` and advanced/retired in update(). M2 ships muzzle flash, hit
// spark and a simplified spore explosion; the full ~520-particle death burst and
// per-weapon flashes land in M4 (JUICE_SPEC §10).
const MAX_BURST_PARTICLES = 200; // largest single burst (spore = 180)

export class VFX {
  constructor(scene) {
    this.scene = scene;
    this.active = [];     // particle bursts (pooled — entries reused, never disposed)
    this.lights = [];     // pooled flash lights (added to scene once, intensity toggled)
    this.rings = [];      // expanding shockwave meshes
    this._burstPool = []; // reusable Points objects (see _acquireBurst)
    this._ringGeo = new THREE.RingGeometry(0.6, 0.85, 24);
    this._ringGeo.rotateX(-Math.PI / 2);
    this._sphereGeo = new THREE.SphereGeometry(1, 16, 12); // reused by blast cores
    this._debrisGeo = new THREE.DodecahedronGeometry(1, 0); // unit chunk, scaled per instance
    this._debrisPool = []; // reusable debris meshes (see _acquireDebrisChunk)
    this._scheduled = []; // dt-driven deferred sub-effects (respects slow-mo / hit-stop)
    this._blasts = [];     // expanding additive blast-core spheres (the detonation flash)
    // Unit-length +Y cylinder (centered) reused for the laser beam — scaled by
    // length and oriented per frame, positioned at the segment midpoint.
    this._beamGeo = new THREE.CylinderGeometry(0.05, 0.05, 1, 7, 1, true);
    this._beamUp = new THREE.Vector3(0, 1, 0);
    this._beamV0 = new THREE.Vector3();
    // Persistent laser beam — built once, repositioned/toggled each frame while
    // firing. Never added/removed per-frame (that would change the scene light
    // count and force a full material shader recompile every frame → stutter).
    this._laser = null;

    // Flash-light pool: added to the scene ONCE and never removed. Adding/removing
    // a light changes the scene light count, which forces Three.js to recompile the
    // shader of every lit material — at the Machine Gun's ~12.5 shots/s that meant a
    // recompile storm and the firing freeze. Now we only toggle intensity. The pool
    // grows on demand (when more flashes overlap than exist) and then stays put.
    for (let i = 0; i < 8; i++) this._spawnPoolLight();
  }

  _spawnPoolLight() {
    const light = new THREE.PointLight(0xffffff, 0, 5, 2);
    this.scene.add(light);
    const entry = { light, life: 0, maxLife: 0, intensity: 0 };
    this.lights.push(entry);
    return entry;
  }

  // Reusable particle-burst object. Each carries a fixed-capacity geometry so a burst
  // never allocates after warm-up; draw range limits it to the live particle count.
  _acquireBurst() {
    for (const e of this._burstPool) if (!e.active) return e;
    const positions = new Float32Array(MAX_BURST_PARTICLES * 3);
    const colors = new Float32Array(MAX_BURST_PARTICLES * 3); // Add per-particle colors
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3)); // Vertex colors
    const mat = new THREE.PointsMaterial({
      color: 0xffffff, size: 0.10, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
      vertexColors: true, // Enable vertex colors for variety
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.visible = false;
    points.layers.enable(BLOOM_LAYER); // additive particles glow in the post pipeline
    this.scene.add(points);
    const entry = { points, positions, colors, vels: new Float32Array(MAX_BURST_PARTICLES * 3),
      count: 0, life: 0, maxLife: 0, gravity: 0, active: false };
    this._burstPool.push(entry);
    return entry;
  }

  _buildLaser() {
    const group = new THREE.Group();
    group.visible = false;
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff3a4a, transparent: true,
      opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true,
      opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (const [mat, radius] of [[glowMat, 0.13], [coreMat, 0.05]]) {
      const m = new THREE.Mesh(this._beamGeo, mat);
      m.scale.set(radius / 0.05, 1, radius / 0.05);
      m.layers.enable(BLOOM_LAYER);
      group.add(m);
    }
    // One persistent muzzle-glow light (intensity toggled, never re-added).
    const light = new THREE.PointLight(0xff3a4a, 0, 6, 2);
    this.scene.add(group);
    this.scene.add(light);
    this._laser = { group, glow: group.children[0], core: group.children[1],
      glowMat, coreMat, light, ttl: 0 };
    return this._laser;
  }

  _burst(pos, { count, color, size, speed, spread = 1, up = 0.4, life = 0.5, gravity = 2, colorVariety = 0.15, drag = 0, fadeIn = 0 }) {
    count = Math.min(count, MAX_BURST_PARTICLES);
    const e = this._acquireBurst();
    const positions = e.positions, vels = e.vels, colors = e.colors;
    const baseColor = new THREE.Color(color);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;

      // More varied spherical distribution
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const v = speed * (0.3 + Math.random() * 0.7); // More speed variation
      vels[i * 3] = Math.sin(phi) * Math.cos(theta) * v * spread;
      vels[i * 3 + 1] = Math.abs(Math.cos(phi)) * v * up + v * 0.3;
      vels[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * v * spread;

      // Per-particle color variation for more colorful effects
      const variedColor = baseColor.clone();
      variedColor.offsetHSL(0, (Math.random() - 0.5) * colorVariety, (Math.random() - 0.5) * colorVariety * 0.5);
      colors[i * 3] = variedColor.r;
      colors[i * 3 + 1] = variedColor.g;
      colors[i * 3 + 2] = variedColor.b;
    }
    e.points.geometry.setDrawRange(0, count);
    e.points.geometry.attributes.position.needsUpdate = true;
    e.points.geometry.attributes.color.needsUpdate = true;
    e.points.material.size = size;
    e.points.material.opacity = 1;
    e.points.visible = true;
    e.count = count; e.life = life; e.maxLife = life; e.gravity = gravity;
    e.drag = drag; e.fadeIn = fadeIn; e._baseSize = 0;
    e.active = true;
    this.active.push(e);
  }

  // Defer a sub-effect by `t` seconds, advanced by update(dt) so the staging
  // honors hit-stop / slow-mo (a setTimeout would desync from scaled game time).
  _delay(t, fn) { this._scheduled.push({ t, fn }); }

  // Expanding white-hot blast sphere — the punchy detonation core. Grows with an
  // ease-out while opacity collapses fast, so it reads as a flash, not a bubble.
  _blastCore(pos, color, maxR, life) {
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const mesh = new THREE.Mesh(this._sphereGeo, mat);
    mesh.position.copy(pos);
    mesh.scale.setScalar(0.3);
    mesh.layers.enable(BLOOM_LAYER);
    this.scene.add(mesh);
    this._blasts.push({ mesh, mat, life, maxLife: life, maxR });
  }

  // Acquire a free pooled light (intensity toggled, never added/removed from the scene).
  _flash(pos, color, intensity, range) {
    let e = null;
    for (const l of this.lights) if (l.life <= 0) { e = l; break; }
    if (!e) e = this._spawnPoolLight();
    e.light.color.setHex(color);
    e.light.distance = range;
    e.light.position.copy(pos);
    e.light.intensity = intensity;
    e.intensity = intensity;
    e.life = 0.18; e.maxLife = 0.18;
  }

  _shockwave(pos, color, maxRadius, life) {
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(this._ringGeo, mat);
    mesh.position.set(pos.x, 0.06, pos.z);
    this.scene.add(mesh);
    this.rings.push({ mesh, life, maxLife: life, maxRadius });
  }

  // Reusable debris chunk: shared unit geometry (scaled per use) + own material
  // (color/emissive mutated on reuse, never recreated). Pooled like the burst/
  // light systems above — allocating a fresh DodecahedronGeometry + Material
  // per chunk per explosion was a stutter source at explosion-heavy moments
  // (Boomstick, spore deaths, tail swing all fire _debris() every hit/kill).
  _acquireDebrisChunk() {
    const m = this._debrisPool.pop();
    if (m) return m;
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.8, emissiveIntensity: 0.4, transparent: true });
    const mesh = new THREE.Mesh(this._debrisGeo, mat);
    mesh.castShadow = true;
    return mesh;
  }

  // Chunky debris flung outward with angular spin (VFX_SPEC §2.4).
  _debris(pos, color, count = 8, size = 0.12, speed = 6) {
    const chunks = [];
    const vels = [];
    const rots = [];
    for (let i = 0; i < count; i++) {
      const m = this._acquireDebrisChunk();
      m.material.color.setHex(color);
      m.material.emissive.setHex(color);
      m.material.opacity = 1;
      m.scale.setScalar(size * (0.7 + Math.random() * 0.6));
      m.position.copy(pos);
      m.rotation.set(0, 0, 0);
      this.scene.add(m);
      const theta = Math.random() * Math.PI * 2;
      const v = speed * (0.5 + Math.random() * 0.8);
      vels.push(Math.cos(theta) * v, 4 + Math.random() * speed, Math.sin(theta) * v);
      rots.push(Math.random() * 10, Math.random() * 10, Math.random() * 10);
      chunks.push(m);
    }
    this.debris = this.debris || [];
    this.debris.push({ chunks, vels, rots, life: 1.2, maxLife: 1.2, gravity: 14 });
  }

  muzzleFlash(pos, color = 0xc7e08a) {
    this._burst(pos, { count: 10, color, size: 0.08, speed: 5, spread: 0.5, life: 0.12, colorVariety: 0.2 });
    this._flash(pos, color, 6, 5);
  }

  // Explosive/ring detonation (Boomstick / Fire Bullet / Toroid). Scales with the
  // blast radius: fireball burst + smoke + twin flash + stacked shockwaves + debris.
  explosion(pos, color = 0xff7a2a, radius = 3) {
    const k = radius / 3;
    this._flash(pos, 0xffffff, 28, 14 * k);
    this._flash(pos, color, 20, 11 * k);
    // Main fireball - smaller, more colorful
    this._burst(pos, { count: 140, color, size: 0.18 * k, speed: 11 * k, spread: 1.1, up: 0.6, life: 0.6, colorVariety: 0.25 });
    // Bright core - very small, intense
    this._burst(pos, { count: 80, color: 0xffe6a0, size: 0.10 * k, speed: 14 * k, spread: 1.2, life: 0.3, colorVariety: 0.15 });
    // Smoke/debris - darker, slower
    this._burst(pos, { count: 40, color: 0x333333, size: 0.22 * k, speed: 3 * k, spread: 0.8, up: 1.0, life: 1.0, gravity: 0.8, colorVariety: 0.1 });
    // Sparks - very small, fast
    this._burst(pos, { count: 60, color: 0xffaa00, size: 0.06 * k, speed: 16 * k, spread: 1.3, life: 0.25, gravity: 3, colorVariety: 0.3 });
    this._debris(pos, color, 8, 0.12 * k, 9 * k);
    for (let i = 0; i < 3; i++) this._shockwave(pos, i === 0 ? 0xffffff : color, radius * (1.4 + i * 0.4), 0.35 + i * 0.12);
  }

  // Sustained laser beam (Laser Rifle): reposition the ONE persistent beam object
  // each frame the weapon fires. No per-frame allocation / scene mutation, so the
  // light count is stable and materials never recompile (the old per-frame version
  // froze the renderer). Held briefly via ttl so it reads as a continuous beam and
  // fades out a few frames after firing stops.
  beam(origin, end, color = 0xff3a4a) {
    const L = this._laser || this._buildLaser();
    const dir = this._beamV0.subVectors(end, origin);
    const len = dir.length();
    if (len < 0.05) return;
    L.glowMat.color.setHex(color);
    L.light.color.setHex(color);
    L.glow.scale.y = len;
    L.core.scale.y = len;
    L.group.position.copy(origin).addScaledVector(dir, 0.5);
    L.group.quaternion.setFromUnitVectors(this._beamUp, dir.normalize());
    L.light.position.copy(origin);
    L.group.visible = true;
    L.ttl = 0.05; // refreshed every fire frame; decays a hair after release
  }

  hitSpark(pos, color = 0xffffff) {
    this._burst(pos, { count: 16, color, size: 0.07, speed: 6, spread: 1.2, life: 0.3, colorVariety: 0.2 });
  }

  // Melee swoosh (kick): an outward spark burst + a ground shockwave
  // sized to the attack reach (HERO_SPEC §6.3).
  melee(pos, color = 0xffffff, radius = 2.6) {
    this._burst(pos, { count: 32, color, size: 0.10, speed: radius * 2.4, spread: 1.2, up: 0.4, life: 0.45, colorVariety: 0.15 });
    this._shockwave(pos, color, radius * 1.5, 0.4);
  }

  // Tail swing (R): a big, juicy 360° melee. A flat fan of low ground sparks
  // sells the sweep arc, twin stacked shockwave rings ripple out at the exact
  // damage radius, a white-hot core pops at the pivot, and a halo of debris +
  // up-kicked dust gives it weight (HERO_SPEC §6.3, JUICE_SPEC §12).
  tailSwing(pos, color = 0xc7e08a, radius = 4.0) {
    // Pivot flash + hot core — the wind-up "pop" right on the hero.
    this._flash(pos, 0xffffff, 22, radius * 3);
    this._flash(pos, color, 16, radius * 2.4);
    this._blastCore(pos, 0xffffff, radius * 0.55, 0.16);
    this._blastCore(pos, color, radius * 0.85, 0.28);

    // Low, fast, flat sweep of sparks hugging the ground — reads as the arc.
    this._burst(pos, { count: 90, color, size: 0.13, speed: radius * 3.2, spread: 1.5, up: 0.06, life: 0.34, gravity: 1.2, drag: 5, colorVariety: 0.22 });
    // White-hot leading edge thrown out hard then snapped by drag.
    this._burst(pos, { count: 60, color: 0xffffff, size: 0.08, speed: radius * 4.2, spread: 1.4, up: 0.04, life: 0.24, gravity: 1, drag: 7, colorVariety: 0.1 });

    // Twin shockwave rings at the strike radius, the 2nd a beat later for ripple.
    this._shockwave(pos, 0xffffff, radius * 1.0, 0.32);
    this._shockwave(pos, color, radius * 1.25, 0.45);
    this._delay(0.06, () => this._shockwave(pos, color, radius * 1.55, 0.5));

    // Chunky debris + up-kicked dust for follow-through weight.
    this._debris(pos, color, 10, 0.09, radius * 2.2);
    this._delay(0.04, () => {
      this._burst(pos, { count: 40, color: 0x9aa86a, size: 0.20, speed: 2.4, spread: 1.0, up: 0.9, life: 0.9, gravity: -0.5, drag: 1.8, fadeIn: 0.1, colorVariety: 0.08 });
    });
  }

  // Universal spore explosion (VFX_SPEC §2 + ENEMIES_SPEC §7): twin flash
  // lights, ~520 additive particles (lime + magenta + white-hot core + accent),
  // 3 stacked shockwaves, and chunky debris. The signature kill moment.
  spore(pos, accentColor = 0xffffff) {
    // --- Frame 0: blinding detonation — twin flash lights + expanding white-hot cores ---
    this._flash(pos, 0xffffff, 34, 18);
    this._flash(pos, accentColor, 24, 13);
    this._blastCore(pos, 0xffffff, 2.4, 0.16);   // hard, fast white pop
    this._blastCore(pos, accentColor, 3.6, 0.30); // slower accent-tinted bloom

    // White-hot needle sparks blasted out hard, then snapped to a halt by drag.
    this._burst(pos, { count: 130, color: 0xffffff, size: 0.09, speed: 17, spread: 1.3, up: 0.5, life: 0.34, gravity: 5, drag: 6, colorVariety: 0.1 });
    // Primary lime fireball shell — fast launch that eases out for a soft bloom.
    this._burst(pos, { count: 200, color: 0x9bff5a, size: 0.15, speed: 12, spread: 1.15, up: 0.7, life: 0.75, gravity: 3, drag: 3.4, colorVariety: 0.3 });

    // --- A beat later: secondary shells bloom outward, layering the expansion ---
    this._delay(0.05, () => {
      this._burst(pos, { count: 180, color: 0xff5ad0, size: 0.13, speed: 9.5, spread: 1.05, up: 0.6, life: 0.72, gravity: 3, drag: 3, colorVariety: 0.28 });
      this._burst(pos, { count: 130, color: accentColor, size: 0.11, speed: 7.5, spread: 0.95, up: 0.6, life: 0.66, gravity: 2.5, drag: 2.6, colorVariety: 0.22 });
      this._shockwave(pos, accentColor, 5.8, 0.5);
    });

    // --- Settle: dark smoke puff fades in and lifts; embers drift upward, lingering ---
    this._delay(0.04, () => {
      this._burst(pos, { count: 64, color: 0x26262c, size: 0.24, speed: 2.6, spread: 0.8, up: 1.2, life: 1.35, gravity: -0.6, drag: 1.6, fadeIn: 0.14, colorVariety: 0.05 });
    });
    this._delay(0.11, () => {
      this._burst(pos, { count: 80, color: 0xffd27a, size: 0.07, speed: 4, spread: 0.7, up: 1.5, life: 1.15, gravity: -1.3, drag: 1.3, colorVariety: 0.3 });
    });

    this._debris(pos, accentColor, 14, 0.10, 9);
    this._shockwave(pos, 0xffffff, 4.6, 0.4);
    this._delay(0.13, () => this._shockwave(pos, accentColor, 6.6, 0.55));
  }

  // Celebratory burst when an animal is freed (ANIMALS_SPEC §8) — gold + pink.
  rescueBurst(pos) {
    this._flash(pos, 0xffd6f0, 16, 9);
    this._burst(pos, { count: 40, color: 0xffd24a, size: 0.12, speed: 7, spread: 1.1, up: 0.8, life: 0.8, colorVariety: 0.2 });
    this._burst(pos, { count: 35, color: 0xff7ab0, size: 0.10, speed: 6, spread: 1.0, up: 0.7, life: 0.75, colorVariety: 0.25 });
    this._burst(pos, { count: 20, color: 0xffffff, size: 0.06, speed: 8, spread: 1.2, up: 0.5, life: 0.5, colorVariety: 0.1 });
  }

  update(dt) {
    const time = performance.now() * 0.001;

    // Fire any staged sub-effects whose delay has elapsed (dt-driven so the
    // explosion's timing tracks hit-stop / slow-mo instead of wall-clock).
    for (let i = this._scheduled.length - 1; i >= 0; i--) {
      const s = this._scheduled[i];
      s.t -= dt;
      if (s.t <= 0) { this._scheduled.splice(i, 1); s.fn(); }
    }

    // Expanding blast-core spheres: grow with ease-out, opacity collapses fast.
    for (let i = this._blasts.length - 1; i >= 0; i--) {
      const bc = this._blasts[i];
      bc.life -= dt;
      if (bc.life <= 0) { this.scene.remove(bc.mesh); bc.mat.dispose(); this._blasts.splice(i, 1); continue; }
      const t = 1 - bc.life / bc.maxLife;        // 0 → 1
      const ease = 1 - Math.pow(1 - t, 3);       // ease-out cubic
      bc.mesh.scale.setScalar(0.3 + ease * bc.maxR);
      bc.mat.opacity = (1 - t) * (1 - t);        // quadratic fade to nothing
    }

    for (let i = this.active.length - 1; i >= 0; i--) {
      const b = this.active[i];
      b.life -= dt;
      if (b.life <= 0) {
        b.points.visible = false; // returned to the pool — never disposed
        b.active = false;
        this.active.splice(i, 1);
        continue;
      }
      const arr = b.points.geometry.attributes.position.array;
      const cols = b.points.geometry.attributes.color?.array;
      const n = b.count * 3;
      const lifeRatio = b.life / b.maxLife;

      // Air drag damps launch velocity so shells decelerate and ease out
      // (the difference between a fluid bloom and particles flying off linearly).
      const damp = b.drag ? Math.exp(-b.drag * dt) : 1;
      for (let j = 0; j < n; j += 3) {
        if (b.drag) { b.vels[j] *= damp; b.vels[j + 1] *= damp; b.vels[j + 2] *= damp; }
        b.vels[j + 1] -= b.gravity * dt;

        // Add subtle spiral motion to particles
        const idx = j / 3;
        const spiral = Math.sin(time * 3 + idx * 0.1) * 0.3 * dt;

        arr[j] += (b.vels[j] + spiral) * dt;
        arr[j + 1] += b.vels[j + 1] * dt;
        arr[j + 2] += (b.vels[j + 2] + Math.cos(time * 2.5 + idx * 0.1) * 0.3 * dt) * dt;

        if (arr[j + 1] < 0) arr[j + 1] = 0;
      }
      b.points.geometry.attributes.position.needsUpdate = true;

      // Shimmer effect - pulse opacity with high-frequency variation
      const shimmer = 0.9 + Math.sin(time * 15 + i) * 0.1;
      // Optional fade-in ramp (smoke billows in rather than popping on at full alpha).
      const age = b.maxLife - b.life;
      const fade = b.fadeIn ? Math.min(1, age / b.fadeIn) : 1;
      b.points.material.opacity = lifeRatio * shimmer * fade;

      // Size pulsing for more dynamic feel
      const sizePulse = 0.85 + Math.sin(time * 8 + i * 0.5) * 0.15;
      b.points.material.size = b._baseSize || b.points.material.size;
      if (!b._baseSize) b._baseSize = b.points.material.size;
      b.points.material.size = b._baseSize * sizePulse * (0.5 + lifeRatio * 0.5);

      // Dynamic color shifting near end of life
      if (cols && lifeRatio < 0.3) {
        b.points.geometry.attributes.color.needsUpdate = true;
      }
    }

    // Pooled flash lights: fade by dimming intensity, never remove from the scene
    // (the light count must stay constant to avoid material shader recompiles).
    for (const l of this.lights) {
      if (l.life <= 0) continue;
      l.life -= dt;
      l.light.intensity = l.life <= 0 ? 0 : l.intensity * (l.life / l.maxLife);
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) {
        this.scene.remove(r.mesh);
        r.mesh.material.dispose();
        this.rings.splice(i, 1);
      } else {
        const t = 1 - r.life / r.maxLife;
        r.mesh.scale.setScalar(0.5 + t * r.maxRadius);
        r.mesh.material.opacity = 0.7 * (1 - t);
      }
    }

    // Persistent laser: fade the held beam out over its ttl, then hide it (kept in
    // the scene — never removed — so the light count stays constant).
    const L = this._laser;
    if (L && L.group.visible) {
      L.ttl -= dt;
      if (L.ttl <= 0) {
        L.group.visible = false;
        L.light.intensity = 0;
      } else {
        const f = Math.min(1, L.ttl / 0.05);
        L.glowMat.opacity = 0.5 * f;
        L.coreMat.opacity = 1.0 * f;
        L.light.intensity = 7 * f;
        // Subtle core flicker so the beam looks like live energy, not a static bar.
        L.core.scale.x = L.core.scale.z = 1 + Math.sin(performance.now() * 0.05) * 0.15;
      }
    }

    // Debris: fling + spin + gravity + fade, then retire (VFX_SPEC §2.4).
    if (this.debris) {
      for (let i = this.debris.length - 1; i >= 0; i--) {
        const d = this.debris[i];
        d.life -= dt;
        if (d.life <= 0) {
          for (const c of d.chunks) { this.scene.remove(c); this._debrisPool.push(c); }
          this.debris.splice(i, 1);
          continue;
        }
        const fade = d.life / d.maxLife;
        for (let j = 0; j < d.chunks.length; j++) {
          const c = d.chunks[j];
          d.vels[j * 3 + 1] -= d.gravity * dt;
          c.position.x += d.vels[j * 3] * dt;
          c.position.y += d.vels[j * 3 + 1] * dt;
          c.position.z += d.vels[j * 3 + 2] * dt;
          if (c.position.y < 0.1) { c.position.y = 0.1; d.vels[j * 3 + 1] *= -0.3; }
          c.rotation.x += d.rots[j * 3] * dt;
          c.rotation.y += d.rots[j * 3 + 1] * dt;
          c.material.opacity = fade;
          c.material.transparent = true;
        }
      }
    }
  }

  // Clear all dynamic VFX (called on level restart to prevent accumulation).
  // Clears rings, debris, and active bursts, but keeps pooled resources (lights,
  // burst pool, debris chunk pool).
  clear() {
    // Drop any pending staged sub-effects and dispose live blast-core spheres.
    this._scheduled.length = 0;
    for (const bc of this._blasts) { this.scene.remove(bc.mesh); bc.mat.dispose(); }
    this._blasts.length = 0;

    // Clear and dispose all shockwave rings
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      this.scene.remove(r.mesh);
      r.mesh.material.dispose();
    }
    this.rings.length = 0;

    // Return all live debris chunks to the pool (never disposed — reused)
    if (this.debris) {
      for (const d of this.debris) {
        for (const c of d.chunks) {
          this.scene.remove(c);
          this._debrisPool.push(c);
        }
      }
      this.debris.length = 0;
    }

    // Reset all active bursts to pool
    for (const b of this.active) {
      b.points.visible = false;
      b.active = false;
    }
    this.active.length = 0;

    // Hide laser beam
    if (this._laser) {
      this._laser.group.visible = false;
      this._laser.light.intensity = 0;
      this._laser.ttl = 0;
    }
  }
}
