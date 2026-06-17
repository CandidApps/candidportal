import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const MANGO_PATH = resolve(process.cwd(), 'Mango.xlsx');
const WEAVE_PATH = resolve(process.cwd(), 'Weave.xlsx');

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

function parseNumber(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const n = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function parsePeriod(value) {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  const slash = s.match(/^(\d{4})\/(\d{2})\//);
  if (slash) return `${slash[1]}-${slash[2]}`;
  const iso = s.match(/^(\d{4})-(\d{2})-\d{2}/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  return /^\d{4}-\d{2}/.test(s) ? s.slice(0, 7) : null;
}

function readSheetRows(filePath) {
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
}

function mapMangoRows(rawRows) {
  return rawRows
    .map((raw) => {
      const period = parsePeriod(raw.Period);
      const accountNum = raw['Account #'] ? String(raw['Account #']).trim() : '';
      if (!period || !accountNum) return null;

      return {
        period,
        customer: raw.Customer ? String(raw.Customer).trim() : null,
        activation_date: raw['Activation Date'] ? String(raw['Activation Date']).trim() : null,
        account_num: accountNum,
        annual: raw.Annual ? String(raw.Annual).trim() : null,
        seats: parseNumber(raw.Seats),
        rate: parseNumber(raw.Rate),
        other: parseNumber(raw.Other),
        mrc: parseNumber(raw.MRC),
        commission_rate: parseNumber(raw.Rate_1 ?? raw.Rate),
        commission: parseNumber(raw.Commission),
        commission_month: parsePeriod(raw['Commission Month']) ?? (raw['Commission Month'] ? String(raw['Commission Month']).trim() : null),
      };
    })
    .filter(Boolean);
}

function mapWeaveRows(rawRows) {
  return rawRows
    .map((raw) => {
      const period = parsePeriod(raw.Period);
      const partner = raw['Partner Object Name'] ? String(raw['Partner Object Name']).trim() : '';
      if (!period || !partner) return null;

      return {
        period,
        partner_object_name: partner,
        payout: parseNumber(raw['Pay Out']),
        commission_month: raw['Commission Month'] ? String(raw['Commission Month']).trim() : null,
      };
    })
    .filter(Boolean);
}

async function upsertRows(supabase, table, rows, onConflict) {
  const chunkSize = 200;
  const results = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from(table)
      .upsert(chunk, { onConflict })
      .select('id, period');
    if (error) throw new Error(`${table}: ${error.message}`);
    results.push(...(data ?? []));
  }
  return results;
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');

  if (!existsSync(MANGO_PATH)) throw new Error(`File not found: ${MANGO_PATH}`);
  if (!existsSync(WEAVE_PATH)) throw new Error(`File not found: ${WEAVE_PATH}`);

  const mangoRows = mapMangoRows(readSheetRows(MANGO_PATH));
  const weaveRows = mapWeaveRows(readSheetRows(WEAVE_PATH));

  const supabase = createClient(url, key);

  await upsertRows(supabase, 'mango_commissions', mangoRows, 'period,account_num');
  await upsertRows(supabase, 'weave_commissions', weaveRows, 'period,partner_object_name');

  const mangoTotal = mangoRows.reduce((s, r) => s + r.commission, 0);
  const weaveTotal = weaveRows.reduce((s, r) => s + r.payout, 0);
  const mangoPeriods = [...new Set(mangoRows.map((r) => r.period))].sort();
  const weavePeriods = [...new Set(weaveRows.map((r) => r.period))].sort();

  console.log(`Mango: ${mangoRows.length} rows across ${mangoPeriods.length} periods (${mangoPeriods[0]} – ${mangoPeriods.at(-1)})`);
  console.log(`Mango total commission: $${mangoTotal.toFixed(2)}`);
  console.log(`Weave: ${weaveRows.length} rows across ${weavePeriods.length} periods (${weavePeriods[0]} – ${weavePeriods.at(-1)})`);
  console.log(`Weave total payout: $${weaveTotal.toFixed(2)}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
