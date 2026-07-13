#!/usr/bin/env node
/**
 * Apply agent role + marketing hub access migration (0063).
 *
 *   npm run db:apply-agent-marketing
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

const databaseUrl = (process.env.DATABASE_URL ?? loadEnvFile().DATABASE_URL)?.trim();
if (!databaseUrl) {
  console.error('Set DATABASE_URL in .env.local, then run again.');
  process.exit(1);
}

const sql = [
  readFileSync(join(root, 'supabase/migrations/0063_agent_role_marketing_access.sql'), 'utf8'),
  "notify pgrst, 'reload schema';",
].join('\n\n');

const { default: pg } = await import('pg');
const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  await client.query(sql);
  console.log('Applied 0063_agent_role_marketing_access.sql');
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await client.end();
}
