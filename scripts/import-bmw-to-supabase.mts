#!/usr/bin/env node
/**
 * Upserts BMW deal master + agent rates into Supabase from local JSON.
 * Requires src/data/bmw/deals.json and agent-rates.json (npm run import-bmw).
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { bmwDealExternalKey } from '../src/lib/crm/load-bmw-from-db.ts';

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

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');

  const dealsPath = resolve(process.cwd(), 'src/data/bmw/deals.json');
  const ratesPath = resolve(process.cwd(), 'src/data/bmw/agent-rates.json');
  if (!existsSync(dealsPath) || !existsSync(ratesPath)) {
    throw new Error('Run npm run import-bmw first to generate src/data/bmw/*.json');
  }

  const deals = JSON.parse(readFileSync(dealsPath, 'utf8'));
  const rates = JSON.parse(readFileSync(ratesPath, 'utf8'));

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const dealRows = deals.map((deal) => ({
    external_key: bmwDealExternalKey(deal),
    deal_uid: deal.dealUid || null,
    merchant: deal.merchant || null,
    pay_source: deal.paySource || null,
    agent_comm_id: deal.agentCommId || null,
    deal_data: deal,
  }));

  const rateRows = rates.map((rate) => ({
    agent_comm_id: rate.id,
    rate_data: rate,
  }));

  await upsertTable(supabase, 'bmw_deals', dealRows, 'external_key');
  await upsertTable(supabase, 'bmw_agent_rates', rateRows, 'agent_comm_id');

  console.log(`Imported ${dealRows.length} BMW deals and ${rateRows.length} agent rate profiles.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
