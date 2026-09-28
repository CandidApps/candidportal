import { syncContractAgentAssignment } from '@/lib/bmw/deal-agent-sync';
import { hideContract, setContractOverride } from '@/lib/customer-contract-overrides';
import { deleteCrmDeal, updateCrmDeal, updateCrmDocument } from '@/lib/crm/client-persist';
import type { CandidContractRecord, CustomerDocument } from '@/lib/customer-records';

/**
 * Saves a two-deal merge: writes the kept deal, relinks documents from the removed deal, then deletes it.
 * Returns the documents with updated links so callers can refresh local state.
 */
export async function persistContractMerge({
  customerId,
  merged,
  remove,
  documents,
}: {
  customerId: string;
  merged: CandidContractRecord;
  remove: CandidContractRecord;
  documents: CustomerDocument[];
}): Promise<{ documents: CustomerDocument[]; relinkedCount: number }> {
  setContractOverride(merged.id, {
    dealStatus: merged.dealStatus,
    dealId: merged.dealId,
    agentCommId: merged.agentCommId ?? null,
    agentOfRecord: merged.agentOfRecord,
    agentCommissionRate: merged.agentCommissionRate,
    paySource: merged.paySource,
    serviceTypeId: merged.serviceTypeId,
    solution: merged.solution,
    service: merged.service,
    product: merged.product,
    solutionDescription: merged.solutionDescription,
    merchantPricing: merged.merchantPricing,
    pricingStructureId: merged.pricingStructureId,
    pricingLineItems: merged.pricingLineItems,
    mrr: merged.mrr,
    mrc: merged.mrc,
    taxRatePercent: merged.taxRatePercent,
    estimatedTotalBill: merged.estimatedTotalBill,
    monthly: merged.monthly,
    candidCommissionRate: merged.candidCommissionRate,
    commissionAmount: merged.commissionAmount,
    spiffExpected: merged.spiffExpected,
    contractStartDate: merged.contractStartDate,
    contractEndDate: merged.contractEndDate,
    contractTerms: merged.contractTerms,
    locationId: merged.locationId,
    physicalLocationId: merged.physicalLocationId,
    billingLocationId: merged.billingLocationId,
    vendor: merged.vendor,
    expires: merged.expires,
    autoRenews: merged.autoRenews,
  });
  syncContractAgentAssignment(merged, merged.agentCommId ?? '');
  await updateCrmDeal(customerId, merged);

  const docsToRelink = documents.filter((d) => d.contractId === remove.id);
  for (const doc of docsToRelink) {
    await updateCrmDocument(customerId, { ...doc, contractId: merged.id });
  }

  hideContract(remove);
  await deleteCrmDeal(remove.id);

  return {
    documents: docsToRelink.length
      ? documents.map((d) => (d.contractId === remove.id ? { ...d, contractId: merged.id } : d))
      : documents,
    relinkedCount: docsToRelink.length,
  };
}
