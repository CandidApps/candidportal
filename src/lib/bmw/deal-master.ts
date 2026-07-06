import { addedDealToBmwDeal, getAddedDeals } from '@/lib/bmw/added-deals';
import { dealKey, normalizeUid } from '@/lib/bmw/deal-key';
import { supplierForPaySource } from '@/lib/bmw/pay-source-map';
import type { BmwAgentRate, BmwDeal } from '@/lib/bmw/types';
import type { SupplierId } from '@/lib/commissions/supplier-config';
import type { Customer, Contact, Location } from '@/components/CustomersView';
import type { Agent, AgentCustomerRef, AgentStatus } from '@/components/AgentsView';
import { buildMergedAgents } from '@/lib/bmw/merged-agents';
import { getCrmRuntimeData } from '@/lib/crm/runtime-store';

let rateById = new Map<string, BmwAgentRate>();

export function rebuildAgentRateIndex(): void {
  rateById = new Map(getBmwAgentRates().map((r) => [r.id, r]));
}

export function getBmwDeals(): BmwDeal[] {
  return getCrmRuntimeData().bmwDeals;
}

export function getBmwAgentRates(): BmwAgentRate[] {
  return getCrmRuntimeData().agentRates;
}

export function getAgentRateProfile(agentCommId: string): BmwAgentRate | undefined {
  return rateById.get(agentCommId);
}

export function resolveAgentDisplayName(agentCommId: string): string {
  const profile = rateById.get(agentCommId);
  return profile?.name || agentCommId;
}

export function resolveAgentEmail(agentCommId: string): string {
  return rateById.get(agentCommId)?.email ?? '';
}

/** Stable key for merging multiple agentCommId profiles (e.g. different rates per supplier). */
export function resolveAgentMergeKey(agentCommId: string): string {
  const profile = rateById.get(agentCommId);
  const email = profile?.email?.trim().toLowerCase();
  if (email) return email;
  const name = profile?.name?.trim().toLowerCase();
  if (name) return name.replace(/\s+/g, ' ');
  return agentCommId;
}

/** Index deals by supplier + commission match keys */
let cachedDealIndexes: ReturnType<typeof buildDealIndexesInternal> | null = null;

export function invalidateDealIndexes(): void {
  cachedDealIndexes = null;
}

export function buildDealIndexes() {
  if (!cachedDealIndexes) {
    cachedDealIndexes = buildDealIndexesInternal();
  }
  return cachedDealIndexes;
}

function addSupplierUidIndex(
  bySupplierUid: Map<string, BmwDeal[]>,
  supplier: SupplierId,
  rawUid: string,
  deal: BmwDeal,
): void {
  const uid = normalizeUid(rawUid);
  if (!uid) return;
  const indexKey = `${supplier}::${uid}`;
  const list = bySupplierUid.get(indexKey) ?? [];
  if (!list.includes(deal)) {
    list.push(deal);
    bySupplierUid.set(indexKey, list);
  }
}

function indexDealForSupplierLookup(
  deal: BmwDeal,
  byDealKey: Map<string, BmwDeal>,
  bySupplierUid: Map<string, BmwDeal[]>,
): void {
  if (deal.dealUid) {
    byDealKey.set(dealKey(deal), deal);
  }

  const supplier = supplierForPaySource(deal.paySource);
  if (!supplier) return;

  for (const rawUid of [
    deal.dealUid,
    deal.providerAccount,
    deal.serviceId,
    deal.uuid,
    deal.sandlerDealId,
    deal.cloverId,
    deal.customerId,
  ]) {
    if (rawUid) addSupplierUidIndex(bySupplierUid, supplier, rawUid, deal);
  }
}

function buildDealIndexesInternal() {
  const byDealKey = new Map<string, BmwDeal>();
  const bySupplierUid = new Map<string, BmwDeal[]>();

  for (const deal of getBmwDeals()) {
    indexDealForSupplierLookup(deal, byDealKey, bySupplierUid);
  }

  for (const added of getAddedDeals()) {
    indexDealForSupplierLookup(addedDealToBmwDeal(added), byDealKey, bySupplierUid);
  }

  return { byDealKey, bySupplierUid };
}

function slugId(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'customer';
}

const NUVIA_PARENT = 'Nuvia Dental Implant Center';

/**
 * Merchants that are sub-accounts / additional locations of a parent customer.
 * "NIC - <city>" merchants are Nuvia Dental Implant Center locations.
 */
export function parentMerchantFor(merchant: string): string {
  if (/^NIC\s*-/i.test(merchant)) return NUVIA_PARENT;
  return merchant;
}

function locationScore(deal: BmwDeal): number {
  return [deal.street, deal.city, deal.state, deal.zip].filter(Boolean).length;
}

function merchantGroupKey(deal: BmwDeal): string {
  if (deal.customerId) return `cid:${deal.customerId}`;
  return `merchant:${parentMerchantFor(deal.merchant).toLowerCase()}`;
}

/** Stable customer id used in CustomersView for a BMW deal group. */
export function bmwCustomerIdForDeal(deal: BmwDeal): string {
  if (!deal.merchant) return '';
  return `bmw-${slugId(merchantGroupKey(deal))}`;
}

export function bmwDealsToCustomers(): Customer[] {
  const groups = new Map<string, BmwDeal[]>();

  for (const deal of getBmwDeals()) {
    if (!deal.merchant) continue;
    const gk = merchantGroupKey(deal);
    const list = groups.get(gk) ?? [];
    list.push(deal);
    groups.set(gk, list);
  }

  return Array.from(groups.entries()).map(([gk, deals]) => {
    // Prefer the parent record (e.g. "Nuvia Dental Implant Center") over
    // sub-location deals (e.g. "NIC - Fresno") when naming the customer.
    const primary =
      deals.find((d) => d.merchant === parentMerchantFor(d.merchant)) ?? deals[0]!;
    const company = parentMerchantFor(primary.merchant);
    const id = bmwCustomerIdForDeal(primary);
    const agentCommId = deals.find((d) => d.agentCommId)?.agentCommId ?? '';
    const agentDisplay = agentCommId ? resolveAgentDisplayName(agentCommId) : 'Unassigned';
    const hasActive = deals.some(
      (d) => d.activeDeal || Boolean(d.paySource && supplierForPaySource(d.paySource)),
    );
    const suppliers = [...new Set(deals.map((d) => d.paySource).filter(Boolean))];
    const products = [...new Set(deals.map((d) => d.product || d.provider).filter(Boolean))];

    const contacts: Contact[] = [];
    if (primary.customerContactName) {
      contacts.push({
        id: `${id}-contact`,
        name: primary.customerContactName,
        email: '',
        phone: '',
        role: 'Primary Contact',
        isPrimary: true,
      });
    }

    const locations: Location[] = [];
    if (primary.street || primary.city) {
      locations.push({
        id: `${id}-loc`,
        label: 'Primary',
        street: primary.street,
        city: primary.city,
        state: primary.state,
        zip: primary.zip,
        isPrimary: true,
      });
    }

    // Sub-account merchants (e.g. "NIC - Fresno") become locations of the parent.
    const subMerchants = new Map<string, BmwDeal>();
    for (const deal of deals) {
      if (deal.merchant === company) continue;
      const existing = subMerchants.get(deal.merchant);
      if (!existing || locationScore(deal) > locationScore(existing)) {
        subMerchants.set(deal.merchant, deal);
      }
    }
    let locIdx = 0;
    for (const [merchant, deal] of subMerchants) {
      locations.push({
        id: `${id}-sub-${locIdx++}`,
        label: merchant,
        street: deal.street,
        city: deal.city,
        state: deal.state,
        zip: deal.zip,
        isPrimary: false,
      });
    }

    const totalMrc = deals.reduce((s, d) => s + (d.contractMrc ?? 0), 0);

    const subLocationCount = subMerchants.size;
    return {
      id,
      company,
      industry: products.slice(0, 2).join(' · ') || primary.provider || undefined,
      description: deals.length > 1
        ? `${deals.length} deals across ${suppliers.join(', ')}${subLocationCount ? ` · ${subLocationCount} locations` : ''}.`
        : primary.product || primary.provider || undefined,
      status: hasActive ? 'active' : 'prospect',
      agent: agentDisplay,
      spend: Math.round(totalMrc),
      savings: 0,
      contracts: deals.length,
      files: 0,
      since: 'BMW import',
      notes: `Deal UIDs: ${deals.map((d) => d.dealUid).filter(Boolean).slice(0, 5).join(', ')}${deals.length > 5 ? '…' : ''}`,
      contacts,
      locations,
    } satisfies Customer;
  }).sort((a, b) => a.company.localeCompare(b.company));
}

function agentStatusFromRate(profile: BmwAgentRate): AgentStatus {
  if (profile.name.startsWith('*')) return 'active';
  if (profile.commissionRate <= 0) return 'inactive';
  return 'active';
}

/** Unique BMW customers (deal groups) attributed to each agentCommId. */
export function bmwCustomersByAgent(): Map<string, AgentCustomerRef[]> {
  const groups = new Map<string, BmwDeal[]>();

  for (const deal of getBmwDeals()) {
    if (!deal.merchant) continue;
    const gk = merchantGroupKey(deal);
    const list = groups.get(gk) ?? [];
    list.push(deal);
    groups.set(gk, list);
  }

  const byAgent = new Map<string, Map<string, string>>();

  for (const deals of groups.values()) {
    const primary =
      deals.find((d) => d.merchant === parentMerchantFor(d.merchant)) ?? deals[0]!;
    const customerId = bmwCustomerIdForDeal(primary);
    const company = parentMerchantFor(primary.merchant);
    const agentIds = new Set(
      deals.map((d) => d.agentCommId?.trim()).filter((id): id is string => Boolean(id)),
    );

    for (const agentId of agentIds) {
      const bucket = byAgent.get(agentId) ?? new Map<string, string>();
      bucket.set(customerId, company);
      byAgent.set(agentId, bucket);
    }
  }

  const out = new Map<string, AgentCustomerRef[]>();
  for (const [agentId, customers] of byAgent) {
    out.set(
      agentId,
      [...customers.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    );
  }
  return out;
}

export function bmwRatesToAgents(): Agent[] {
  return buildMergedAgents();
}
