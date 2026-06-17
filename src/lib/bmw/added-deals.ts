'use client';

import { normalizeUid } from '@/lib/bmw/deal-key';
import { paySourceForSupplier } from '@/lib/bmw/pay-source-map';
import type { BmwDeal } from '@/lib/bmw/types';
import type { SupplierId } from '@/lib/commissions/supplier-config';

export type AddedDeal = {
  supplier: SupplierId;
  dealUid: string;
  merchant: string;
  agentCommId: string;
  agentName: string;
  commissionRate: number;
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
  const deals = getAddedDeals().filter(
    (d) => !(d.supplier === deal.supplier && normalizeUid(d.dealUid) === normalizeUid(deal.dealUid)),
  );
  deals.push(deal);
  localStorage.setItem(KEY, JSON.stringify(deals));
  window.dispatchEvent(new Event('candid-commissions-updated'));
}

export function isDealAdded(supplier: SupplierId, dealUid: string): boolean {
  const uid = normalizeUid(dealUid);
  return getAddedDeals().some((d) => d.supplier === supplier && normalizeUid(d.dealUid) === uid);
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

/** Synthetic BMW deal so added deals participate in commission matching. */
export function addedDealToBmwDeal(added: AddedDeal): BmwDeal {
  return {
    rowNum: 0,
    paySource: paySourceForSupplier(added.supplier),
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
