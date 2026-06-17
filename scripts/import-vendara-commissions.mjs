import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const EXCEL_PATH = resolve(process.cwd(), process.argv[2] ?? 'Vendara_Reorganized.xlsx');

const COLUMN_MAP = {
  'Merchant MID': 'merchant_mid',
  'Merchant Name': 'merchant_name',
  'Profile Category': 'profile_category',
  Office: 'office',
  Agent: 'agent',
  Date: 'date',
  'MC Volume': 'mc_volume',
  'Visa Volume': 'visa_volume',
  'Disc Volume': 'disc_volume',
  'Amex Volume': 'amex_volume',
  'Debit Volume': 'debit_volume',
  'EBT Volume': 'ebt_volume',
  'JBC Volume': 'jbc_volume',
  'PayPal Volume': 'paypal_volume',
  'Gross Vol': 'gross_vol',
  Transaction: 'transaction_ct',
  Income: 'income',
  Expense: 'expense',
  GrossResidual: 'gross_residual',
  Split: 'split_pct',
  'Net Residual': 'net_residual',
  'Unnamed: 21': 'unnamed_21',
  'IC/Cost & Trans Income': 'ic_cost_trans_income',
  'Breach Insurance Income': 'breach_insurance_income',
  'CB  & Retrieval Income': 'cb_retrieval_income',
  'Semi & Annual Income': 'semi_annual_income',
  'Monthly Income': 'monthly_income',
  'POS License Income': 'pos_license_income',
  'Setup/Misc Income': 'setup_misc_income',
  'Month Minimum Income': 'month_minimum_income',
  'Monthly Minimum Expense': 'monthly_minimum_expense',
  'IC/Cost & Trans Expense': 'ic_cost_trans_expense',
  'Breach Insurance Expense': 'breach_insurance_expense',
  'CB  & Retrieval Expense': 'cb_retrieval_expense',
  'Semi & Annual Expense': 'semi_annual_expense',
  'POS License Expense': 'pos_license_expense',
  'Setup Expense': 'setup_expense',
  'Statement Expense': 'statement_expense',
  'Account on File Expense': 'account_on_file_expense',
  'Margin Minimum Expense': 'margin_minimum_expense',
  'Cash Discount Expense': 'cash_discount_expense',
  'POS Monthly Expense': 'pos_monthly_expense',
  'Enhanced Portal Expense': 'enhanced_portal_expense',
  'Gateway Expense': 'gateway_expense',
  'BIN fee': 'bin_fee',
  'Ach Rejects': 'ach_rejects',
  'Disc Adjustment': 'disc_adjustment',
  Period: 'period',
};

const NUMERIC_FIELDS = new Set(
  Object.values(COLUMN_MAP).filter(
    (f) => !['merchant_mid', 'merchant_name', 'profile_category', 'office', 'agent', 'date', 'period', 'unnamed_21'].includes(f),
  ),
);

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
  const s = String(value).replace(/%/g, '').replace(/,/g, '').trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function parsePeriod(value) {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  const iso = s.match(/^(\d{4})-(\d{2})-\d{2}/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  return /^\d{4}-\d{2}/.test(s) ? s.slice(0, 7) : null;
}

function mapRow(raw) {
  const row = {};
  for (const [excelCol, dbCol] of Object.entries(COLUMN_MAP)) {
    const rawVal = raw[excelCol];
    if (rawVal == null || rawVal === '') continue;

    if (dbCol === 'merchant_mid') {
      row.merchant_mid = parseNumber(rawVal);
      continue;
    }
    if (dbCol === 'period') {
      const period = parsePeriod(rawVal);
      if (period) row.period = period;
      continue;
    }
    if (NUMERIC_FIELDS.has(dbCol)) {
      row[dbCol] = parseNumber(rawVal);
      continue;
    }
    row[dbCol] = String(rawVal);
  }
  return row;
}

function mergeRows(existing, incoming) {
  const merged = { ...existing };
  if (incoming.merchant_name && incoming.merchant_name !== existing.merchant_name) {
    merged.merchant_name = `${existing.merchant_name} + ${incoming.merchant_name}`;
  }
  for (const field of NUMERIC_FIELDS) {
    if (field in incoming) {
      merged[field] = (merged[field] ?? 0) + incoming[field];
    }
  }
  return merged;
}

function dedupeRows(rows) {
  const byKey = new Map();
  for (const row of rows) {
    if (!row.period || !row.merchant_mid) continue;
    const key = `${row.period}::${row.merchant_mid}`;
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeRows(existing, row) : row);
  }
  return [...byKey.values()];
}

function readVendaraRows(filePath) {
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  return dedupeRows(rawRows.map(mapRow).filter((r) => r.period && r.merchant_mid));
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');

  if (!existsSync(EXCEL_PATH)) {
    throw new Error(`File not found: ${EXCEL_PATH}`);
  }

  const rows = readVendaraRows(EXCEL_PATH);
  if (!rows.length) throw new Error('No rows to import');

  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from('vendara_commissions')
    .upsert(rows, { onConflict: 'period,merchant_mid' })
    .select('id, period, merchant_mid, merchant_name, net_residual');

  if (error) throw new Error(error.message);

  const total = rows.reduce((s, r) => s + (r.net_residual ?? 0), 0);
  console.log(`Imported ${data?.length ?? rows.length} Vendara rows for period ${rows[0].period}`);
  console.log(`Total net residual: $${total.toFixed(2)}`);
  for (const row of data ?? rows) {
    console.log(`  ${row.merchant_mid} · ${row.merchant_name} · $${Number(row.net_residual).toFixed(2)}`);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
