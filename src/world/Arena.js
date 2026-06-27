import * as THREE from 'three';
import { ARENA } from '../config/Constants.js';
import { randRange, randInt } from '../util/MathUtils.js';

// Misty Forest arena (LEVELS_SPEC L1). M1 scope: ground, sky, fog, lighting,
// boundary, scattered trees, a raised central platform with stairs, and a
// boss-end landmark placeholder. Set-piece detail expands in M3.
export class Arena {
  constructor(scene) {
    this.scene = scene;
    this.colliders = []; // {type:'cylinder', x, z, r} tree trunks etc. (used later)
    this._build();
  }

  _build() {
    const scene = this.scene;

    // --- Sky + fog (pale misty daylight) ---
    scene.background = new THREE.Color(0x9fc8d6);
    scene.fog = new THREE.Fog(0xa9cdd0, 35, 130);

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
    const groundMat = new THREE.MeshToonMaterial({ color: 0x4f7a3a });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.receiveShadow = true;
    scene.add(ground);

    // Stone path down the center lane (visual).
    const pathGeo = new THREE.PlaneGeometry(4.2, ARENA.LENGTH - 6);
    pathGeo.rotateX(-Math.PI / 2);
    const path = new THREE.Mesh(pathGeo, new THREE.MeshToonMaterial({ color: 0x7d8a72 }));
    path.position.y = 0.01;
    path.receiveShadow = true;
    scene.add(path);

    // --- Boundary walls (low decorative hedges marking the arena edge) ---
    this._boundary();

    // --- Trees scattered off the lane ---
    this._trees();

    // --- Raised central platform + stairs ---
    this._platform();

    // --- Boss-end landmark: giant violet mushroom ---
    this._bossLandmark();

    // --- Spawn telegraph rings near east end (visual placeholder) ---
    for (let i = 0; i < 3; i++) {
      this._spawnRing(randRange(-8, 8), ARENA.LENGTH / 2 - randRange(6, 14));
    }
  }

  _boundary() {
    const mat = new THREE.MeshToonMaterial({ color: 0x2f5a2c });
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
      new THREE.MeshToonMaterial({ color: 0x6b7d5a })
    );
    top.position.set(0, h / 2, 4);
    top.castShadow = true; top.receiveShadow = true;
    this.scene.add(top);
    // Mossy top cap
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(10.2, 0.2, 10.2),
      new THREE.MeshToonMaterial({ color: 0x5a8a3f })
    );
    cap.position.set(0, h + 0.1, 4);
    this.scene.add(cap);
    // Corner pillars
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const pil = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.45, h + 1.2, 8),
        new THREE.MeshToonMaterial({ color: 0x8a8475 })
      );
      pil.position.set(sx * 4.4, (h + 1.2) / 2, 4 + sz * 4.4);
      pil.castShadow = true;
      this.scene.add(pil);
    }
    // Stairs (steps 0.625 high → above nav climb, per spec)
    const steps = 5;
    for (let i = 0; i < steps; i++) {
      const sh = (i + 1) * (h / steps);
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(3, sh, 1.0),
        new THREE.MeshToonMaterial({ color: 0x7d7363 })
      );
      step.position.set(0, sh / 2, 4 - 5 - i * 1.0);
      step.castShadow = true; step.receiveShadow = true;
      this.scene.add(step);
    }
    this.platform = top;
  }

  _bossLandmark() {
    const g = new THREE.Group();
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.8, 7, 12),
      new THREE.MeshToonMaterial({ color: 0xe8dcc0 })
    );
    stem.position.y = 3.5;
    stem.castShadow = true;
    g.add(stem);
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(4.5, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshToonMaterial({ color: 0x7a3fa0, emissive: 0x2a0f40, emissiveIntensity: 0.6 })
    );
    cap.position.y = 7;
    cap.castShadow = true;
    g.add(cap);
    // Glowing spots
    for (let i = 0; i < 10; i++) {
      const spot = new THREE.Mesh(
        new THREE.SphereGeometry(randRange(0.3, 0.6), 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xc89bff })
      );
      const a = randRange(0, Math.PI * 2), r = randRange(1.5, 3.8);
      spot.position.set(Math.cos(a) * r, 7 + randRange(0.5, 2.5), Math.sin(a) * r * 0.5);
      g.add(spot);
    }
    g.position.set(0, 0, ARENA.LENGTH / 2 - 4);
    this.scene.add(g);
    // Eerie glow light
    const glow = new THREE.PointLight(0xa060ff, 30, 30, 2);
    glow.position.set(0, 8, ARENA.LENGTH / 2 - 4);
    this.scene.add(glow);
  }

  _spawnRing(x, z) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.6, 0.12, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0x7fff9f, transparent: true, opacity: 0.7 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.05, z);
    this.scene.add(ring);
  }
}
