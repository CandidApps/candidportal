/**
 * Download a change request's screenshots/attachments into tmp/change-attachments/<CR-id>/
 * so Cursor can open them locally (signed storage URLs expire after an hour).
 *
 *   npx tsx scripts/pull-change-attachments.ts CR-0071 [CR-0072 ...]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { createSupabaseAdminClient } from '../src/lib/supabase/admin';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const i = line.indexOf('=');
  if (i < 0) continue;
  process.env[line.slice(0, i)] = line.slice(i + 1).replace(/^"|"$/g, '');
}

const BUCKET = 'change-request-attachments';
const OUT_ROOT = path.join('tmp', 'change-attachments');

async function pull(publicId: string) {
  const admin = createSupabaseAdminClient();
  const { data: change, error } = await admin
    .from('product_change_requests')
    .select('id, public_id, title')
    .eq('public_id', publicId.toUpperCase())
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!change) {
    console.log(`${publicId}: not found`);
    return;
  }

  const { data: rows, error: attErr } = await admin
    .from('product_change_attachments')
    .select('storage_path, file_name')
    .eq('change_request_id', change.id)
    .order('created_at', { ascending: true });
  if (attErr) throw new Error(attErr.message);
  if (!rows?.length) {
    console.log(`${change.public_id}: no attachments`);
    return;
  }

  const dir = path.join(OUT_ROOT, change.public_id);
  mkdirSync(dir, { recursive: true });
  for (const [i, row] of rows.entries()) {
    const { data, error: dlErr } = await admin.storage.from(BUCKET).download(row.storage_path);
    if (dlErr || !data) {
      console.log(`  ! ${row.file_name}: ${dlErr?.message ?? 'download failed'}`);
      continue;
    }
    const file = path.join(dir, `${String(i + 1).padStart(2, '0')}-${row.file_name}`);
    writeFileSync(file, Buffer.from(await data.arrayBuffer()));
    console.log(`  ${file}`);
  }
  console.log(`${change.public_id} (${change.title}): ${rows.length} attachment(s)`);
}

const ids = process.argv.slice(2);
if (!ids.length) {
  console.error('Usage: npx tsx scripts/pull-change-attachments.ts CR-0071 [CR-0072 ...]');
  process.exit(1);
}
(async () => {
  for (const id of ids) await pull(id);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
