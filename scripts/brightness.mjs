import { readFileSync } from 'node:fs';
const b = readFileSync(process.argv[2] || '/tmp/fd6.bmp');
const off = b.readUInt32LE(10);
const w = Math.abs(b.readInt32LE(18)), h = Math.abs(b.readInt32LE(22));
const bpp = b.readUInt16LE(28) >>> 3;
const rowBytes = Math.floor((w * bpp * 8 + 31) / 32) * 4;
let sum = 0, dark = 0;
for (let y = 0; y < h; y++) {
  const row = off + y * rowBytes;
  for (let x = 0; x < w; x++) {
    const i = row + x * bpp;
    const r = b[i + 2], g = b[i + 1], bl = b[i];
    sum += r + g + bl;
    if (r < 8 && g < 8 && bl < 8) dark++;
  }
}
const mean = sum / (w * h * 3);
console.log(`mean=${mean.toFixed(1)}/255 black=${(dark / (w * h) * 100).toFixed(1)}%`);
console.log(mean > 15 ? 'SCENE RENDERED' : 'BLACK');
