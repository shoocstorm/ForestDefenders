import * as THREE from 'three';
import { ARENA, VEGETATION } from '../config/Constants.js';
import { painted, untrackWind } from '../materials/CelMaterial.js';
import { clone } from '../core/Assets.js';

// Arena forest built from sculpted GLB trees (Hyper3D Rodin, see package-models.js).
// Replaces the old procedural primitive trees (icosahedron blobs, umbrella discs,
// upside-down willow cones), which didn't read as trees at a glance.
//
// Each tree is a clone of a cached master (shared geometry — never disposed
// here). Materials are built fresh per Vegetation instance, one or two per
// species, because each biome re-skins the foliage: the baked texture's green
// pixels are hue-remapped to the biome palette on a canvas (bark stays put).
// Wind is shader-driven canopy sway (CelMaterial wind), so update() only
// advances time.

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Species table. `height` is the world-space height range; `trunk` is the trunk
// collider radius as a fraction of height; `leaf` picks the biome palette slot
// ('broadleaf' | 'pine') or null to keep the baked colours (dead wood); `wind`
// is canopy sway (`from` = fraction of model height where sway starts, `amp` in
// world units — converted to model space per material).
const SPECIES = {
  OAK:   { key: 'treeOak',   height: [6.5, 9.0], trunk: 0.055, leaf: 'broadleaf',
    wind: { from: 0.45, freq: 1.5, amp: 0.08 } },
  FIR:   { key: 'treeFir',   height: [7.0, 10.5], trunk: 0.04, leaf: 'pine',
    wind: { from: 0.35, freq: 1.8, amp: 0.06 } },
  BIRCH: { key: 'treeBirch', height: [7.0, 9.5], trunk: 0.03, leaf: 'broadleaf',
    wind: { from: 0.45, freq: 2.0, amp: 0.09 } },
  BUSH:  { key: 'treeBush',  height: [1.3, 2.1], trunk: 0.25, leaf: 'broadleaf',
    wind: { from: 0.3, freq: 2.4, amp: 0.04 } },
  DEAD:  { key: 'treeDead',  height: [5.5, 8.0], trunk: 0.045, leaf: null,
    wind: { from: 0.55, freq: 1.2, amp: 0.04 } },
};

// Weighted species roll — a varied forest, broadleaf-heavy for readability.
const TABLE = [['OAK', 26], ['FIR', 22], ['BIRCH', 14], ['BUSH', 22], ['DEAD', 6]];

// The baked textures are green; palettes whose leaf hue sits near green keep
// them as-is (the L1 look) and only get a light tint for the second variant.
const GREEN_HUE = 0.29;
const _hsl = { h: 0, s: 0, l: 0 };
const _c = new THREE.Color();

// Hue-remap the foliage (green-hued, saturated pixels) of a baked texture to
// `targetHex`, preserving each pixel's relative shading. Bark/wood is untouched.
function recolorFoliage(src, targetHex) {
  const img = src.image;
  const w = img.width, h = img.height;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  _c.setHex(targetHex).getHSL(_hsl);
  const th = _hsl.h, ts = _hsl.s, tl = _hsl.l;
  for (let i = 0; i < px.length; i += 4) {
    _c.setRGB(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255).getHSL(_hsl);
    if (_hsl.h < 0.14 || _hsl.h > 0.47 || _hsl.s < 0.2) continue;
    // Baked foliage averages roughly s 0.6 / l 0.35 — scale toward the target.
    _c.setHSL(th, Math.min(1, _hsl.s * ts / 0.6), Math.min(0.95, _hsl.l * tl / 0.35));
    px[i] = _c.r * 255; px[i + 1] = _c.g * 255; px[i + 2] = _c.b * 255;
  }
  ctx.putImageData(data, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = src.colorSpace;
  tex.flipY = src.flipY;
  tex.wrapS = src.wrapS; tex.wrapT = src.wrapT;
  tex.anisotropy = src.anisotropy;
  return tex;
}

export class Vegetation {
  constructor(scene, palette) {
    this.scene = scene;
    this.colliders = [];
    this.trees = [];          // { group, phase }
    this._t = 0;
    this.rng = mulberry32(VEGETATION.SEED);
    // Biome palette (SEASONS_SPEC) re-skins the foliage per level. Falls back to
    // the baked greens.
    this.palette = palette || {};
    this._materials = [];     // owned: disposed + untracked in dispose()
    this._textures = [];      // owned recolored canvases
    this._species = {};       // name -> { bounds, mats: [variant, ...] }
    this._build();
  }

  // Per-species prep: model-space bounds + 1–2 foliage material variants.
  _prepSpecies(name) {
    const spec = SPECIES[name];
    const probe = clone(spec.key);
    const box = new THREE.Box3().setFromObject(probe);
    const size = box.getSize(new THREE.Vector3());
    let srcMap = null;
    probe.traverse((o) => { if (!srcMap && o.isMesh) srcMap = o.material.map; });

    const p = this.palette;
    const leafHexes = spec.leaf ? [p[spec.leaf], p[spec.leaf + '2']].filter((v) => v != null) : [];
    const leafHue = leafHexes.length ? (_c.setHex(leafHexes[0]).getHSL(_hsl), _hsl.h) : GREEN_HUE;
    const recolor = srcMap && leafHexes.length && Math.abs(leafHue - GREEN_HUE) > 0.08;
    const rim = recolor ? (p.barkRim ?? 0xbfe88a) : 0xbfe88a;

    // Variants: recolored biomes use both palette slots; green biomes reuse the
    // baked texture with a neutral and a slightly cooler/darker tint.
    const variants = recolor
      ? leafHexes.map((hex) => ({ map: recolorFoliage(srcMap, hex), color: 0xffffff, own: true }))
      : [{ map: srcMap, color: 0xffffff }, ...(spec.leaf ? [{ map: srcMap, color: 0xd6e2cc }] : [])];

    const mats = variants.map((v) => {
      if (v.own) this._textures.push(v.map);
      // Typical scale ≈ mid height / model height; wind amp is model-space.
      const midH = (spec.height[0] + spec.height[1]) / 2;
      const m = painted({
        map: v.map, color: v.color,
        rim: { color: rim, intensity: 0.35 },
        wind: {
          base: box.min.y + size.y * spec.wind.from,
          freq: spec.wind.freq + this.rng() * 0.4,
          amp: spec.wind.amp * size.y / midH,
        },
      });
      this._materials.push(m);
      return m;
    });
    return { box, size, mats };
  }

  _build() {
    const lane = 3.5;
    const count = 60; // Reduced tree density for clearer arena visibility
    for (const [name] of TABLE) this._species[name] = this._prepSpecies(name);
    const totalW = TABLE.reduce((s, [, w]) => s + w, 0);
    const platformClear = (x, z) => Math.abs(x) < 8 && z > -7 && z < 12;

    for (let i = 0; i < count; i++) {
      let r = this.rng() * totalW, specName = TABLE[0][0];
      for (const [name, w] of TABLE) { if ((r -= w) <= 0) { specName = name; break; } }
      const spec = SPECIES[specName];
      const sp = this._species[specName];
      // Reroll (deterministically) out of the central platform's footprint +
      // stairs — the sculpted canopies are wide enough to swallow the deck.
      let x, z, tries = 0;
      do {
        const side = this.rng() < 0.5 ? -1 : 1;
        x = side * (lane + this.rng() * (ARENA.WIDTH / 2 - lane - 1.2));
        z = -ARENA.LENGTH / 2 + 4 + this.rng() * (ARENA.LENGTH - 12);
      } while (platformClear(x, z) && ++tries < 10);
      if (platformClear(x, z)) continue;
      const height = spec.height[0] + this.rng() * (spec.height[1] - spec.height[0]);
      const s = height / Math.max(0.001, sp.size.y);

      const group = clone(spec.key);
      group.scale.setScalar(s);
      group.position.set(x, -sp.box.min.y * s, z);
      group.rotation.y = this.rng() * Math.PI * 2;
      const mat = sp.mats[Math.floor(this.rng() * sp.mats.length)];
      group.traverse((o) => {
        if (!o.isMesh) return;
        o.material = mat;
        o.castShadow = true;
        o.receiveShadow = true;
      });

      this.scene.add(group);
      this.trees.push({ group, phase: this.rng() * Math.PI * 2 });
      this.colliders.push({ type: 'cylinder', x, z, r: Math.max(0.4, height * spec.trunk) });
    }
  }

  // Wind is shader-driven (CelMaterial.updateTime advances all wind materials);
  // here we just keep a time reference in case per-tree variation is needed later.
  update(dt) { this._t += dt; }

  dispose() {
    // Tree clones share geometry with the cached master asset (Assets.clone) —
    // only remove them; disposing geometry would corrupt the next level's trees.
    // The per-biome materials + recolored textures ARE owned here. Wind
    // materials register in CelMaterial's module-level _windMaterials Set, so
    // untrackWind() is required or every level reload leaks them.
    for (const t of this.trees) this.scene.remove(t.group);
    for (const m of this._materials) { m.dispose(); untrackWind(m); }
    for (const tex of this._textures) tex.dispose();
    this.trees.length = 0;
    this.colliders.length = 0;
    this._materials.length = 0;
    this._textures.length = 0;
  }
}
