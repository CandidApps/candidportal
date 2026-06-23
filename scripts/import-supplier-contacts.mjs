#!/usr/bin/env node
/**
 * Import supplier contacts from Candid_Supplier_Contacts.xlsx (Full Directory tab)
 * into solution_provider_contacts, matching or creating solution_providers.
 *
 * Usage: npm run import-supplier-contacts
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import XLSX from 'xlsx';

const XLSX_PATH = resolve(process.cwd(), 'Candid_Supplier_Contacts.xlsx');
const SHEET = 'Full Directory';

/** Excel company label → canonical solution_providers.name in Supabase */
const COMPANY_TO_PROVIDER = {
  '8x8': '8x8',
  'acc business': 'ACC Business',
  airespring: 'AireSpring',
  appdirect: 'AppDirect',
  'cardconnect / fiserv': 'CardConnect',
  cardconnect: 'CardConnect',
  fiserv: 'CardConnect',
  'checkcommerce (nuvei ach)': 'CheckCommerce',
  checkcommerce: 'CheckCommerce',
  'comcast business': 'Comcast Business',
  comcast: 'Comcast Business',
  dialpad: 'Dialpad',
  formpiper: 'FormPiper',
  goto: 'GoTo',
  granite: 'Granite',
  hyfin: 'Hyfin',
  linked2pay: 'Linked2Pay',
  lumen: 'Lumen',
  mettel: 'MetTel',
  'momentum telecom': 'Momentum Telecom',
  nitel: 'Nitel',
  nuvei: 'Nuvei',
  paymentcloud: 'PaymentCloud',
  ringcentral: 'RingCentral',
  spectrum: 'Spectrum',
  't-mobile': 'T-Mobile',
  telarus: 'Telarus',
  vendara: 'Vendara',
  vonage: 'Vonage',
  'windstream enterprise': 'Windstream Enterprise',
};

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

function clean(v) {
  if (v == null) return '';
  const s = String(v).trim();
  return s === '—' || s === '-' ? '' : s;
}

function normKey(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function slugify(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function resolveProviderName(company, providerByNorm) {
  const key = normKey(company);
  if (!key) return null;

  const mapped = COMPANY_TO_PROVIDER[key];
  if (mapped) return mapped;

  if (providerByNorm.has(key)) return providerByNorm.get(key);

  for (const [norm, name] of providerByNorm) {
    if (key.includes(norm) || norm.includes(key)) return name;
  }

  return clean(company) || null;
}

function buildNotes(row) {
  const parts = [];
  const notes = clean(row.Notes);
  const bestFor = clean(row['Best For']);
  const status = clean(row.Status);
  const location = clean(row.Location);
  const lastContact = clean(row['Last Contact']);
  const direction = clean(row.Direction);

  if (notes) parts.push(notes);
  if (bestFor) parts.push(`Best for: ${bestFor}`);
  if (status && status.toLowerCase() !== 'active') parts.push(`Status: ${status}`);
  if (location) parts.push(`Location: ${location}`);
  if (lastContact) parts.push(`Last contact: ${lastContact}`);
  if (direction) parts.push(`Direction: ${direction}`);

  return parts.join(' | ') || null;
}

function parseClientFacing(row) {
  const value = clean(row['Client Facing']).toLowerCase();
  return value === 'true' || value === 'yes' || value === 'y' || value === '1';
}

function isPrimaryContact(row) {
  const notes = clean(row.Notes).toLowerCase();
  return notes.startsWith('primary') || notes.includes('primary partner') || notes.includes('primary contact');
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  if (!existsSync(XLSX_PATH)) throw new Error(`Missing ${XLSX_PATH}`);

  const wb = XLSX.readFile(XLSX_PATH);
  const sheet = wb.Sheets[SHEET];
  if (!sheet) throw new Error(`Sheet "${SHEET}" not found`);

  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  const contactRows = rows.filter((row) => clean(row.Name) || clean(row.Email));
  console.log(`Parsed ${contactRows.length} contact rows from "${SHEET}"`);

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: providers, error: provErr } = await supabase
    .from('solution_providers')
    .select('id, name, slug');
  if (provErr) throw new Error(provErr.message);

  const providerByName = new Map();
  const providerByNorm = new Map();
  const providerIdByName = new Map();

  for (const p of providers ?? []) {
    providerByName.set(p.name, p);
    providerIdByName.set(p.name, p.id);
    providerByNorm.set(normKey(p.name), p.name);
    providerByNorm.set(normKey(p.slug), p.name);
  }

  const neededNames = new Set();
  for (const row of contactRows) {
    const name = resolveProviderName(row.Company, providerByNorm);
    if (name) neededNames.add(name);
  }

  let createdProviders = 0;
  for (const name of neededNames) {
    if (providerByName.has(name)) continue;
    const slug = slugify(name);
    const { data, error } = await supabase
      .from('solution_providers')
      .insert({ slug, name })
      .select('id, name, slug')
      .single();
    if (error) throw new Error(`Create provider ${name}: ${error.message}`);
    providerByName.set(name, data);
    providerIdByName.set(name, data.id);
    providerByNorm.set(normKey(name), name);
    providerByNorm.set(normKey(slug), name);
    createdProviders += 1;
    console.log(`Created provider: ${name}`);
  }

  const { data: existingContacts, error: contactErr } = await supabase
    .from('solution_provider_contacts')
    .select('id, provider_id, email');
  if (contactErr) throw new Error(contactErr.message);

  const contactIdByProviderEmail = new Map();
  for (const c of existingContacts ?? []) {
    const email = clean(c.email).toLowerCase();
    if (!email) continue;
    contactIdByProviderEmail.set(`${c.provider_id}::${email}`, c.id);
  }

  const toInsert = [];
  const toUpdate = [];
  const unmatched = [];

  for (const row of contactRows) {
    const providerName = resolveProviderName(row.Company, providerByNorm);
    if (!providerName) {
      unmatched.push(clean(row.Company));
      continue;
    }

    const providerId = providerIdByName.get(providerName);
    const email = clean(row.Email).toLowerCase();
    const name = clean(row.Name) || clean(row.Email).split('@')[0] || 'Contact';

    const payload = {
      provider_id: providerId,
      name,
      role: clean(row['Role / Title']),
      email: clean(row.Email),
      phone: clean(row.Phone),
      is_primary: isPrimaryContact(row),
      client_facing: parseClientFacing(row),
      notes: buildNotes(row),
    };

    if (email) {
      const existingId = contactIdByProviderEmail.get(`${providerId}::${email}`);
      if (existingId) {
        toUpdate.push({ id: existingId, ...payload });
        continue;
      }
      contactIdByProviderEmail.set(`${providerId}::${email}`, 'pending');
    }

    toInsert.push(payload);
  }

  if (unmatched.length) {
    console.warn('Unmatched companies:', [...new Set(unmatched)].join(', '));
  }

  let inserted = 0;
  let updated = 0;

  if (toInsert.length) {
    const BATCH = 50;
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const batch = toInsert.slice(i, i + BATCH);
      const { error } = await supabase.from('solution_provider_contacts').insert(batch);
      if (error) throw new Error(error.message);
      inserted += batch.length;
    }
  }

  for (const row of toUpdate) {
    const { id, provider_id: _p, ...patch } = row;
    const { error } = await supabase.from('solution_provider_contacts').update(patch).eq('id', id);
    if (error) throw new Error(error.message);
    updated += 1;
  }

  if (!inserted && !updated) {
    console.log('No contacts to insert or update.');
    return;
  }

  // Ensure at most one primary per provider (keep first primary flagged)
  const { data: allContacts } = await supabase
    .from('solution_provider_contacts')
    .select('id, provider_id, is_primary')
    .order('id');

  const primarySeen = new Set();
  for (const c of allContacts ?? []) {
    if (!c.is_primary) continue;
    if (primarySeen.has(c.provider_id)) {
      await supabase.from('solution_provider_contacts').update({ is_primary: false }).eq('id', c.id);
    } else {
      primarySeen.add(c.provider_id);
    }
  }

  const byProvider = new Map();
  for (const row of [...toInsert, ...toUpdate]) {
    byProvider.set(row.provider_id, (byProvider.get(row.provider_id) ?? 0) + 1);
  }

  console.log(`Created ${createdProviders} new supplier(s).`);
  console.log(`Inserted ${inserted} contacts, updated ${updated} existing.`);
  console.log(`Suppliers touched: ${byProvider.size}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
