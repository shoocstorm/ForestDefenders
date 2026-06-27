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
  { key: 'woodShroom',   file: 'mushrooms/wood_mushroom.glb' },
  // fireShroom & earthShroom are procedural now (their GLBs were >2MB each) —
  // see src/entities/enemies/ProceduralMushroom.js.
  { key: 'bossShroom',   file: 'mushrooms/boss_mushroom.glb' },
  { key: 'glowShroom',   file: 'mushrooms/glow_mushroom.glb' },
  { key: 'bunny',        file: 'animals/bunny.glb' },
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
