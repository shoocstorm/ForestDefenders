import * as THREE from 'three';
import { ARENA } from '../config/Constants.js';
import { randRange } from '../util/MathUtils.js';

// Low drifting mist banks (production-visual pass). A handful of large, soft,
// horizontal alpha cards floating just above the ground and slowly drifting /
// spinning read as layered ground fog from the player's eye height — the cheap
// stand-in for volumetrics that ships in most stylised games. Density, tint
// and speed are biome-driven (BIOMES[].mist).
//
// The blob texture is generated once on a canvas (radial falloff); cards are
// non-uniformly scaled and rotated so the shared texture never repeats
// visibly. Depth-write is off so cards blend with each other and with the
// water/ground instead of cutting them.
let _blobTex;
function blobTexture() {
  if (_blobTex) return _blobTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(128, 128, 8, 128, 128, 126);
  g.addColorStop(0.0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  _blobTex = new THREE.CanvasTexture(c);
  return _blobTex;
}

export class GroundFog {
  constructor(scene, cfg = {}) {
    this.scene = scene;
    this.cards = [];
    const count = cfg.count ?? 0;
    if (!count) return;
    const [minS, maxS] = cfg.size ?? [14, 26];
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2); // lie flat, face up
    const mat = new THREE.MeshBasicMaterial({
      map: blobTexture(), color: cfg.color ?? 0xd0e0e4, transparent: true,
      opacity: cfg.opacity ?? 0.1, depthWrite: false, fog: true,
    });
    this.speed = cfg.speed ?? 0.35;
    this.drift = new THREE.Vector2(1, 0.22).normalize().multiplyScalar(this.speed);
    this.geo = geo;
    this.mat = mat;
    const spanX = ARENA.WIDTH / 2 + 14, spanZ = ARENA.LENGTH / 2 + 10;
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, mat);
      const sx = randRange(minS, maxS);
      m.scale.set(sx, 1, sx * randRange(0.5, 0.9)); // elliptical blobs
      m.position.set(randRange(-spanX, spanX), randRange(0.35, 1.5), randRange(-spanZ, spanZ));
      m.rotation.y = randRange(0, Math.PI * 2);
      m.renderOrder = 6; // among the transparents, above rings/water
      m.userData.baseY = m.position.y;
      m.userData.phase = randRange(0, Math.PI * 2);
      m.userData.spin = randRange(-0.02, 0.02);
      scene.add(m);
      this.cards.push(m);
    }
    this._spanX = spanX;
  }

  update(dt, t) {
    for (const m of this.cards) {
      m.position.x += this.drift.x * dt;
      m.position.z += this.drift.y * dt;
      // Wrap around the arena so the banks never all pile up downwind.
      if (m.position.x > this._spanX) m.position.x = -this._spanX;
      m.rotation.y += m.userData.spin * dt;
      m.position.y = m.userData.baseY + Math.sin(t * 0.3 + m.userData.phase) * 0.15;
    }
  }

  dispose() {
    for (const m of this.cards) this.scene.remove(m);
    this.cards.length = 0;
    this.geo?.dispose();
    this.mat?.dispose();
    // NOTE: the blob CanvasTexture is intentionally shared/module-level.
  }
}
