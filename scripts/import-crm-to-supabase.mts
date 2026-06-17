#!/usr/bin/env node
/**
 * Imports BMW + portal CRM snapshot into Supabase and uploads local docs to Storage.
 *
 * Prerequisites:
 *   1. Run migrations through 0011_crm_tables.sql in Supabase
 *   2. npm run import-bmw && npm run import-portal (generates local src/data)
 *   3. .env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   npm run import-crm
 *   npm run import-crm -- --skip-upload   # metadata only, no Storage uploads
 */
import { createClient } from '@supabase/supabase-js';
import { createReadStream, existsSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { buildCrmSnapshot } from '../src/lib/crm/snapshot.ts';
import { snapshotToImportPayload } from '../src/lib/crm/db-mapper.ts';

const DOCS_DIR = resolve(process.cwd(), 'candid_portal_all_docs');
const BATCH = 100;

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

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function upsertTable(supabase, table, rows, onConflict) {
  if (!rows.length) return;
  for (const batch of chunk(rows, BATCH)) {
    const { error } = await supabase.from(table).upsert(batch, { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function uploadDocument(supabase, customerUuid, recordExternalId, filename, localPath) {
  const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : '';
  const safeBase = recordExternalId.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
  const storagePath = `${customerUuid}/${safeBase}${ext}`;
  const body = createReadStream(localPath);
  const { error } = await supabase.storage.from('candid_documents').upload(storagePath, body, {
    upsert: true,
    contentType: guessMime(filename),
  });
  if (error) throw new Error(`upload ${filename}: ${error.message}`);
  return storagePath;
}

function guessMime(filename) {
  const ext = filename.toLowerCase().split('.').pop();
  const map = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    doc: 'application/msword',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ppt: 'application/vnd.ms-powerpoint',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
  };
  return map[ext] ?? 'application/octet-stream';
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function main() {
  loadEnv();
  const skipUpload = process.argv.includes('--skip-upload');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  console.log('Building CRM snapshot from local BMW + portal import…');
  const snapshot = buildCrmSnapshot();
  const payload = snapshotToImportPayload(snapshot);

  console.log(
    `Upserting ${payload.customers.length} customers, ${payload.deals.length} deals, ${payload.records.length} records…`,
  );

  await upsertTable(supabase, 'customers', payload.customers, 'external_id');

  const { data: customerRows, error: customerLookupError } = await supabase
    .from('customers')
    .select('id, external_id');
  if (customerLookupError) throw new Error(customerLookupError.message);

  const uuidByExternal = new Map(customerRows.map((r) => [r.external_id, r.id]));

  const locations = payload.locations.map(({ customerExternalId, row }) => ({
    ...row,
    customer_id: uuidByExternal.get(customerExternalId),
  }));

  const contacts = payload.contacts.map(({ customerExternalId, row }) => ({
    ...row,
    customer_id: uuidByExternal.get(customerExternalId),
  }));

  const deals = payload.deals.map(({ customerExternalId, row }) => ({
    ...row,
    customer_id: uuidByExternal.get(customerExternalId),
  }));

  const records = payload.records.map(({ customerExternalId, row }) => ({
    ...row,
    customer_id: uuidByExternal.get(customerExternalId),
  }));

  await upsertTable(supabase, 'customer_locations', locations, 'customer_id,external_id');
  await upsertTable(supabase, 'customer_contacts', contacts, 'customer_id,external_id');
  await upsertTable(supabase, 'deals', deals, 'external_id');
  await upsertTable(supabase, 'customer_records', records, 'external_id');

  let uploaded = 0;
  let missing = 0;

  if (!skipUpload) {
    console.log('Uploading documents to candid_documents storage…');
    const { data: existingRecords } = await supabase
      .from('customer_records')
      .select('external_id, storage_path')
      .not('storage_path', 'is', null);
    const uploadedSet = new Set((existingRecords ?? []).map((r) => r.external_id));

    for (const record of records) {
      if (uploadedSet.has(record.external_id)) {
        uploaded++;
        continue;
      }
      const filename = record.local_filename ?? record.filename;
      const localPath = join(DOCS_DIR, filename);
      if (!existsSync(localPath)) {
        missing++;
        continue;
      }

      const storagePath = await uploadDocument(
        supabase,
        record.customer_id,
        record.external_id,
        filename,
        localPath,
      );
      const size = formatBytes(statSync(localPath).size);
      const { error } = await supabase
        .from('customer_records')
        .update({ storage_path: storagePath, file_size_label: size })
        .eq('external_id', record.external_id);
      if (error) throw new Error(error.message);
      uploaded++;
    }
  }

  console.log('CRM import complete.');
  console.log({
    customers: payload.customers.length,
    deals: payload.deals.length,
    records: payload.records.length,
    uploaded,
    missingLocalFiles: missing,
    skipUpload,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
