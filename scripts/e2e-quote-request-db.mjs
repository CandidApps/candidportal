#!/usr/bin/env node
/**
 * DB E2E: insert a smoke quote_request via service role, verify columns, clean up.
 * Requires migration 0053 applied.
 *
 *   node scripts/e2e-quote-request-db.mjs
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

const fileEnv = loadEnvFile();
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? fileEnv.NEXT_PUBLIC_SUPABASE_URL)?.trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? fileEnv.SUPABASE_SERVICE_ROLE_KEY)?.trim();

if (!supabaseUrl || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const { createClient } = await import('@supabase/supabase-js');
const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const smokeUserId = '00000000-0000-4000-8000-000000000099';
let insertedId = null;

try {
  const { error: colErr } = await admin.from('quote_requests').select('subject, service_type_id, status').limit(1);
  if (colErr) {
    throw new Error(`Schema check failed (run migration 0053): ${colErr.message}`);
  }
  console.log('✓ quote_requests schema (subject, service_type_id, status)');

  const { data, error } = await admin
    .from('quote_requests')
    .insert({
      user_id: smokeUserId,
      mode: 'request',
      contact_name: 'Smoke E2E',
      company: 'Smoke E2E Co',
      contact_email: 'smoke-e2e@candid.test',
      services: ['internet'],
      service_type_id: 'internet',
      subject: 'Quote request — Internet / Broadband (Smoke E2E Co)',
      status: 'open',
    })
    .select('id, subject, status')
    .single();

  if (error) throw new Error(`Insert failed: ${error.message}`);
  insertedId = data.id;
  console.log(`✓ Insert quote_request (${data.id})`);

  const { data: row, error: readErr } = await admin
    .from('quote_requests')
    .select('*')
    .eq('id', insertedId)
    .single();
  if (readErr || !row) throw new Error(`Read back failed: ${readErr?.message ?? 'no row'}`);
  if (row.status !== 'open' || !row.subject?.includes('Smoke E2E')) {
    throw new Error('Read back data mismatch');
  }
  console.log('✓ Read back quote_request');

  const { error: patchErr } = await admin.from('quote_requests').update({ status: 'in_progress' }).eq('id', insertedId);
  if (patchErr) throw new Error(`Status update failed: ${patchErr.message}`);
  console.log('✓ Update status to in_progress');

  console.log('\nE2E DB: all checks passed');
} catch (err) {
  console.error('✗', err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  if (insertedId) {
    await admin.from('quote_requests').delete().eq('id', insertedId);
  }
}
