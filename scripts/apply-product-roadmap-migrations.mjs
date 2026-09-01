#!/usr/bin/env node
/**
 * Apply product roadmap + change-request migrations.
 *
 *   DATABASE_URL='postgresql://...' node scripts/apply-product-roadmap-migrations.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env.local');

function loadEnvFile() {
  const out = {};
  if (!existsSync(envPath)) return out;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const env = loadEnvFile();
const databaseUrl = (process.env.DATABASE_URL ?? env.DATABASE_URL)?.trim();
if (!databaseUrl) {
  console.error(
    'Set DATABASE_URL (Supabase Dashboard → Project Settings → Database), then re-run.',
  );
  process.exit(1);
}

const sql = [
  readFileSync(join(root, 'supabase/migrations/20260831184729_product_roadmap.sql'), 'utf8'),
  readFileSync(
    join(root, 'supabase/migrations/20260831190758_product_change_requests.sql'),
    'utf8',
  ),
  "notify pgrst, 'reload schema';",
].join('\n\n');

const { default: pg } = await import('pg');
const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  await client.query(sql);
  console.log('Applied product_roadmap + product_change_requests migrations.');
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
