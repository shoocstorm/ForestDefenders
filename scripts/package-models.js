import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ASSETS = join(ROOT, 'assets/models');
if (!process.argv[2]) {
  console.error('Usage: bun scripts/package-models.js <outdir>');
  console.error('  <outdir> is relative to project root (e.g. . for root, dist for build)');
  process.exit(1);
}
const OUT_DIR = join(ROOT, process.argv[2]);

const MODELS = [
  // All six elemental shrooms (incl. Wood) are procedural — see
  // src/entities/enemies/ProceduralMushroom.js.
  { key: 'bossShroom',   file: 'mushrooms/boss_mushroom.glb' },
  { key: 'glowShroom',   file: 'mushrooms/glow_mushroom.glb' },
  { key: 'groveTree',    file: 'trees/grove_tree.glb' },
  { key: 'pine',         file: 'trees/pine.glb' },
  { key: 'lowPolyTree',  file: 'trees/tree-low-poly-shaded.glb' },
  { key: 'ancientTree',  file: 'trees/ancient_tree.glb' },
  { key: 'rock',         file: 'general/rock.glb' },
  { key: 'mossStump',    file: 'general/moss_stump.glb' },
  { key: 'pathStone',    file: 'general/path_stone.glb' },
  { key: 'crystalRock',  file: 'general/crystal_rock.glb' },
  { key: 'supplyCrate',  file: 'general/supply_crate.glb' },
  { key: 'fireBullet',   file: 'general/fire_bullet.glb' },
  { key: 'fern',         file: 'vegetation/fern.glb' },
  { key: 'grass',        file: 'vegetation/grass.glb' },
  { key: 'stoneArch',    file: 'buildings/stone_arch.glb' },
  // Hyper3D Rodin Gen-2.5 output, slimmed: 1024px JPEG diffuse + emissive only
  // (normal/metal-roughness maps dropped — celifyGLTF never reads them).
  { key: 'powerTower',   file: 'buildings/power_tower.glb' },
  // Arena forest (Vegetation.js) — Hyper3D Rodin Gen-2.5, slimmed the same way
  // (512px JPEG diffuse only).
  { key: 'treeOak',      file: 'trees/oak_tree.glb' },
  { key: 'treeFir',      file: 'trees/fir_tree.glb' },
  { key: 'treeBirch',    file: 'trees/birch_tree.glb' },
  { key: 'treeDead',     file: 'trees/dead_tree.glb' },
  { key: 'treeBush',     file: 'vegetation/leafy_bush.glb' },
  // Hunter's cabin homestead (HuntersCabin.js) — converted from the Hyper3D
  // USDZ scene in buildings/hunters_cabin/source/ (Z-up → Y-up, 1024px cabin /
  // 512px prop textures as JPEG).
  { key: 'huntersCabin',     file: 'buildings/hunters_cabin/hunters_cabin.glb' },
  { key: 'cabinStumpAxe',    file: 'buildings/hunters_cabin/chopping_stump_axe.glb' },
  { key: 'cabinFirewood',    file: 'buildings/hunters_cabin/firewood_logs.glb' },
  { key: 'cabinJerryCan',    file: 'buildings/hunters_cabin/jerry_can.glb' },
  { key: 'cabinCrate',       file: 'buildings/hunters_cabin/wooden_crate.glb' },
  { key: 'cabinBarrels',     file: 'buildings/hunters_cabin/oil_barrels.glb' },
  { key: 'cabinGenerator',   file: 'buildings/hunters_cabin/generator.glb' },
];

mkdirSync(OUT_DIR, { recursive: true });

const magic = Buffer.from('FDB1', 'ascii');
const countBuf = Buffer.alloc(4);

const entries = MODELS.map(({ key, file }) => {
  const data = readFileSync(join(ASSETS, file));
  const keyBuf = Buffer.from(key, 'utf-8');
  const header = Buffer.alloc(2 + keyBuf.length + 4);
  let off = 0;
  header.writeUInt16LE(keyBuf.length, off); off += 2;
  header.set(keyBuf, off); off += keyBuf.length;
  header.writeUInt32LE(data.length, off);
  return { header, data, name: key };
});

countBuf.writeUInt32LE(entries.length, 0);

const bundle = Buffer.concat([magic, countBuf, ...entries.flatMap(e => [e.header, e.data])]);
writeFileSync(join(OUT_DIR, 'models.bundle'), bundle);
const rel = join(OUT_DIR.replace(ROOT + '/', ''), 'models.bundle');
console.log(`Wrote ${entries.length} models (${(bundle.length / 1024 / 1024).toFixed(1)} MB) → ${rel}`);
