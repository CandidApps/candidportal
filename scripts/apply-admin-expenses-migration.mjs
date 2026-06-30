#!/usr/bin/env node
/**
 * One-time apply of admin_expenses migrations when Supabase CLI/MCP isn't linked.
 *
 * Usage (get DATABASE_URL from Supabase Dashboard → Project Settings → Database):
 *   DATABASE_URL='postgresql://postgres.[ref]:[password]@...' node scripts/apply-admin-expenses-migration.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error('Set DATABASE_URL to your Supabase Postgres connection string (Session pooler or direct).');
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sql = [
  readFileSync(join(root, 'supabase/migrations/0045_admin_expenses.sql'), 'utf8'),
  readFileSync(join(root, 'supabase/migrations/0048_admin_expenses_customer_agent.sql'), 'utf8'),
  "notify pgrst, 'reload schema';",
].join('\n\n');

const { default: pg } = await import('pg');
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  await client.query(sql);
  console.log('admin_expenses migration applied successfully.');
} catch (err) {
  console.error('Migration failed:', err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
