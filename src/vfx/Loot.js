import * as THREE from 'three';

// Gold coin loot (ENEMIES_SPEC §7.2 / JUICE). On enemy death a few coins pop
// out, scatter under gravity, then after a short delay magnetize toward the
// player's chest (NOT the camera, so they never block the view); on arrival
// each credits 1 gold to the GameManager, pulses the HUD and pings a spark.
const SCATTER_DELAY = 0.3;
const MAGNET_ACCEL = 55;   // ramps the suck so it accelerates into the player
const MAGNET_MAX = 26;
const COLLECT_DIST = 0.7;
const TORSO_Y = 1.05;      // aim above the player's feet so coins sweep low-screen

export class Loot {
  constructor(scene, gameManager, hud, vfx, audio) {
    this.scene = scene;
    this.gameManager = gameManager;
    this.hud = hud;
    this.vfx = vfx;
    this._audio = audio;
    this.items = [];
    // A flat, faceted coin reads unambiguously as gold and flashes as it spins.
    this._geo = new THREE.CylinderGeometry(0.15, 0.15, 0.045, 10);
    this._mat = new THREE.MeshToonMaterial({
      color: 0xffcc33,
      emissive: 0xffaa00,
      emissiveIntensity: 0.7,
    });
    this._target = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
  }

  spawnGold(pos, amount) {
    for (let i = 0; i < amount; i++) {
      const mesh = new THREE.Mesh(this._geo, this._mat);
      mesh.position.set(pos.x, pos.y + 0.4, pos.z);
      // Tilt so the coin face catches the light as it tumbles.
      mesh.rotation.set(Math.random() * Math.PI, 0, Math.random() * 0.6 - 0.3);
      mesh.scale.setScalar(0.01);
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.items.push({
        mesh,
        vel: new THREE.Vector3((Math.random() - 0.5) * 4.5, 5 + Math.random() * 2.5, (Math.random() - 0.5) * 4.5),
        delay: SCATTER_DELAY + Math.random() * 0.12,
        spin: 8 + Math.random() * 6,
        magSpeed: 4,
        t: 0,
      });
    }
  }

  // `playerPos` is the player's feet position; coins home to the chest above it.
  update(dt, playerPos) {
    this._target.set(playerPos.x, playerPos.y + TORSO_Y, playerPos.z);

    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      it.mesh.rotation.y += it.spin * dt;

      // Snappy pop-in with a little overshoot (back-ease-out), then full size.
      if (it.t < 0.22) {
        const k = it.t / 0.22;
        const s = 2.4;
        it.mesh.scale.setScalar(1 + (s + 1) * Math.pow(k - 1, 3) + s * Math.pow(k - 1, 2));
      } else {
        it.mesh.scale.setScalar(1);
      }

      if (it.delay > 0) {
        it.delay -= dt;
        it.vel.y -= 22 * dt;
        it.mesh.position.addScaledVector(it.vel, dt);
        if (it.mesh.position.y < 0.15) { it.mesh.position.y = 0.15; it.vel.y *= -0.45; it.vel.x *= 0.7; it.vel.z *= 0.7; }
      } else {
        // Accelerating magnet toward the chest; collect on contact.
        this._tmp.copy(this._target).sub(it.mesh.position);
        const dist = this._tmp.length();
        if (dist < COLLECT_DIST) {
          this.gameManager.addGold(1);
          this.hud?.pulseGold();
          this.vfx?.hitSpark?.(it.mesh.position, 0xffd24a);
          this._audio?.coin();
          this.scene.remove(it.mesh);
          this.items.splice(i, 1);
          continue;
        }
        it.magSpeed = Math.min(MAGNET_MAX, it.magSpeed + MAGNET_ACCEL * dt);
        it.mesh.position.addScaledVector(this._tmp.normalize(), it.magSpeed * dt);
        it.spin = 14; // spin faster while being sucked in
      }
    }
  }
}
