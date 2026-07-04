import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ICONS = join(ROOT, 'assets/icon');
const OUT_DIR = join(ROOT, 'src');

// Icon definitions matching src/ui/Icon.js
const ICON_DEFS = [
  { key: 'ammo-box', path: 'sbed/ammo-box.svg' },
  { key: 'cancel', path: 'sbed/cancel.svg' },
  { key: 'hearts', path: 'skoll/hearts.svg' },
  { key: 'archery-target', path: 'lorc/archery-target.svg' },
  { key: 'bell-shield', path: 'lorc/bell-shield.svg' },
  { key: 'cog', path: 'lorc/cog.svg' },
  { key: 'crossed-swords', path: 'lorc/crossed-swords.svg' },
  { key: 'fire-silhouette', path: 'lorc/fire-silhouette.svg' },
  { key: 'king', path: 'lorc/king.svg' },
  { key: 'minotaur', path: 'lorc/minotaur.svg' },
  { key: 'moebius-star', path: 'lorc/moebius-star.svg' },
  { key: 'mushroom', path: 'lorc/mushroom.svg' },
  { key: 'owl', path: 'lorc/owl.svg' },
  { key: 'paw-print', path: 'lorc/paw-print.svg' },
  { key: 'ribbon', path: 'lorc/ribbon.svg' },
  { key: 'run', path: 'lorc/run.svg' },
  { key: 'skull-crossed-bones', path: 'lorc/skull-crossed-bones.svg' },
  { key: 'spiky-explosion', path: 'lorc/spiky-explosion.svg' },
  { key: 'play-button', path: 'guard13007/play-button.svg' },
  { key: 'pistol-gun', path: 'john-colburn/pistol-gun.svg' },
  { key: 'bow-arrow', path: 'delapouite/bow-arrow.svg' },
  { key: 'cage', path: 'delapouite/cage.svg' },
  { key: 'check-mark', path: 'delapouite/check-mark.svg' },
  { key: 'credits-currency', path: 'delapouite/credits-currency.svg' },
  { key: 'flower-emblem', path: 'delapouite/flower-emblem.svg' },
  { key: 'fox-tail', path: 'delapouite/fox-tail.svg' },
  { key: 'house', path: 'delapouite/house.svg' },
  { key: 'photo-camera', path: 'delapouite/photo-camera.svg' },
  { key: 'plain-arrow', path: 'delapouite/plain-arrow.svg' },
  { key: 'shopping-cart', path: 'delapouite/shopping-cart.svg' },
  { key: 'upgrade', path: 'delapouite/upgrade.svg' },
  { key: 'warlock-eye', path: 'delapouite/warlock-eye.svg' },
];

mkdirSync(OUT_DIR, { recursive: true });

const magic = Buffer.from('FDIC', 'ascii');
const countBuf = Buffer.alloc(4);

const entries = ICON_DEFS.map(({ key, path }) => {
  const data = readFileSync(join(ICONS, path), 'utf-8');
  const keyBuf = Buffer.from(key, 'utf-8');
  const header = Buffer.alloc(2 + keyBuf.length + 4);
  let off = 0;
  header.writeUInt16LE(keyBuf.length, off); off += 2;
  header.set(keyBuf, off); off += keyBuf.length;
  header.writeUInt32LE(Buffer.byteLength(data, 'utf8'), off);
  return { header, data, name: key };
});

countBuf.writeUInt32LE(entries.length, 0);

const bundle = Buffer.concat([
  magic,
  countBuf,
  ...entries.flatMap(e => [e.header, Buffer.from(e.data, 'utf8')])
]);

writeFileSync(join(OUT_DIR, 'icons.bundle'), bundle);
console.log(`Wrote ${entries.length} icons (${(bundle.length / 1024).toFixed(1)} KB) → src/icons.bundle`);
