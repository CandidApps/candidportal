/**
 * Split brand wordmark / lockup PNGs into alpha masks for themeable SVG layers.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'public', 'brand', 'sources');
const OUT_DIR = path.join(ROOT, 'public', 'brand', 'masks');

const SOURCES = [
  {
    name: 'wordmark-primary',
    src: path.join(SOURCE_DIR, 'candidiq-wordmark.png'),
    pick: (r, g, b, a) => a > 128 && r > 200 && g > 200 && b > 200,
  },
  {
    name: 'wordmark-accent',
    src: path.join(SOURCE_DIR, 'candidiq-wordmark.png'),
    pick: (r, g, b, a) => a > 128 && b > r && b > 120,
  },
  {
    name: 'lockup-primary',
    src: path.join(SOURCE_DIR, 'candidiq-lockup-white.png'),
    pick: (r, g, b, a) => a > 128,
  },
];

async function writeMask({ name, src, pick }) {
  const { data, info } = await sharp(src)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const out = Buffer.alloc(width * height * 4);

  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const a = data[o + 3];
    const on = pick(r, g, b, a) ? 255 : 0;
    out[o] = 255;
    out[o + 1] = 255;
    out[o + 2] = 255;
    out[o + 3] = on;
  }

  const outPath = path.join(OUT_DIR, `${name}.png`);
  await sharp(out, { raw: { width, height, channels: 4 } }).png().toFile(outPath);
  console.log(`wrote ${outPath} (${width}x${height})`);
  return { name, width, height };
}

await fs.mkdir(OUT_DIR, { recursive: true });
const meta = await Promise.all(SOURCES.map(writeMask));
await fs.writeFile(path.join(OUT_DIR, 'meta.json'), JSON.stringify(meta, null, 2));
