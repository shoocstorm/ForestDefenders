import * as THREE from 'three';

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
    this._ringGeo = new THREE.RingGeometry(0.6, 0.85, 24);
    this._ringGeo.rotateX(-Math.PI / 2);
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

  muzzleFlash(pos, color = 0xc7e08a) {
    this._burst(pos, { count: 10, color, size: 0.16, speed: 4, spread: 0.6, life: 0.18 });
    this._flash(pos, color, 6, 5);
  }

  hitSpark(pos, color = 0xffffff) {
    this._burst(pos, { count: 12, color, size: 0.13, speed: 5, spread: 1, life: 0.25 });
  }

  // Simplified universal spore explosion (full version is M4).
  spore(pos, accentColor = 0xffffff) {
    this._flash(pos, 0xffffff, 26, 15);
    this._flash(pos, accentColor, 18, 11);
    this._burst(pos, { count: 60, color: 0x9bff5a, size: 0.3, speed: 7, spread: 1, life: 0.6 });
    this._burst(pos, { count: 50, color: 0xff5ad0, size: 0.26, speed: 6, spread: 1, life: 0.6 });
    this._burst(pos, { count: 28, color: 0xffffff, size: 0.18, speed: 9, spread: 1, life: 0.45 });
    this._burst(pos, { count: 24, color: accentColor, size: 0.22, speed: 5, spread: 1, life: 0.55 });
    for (let i = 0; i < 3; i++) this._shockwave(pos, accentColor, 5.0, 0.4 + i * 0.12);
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
  }
}
