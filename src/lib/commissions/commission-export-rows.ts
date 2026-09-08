import { agentCommIdForDeal, commissionRateForAgent } from '@/lib/bmw/agent-comm-history';
import { getAddedDeal, getAddedDeals, type CommissionDealType } from '@/lib/bmw/added-deals';
import {
  computeAgentPayout,
  displayAgentForCommission,
  agentRateForCommissionPeriod,
  isAgentPayableForPeriod,
} from '@/lib/agents/agent-lifecycle';
import { overridePayoutLinesForDeal } from '@/lib/agents/agent-override-partners';
import {
  commissionRowCustomer,
  commissionRowUid,
  matchDealToCommissionRow,
} from '@/lib/bmw/commission-match';
import { getBmwAgentRates } from '@/lib/bmw/deal-master';
import { paySourceForSupplier } from '@/lib/bmw/pay-source-map';
import type { BmwDeal } from '@/lib/bmw/types';
import { normalizeUid } from '@/lib/bmw/deal-key';
import { resolveAgentCommIdForCommissionRow } from '@/lib/commissions/commission-deal-prefill';
import {
  sortCommissionRowsAlphabetically,
  type SupplierImportBatch,
} from '@/lib/commissions/commission-store';
import {
  commissionRowAmountForBatch,
  type SupplierId,
} from '@/lib/commissions/supplier-config';
import { cell, type SheetRow } from '@/lib/spreadsheet-io';

const PRODUCT_FIELDS = [
  'product_name',
  'product',
  'service_description',
  'service',
  'provider',
  'vendor',
  'Product',
  'Service',
];

const RESIDUAL_TYPE_FIELDS = [
  'residual_type',
  'Residual Type',
  'commission_type',
  'Commission Type',
  'comp_type',
  'payment_type',
  'Payment Type',
];

/** Map deal / import residual classification for Excel exports. */
export function residualTypeLabel(
  type?: CommissionDealType | string | null,
): 'Commission' | 'Spiff' {
  const raw = String(type ?? '').trim().toLowerCase();
  if (
    raw === 'one_time' ||
    raw === 'one-time' ||
    raw === 'spiff' ||
    raw === 'bonus' ||
    raw.includes('spiff')
  ) {
    return 'Spiff';
  }
  return 'Commission';
}

export function residualTypeFromRow(row: Record<string, unknown>): 'Commission' | 'Spiff' | null {
  for (const field of RESIDUAL_TYPE_FIELDS) {
    const v = cell(row as SheetRow, field);
    if (v) return residualTypeLabel(v);
  }
  return null;
}

export function commissionRowProduct(row: Record<string, unknown>): string {
  for (const field of PRODUCT_FIELDS) {
    const v = cell(row as SheetRow, field);
    if (v) return v;
  }
  return '';
}

function productForDeal(deal: BmwDeal | null, row: Record<string, unknown>): string {
  const fromRow = commissionRowProduct(row);
  if (fromRow) return fromRow;
  if (!deal) return '';
  return deal.product || deal.serviceDescription || '';
}

function findAddedDealByUid(dealUid: string) {
  const key = normalizeUid(dealUid);
  if (!key) return undefined;
  return getAddedDeals().find((d) => normalizeUid(d.dealUid) === key);
}

function vendorForExport(
  deal: BmwDeal | null,
  addedProvider: string | undefined,
  row: Record<string, unknown>,
  supplierLabel: string,
): string {
  const fromAdded = (addedProvider ?? '').trim();
  if (fromAdded) return fromAdded;
  const fromDeal = (deal?.provider ?? '').trim();
  if (fromDeal) return fromDeal;
  const fromRowVendor = cell(row as SheetRow, 'vendor', 'Vendor', 'provider', 'Provider');
  if (fromRowVendor) return fromRowVendor;
  return supplierLabel;
}

function residualTypeForDeal(
  deal: BmwDeal | null,
  row: Record<string, unknown>,
  supplierId?: SupplierId | null,
): 'Commission' | 'Spiff' {
  const fromRow = residualTypeFromRow(row);
  if (fromRow) return fromRow;
  const added = deal
    ? supplierId
      ? getAddedDeal(supplierId, deal.dealUid)
      : findAddedDealByUid(deal.dealUid)
    : undefined;
  return residualTypeLabel(added?.commissionType);
}

function agentPayoutAmount(
  netCommission: number,
  agentCommId: string,
  period: string,
  ratePct: number | null,
): number | null {
  if (ratePct == null || !Number.isFinite(netCommission) || !agentCommId) return null;
  return computeAgentPayout(netCommission, agentCommId, period, ratePct);
}

export function buildSupplierDetailRow(
  batch: SupplierImportBatch,
  row: Record<string, unknown>,
): SheetRow {
  const deal = matchDealToCommissionRow(batch.supplier, row, {
    uidField: batch.uidField,
    customerField: batch.customerField,
  });
  const added = deal ? getAddedDeal(batch.supplier, deal.dealUid) : undefined;
  const dealAgentCommId = deal ? agentCommIdForDeal(deal, batch.period) : '';
  const agentCommId = resolveAgentCommIdForCommissionRow(
    row,
    deal,
    getBmwAgentRates(),
    dealAgentCommId,
  );
  const agentName = agentCommId ? displayAgentForCommission(agentCommId, batch.period) : '';
  const rawRate = added
    ? added.commissionRate
    : agentCommId
      ? commissionRateForAgent(agentCommId, batch.period)
      : null;
  const commissionRate =
    agentCommId && rawRate != null
      ? agentRateForCommissionPeriod(agentCommId, batch.period, rawRate)
      : null;
  const netCommission = commissionRowAmountForBatch(batch, row);
  const overrideLines = agentCommId
    ? overridePayoutLinesForDeal(netCommission, agentCommId, batch.period)
    : [];
  const primaryInactive = Boolean(agentCommId && !isAgentPayableForPeriod(agentCommId, batch.period));
  const overrideNote = overrideLines.length
    ? overrideLines
        .map((line) => `${displayAgentForCommission(line.overrideCommId, batch.period)} (${line.overrideRate}%)`)
        .join(', ')
    : null;
  const grossPrimary =
    agentCommId && !primaryInactive
      ? agentPayoutAmount(netCommission, agentCommId, batch.period, rawRate ?? 0)
      : null;
  const overrideTotal = overrideLines.reduce((sum, line) => sum + line.overridePayout, 0);
  const dealUid =
    deal?.dealUid ||
    commissionRowUid(batch.supplier, row, {
      uidField: batch.uidField,
      customerField: batch.customerField,
    }) ||
    null;
  const supplierLabel = paySourceForSupplier(batch.supplier);

  return {
    'Deal UID': dealUid,
    Customer: deal?.merchant || commissionRowCustomer(row, batch.customerField) || null,
    'Product/Service': productForDeal(deal, row) || null,
    Supplier: supplierLabel,
    Vendor: vendorForExport(deal, added?.provider, row, supplierLabel) || null,
    'Residual type': residualTypeForDeal(deal, row, batch.supplier),
    'Net Commission': netCommission,
    Agent: primaryInactive
      ? `Candid Solutions${overrideNote ? ` · Override: ${overrideNote}` : ''}`
      : overrideNote
        ? `${agentName} · Override: ${overrideNote}`
        : agentName || null,
    'Agent Rate': primaryInactive ? null : commissionRate,
    'Agent Payout': primaryInactive ? overrideTotal || null : grossPrimary,
  };
}

export function supplierDetailRowsForBatch(batch: SupplierImportBatch): SheetRow[] {
  return sortCommissionRowsAlphabetically(batch.supplier, batch.rows).map((row) =>
    buildSupplierDetailRow(batch, row),
  );
}

export function verifiedPaySourceDetailRows(
  label: string,
  lines: Array<{ dealUid: string; merchant: string; amount: number }>,
): SheetRow[] {
  return lines.map((line) => {
    const addedAny = findAddedDealByUid(line.dealUid);
    return {
      'Deal UID': line.dealUid,
      Customer: line.merchant,
      'Product/Service': addedAny?.product ?? null,
      Supplier: label,
      Vendor: addedAny?.provider || label,
      'Residual type': residualTypeLabel(addedAny?.commissionType),
      'Net Commission': line.amount,
      Agent: null,
      'Agent Rate': null,
      'Agent Payout': null,
    };
  });
}

export type AgentLineExport = {
  dealUid: string;
  company: string;
  vendor: string;
  productService: string;
  commissionRate: number;
  residual: number;
};

export function agentLineExportRow(line: AgentLineExport): SheetRow {
  return {
    'Deal UID': line.dealUid,
    'Customer name': line.company,
    Vendor: line.vendor,
    'Service/Solution': line.productService || null,
    'Agent Rate': line.commissionRate,
    Residual: line.residual,
  };
}

export function findCommissionRowForDeal(
  imports: SupplierImportBatch[],
  period: string,
  supplierId: SupplierId,
  dealUid: string,
): Record<string, unknown> | null {
  const batch = imports.find((i) => i.supplier === supplierId && i.period === period);
  if (!batch) return null;
  for (const row of batch.rows) {
    const deal = matchDealToCommissionRow(batch.supplier, row, {
      uidField: batch.uidField,
      customerField: batch.customerField,
    });
    if (deal?.dealUid === dealUid) return row;
  }
  return null;
}
