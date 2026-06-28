import * as THREE from 'three';
import { BLOOM_LAYER } from '../config/Constants.js';

// Lightweight particle/light VFX manager. Each effect is a short-lived additive
// THREE.Points cloud (+ optional flash light + expanding shockwave rings) tracked
// in `this.active` and advanced/retired in update(). M2 ships muzzle flash, hit
// spark and a simplified spore explosion; the full ~520-particle death burst and
// per-weapon flashes land in M4 (JUICE_SPEC §10).
export class VFX {
  constructor(scene) {
    this.scene = scene;
    this.active = [];     // particle bursts
    this.lights = [];     // fading flash lights
    this.rings = [];      // expanding shockwave meshes
    this.beams = [];      // instant hit-scan beams (laser)
    this._ringGeo = new THREE.RingGeometry(0.6, 0.85, 24);
    this._ringGeo.rotateX(-Math.PI / 2);
    // Unit-length +Y cylinder (centered) reused for every beam — scaled by length
    // and oriented per shot, positioned at the segment midpoint.
    this._beamGeo = new THREE.CylinderGeometry(0.05, 0.05, 1, 7, 1, true);
    this._beamUp = new THREE.Vector3(0, 1, 0);
    this._beamV0 = new THREE.Vector3();
  }

  _burst(pos, { count, color, size, speed, spread = 1, up = 0.4, life = 0.5, gravity = 2 }) {
    const positions = new Float32Array(count * 3);
    const vels = new Float32Array(count * 3);
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
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color, size, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.layers.enable(BLOOM_LAYER); // additive particles glow in the post pipeline
    this.scene.add(points);
    this.active.push({ points, vels, life, maxLife: life, gravity });
  }

  _flash(pos, color, intensity, range) {
    const light = new THREE.PointLight(color, intensity, range, 2);
    light.position.copy(pos);
    this.scene.add(light);
    this.lights.push({ light, life: 0.18, maxLife: 0.18, intensity });
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

  // Instant beam (Laser Rifle): a thin glowing cylinder origin→end that flashes out.
  beam(origin, end, color = 0xff3a4a) {
    const dir = this._beamV0.subVectors(end, origin);
    const len = dir.length();
    if (len < 0.01) return;
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const mesh = new THREE.Mesh(this._beamGeo, mat);
    mesh.scale.set(1, len, 1);
    mesh.position.copy(origin).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(this._beamUp, dir.normalize());
    mesh.layers.enable(BLOOM_LAYER);
    this.scene.add(mesh);
    this.beams.push({ mesh, life: 0.09, maxLife: 0.09 });
    this._flash(end, color, 10, 4);
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
        this.scene.remove(b.points);
        b.points.geometry.dispose();
        b.points.material.dispose();
        this.active.splice(i, 1);
        continue;
      }
      const arr = b.points.geometry.attributes.position.array;
      for (let j = 0; j < b.vels.length; j += 3) {
        b.vels[j + 1] -= b.gravity * dt;
        arr[j] += b.vels[j] * dt;
        arr[j + 1] += b.vels[j + 1] * dt;
        arr[j + 2] += b.vels[j + 2] * dt;
        if (arr[j + 1] < 0) arr[j + 1] = 0;
      }
      b.points.geometry.attributes.position.needsUpdate = true;
      b.points.material.opacity = b.life / b.maxLife;
    }

    for (let i = this.lights.length - 1; i >= 0; i--) {
      const l = this.lights[i];
      l.life -= dt;
      if (l.life <= 0) {
        this.scene.remove(l.light);
        this.lights.splice(i, 1);
      } else {
        l.light.intensity = l.intensity * (l.life / l.maxLife);
      }
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

    // Beams: hold a moment then flash out.
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.life -= dt;
      if (b.life <= 0) {
        this.scene.remove(b.mesh);
        b.mesh.material.dispose();
        this.beams.splice(i, 1);
      } else {
        b.mesh.material.opacity = 0.9 * (b.life / b.maxLife);
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
}
