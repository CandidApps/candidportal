#!/usr/bin/env node
/**
 * Apply Get help migrations: 0059 (member_service_requests) + 0061 (customer_service_tickets).
 *
 * Requires DATABASE_URL in .env.local (Supabase → Project Settings → Database → Connection string).
 *
 *   npm run db:apply-get-help
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
  console.error(
    'Set DATABASE_URL in .env.local, then run again.\n' +
      'Supabase Dashboard → Project Settings → Database → Connection string (URI).',
  );
  process.exit(1);
}

const sql = [
  readFileSync(join(root, 'supabase/migrations/0059_member_service_requests.sql'), 'utf8'),
  readFileSync(join(root, 'supabase/migrations/0061_ensure_customer_service_tickets.sql'), 'utf8'),
  "notify pgrst, 'reload schema';",
].join('\n\n');

const { default: pg } = await import('pg');
const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  await client.query(sql);
  const { rows } = await client.query(`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name in ('member_service_requests', 'customer_service_tickets')
    order by table_name
  `);
  const names = rows.map((r) => r.table_name);
  if (!names.includes('member_service_requests') || !names.includes('customer_service_tickets')) {
    console.error('Migration ran but tables missing:', names);
    process.exit(1);
  }
  console.log('OK: Get help migrations applied:', names.join(', '));
} catch (err) {
  console.error('Migration failed:', err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
