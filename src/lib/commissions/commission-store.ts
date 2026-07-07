'use client';

import { DEMO_AGENTS } from '@/lib/demo/admin-portfolio';

export type {
  SupplierId,
  SupplierImportBatch,
} from '@/lib/commissions/supplier-config';

import { buildAgentCommissionRowsFromImports } from '@/lib/commissions/agent-commission-engine';
import { commissionRowCustomer, commissionRowUid } from '@/lib/bmw/commission-match';
import type { SupplierId, SupplierImportBatch } from '@/lib/commissions/supplier-config';
import { currentPeriod, periodBefore } from '@/lib/commissions/period-utils';

function localeCompareInsensitive(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

export function commissionRowSortKey(supplier: SupplierId, row: Record<string, unknown>): string {
  return (commissionRowCustomer(row) || commissionRowUid(supplier, row)).toLowerCase();
}

export function sortCommissionRowsAlphabetically(
  supplier: SupplierId,
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  return [...rows].sort((a, b) =>
    localeCompareInsensitive(commissionRowSortKey(supplier, a), commissionRowSortKey(supplier, b)),
  );
}

function sortAgentCustomers(customers: AgentCommissionCustomer[]): AgentCommissionCustomer[] {
  return [...customers].sort(
    (a, b) =>
      localeCompareInsensitive(a.company, b.company) ||
      localeCompareInsensitive(a.supplier, b.supplier),
  );
}

export {
  SUPPLIER_IDS,
  SUPPLIER_LABELS,
  displayColumnsForSupplier,
} from '@/lib/commissions/supplier-config';

export type AgentCommissionCustomer = {
  id: string;
  company: string;
  supplier: string;
  amount: number;
  commissionRate: number;
};

export type AgentCommissionRow = {
  agentId: string;
  company: string;
  contactEmail: string;
  currentMonthOwed: number;
  lastMonthPaid: number;
  ytdPaid: number;
  customers: AgentCommissionCustomer[];
};

type PayoutRecord = {
  paid: boolean;
  paidAt?: string;
  amount?: number;
};

const PAYOUTS_KEY = 'candid-agent-payouts';
const OVERRIDES_KEY = 'candid-agent-commission-overrides';

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event('candid-commissions-updated'));
}

export { currentPeriod, periodBefore, periodAfter } from '@/lib/commissions/period-utils';

export function previousPeriod(): string {
  return periodBefore(currentPeriod());
}

export function formatPeriodLabel(period: string): string {
  const [y, m] = period.split('-');
  if (!y || !m) return period;
  return new Date(Number(y), Number(m) - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

export function formatCommissionCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function seedCustomers(agentId: string, company: string): AgentCommissionCustomer[] {
  const templates: Record<string, AgentCommissionCustomer[]> = {
    'ag-vertex': [
      { id: 'c1', company: 'Harbor Bistro Group', supplier: 'PaymentCloud', amount: 4200, commissionRate: 50 },
      { id: 'c2', company: 'Summit Auto Parts', supplier: 'CardConnect', amount: 3180, commissionRate: 50 },
      { id: 'c3', company: 'Lakeview Fitness', supplier: 'PayJunction', amount: 2240, commissionRate: 50 },
    ],
    'ag-payments-pro': [
      { id: 'c4', company: 'Northline Dental', supplier: 'AppDirect', amount: 2890, commissionRate: 50 },
      { id: 'c5', company: 'Prairie Home Goods', supplier: 'Intelisys', amount: 1950, commissionRate: 50 },
    ],
    'ag-summit': [
      { id: 'c6', company: 'Metro Print Co', supplier: 'CardConnect', amount: 2640, commissionRate: 50 },
      { id: 'c7', company: 'Westside Pharmacy', supplier: 'PaymentCloud', amount: 1820, commissionRate: 50 },
    ],
    'ag-midwest-iso': [
      { id: 'c8', company: 'Oak Street Cafe', supplier: 'PayJunction', amount: 1540, commissionRate: 50 },
      { id: 'c9', company: 'Bright Dental', supplier: 'AppDirect', amount: 1210, commissionRate: 50 },
    ],
    'ag-coastal': [
      { id: 'c10', company: 'Coastal Surf Shop', supplier: 'Intelisys', amount: 890, commissionRate: 50 },
    ],
    'ag-lakeside': [],
  };
  return templates[agentId] ?? [{ id: `${agentId}-c1`, company: `${company} Merchant`, supplier: 'PaymentCloud', amount: 500, commissionRate: 50 }];
}

function buildDemoAgentRows(): AgentCommissionRow[] {
  return DEMO_AGENTS.map((a) => ({
    agentId: a.id,
    company: a.company,
    contactEmail: 'agent@partners.example.com',
    currentMonthOwed: a.commissionsLastMonth,
    lastMonthPaid: Math.round(a.commissionsLastMonth * 0.92),
    ytdPaid: a.commissionsYtd,
    customers: seedCustomers(a.id, a.company),
  }));
}

function payoutKey(agentId: string, period: string) {
  return `${agentId}::${period}`;
}

function overrideKey(agentId: string, period: string) {
  return `${agentId}::${period}`;
}

function listPayouts(): Record<string, PayoutRecord> {
  return readJson<Record<string, PayoutRecord>>(PAYOUTS_KEY, {});
}

function listOverrides(): Record<string, number> {
  const raw = readJson<Record<string, number>>(OVERRIDES_KEY, {});
  const cleaned: Record<string, number> = {};
  let changed = false;
  for (const [key, value] of Object.entries(raw)) {
    if (key.includes('::')) {
      cleaned[key] = value;
    } else {
      changed = true;
    }
  }
  if (changed) writeJson(OVERRIDES_KEY, cleaned);
  return cleaned;
}

export type AgentCommissionRowView = AgentCommissionRow & { paid: boolean };

const AGENT_EMAILS: Record<string, string> = {
  'ag-vertex': 'dana@vertexsales.io',
  'ag-payments-pro': 'marcus@paymentspro.com',
  'ag-summit': 'priya@summitpb.com',
  'ag-midwest-iso': 'sarah@midwestiso.com',
  'ag-coastal': 'jortiz@coastalma.com',
  'ag-lakeside': 'tom@lakesideagents.com',
};

export function getAgentCommissionRows(
  opts?: {
    imports?: SupplierImportBatch[];
    period?: string;
  },
): AgentCommissionRowView[] {
  const period = opts?.period ?? currentPeriod();
  let base: AgentCommissionRow[];

  if (opts?.imports) {
    base = buildAgentCommissionRowsFromImports(opts.imports, period);
  } else {
    base = buildDemoAgentRows();
  }

  const payouts = listPayouts();
  const overrides = listOverrides();

  return base
    .map((row) => {
      const owed = overrides[overrideKey(row.agentId, period)] ?? row.currentMonthOwed;
      const paid = payouts[payoutKey(row.agentId, period)]?.paid ?? false;
      return {
        ...row,
        contactEmail: AGENT_EMAILS[row.agentId] ?? row.contactEmail,
        currentMonthOwed: owed,
        customers: sortAgentCustomers(row.customers),
        paid,
      };
    })
    .sort((a, b) => localeCompareInsensitive(a.company, b.company));
}

export function isAgentPaid(agentId: string, period = currentPeriod()): boolean {
  return listPayouts()[payoutKey(agentId, period)]?.paid ?? false;
}

export function setAgentPaid(agentId: string, paid: boolean, period = currentPeriod(), amount?: number) {
  const payouts = listPayouts();
  const key = payoutKey(agentId, period);
  if (paid) {
    payouts[key] = { paid: true, paidAt: new Date().toISOString(), amount };
  } else {
    delete payouts[key];
  }
  writeJson(PAYOUTS_KEY, payouts);
}

export function setAllAgentsPaid(agentIds: string[], paid: boolean, period = currentPeriod()) {
  const payouts = listPayouts();
  for (const id of agentIds) {
    const key = payoutKey(id, period);
    if (paid) payouts[key] = { paid: true, paidAt: new Date().toISOString() };
    else delete payouts[key];
  }
  writeJson(PAYOUTS_KEY, payouts);
}

export function setAgentCommissionOverride(
  agentId: string,
  amount: number,
  period = currentPeriod(),
) {
  const overrides = listOverrides();
  overrides[overrideKey(agentId, period)] = amount;
  // Drop legacy agent-only keys so stale pre-period overrides cannot resurface.
  delete overrides[agentId];
  writeJson(OVERRIDES_KEY, overrides);
}

export function supplierPeriodTotals(
  imports: SupplierImportBatch[],
  supplier: SupplierId,
  period: string,
): number {
  const batches = imports.filter((i) => i.supplier === supplier && i.period === period);
  if (!batches.length) return 0;
  const manualBatch = batches.find((b) => b.id.startsWith('manual-') && b.rowCount > 0);
  if (manualBatch) return manualBatch.totalAmount;
  const dbBatch = batches.find((b) => !b.id.startsWith('manual-') && b.rowCount > 0);
  if (dbBatch) return dbBatch.totalAmount;
  return batches.reduce((s, i) => s + i.totalAmount, 0);
}

export function totalCommissionForPeriod(imports: SupplierImportBatch[], period: string): number {
  return imports
    .filter((i) => i.period === period)
    .reduce((s, i) => s + i.totalAmount, 0);
}

export function availableCommissionPeriods(imports: SupplierImportBatch[]): string[] {
  return [...new Set(imports.map((i) => i.period))].sort((a, b) => b.localeCompare(a));
}

export type CommissionTrendPoint = {
  period: string;
  label: string;
  total: number;
};

export function commissionTrendSeries(imports: SupplierImportBatch[]): CommissionTrendPoint[] {
  const periods = [...new Set(imports.map((i) => i.period))].sort();
  const years = new Set(periods.map((p) => p.split('-')[0]));
  const multiYear = years.size > 1;

  return periods.map((period) => {
    const [y, m] = period.split('-');
    const d = new Date(Number(y), Number(m) - 1);
    const label = d.toLocaleString('en-US', {
      month: 'short',
      ...(multiYear ? { year: '2-digit' as const } : {}),
    });
    return {
      period,
      label,
      total: totalCommissionForPeriod(imports, period),
    };
  });
}

export function formatPeriodDelta(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? 'New' : '—';
  const pct = ((current - previous) / previous) * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}% vs prior`;
}

function normalizeColumnKey(column: string): string {
  return column.toLowerCase().replace(/\s+/g, '_');
}

/** Identifier-style columns (MIDs, account numbers, order/customer ids) should never render as currency. */
function isIdentifierColumn(column: string): boolean {
  const c = normalizeColumnKey(column);
  return (
    c === 'mid'
    || c === 'ein'
    || c.endsWith('_mid')
    || c.endsWith('_num')
    || c.endsWith('_id')
    || c.endsWith('_account')
    || c.includes('account_number')
    || c.includes('account_num')
    || c === 'vendor_account'
    || c.includes('order_id')
    || c.includes('customer_id')
  );
}

/** Only commission-dollar columns should render as currency — not volumes, rates, or ids. */
function isAmountColumn(column: string): boolean {
  if (isIdentifierColumn(column)) return false;
  const c = normalizeColumnKey(column);
  if (/rate|volume|count|qty|quantity|percent|pct/i.test(c)) return false;
  return /comm|amount|payout|net_|total|paid|residual|revenue|fee/i.test(c);
}

function isDateColumn(column: string): boolean {
  const c = normalizeColumnKey(column);
  return c === 'commission_cycle' || c.includes('commission_cycle');
}

function formatDateCell(v: unknown): string | null {
  if (v == null || v === '') return null;

  if (typeof v === 'number' && v > 0) {
    // Excel serial date (1900 date system)
    const utc = (v - 25569) * 86400 * 1000;
    const d = new Date(utc);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  }

  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  }

  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const month = Number(slash[1]);
    const day = Number(slash[2]);
    let year = Number(slash[3]);
    if (year < 100) year += 2000;
    const d = new Date(year, month - 1, day);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  }

  return null;
}

export function formatCellValue(v: unknown, column?: string): string {
  if (v == null || v === '') return '—';
  if (column && isDateColumn(column)) {
    const formatted = formatDateCell(v);
    if (formatted) return formatted;
  }
  if (typeof v === 'number') {
    if (!column || !isAmountColumn(column)) return String(v);
    return formatCommissionCurrency(v);
  }
  return String(v);
}
