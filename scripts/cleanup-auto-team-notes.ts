#!/usr/bin/env npx tsx
/**
 * CR-0029: remove historical auto-generated "Outreach update — …" team notes.
 * Only deletes notes already copied into admin_outreach_activity (migration 20260929170000).
 *
 *   npx tsx scripts/cleanup-auto-team-notes.ts            # dry run — counts only
 *   npx tsx scripts/cleanup-auto-team-notes.ts --confirm  # copy any stragglers, then delete
 *
 * Targets whatever NEXT_PUBLIC_SUPABASE_URL points at (.env.local).
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
  const envPath = resolve(process.cwd(), '.env.local');
  if (!existsSync(envPath)) throw new Error('Missing .env.local');
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx);
    const value = trimmed.slice(idx + 1);
    if (!process.env[key]) process.env[key] = value;
  }
}

const AUTO_PREFIX = 'Outreach update — ';

async function main() {
  loadEnv();
  const confirm = process.argv.includes('--confirm');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required');
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { data: notes, error } = await admin
    .from('team_notes')
    .select('id, context_key, author_id, body, created_at')
    .eq('context_type', 'customer')
    .like('body', `${AUTO_PREFIX}%`);
  if (error) throw new Error(error.message);
  const rows = notes ?? [];
  console.log(`Target: ${url}`);
  console.log(`Auto outreach team notes: ${rows.length}`);
  if (!rows.length) return;

  const { data: copied, error: copiedErr } = await admin
    .from('admin_outreach_activity')
    .select('source_team_note_id')
    .in('source_team_note_id', rows.map((r) => r.id));
  if (copiedErr) throw new Error(`${copiedErr.message} — apply migration 20260929170000 first`);
  const copiedIds = new Set((copied ?? []).map((r) => String(r.source_team_note_id)));
  const missing = rows.filter((r) => !copiedIds.has(String(r.id)));
  console.log(`Already copied to outreach activity: ${copiedIds.size}; not yet copied: ${missing.length}`);

  if (!confirm) {
    console.log('Dry run. Re-run with --confirm to copy stragglers and delete these notes.');
    return;
  }

  if (missing.length) {
    const { error: insErr } = await admin.from('admin_outreach_activity').insert(
      missing.map((r) => ({
        customer_external_id: r.context_key,
        author_id: r.author_id,
        note: r.body,
        source_team_note_id: r.id,
        created_at: r.created_at,
      })),
    );
    if (insErr) throw new Error(insErr.message);
  }

  const { error: delErr, count } = await admin
    .from('team_notes')
    .delete({ count: 'exact' })
    .in('id', rows.map((r) => r.id));
  if (delErr) throw new Error(delErr.message);
  console.log(`Deleted ${count ?? rows.length} auto team notes.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
