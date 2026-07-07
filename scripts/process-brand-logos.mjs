#!/usr/bin/env node
/**
 * Convert brand JPEG uploads (mislabeled .png) into true transparent PNGs.
 * Removes near-black pixels so logos blend on any sidebar/login background.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assets = join(
  process.env.USERPROFILE ?? '',
  '.cursor/projects/c-Users-Josh-OneDrive-Documents-GitHub-candidportal/assets',
);

const jobs = [
  {
    src: join(
      assets,
      'c__Users_Josh_AppData_Roaming_Cursor_User_workspaceStorage_d29e15f19eea2253ec5e0faa6fd6124e_images_CandidIQ_Logo_V1_White-ed884da1-e056-4a49-82fc-6d38dbc42265.png',
    ),
    out: join(root, 'public/brand/candidiq-logo-white.png'),
  },
  {
    src: join(
      assets,
      'c__Users_Josh_AppData_Roaming_Cursor_User_workspaceStorage_d29e15f19eea2253ec5e0faa6fd6124e_images_CandidPortal_CandidLogo-549b5bfe-3988-4053-8592-b2c55af92a37.png',
    ),
    out: join(root, 'public/brand/candidiq-icon.png'),
  },
  {
    src: join(
      assets,
      'c__Users_Josh_AppData_Roaming_Cursor_User_workspaceStorage_d29e15f19eea2253ec5e0faa6fd6124e_images_CandidIQ_Portal_Logo_Word-c0f02fc1-2d6c-434b-b43b-2b5b3bff9a4c.png',
    ),
    out: join(root, 'public/brand/candidiq-wordmark.png'),
  },
];

/** Pixels darker than this become fully transparent. */
const BLACK_THRESHOLD = 40;

async function toTransparentPng(inputPath, outputPath) {
  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = new Uint8Array(data);
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    if (r <= BLACK_THRESHOLD && g <= BLACK_THRESHOLD && b <= BLACK_THRESHOLD) {
      pixels[i + 3] = 0;
    }
  }

  const png = await sharp(pixels, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .trim({ threshold: 10 })
    .png({ compressionLevel: 9 })
    .toBuffer();

  writeFileSync(outputPath, png);
  const check = readFileSync(outputPath);
  console.log(`OK ${outputPath} (${info.width}x${info.height}, PNG ${check.length} bytes)`);
}

for (const job of jobs) {
  await toTransparentPng(job.src, job.out);
}
