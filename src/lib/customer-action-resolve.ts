import { contractServiceTitle } from '@/lib/customer-contracts-from-deals';
import { setContractOverride } from '@/lib/customer-contract-overrides';
import type { ContractDocumentExtractResult } from '@/lib/contract-document-extract';
import type { ActionResolutionOutcome } from '@/lib/customer-actions-store';
import type { CandidContractRecord, CustomerDocument } from '@/lib/customer-records';
import type { CustomerAction } from '@/lib/portal-import/merge';

const newId = () => `id-${Math.random().toString(36).slice(2, 10)}`;

function normalizeProvider(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function findMatchingContract(
  contracts: CandidContractRecord[],
  action: CustomerAction,
  extract?: ContractDocumentExtractResult,
): CandidContractRecord | undefined {
  const providerKey = normalizeProvider(
    extract?.provider ?? action.provider ?? '',
  );
  if (!providerKey) return undefined;

  return contracts.find((c) => {
    const hay = normalizeProvider(
      [c.solution, c.vendor, c.product, contractServiceTitle(c)].filter(Boolean).join(' '),
    );
    return hay.includes(providerKey) || providerKey.includes(hay.slice(0, 8));
  });
}

function dealStatusForOutcome(outcome: ActionResolutionOutcome): CandidContractRecord['dealStatus'] {
  if (outcome === 'renewed' || outcome === 'completed') return 'active';
  if (outcome === 'cancelled') return 'cancelled';
  if (outcome === 'deferred') return 'expiring';
  return 'active';
}

export type ResolveActionArtifacts = {
  document?: CustomerDocument;
  contracts: CandidContractRecord[];
};

export function applyActionResolutionToContracts({
  customerId,
  locationId,
  action,
  outcome,
  contracts,
  extract,
  uploadedBy,
  file,
}: {
  customerId: string;
  locationId: string;
  action: CustomerAction;
  outcome: ActionResolutionOutcome;
  contracts: CandidContractRecord[];
  extract?: ContractDocumentExtractResult;
  uploadedBy: string;
  file?: File | null;
}): ResolveActionArtifacts {
  const next = [...contracts];
  let document: CustomerDocument | undefined;

  if (file) {
    const contractId = newId();
    document = {
      id: newId(),
      customerId,
      locationId,
      filename: file.name,
      recordKind: 'candid_contract',
      uploadedBy,
      date: new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      size: `${Math.max(1, Math.round(file.size / 1024))} KB`,
      contractId,
    };
  }

  const existing = findMatchingContract(next, action, extract);
  const status = dealStatusForOutcome(outcome);

  if (existing) {
    const patch: Partial<CandidContractRecord> = {
      dealStatus: status,
    };
    if (extract?.provider) patch.solution = extract.provider;
    if (extract?.product) patch.product = extract.product;
    if (extract?.serviceDescription) patch.solutionDescription = extract.serviceDescription;
    if (extract?.mrc != null) {
      patch.mrc = extract.mrc;
      patch.mrr = extract.mrr ?? extract.mrc;
      patch.monthly = extract.mrc;
    }
    if (extract?.contractStartDate) patch.contractStartDate = extract.contractStartDate;
    if (extract?.contractEndDate) {
      patch.contractEndDate = extract.contractEndDate;
      patch.expires = extract.contractEndDate;
    }
    if (extract?.paySource) patch.paySource = extract.paySource;
    if (extract?.dealId) patch.dealId = extract.dealId;

    if (outcome === 'renewed' && !extract?.contractEndDate) {
      patch.dealStatus = 'active';
    }

    setContractOverride(existing.id, patch);
    const updated = { ...existing, ...patch };
    const idx = next.findIndex((c) => c.id === existing.id);
    if (idx >= 0) next[idx] = updated;
    if (document) document.contractId = existing.id;
    return { document, contracts: next };
  }

  if (outcome === 'renewed' && extract && (extract.provider || extract.mrc)) {
    const contractId = document?.contractId ?? newId();
    const mrc = extract.mrc ?? 0;
    const created: CandidContractRecord = {
      id: contractId,
      customerId,
      locationId,
      dealId: extract.dealId,
      paySource: extract.paySource,
      solution: extract.provider,
      service: extract.product,
      product: extract.product,
      solutionDescription: extract.serviceDescription,
      mrc: extract.mrc,
      mrr: extract.mrr ?? extract.mrc,
      dealStatus: 'active',
      contractStartDate: extract.contractStartDate,
      contractEndDate: extract.contractEndDate,
      physicalLocationId: locationId,
      billingLocationId: locationId,
      vendor:
        [extract.provider, extract.product].filter(Boolean).join(' — ') ||
        action.provider ||
        'Candid Contract',
      monthly: mrc,
      expires: extract.contractEndDate || '—',
      autoRenews: false,
    };
    next.unshift(created);
    if (document) document.contractId = contractId;
    return { document, contracts: next };
  }

  if (document && !document.contractId) {
    document.contractId = undefined;
  }

  return { document, contracts: next };
}
