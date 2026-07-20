import type { Customer, Location } from '@/components/CustomersView';
import { addedDealToBmwDeal, getAddedDeals, type AddedDeal } from '@/lib/bmw/added-deals';
import { dealKey, normalizeUid } from '@/lib/bmw/deal-key';
import {
  bmwCustomerIdForDeal,
  getAgentRateProfile,
  getBmwDeals,
  parentMerchantFor,
  resolveAgentDisplayName,
} from '@/lib/bmw/deal-master';
import { getAddedDeal } from '@/lib/bmw/added-deals';
import { supplierForPaySource } from '@/lib/bmw/pay-source-map';
import type { BmwDeal } from '@/lib/bmw/types';
import type { CandidContractRecord, DealStatus } from '@/lib/customer-records';

function primaryLocationId(customer: Customer): string {
  return customer.locations.find((l) => l.isPrimary)?.id ?? customer.locations[0]?.id ?? '';
}

/** Match a BMW deal merchant to a customer location label. */
export function resolveLocationIdForDeal(customer: Customer, deal: BmwDeal): string {
  const company = customer.company;
  const merchant = deal.merchant.trim();

  const byLabel = customer.locations.find(
    (l) => l.label.trim().toLowerCase() === merchant.toLowerCase(),
  );
  if (byLabel) return byLabel.id;

  if (merchant.toLowerCase() === company.toLowerCase()) {
    return primaryLocationId(customer);
  }

  const parent = parentMerchantFor(merchant);
  if (parent.toLowerCase() === company.toLowerCase()) {
    const byParentLabel = customer.locations.find(
      (l) => l.label.trim().toLowerCase() === merchant.toLowerCase(),
    );
    if (byParentLabel) return byParentLabel.id;
    return primaryLocationId(customer);
  }

  return primaryLocationId(customer);
}

function isCommissionSupplierDeal(deal: BmwDeal): boolean {
  return Boolean(deal.paySource && supplierForPaySource(deal.paySource));
}

function resolveDealStatus(deal: BmwDeal): DealStatus {
  const status = (deal.status || '').toLowerCase();
  if (status.includes('cancel')) return 'cancelled';
  if (status.includes('expir')) return 'expiring';
  if (status.includes('pending')) return 'pending';
  if (status.includes('draft')) return 'draft';
  if (deal.activeDeal || isCommissionSupplierDeal(deal)) return 'active';
  return 'expired';
}

function normalizeMrc(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  if (value > 100_000) return 0;
  return Math.round(value * 100) / 100;
}

function inferServiceFromProvider(provider: string): string {
  const p = provider.trim().toLowerCase();
  if (!p) return '';
  if (/comcast|spectrum|att|verizon|cox|frontier|lumen|windstream|centurylink|zayo/.test(p)) {
    return 'Internet / connectivity';
  }
  if (/ringcentral|vonage|dialpad|8x8|zoom|nextiva/.test(p)) return 'UCaaS / phone';
  if (/microsoft|google|adobe/.test(p)) return 'Cloud / productivity';
  if (/nuvei|worldpay|square|clover|fiserv|elavon|stripe|payment|payjunction|linked2pay|hyfin|checkcommerce|vendara/.test(p)) {
    return 'Merchant processing';
  }
  return '';
}

function serviceLabel(deal: BmwDeal): string {
  if (deal.product?.trim()) return deal.product.trim();
  if (deal.serviceDescription?.trim()) return deal.serviceDescription.trim();
  return inferServiceFromProvider(deal.provider);
}

/** Primary service line: BMW provider + product/service (not pay source). */
export function dealServiceTitle(deal: BmwDeal): string {
  const servicePart = serviceLabel(deal);
  const provider = deal.provider?.trim() || '';
  if (provider && servicePart) return `${provider} — ${servicePart}`;
  if (provider) return provider;
  if (servicePart) return servicePart;
  return deal.paySource || 'Commission deal';
}

function contractTitleFromDeal(deal: BmwDeal): string {
  return dealServiceTitle(deal);
}

/** Resolve contract-style service title from a deal UID (BMW master or added deals). */
export function dealServiceTitleForUid(dealUid: string): string | null {
  const key = normalizeUid(dealUid);
  if (!key) return null;
  for (const deal of getBmwDeals()) {
    if (normalizeUid(deal.dealUid) === key) return dealServiceTitle(deal);
  }
  for (const added of getAddedDeals()) {
    if (normalizeUid(added.dealUid) === key) return dealServiceTitle(addedDealToBmwDeal(added));
  }
  return null;
}

/** Build display title from a contract record (respects overrides). */
export function contractServiceTitle(ct: CandidContractRecord): string {
  const servicePart = ct.product || ct.service || '';
  const provider = ct.solution?.trim() || '';
  if (provider && servicePart) return `${provider} — ${servicePart}`;
  if (provider) return provider;
  if (servicePart) return servicePart;
  return ct.vendor || '—';
}

export function bmwDealToContract(
  deal: BmwDeal,
  customer: Customer,
): CandidContractRecord {
  const locationId = resolveLocationIdForDeal(customer, deal);
  const mrr = normalizeMrc(deal.contractMrc);
  const dealStatus = resolveDealStatus(deal);
  const active = dealStatus === 'active' || dealStatus === 'expiring' || dealStatus === 'pending';
  const supplierId = deal.paySource ? supplierForPaySource(deal.paySource) : null;
  const added =
    supplierId && deal.dealUid ? getAddedDeal(supplierId, deal.dealUid) : undefined;
  const agentRate =
    added?.commissionRate ??
    (deal.agentCommId ? getAgentRateProfile(deal.agentCommId)?.commissionRate : undefined);

  return {
    id: `ct-bmw-${normalizeUid(dealKey(deal)).replace(/[^a-z0-9]+/g, '-')}`,
    customerId: customer.id,
    locationId,
    dealId: deal.dealUid || undefined,
    agentCommId: deal.agentCommId || undefined,
    agentOfRecord: deal.agentCommId ? resolveAgentDisplayName(deal.agentCommId) : deal.agentName || undefined,
    agentCommissionRate: agentRate,
    paySource: deal.paySource || undefined,
    solution: deal.provider || undefined,
    service: serviceLabel(deal),
    product: deal.product || undefined,
    solutionDescription: deal.serviceDescription || undefined,
    mrr: mrr || undefined,
    mrc: mrr || undefined,
    dealStatus: active ? (dealStatus === 'expiring' ? 'expiring' : 'active') : dealStatus,
    physicalLocationId: locationId,
    billingLocationId: locationId,
    vendor: contractTitleFromDeal(deal),
    monthly: mrr,
    expires: active ? 'Active — commission deal' : '—',
    autoRenews: false,
  };
}

function customerById(customers: Customer[]): Map<string, Customer> {
  return new Map(customers.map((c) => [c.id, c]));
}

/** Build Active Contracts from BMW deal master (+ optional added deals). */
export function buildContractsFromDeals(
  customers: Customer[],
  deals: BmwDeal[],
): Record<string, CandidContractRecord[]> {
  const byCustomer = customerById(customers);
  const out: Record<string, CandidContractRecord[]> = {};
  const seen = new Set<string>();
  const seenProviderAccount = new Set<string>();

  for (const deal of deals) {
    if (!deal.merchant?.trim() || !deal.dealUid?.trim()) continue;

    const preferredId = deal.customerId?.trim();
    const customer =
      (preferredId ? byCustomer.get(preferredId) : undefined) ??
      byCustomer.get(bmwCustomerIdForDeal(deal)) ??
      customers.find((c) => {
        const merchant = deal.merchant.trim().toLowerCase();
        const company = c.company.trim().toLowerCase();
        return (
          company === merchant ||
          parentMerchantFor(c.company).toLowerCase() === parentMerchantFor(deal.merchant).toLowerCase()
        );
      });
    if (!customer) continue;

    const customerId = customer.id;
    const key = `${customerId}::${dealKey(deal)}`;
    if (seen.has(key)) continue;

    const providerAccount = deal.providerAccount?.trim();
    if (providerAccount) {
      const acctKey = `${customerId}::${deal.merchant.trim().toLowerCase()}::${providerAccount}`;
      if (seenProviderAccount.has(acctKey)) continue;
      seenProviderAccount.add(acctKey);
    }

    seen.add(key);

    const contract = bmwDealToContract(deal, customer);
    const list = out[customerId] ?? [];
    list.push(contract);
    out[customerId] = list;
  }

  for (const contracts of Object.values(out)) {
    contracts.sort((a, b) => {
      const loc = a.vendor.localeCompare(b.vendor, undefined, { sensitivity: 'base' });
      if (loc !== 0) return loc;
      return (a.dealId ?? '').localeCompare(b.dealId ?? '', undefined, { sensitivity: 'base' });
    });
  }

  return out;
}

export function mergeContractMaps(
  ...maps: Record<string, CandidContractRecord[]>[]
): Record<string, CandidContractRecord[]> {
  const out: Record<string, CandidContractRecord[]> = {};
  const seen = new Set<string>();

  for (const map of maps) {
    for (const [customerId, contracts] of Object.entries(map)) {
      const list = out[customerId] ?? [];
      for (const contract of contracts) {
        const key = `${customerId}::${contract.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        list.push(contract);
      }
      out[customerId] = list;
    }
  }

  return out;
}

/** BMW master deals plus portal-added commission deals (client only). */
export function allDealsForCustomerContracts(): BmwDeal[] {
  const master = getBmwDeals();
  if (typeof window === 'undefined') return master;
  const added = getAddedDeals().map(addedDealToBmwDeal);
  return [...master, ...added];
}

export function buildAllCustomerContracts(customers: Customer[]): Record<string, CandidContractRecord[]> {
  return buildContractsFromDeals(customers, allDealsForCustomerContracts());
}

function normalizeProviderName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*business\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Stable key for deduping and hiding contracts (provider+MRC, deal id, or record id). */
export function contractDedupeKey(ct: CandidContractRecord): string {
  const provider = normalizeProviderName(ct.solution ?? ct.vendor ?? '');
  const monthly = ct.mrc ?? ct.monthly ?? 0;
  if (provider && monthly > 0) {
    return `${provider}|${Math.round(monthly * 100)}`;
  }
  return ct.dealId?.trim() || ct.id;
}

/** All keys stored when a contract is removed from a customer record. */
export function contractHideKeys(ct: CandidContractRecord): string[] {
  return [...new Set([ct.id, contractDedupeKey(ct)])];
}

export function contractRichnessScore(ct: CandidContractRecord): number {
  let score = 0;
  if (ct.id.startsWith('import-')) score += 10;
  if (ct.contractStartDate || ct.contractEndDate) score += 5;
  if (ct.product && !/duplicate/i.test(ct.product)) score += 4;
  if (ct.solutionDescription) score += 2;
  if (ct.dealId) score += 1;
  return score;
}

/** Drop explicit duplicate rows and collapse same provider+MRC deals from BMW + portal import. */
export function dedupeCustomerContracts(contracts: CandidContractRecord[]): CandidContractRecord[] {
  const filtered = contracts.filter((ct) => {
    const blob = `${ct.product ?? ''} ${ct.solutionDescription ?? ''} ${ct.service ?? ''}`.toLowerCase();
    return !/duplicate/.test(blob);
  });

  const groups = new Map<string, CandidContractRecord[]>();

  for (const ct of filtered) {
    const key = contractDedupeKey(ct);
    const list = groups.get(key) ?? [];
    list.push(ct);
    groups.set(key, list);
  }

  const out: CandidContractRecord[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => contractRichnessScore(b) - contractRichnessScore(a));
    out.push(group[0]!);
  }

  return out;
}

export function dedupeCustomerContractMap(
  map: Record<string, CandidContractRecord[]>,
): Record<string, CandidContractRecord[]> {
  const out: Record<string, CandidContractRecord[]> = {};
  for (const [customerId, contracts] of Object.entries(map)) {
    out[customerId] = dedupeCustomerContracts(contracts);
  }
  return out;
}

/** Attach added deals that reference a parent customer by portal id. */
export function addedDealsForCustomer(customerId: string, company: string): BmwDeal[] {
  if (typeof window === 'undefined') return [];
  return getAddedDeals()
    .filter(
      (d: AddedDeal) =>
        d.parentCustomerId === customerId ||
        (d.parentCustomerName && d.parentCustomerName.toLowerCase() === company.toLowerCase()),
    )
    .map(addedDealToBmwDeal);
}
