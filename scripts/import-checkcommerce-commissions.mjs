import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import { readFileSync, existsSync } from 'fs';
import { resolve, basename } from 'path';

// Usage: node scripts/import-checkcommerce-commissions.mjs [file.xlsx] [YYYY-MM]
// Files are named by activity month (e.g. "2026-05 CheckCommerce.xlsx"); the
// commission payout period is the following month unless overridden by arg 2.

const DEFAULT_FILE = '2026-05 CheckCommerce.xlsx';

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

function periodAfter(period) {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m - 1 + 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function excelSerialToIso(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  return String(value).trim() || null;
}

function mapRows(rawRows, period) {
  return rawRows
    .map((raw) => {
      const mid = raw.MID != null ? String(raw.MID).trim() : '';
      if (!mid) return null;

      return {
        period,
        mid,
        company_name: raw['Company Name'] ? String(raw['Company Name']).trim() : null,
        company_dba: raw['Company DBA'] ? String(raw['Company DBA']).trim() : null,
        ein: raw.EIN != null ? String(raw.EIN).trim() : null,
        created_date: excelSerialToIso(raw['Created Date']),
        orig_fee_rate: parseNumber(raw.Orig),
        disc_rate: parseNumber(raw.Disc),
        return_fee: parseNumber(raw.Return),
        monthly_maint_fee: parseNumber(raw['Monthly Maint.']),
        chargeback_fee: parseNumber(raw.Chargeback),
        fraud_chek_fee: parseNumber(raw['Fraud Chek ']),
        orig_count: parseNumber(raw['Orig Count']),
        orig_volume: parseNumber(raw['Orig Volume']),
        return_count: parseNumber(raw['Return Count']),
        return_volume: parseNumber(raw['Return Volume']),
        chargeback_count: parseNumber(raw['Chargeback Count']),
        fraud_chek_count: parseNumber(raw['Fraud Chek Count']),
        net_volume: parseNumber(raw['Net Volume']),
        orig_dollar: parseNumber(raw.Orig2),
        disc_dollar: parseNumber(raw.Disc3),
        return_dollar: parseNumber(raw.Return4),
        monthly_maint_dollar: parseNumber(raw['Monthly Maint.5']),
        chargeback_dollar: parseNumber(raw.Chargeback6),
        fraud_chek_dollar: parseNumber(raw['Fraud Chek 7']),
        orig_residual: parseNumber(raw.Orig8),
        disc_residual: parseNumber(raw.Disc9),
        return_residual: parseNumber(raw.Return10),
        chargeback_residual: parseNumber(raw['Chargeback ']),
        fraud_chek_residual: parseNumber(raw['Fraud Chek']),
        total: parseNumber(raw['Total ']),
        total_monthly_maint: parseNumber(raw['Total Monthly Maint']),
      };
    })
    .filter(Boolean);
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');

  const fileArg = process.argv[2] ?? DEFAULT_FILE;
  const filePath = resolve(process.cwd(), fileArg);
  if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`);

  const fileMonth = basename(filePath).match(/^(\d{4}-\d{2})/)?.[1] ?? null;
  const periodArg = process.argv[3] ?? null;
  const period = periodArg ?? (fileMonth ? periodAfter(fileMonth) : null);
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    throw new Error('Could not determine period. Pass it explicitly: node scripts/import-checkcommerce-commissions.mjs <file> <YYYY-MM>');
  }

  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets['Residual Detail'] ?? wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  const rows = mapRows(rawRows, period);
  if (!rows.length) throw new Error('No valid rows found in sheet');

  const supabase = createClient(url, key);

  const chunkSize = 200;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const { error } = await supabase
      .from('checkcommerce_commissions')
      .upsert(rows.slice(i, i + chunkSize), { onConflict: 'period,mid' });
    if (error) throw new Error(`checkcommerce_commissions: ${error.message}`);
  }

  const total = rows.reduce((s, r) => s + r.total, 0);
  console.log(`Imported ${rows.length} CheckCommerce rows for period ${period} (file month ${fileMonth ?? 'n/a'})`);
  console.log(`Total commission: $${total.toFixed(2)}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
