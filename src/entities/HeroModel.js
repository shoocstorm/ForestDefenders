import * as THREE from 'three';

// Procedural "Squrriel" hero built from primitives (HERO_SPEC §1).
// Feet at origin (y=0), ~1.05 units tall, faces -Z (game forward).
// Exposes named pivots so the locomotion animator can drive limbs/tail.
//
// A skinned GLB can replace this later; the public interface (group + pivots
// + setPose hooks) is what Player.js depends on.

const FUR = 0xe07a32;       // warm orange
const FUR_DARK = 0xb85e22;
const CREAM = 0xf4e0bd;     // belly / tail tip
const VEST = 0x3f7d3f;      // green utility vest
const BELT = 0x6b4423;
const GOLD = 0xe8c14a;
const GOGGLE = 0x2a3a44;
const GOGGLE_LENS = 0x9fd9e8;
const EYE = 0x16110d;
const WOOD = 0x8a5a2b;
const STEEL = 0x70787f;

function toon(color, opts = {}) {
  return new THREE.MeshToonMaterial({ color, ...opts });
}

// Add an inverted-hull outline child to a mesh (cel-shaded look).
function addOutline(mesh, thickness = 0.012) {
  const outlineMat = new THREE.MeshBasicMaterial({ color: 0x10180f, side: THREE.BackSide });
  const outline = new THREE.Mesh(mesh.geometry, outlineMat);
  outline.scale.multiplyScalar(1 + thickness / Math.max(0.05, mesh.geometry.boundingSphere?.radius ?? 0.3));
  // Simpler robust approach: push along normals via slight uniform scale.
  outline.scale.set(1.06, 1.06, 1.06);
  mesh.add(outline);
  return mesh;
}

export class HeroModel {
  constructor() {
    this.group = new THREE.Group();
    this.pivots = {};
    this._build();
  }

  _mesh(geo, mat, parent, pos = [0, 0, 0], outline = true) {
    geo.computeBoundingSphere?.();
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    m.castShadow = true;
    if (outline) addOutline(m);
    parent.add(m);
    return m;
  }

  _build() {
    const g = this.group;

    // --- Torso (slightly egg-shaped) ---
    const torso = new THREE.Group();
    torso.position.y = 0.52;
    g.add(torso);
    this.pivots.torso = torso;

    const bodyGeo = new THREE.CapsuleGeometry(0.22, 0.18, 6, 12);
    this._mesh(bodyGeo, toon(FUR), torso, [0, 0, 0]);
    // Cream belly patch
    this._mesh(new THREE.SphereGeometry(0.17, 12, 10), toon(CREAM), torso, [0, -0.02, 0.12], false);
    // Vest
    const vestGeo = new THREE.CapsuleGeometry(0.235, 0.12, 5, 12);
    const vest = this._mesh(vestGeo, toon(VEST), torso, [0, 0.02, -0.01], false);
    vest.scale.set(1, 1, 0.85);
    // Belt + buckle
    this._mesh(new THREE.TorusGeometry(0.22, 0.03, 8, 16), toon(BELT), torso, [0, -0.18, 0], false)
      .rotation.x = Math.PI / 2;
    this._mesh(new THREE.BoxGeometry(0.07, 0.06, 0.04), toon(GOLD, { emissive: 0x3a2e00 }), torso, [0, -0.18, 0.21], false);

    // --- Head ---
    const head = new THREE.Group();
    head.position.y = 0.34;
    torso.add(head);
    this.pivots.head = head;
    this._mesh(new THREE.SphereGeometry(0.27, 16, 14), toon(FUR), head, [0, 0, 0]);
    // Cheeks / muzzle
    this._mesh(new THREE.SphereGeometry(0.15, 12, 10), toon(CREAM), head, [0, -0.05, 0.2], false);
    // Ears
    for (const sx of [-1, 1]) {
      const ear = this._mesh(new THREE.ConeGeometry(0.08, 0.18, 8), toon(FUR), head, [sx * 0.16, 0.26, -0.02]);
      ear.rotation.z = sx * -0.25;
      this._mesh(new THREE.ConeGeometry(0.045, 0.1, 8), toon(CREAM), ear, [0, 0.0, 0.01], false);
    }
    // Eyes (with catch-light)
    for (const sx of [-1, 1]) {
      this._mesh(new THREE.SphereGeometry(0.06, 10, 8), toon(EYE), head, [sx * 0.11, 0.02, 0.23], false);
      this._mesh(new THREE.SphereGeometry(0.018, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), head, [sx * 0.13, 0.05, 0.27], false);
    }
    // Nose
    this._mesh(new THREE.SphereGeometry(0.035, 8, 8), toon(0x3a2018), head, [0, -0.04, 0.32], false);
    // Goggles on forehead
    const goggleBand = this._mesh(new THREE.TorusGeometry(0.22, 0.035, 8, 18), toon(GOGGLE), head, [0, 0.16, 0.04], false);
    goggleBand.rotation.x = Math.PI / 2 - 0.3;
    for (const sx of [-1, 1]) {
      this._mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 12), toon(GOGGLE), head, [sx * 0.12, 0.2, 0.16], false)
        .rotation.x = Math.PI / 2;
      this._mesh(new THREE.CircleGeometry(0.055, 12), new THREE.MeshBasicMaterial({ color: GOGGLE_LENS }), head, [sx * 0.12, 0.2, 0.19], false)
        .rotation.x = 0;
    }

    // --- Tail (big bushy; arcs up behind the back then curls forward over it) ---
    // Spheres are placed along a baked arc in the tail's local frame so the whole
    // bush sways as one rigid group (driven by pivots.tail rotation in the animator).
    const tail = new THREE.Group();
    tail.position.set(0, 0.0, -0.22); // lower back, just behind the torso
    torso.add(tail);
    this.pivots.tail = tail;
    const tailColors = [FUR_DARK, FUR, FUR, FUR, CREAM, CREAM];
    const tailSizes = [0.15, 0.22, 0.26, 0.25, 0.21, 0.16];
    const segs = tailColors.length;
    const step = 0.17;
    let ty = 0, tz = 0;
    for (let i = 0; i < segs; i++) {
      // Direction angle sweeps from up-and-back (-0.7) to up-and-forward (1.5),
      // measured from +Y toward +Z (front), producing the squirrel "?" curl.
      const phi = -0.7 + 2.2 * ((i + 0.5) / segs);
      ty += Math.cos(phi) * step;
      tz += Math.sin(phi) * step;
      this._mesh(new THREE.SphereGeometry(tailSizes[i], 12, 10), toon(tailColors[i]), tail, [0, ty, tz], false);
    }

    // --- Arms ---
    this.pivots.armL = this._limb(torso, -1, 0.24, 0.18, FUR, true);
    this.pivots.armR = this._limb(torso, 1, 0.24, 0.18, FUR, true);

    // --- Legs ---
    this.pivots.legL = this._limb(g, -1, 0.42, 0.22, FUR, false);
    this.pivots.legR = this._limb(g, 1, 0.42, 0.22, FUR, false);

    // --- Rifle (held in the right paw) ---
    // Parented to the torso so it bobs/leans with the body and the holding hand
    // (which is also a torso child) instead of floating on the static root.
    const gun = new THREE.Group();
    gun.position.set(0.28, -0.02, 0.28); // torso-local (≈ world 0.28, 0.50, 0.28)
    gun.rotation.set(0, 0.1, -0.05);
    torso.add(gun);
    this.pivots.gun = gun;
    this._mesh(new THREE.BoxGeometry(0.08, 0.1, 0.34), toon(WOOD), gun, [0, 0, 0], false); // stock
    this._mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 10), toon(STEEL), gun, [0, 0.03, 0.34], false)
      .rotation.x = Math.PI / 2; // barrel toward +Z
    // Muzzle marker (where projectiles spawn)
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.03, 0.6);
    gun.add(muzzle);
    this.pivots.muzzle = muzzle;

    g.scale.setScalar(1.0);
  }

  // Build a simple two-part limb (upper + lower) hanging from a pivot.
  _limb(parent, side, atY, atXabs, color, isArm) {
    const pivot = new THREE.Group();
    pivot.position.set(side * atXabs, atY, 0);
    parent.add(pivot);
    const upperLen = isArm ? 0.18 : 0.2;
    const lowerLen = isArm ? 0.16 : 0.2;
    const r = isArm ? 0.06 : 0.08;
    const upper = this._mesh(new THREE.CapsuleGeometry(r, upperLen, 4, 8), toon(color), pivot, [0, -upperLen / 2 - r, 0], false);
    const lower = new THREE.Group();
    lower.position.y = -(upperLen + r * 2);
    upper.parent.add(lower); // keep lower under pivot for simple swing
    pivot.add(lower);
    this._mesh(new THREE.CapsuleGeometry(r * 0.9, lowerLen, 4, 8), toon(color), lower, [0, -lowerLen / 2 - r, 0], false);
    // foot / paw
    if (!isArm) {
      this._mesh(new THREE.BoxGeometry(0.14, 0.07, 0.2), toon(FUR_DARK), lower, [0, -lowerLen - r, 0.04], false);
    } else {
      this._mesh(new THREE.SphereGeometry(0.07, 8, 8), toon(CREAM), lower, [0, -lowerLen - r, 0], false);
    }
    return pivot;
  }

  get muzzleWorldPosition() {
    return this.pivots.muzzle.getWorldPosition(new THREE.Vector3());
  }
}
