import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { celifyGLTF } from '../materials/CelMaterial.js';
import { loadBundle as _loadBundle } from './ModelBundle.js';

// All GLB models are loaded from a single bundle file (models.bundle) produced by
// scripts/package-models.js at build time. This avoids 19 separate HTTP requests.
//
// Each loaded model is "celified" once at load time: its PBR materials are
// converted to hand-painted cel materials (with fresnel rim), shadows enabled,
// and an inverted-hull outline added. Cloning (SkeletonUtils.clone) shares the
// GPU geometry/textures but gives each instance its own transform + outline.

const _loader = new GLTFLoader();
const _cache = new Map(); // key -> { scene, animations, bounds }

// Per-model cel + outline config (characters get outlines + boosted rim; foliage
// gets wind sway; environment is outline-free to hold draw-call budget).
const _cfg = {
  // outlineSkip: the face rig's eye/brow/shine/mouth meshes are tiny — a fixed
  // 0.02-unit inverted-hull outline on them is bigger than the feature itself
  // and reads as a solid black blob, so they get no outline at all. The stem
  // also has a narrow collar where it flares to meet the cap; that flare's
  // full circumference is a silhouette edge, so the same fixed-thickness
  // outline there renders as a solid black ring around the neck rather than
  // a thin line — skip it too (the cap's own outline already frames the model).
  woodShroom:  { outline: true, rim: { color: 0xbfe88a, power: 3.0, intensity: 0.55 }, emissiveBoost: 1.2, outlineSkip: ['eye', 'brow', 'shine', 'mouth', 'stem'] },
  // fireShroom & earthShroom are procedural (ProceduralMushroom.js) — no GLB entry.
  bossShroom:  { outline: true, rim: { color: 0xc89bff, power: 3.0, intensity: 0.8 }, emissiveBoost: 1.5, outlineSkip: ['eye', 'brow', 'shine', 'mouth', 'stem'] },
  glowShroom:  { outline: false, rim: { color: 0x9fff6a, power: 3.0, intensity: 0.9 }, emissiveBoost: 1.8 },
  groveTree:   { outline: false, wind: { base: 0.4, freq: 1.8, amp: 0.06 }, rim: { intensity: 0.35 } },
  pine:        { outline: false, wind: { base: 0.5, freq: 2.0, amp: 0.05 }, rim: { intensity: 0.3 } },
  lowPolyTree: { outline: false, wind: { base: 0.6, freq: 1.6, amp: 0.07 }, rim: { intensity: 0.3 } },
  ancientTree: { outline: false, wind: { base: 1.0, freq: 1.2, amp: 0.05 }, rim: { intensity: 0.4 } },
  rock:        { outline: false, rim: { intensity: 0.3 } },
  mossStump:   { outline: false, rim: { intensity: 0.4 } },
  pathStone:   { outline: false, rim: { intensity: 0.3 } },
  crystalRock: { outline: false, rim: { color: 0x9fe8ff, intensity: 0.8 }, emissiveBoost: 1.4 },
  supplyCrate: { outline: true, rim: { intensity: 0.5 } },
  fireBullet:  { outline: false, rim: { color: 0xffcc66, intensity: 1.0 }, emissiveBoost: 2.0 },
  fern:        { outline: false, wind: { base: 0.05, freq: 2.6, amp: 0.05 }, rim: { intensity: 0.4 } },
  grass:       { outline: false, wind: { base: 0.0, freq: 3.0, amp: 0.06 }, rim: { intensity: 0.35 } },
  stoneArch:   { outline: false, rim: { intensity: 0.4 } },
};

export async function loadAll(onProgress) {
  const bundle = await _loadBundle();
  const keys = [...bundle.keys()];
  let done = 0;
  await Promise.all(keys.map((key) => new Promise((resolve, reject) => {
    _loader.parse(bundle.get(key), '', (gltf) => {
      const cfg = _cfg[key] || {};
      const { box } = celifyGLTF(gltf.scene, cfg);
      _cache.set(key, { scene: gltf.scene, animations: gltf.animations || [], box });
      done++;
      onProgress?.(done / keys.length, key);
      resolve(key);
    }, (err) => reject(new Error(`Asset load failed [${key}]: ${err.message || err}`)));
  })));
  return keys.length;
}

// Deep-clone a model's scene (shares geometry/textures; independent transforms,
// skeleton + outline). Animation clips from the master bind by node name.
export function clone(key) {
  const entry = _cache.get(key);
  if (!entry) throw new Error(`Assets.clone: "${key}" not loaded`);
  return SkeletonUtils.clone(entry.scene);
}

export function clips(key) { return _cache.get(key)?.animations || []; }
export function bounds(key) { return _cache.get(key)?.box; }
export function isLoaded(key) { return _cache.has(key); }

// Find the first descendant node whose name matches (case-insensitive includes).
export function findNode(root, namePart) {
  let hit = null;
  root.traverse((o) => { if (!hit && o.name && o.name.toLowerCase().includes(namePart.toLowerCase())) hit = o; });
  return hit;
}
