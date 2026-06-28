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
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff, size: 0.16, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.visible = false;
    points.layers.enable(BLOOM_LAYER); // additive particles glow in the post pipeline
    this.scene.add(points);
    const entry = { points, positions, vels: new Float32Array(MAX_BURST_PARTICLES * 3),
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

  _burst(pos, { count, color, size, speed, spread = 1, up = 0.4, life = 0.5, gravity = 2 }) {
    count = Math.min(count, MAX_BURST_PARTICLES);
    const e = this._acquireBurst();
    const positions = e.positions, vels = e.vels;
    for (let i = 0; i < count; i++) {
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const v = speed * (0.4 + Math.random() * 0.6);
      vels[i * 3] = Math.sin(phi) * Math.cos(theta) * v * spread;
      vels[i * 3 + 1] = Math.abs(Math.cos(phi)) * v * up + v * 0.3;
      vels[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * v * spread;
    }
    e.points.geometry.setDrawRange(0, count);
    e.points.geometry.attributes.position.needsUpdate = true;
    e.points.material.color.set(color);
    e.points.material.size = size;
    e.points.material.opacity = 1;
    e.points.visible = true;
    e.count = count; e.life = life; e.maxLife = life; e.gravity = gravity;
    e.active = true;
    this.active.push(e);
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

  // Chunky debris flung outward with angular spin (VFX_SPEC §2.4).
  _debris(pos, color, count = 8, size = 0.12, speed = 6) {
    const chunks = [];
    const vels = [];
    const rots = [];
    for (let i = 0; i < count; i++) {
      const geo = new THREE.DodecahedronGeometry(size * (0.7 + Math.random() * 0.6), 0);
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, emissive: color, emissiveIntensity: 0.4 });
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(pos);
      m.castShadow = true;
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
    this._burst(pos, { count: 10, color, size: 0.16, speed: 4, spread: 0.6, life: 0.18 });
    this._flash(pos, color, 6, 5);
  }

  // Explosive/ring detonation (Boomstick / Fire Bullet / Toroid). Scales with the
  // blast radius: fireball burst + smoke + twin flash + stacked shockwaves + debris.
  explosion(pos, color = 0xff7a2a, radius = 3) {
    const k = radius / 3;
    this._flash(pos, 0xffffff, 28, 14 * k);
    this._flash(pos, color, 20, 11 * k);
    this._burst(pos, { count: 120, color, size: 0.34 * k, speed: 10 * k, spread: 1, up: 0.5, life: 0.55 });
    this._burst(pos, { count: 70, color: 0xffe6a0, size: 0.22 * k, speed: 13 * k, spread: 1, life: 0.35 });
    this._burst(pos, { count: 50, color: 0x444444, size: 0.4 * k, speed: 4 * k, spread: 1, up: 0.8, life: 0.9, gravity: 0.5 });
    this._debris(pos, color, 8, 0.14 * k, 8 * k);
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
    this._burst(pos, { count: 12, color, size: 0.13, speed: 5, spread: 1, life: 0.25 });
  }

  // Melee swoosh (kick / tail swing): an outward spark burst + a ground shockwave
  // sized to the attack reach (HERO_SPEC §6.3).
  melee(pos, color = 0xffffff, radius = 2.6) {
    this._burst(pos, { count: 26, color, size: 0.18, speed: radius * 2.2, spread: 1, up: 0.3, life: 0.4 });
    this._shockwave(pos, color, radius * 1.5, 0.4);
  }

  // Universal spore explosion (VFX_SPEC §2 + ENEMIES_SPEC §7): twin flash
  // lights, ~520 additive particles (lime + magenta + white-hot core + accent),
  // 3 stacked shockwaves, and chunky debris. The signature kill moment.
  spore(pos, accentColor = 0xffffff) {
    this._flash(pos, 0xffffff, 26, 15);
    this._flash(pos, accentColor, 18, 11);
    this._burst(pos, { count: 180, color: 0x9bff5a, size: 0.28, speed: 8, spread: 1, life: 0.65 });
    this._burst(pos, { count: 150, color: 0xff5ad0, size: 0.24, speed: 7, spread: 1, life: 0.6 });
    this._burst(pos, { count: 110, color: 0xffffff, size: 0.16, speed: 11, spread: 1, life: 0.4 });
    this._burst(pos, { count: 80, color: accentColor, size: 0.2, speed: 6, spread: 1, life: 0.55 });
    this._debris(pos, accentColor, 10, 0.14, 7);
    for (let i = 0; i < 3; i++) this._shockwave(pos, i === 0 ? 0xffffff : accentColor, 5.0 + i * 0.5, 0.4 + i * 0.12);
  }

  // Celebratory burst when an animal is freed (ANIMALS_SPEC §8) — gold + pink.
  rescueBurst(pos) {
    this._flash(pos, 0xffd6f0, 14, 8);
    this._burst(pos, { count: 30, color: 0xffd24a, size: 0.22, speed: 6, spread: 1, up: 0.7, life: 0.75 });
    this._burst(pos, { count: 24, color: 0xff7ab0, size: 0.2, speed: 5, spread: 1, up: 0.6, life: 0.75 });
  }

  update(dt) {
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
      const n = b.count * 3;
      for (let j = 0; j < n; j += 3) {
        b.vels[j + 1] -= b.gravity * dt;
        arr[j] += b.vels[j] * dt;
        arr[j + 1] += b.vels[j + 1] * dt;
        arr[j + 2] += b.vels[j + 2] * dt;
        if (arr[j + 1] < 0) arr[j + 1] = 0;
      }
      b.points.geometry.attributes.position.needsUpdate = true;
      b.points.material.opacity = b.life / b.maxLife;
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
          for (const c of d.chunks) { this.scene.remove(c); c.geometry.dispose(); c.material.dispose(); }
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
  // Clears rings, debris, and active bursts, but keeps pooled resources (lights, burst pool).
  clear() {
    // Clear and dispose all shockwave rings
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      this.scene.remove(r.mesh);
      r.mesh.material.dispose();
    }
    this.rings.length = 0;

    // Clear and dispose all debris chunks
    if (this.debris) {
      for (const d of this.debris) {
        for (const c of d.chunks) {
          this.scene.remove(c);
          c.geometry.dispose();
          c.material.dispose();
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
