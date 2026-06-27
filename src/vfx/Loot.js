import * as THREE from 'three';

// Gold "acorn" loot (ENEMIES_SPEC §7.2 / JUICE). On enemy death a few acorns
// pop out, scatter under gravity, then after a short delay magnetize toward the
// camera; on arrival each credits 1 gold to the GameManager and pulses the HUD.
const SCATTER_DELAY = 0.35;
const MAGNET_SPEED = 18;

export class Loot {
  constructor(scene, gameManager, hud) {
    this.scene = scene;
    this.gameManager = gameManager;
    this.hud = hud;
    this.items = [];
    this._geo = new THREE.IcosahedronGeometry(0.13, 0);
    this._mat = new THREE.MeshToonMaterial({ color: 0xe8c14a, emissive: 0x4a3a00, emissiveIntensity: 0.5 });
    this._tmp = new THREE.Vector3();
  }

  spawnGold(pos, amount) {
    for (let i = 0; i < amount; i++) {
      const mesh = new THREE.Mesh(this._geo, this._mat);
      mesh.position.set(pos.x, pos.y + 0.4, pos.z);
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.items.push({
        mesh,
        vel: new THREE.Vector3((Math.random() - 0.5) * 4, 4 + Math.random() * 2, (Math.random() - 0.5) * 4),
        delay: SCATTER_DELAY,
        spin: Math.random() * 6 - 3,
      });
    }
  }

  update(dt, cameraPos) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.mesh.rotation.y += it.spin * dt;

      if (it.delay > 0) {
        it.delay -= dt;
        it.vel.y -= 22 * dt;
        it.mesh.position.addScaledVector(it.vel, dt);
        if (it.mesh.position.y < 0.13) { it.mesh.position.y = 0.13; it.vel.y *= -0.4; }
      } else {
        // Magnetize toward the camera; collect on contact.
        this._tmp.copy(cameraPos).sub(it.mesh.position);
        const dist = this._tmp.length();
        if (dist < 0.8) {
          this.gameManager.addGold(1);
          this.hud?.pulseGold();
          this.scene.remove(it.mesh);
          this.items.splice(i, 1);
          continue;
        }
        it.mesh.position.addScaledVector(this._tmp.normalize(), MAGNET_SPEED * dt);
      }
    }
  }
}
