'use client';

import { addedDealToBmwDeal, getAddedDeals, saveAddedDeal } from '@/lib/bmw/added-deals';
import { setDealAgentCommIdOverride } from '@/lib/bmw/agent-comm-history';
import { dealKey, normalizeUid } from '@/lib/bmw/deal-key';
import {
  getBmwDeals,
  invalidateDealIndexes,
  resolveAgentDisplayName,
} from '@/lib/bmw/deal-master';
import { invalidateMergedAgentsCache } from '@/lib/bmw/merged-agents';
import { allDealsForCustomerContracts } from '@/lib/customer-contracts-from-deals';
import { getCrmRuntimeData, setCrmRuntimeData } from '@/lib/crm/runtime-store';
import type { CandidContractRecord } from '@/lib/customer-records';
import type { BmwDeal } from '@/lib/bmw/types';

export function findBmwDealForContract(contract: CandidContractRecord): BmwDeal | null {
  const deals = allDealsForCustomerContracts();
  if (contract.dealId?.trim()) {
    const wanted = normalizeUid(contract.dealId);
    const match = deals.find((d) => normalizeUid(d.dealUid) === wanted);
    if (match) return match;
  }
  for (const deal of deals) {
    const contractId = `ct-bmw-${normalizeUid(dealKey(deal)).replace(/[^a-z0-9]+/g, '-')}`;
    if (contractId === contract.id) return deal;
  }
  return null;
}

/** Push contract agent changes into BMW runtime, DB, and commission period snapshots. */
export function syncContractAgentAssignment(
  contract: CandidContractRecord,
  agentCommId: string,
): void {
  const deal = findBmwDealForContract(contract);
  if (!deal) return;

  const uid = normalizeUid(deal.dealUid);
  const agentName = agentCommId ? resolveAgentDisplayName(agentCommId) : '';
  let patched = false;

  const runtime = getCrmRuntimeData();
  const bmwDeals = runtime.bmwDeals.map((d) => {
    if (normalizeUid(d.dealUid) !== uid || d.paySource !== deal.paySource) return d;
    patched = true;
    return { ...d, agentCommId, agentName };
  });
  if (patched) {
    setCrmRuntimeData({ bmwDeals });
    invalidateDealIndexes();
    invalidateMergedAgentsCache();
  }

  for (const added of getAddedDeals()) {
    if (normalizeUid(added.dealUid) !== uid) continue;
    if (added.paySource && added.paySource !== deal.paySource) continue;
    saveAddedDeal({ ...added, agentCommId, agentName });
    patched = true;
    break;
  }

  if (!patched && !getBmwDeals().some((d) => normalizeUid(d.dealUid) === uid)) {
    return;
  }

  setDealAgentCommIdOverride({ ...deal, agentCommId, agentName }, agentCommId || null);

  // Persist to bmw_deals so refresh/hydrate does not restore the old agent (e.g. CANDID1).
  if (typeof window !== 'undefined' && deal.dealUid?.trim() && deal.paySource?.trim()) {
    void fetch('/api/admin/bmw-deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dealUid: deal.dealUid,
        merchant: deal.merchant || contract.customerName || 'Merchant',
        paySource: deal.paySource,
        agentCommId: agentCommId || 'CANDID1',
        agentName: agentName || (agentCommId ? agentCommId : 'Candid Solutions'),
        product: deal.product || undefined,
        provider: deal.provider || undefined,
        parentCustomerId: deal.customerId || undefined,
      }),
    }).catch(() => undefined);
  }
}
