#!/usr/bin/env node
/**
 * Verify or apply migration 0059 (member_service_requests for Get help).
 *
 *   node scripts/apply-0059-member-service-requests.mjs
 *   node scripts/apply-0059-member-service-requests.mjs --apply
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const apply = process.argv.includes('--apply');
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

const fileEnv = loadEnvFile();
const databaseUrl = (process.env.DATABASE_URL ?? fileEnv.DATABASE_URL)?.trim();
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? fileEnv.NEXT_PUBLIC_SUPABASE_URL)?.trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? fileEnv.SUPABASE_SERVICE_ROLE_KEY)?.trim();

async function verifyViaPostgres() {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    const { rows } = await client.query(`
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = 'member_service_requests'
    `);
    if (!rows.length) return false;
    const { rows: grants } = await client.query(`
      select privilege_type
      from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name = 'member_service_requests'
        and grantee = 'authenticated'
    `);
    const privs = new Set(grants.map((r) => r.privilege_type));
    return privs.has('INSERT') && privs.has('SELECT');
  } finally {
    await client.end().catch(() => {});
  }
}

async function applyViaPostgres() {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  const sql = [
    readFileSync(join(root, 'supabase/migrations/0059_member_service_requests.sql'), 'utf8'),
    "notify pgrst, 'reload schema';",
  ].join('\n\n');
  try {
    await client.connect();
    await client.query(sql);
  } finally {
    await client.end().catch(() => {});
  }
}

async function verifyViaSupabaseApi() {
  if (!supabaseUrl || !serviceKey) return null;
  const { createClient } = await import('@supabase/supabase-js');
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await admin.from('member_service_requests').select('id').limit(1);
  if (!error) return true;
  if (/member_service_requests/.test(error.message)) return false;
  throw new Error(error.message);
}

async function main() {
  let applied = false;

  if (databaseUrl) {
    applied = await verifyViaPostgres();
  } else {
    const apiResult = await verifyViaSupabaseApi();
    if (apiResult === null) {
      console.error(
        'Set DATABASE_URL in .env.local to apply migrations, or ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set to verify.',
      );
      process.exit(1);
    }
    applied = apiResult;
  }

  if (applied) {
    console.log('OK: migration 0059 already applied (member_service_requests).');
    return;
  }

  if (!apply) {
    console.error('Migration 0059 is NOT applied. Run: npm run db:apply-0059');
    process.exit(2);
  }

  if (!databaseUrl) {
    console.error(
      'Cannot apply without DATABASE_URL. Add it to .env.local from Supabase → Database → Connection string.',
    );
    process.exit(1);
  }

  await applyViaPostgres();
  if (!(await verifyViaPostgres())) {
    console.error('Migration ran but verification failed.');
    process.exit(1);
  }
  console.log('OK: migration 0059 applied successfully.');
}

main().catch((err) => {
  console.error('Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
