import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const SVG_PATH = path.join(ROOT, 'public/brand/sidebar-minimized.svg');
const BRAND_RED = '#E11D48';
const WHITE = '#ffffff';

async function buildIcon(size, outputPath) {
  let svg = await fs.readFile(SVG_PATH, 'utf8');
  svg = svg
    .replace(/fill:\s*currentColor/g, `fill: ${BRAND_RED}`)
    .replace(/currentColor/g, BRAND_RED);

  const padding = Math.round(size * 0.14);
  const inner = size - padding * 2;

  const logo = await sharp(Buffer.from(svg))
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: WHITE,
    },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(outputPath);

  console.log(`Wrote ${path.relative(ROOT, outputPath)}`);
}

await buildIcon(192, path.join(ROOT, 'public/brand/candid-pwa-192.png'));
await buildIcon(512, path.join(ROOT, 'public/brand/candid-pwa-512.png'));
