'use client';

import { normalizeUid } from '@/lib/bmw/deal-key';
import { paySourceForSupplier } from '@/lib/bmw/pay-source-map';
import type { BmwDeal } from '@/lib/bmw/types';
import type { SupplierId } from '@/lib/commissions/supplier-config';

export type CommissionDealType = 'recurring' | 'one_time';

export type AddedDeal = {
  /** Commission supplier when the deal maps to a Supabase import table. */
  supplier?: SupplierId;
  /** Pay source label when there is no supplier table (e.g. Linked2Pay). */
  paySource?: string;
  dealUid: string;
  merchant: string;
  agentCommId: string;
  agentName: string;
  commissionRate: number;
  /** Whether commission is expected every month or as a one-time payout. */
  commissionType?: CommissionDealType;
  product?: string;
  /** Solution provider / vendor (BMW provider field). */
  provider?: string;
  /** Candid residual rate % from supplier solution config. */
  candidCommissionRate?: number;
  /** Existing customer this deal is a sub-account / additional location of. */
  parentCustomerId?: string;
  parentCustomerName?: string;
  addedAt: string;
};

const KEY = 'candid-added-deals';

export function getAddedDeals(): AddedDeal[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AddedDeal[]) : [];
  } catch {
    return [];
  }
}

export function saveAddedDeal(deal: AddedDeal): void {
  if (!deal.supplier && !deal.paySource?.trim()) {
    throw new Error('Deal must have a supplier or pay source.');
  }
  const deals = getAddedDeals().filter(
    (d) => !(dealKeyForAdded(d) === dealKeyForAdded(deal)),
  );
  deals.push({ ...deal, commissionType: deal.commissionType ?? 'recurring' });
  localStorage.setItem(KEY, JSON.stringify(deals));
  window.dispatchEvent(new Event('candid-commissions-updated'));
}

function dealKeyForAdded(deal: AddedDeal): string {
  const scope = deal.supplier ?? `ps:${deal.paySource ?? ''}`;
  return `${scope}::${normalizeUid(deal.dealUid)}`;
}

export function isDealAdded(supplier: SupplierId, dealUid: string): boolean {
  const uid = normalizeUid(dealUid);
  return getAddedDeals().some(
    (d) => d.supplier === supplier && normalizeUid(d.dealUid) === uid,
  );
}

export function isPaySourceDealAdded(paySource: string, dealUid: string): boolean {
  const uid = normalizeUid(dealUid);
  return getAddedDeals().some(
    (d) => !d.supplier && d.paySource === paySource && normalizeUid(d.dealUid) === uid,
  );
}

export function getAddedDeal(
  supplier: SupplierId,
  dealUid: string,
): AddedDeal | undefined {
  const uid = normalizeUid(dealUid);
  return getAddedDeals().find(
    (d) => d.supplier === supplier && normalizeUid(d.dealUid) === uid,
  );
}

/** Persist a deal from verify / upload flows. */
export function saveCommissionDeal(input: {
  supplier?: SupplierId;
  paySource?: string;
  dealUid: string;
  merchant: string;
  agentCommId: string;
  agentName: string;
  commissionRate: number;
  commissionType?: CommissionDealType;
  product?: string;
  provider?: string;
  candidCommissionRate?: number;
  parentCustomerId?: string;
  parentCustomerName?: string;
}): void {
  saveAddedDeal({
    ...input,
    addedAt: new Date().toISOString(),
  });
}

/** Synthetic BMW deal so added deals participate in commission matching. */
export function addedDealToBmwDeal(added: AddedDeal): BmwDeal {
  const paySource = added.paySource ?? (added.supplier ? paySourceForSupplier(added.supplier) : '');
  return {
    rowNum: 0,
    paySource,
    dealUid: added.dealUid,
    agentCommId: added.agentCommId,
    merchant: added.merchant,
    provider: added.provider ?? '',
    product: added.product ?? '',
    providerAccount: '',
    uidHeader: '',
    sandlerDealId: '',
    serviceDescription: '',
    rate: added.candidCommissionRate != null ? added.candidCommissionRate / 100 : null,
    contractMrc: null,
    activeDeal: true,
    status: 'Active',
    street: '',
    city: '',
    state: '',
    zip: '',
    agentName: added.agentName,
    customerId: added.parentCustomerId ?? '',
    customerContactName: '',
    agentId: '',
    serviceId: '',
    uuid: '',
    cloverId: '',
  };
}
