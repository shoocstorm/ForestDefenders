import * as THREE from 'three';
import { HUNTERS_CABIN } from '../config/Constants.js';
import { clone } from '../core/Assets.js';

// Hunter's cabin homestead — a log cabin with a woodcutter's yard (chopping
// stump + axe, split firewood, crate, jerry can, oil barrels, generator).
// Converted from a Hyper3D multi-object USDZ scene (see package-models.js);
// the source scene's own object placement was image-reconstruction space with
// no common ground plane, so the yard is laid out here instead, every piece
// feet-on-ground and scaled against the chibi hero (≈1.05 tall).
//
// Layout is authored in cabin-local space (door faces local +Z), then the whole
// group is turned by HUNTERS_CABIN.rotY so the door faces the runway.
// Colliders are emitted in world space for Arena's collider list.

// [asset key, local x, local z, yaw, target height, collider radius (0 = none)]
const PIECES = [
  ['huntersCabin',   0.0,  0.0,  0.0, HUNTERS_CABIN.height, 0],
  ['cabinStumpAxe', -1.7,  2.9,  0.4, 0.95, 0.45],
  ['cabinFirewood', -2.7,  2.2,  1.1, 0.35, 0],
  ['cabinCrate',     2.4,  2.0,  0.3, 0.75, 0.5],
  ['cabinJerryCan',  1.9,  2.9, -0.5, 0.55, 0],
  ['cabinBarrels',   2.7, -1.0,  0.2, 1.0,  0.7],
  ['cabinGenerator',-2.8, -0.6,  1.57, 0.8, 0.6],
];

// The cabin's own footprint (~3.8 × 3.7 at height 4.6): four corner posts +
// a centre post of cylinder colliders, in cabin-local space.
const CABIN_POSTS = [[-0.95, -0.95, 1.0], [0.95, -0.95, 1.0], [-0.95, 0.95, 1.0], [0.95, 0.95, 1.0], [0, 0, 1.3]];

const _v = new THREE.Vector3();
const _box = new THREE.Box3();
const _size = new THREE.Vector3();

export class HuntersCabin {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    const [x, z] = HUNTERS_CABIN.pos;
    this.group = new THREE.Group();
    this.group.position.set(x, 0, z);
    this.group.rotation.y = HUNTERS_CABIN.rotY;
    // Clones share geometry/materials with the cached masters — Arena.dispose()
    // removes this subtree without disposing it.
    this.group.userData.arenaOwned = true;
    this.group.userData.__sharedAsset = true;

    for (const [key, lx, lz, yaw, h] of PIECES) {
      const obj = clone(key);
      _box.setFromObject(obj).getSize(_size);
      const s = h / Math.max(0.001, _size.y);
      obj.scale.setScalar(s);
      obj.position.set(lx, -_box.min.y * s, lz);
      obj.rotation.y = yaw;
      obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.group.add(obj);
    }
    scene.add(this.group);

    this.group.updateMatrixWorld(true);
    const local = [
      ...CABIN_POSTS,
      ...PIECES.filter((p) => p[5] > 0).map((p) => [p[1], p[2], p[5]]),
    ];
    for (const [lx, lz, r] of local) {
      this.group.localToWorld(_v.set(lx, 0, lz));
      this.colliders.push({ type: 'cylinder', x: _v.x, z: _v.z, r });
    }
  }

  // True when (x, z) falls inside the homestead's keep-out radius.
  static blocks(x, z, pad = 0) {
    const [cx, cz] = HUNTERS_CABIN.pos;
    const r = HUNTERS_CABIN.clear + pad;
    return (x - cx) * (x - cx) + (z - cz) * (z - cz) < r * r;
  }
}
