import type { CandidContractRecord, CustomerDocument } from '@/lib/customer-records';
import { customerDocumentUrl, isCustomerDocumentAvailable } from '@/lib/crm/document-url';

const CONTRACT_KINDS = new Set(['candid_contract', 'external_contract']);

function normalizeProviderKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

function providerMatches(contractKey: string, doc: CustomerDocument): boolean {
  const name = doc.filename.toLowerCase();
  const docProvider = normalizeProviderKey(doc.provider ?? '');
  if (docProvider && (docProvider.includes(contractKey) || contractKey.includes(docProvider))) {
    return true;
  }
  const firstToken = contractKey.split(/\s+/).find((t) => t.length >= 4);
  return Boolean(firstToken && name.includes(firstToken));
}

function pickBestDocument(candidates: CustomerDocument[]): CustomerDocument | undefined {
  return (
    candidates.find(
      (d) => d.recordKind === 'candid_contract' && isCustomerDocumentAvailable(d),
    ) ??
    candidates.find((d) => Boolean(d.storagePath) && isCustomerDocumentAvailable(d)) ??
    candidates.find((d) => isCustomerDocumentAvailable(d)) ??
    candidates.find((d) => d.recordKind === 'candid_contract') ??
    candidates[0]
  );
}

/** Best-effort match from contract to an uploaded / imported customer document. */
export function findDocumentForContract(
  contract: CandidContractRecord,
  documents: CustomerDocument[],
): CustomerDocument | undefined {
  const linked = documents.find((d) => d.contractId === contract.id);
  if (linked) return linked;

  const contractKey = normalizeProviderKey(
    [contract.solution, contract.vendor, contract.product].filter(Boolean).join(' '),
  );

  const kindCandidates = documents.filter((d) => CONTRACT_KINDS.has(d.recordKind));
  if (contractKey.trim()) {
    const matched = kindCandidates.filter((d) => providerMatches(contractKey, d));
    if (matched.length) return pickBestDocument(matched);

    // Fall back to proposals when no signed contract file is tagged
    const proposals = documents.filter(
      (d) => d.recordKind === 'proposal' && providerMatches(contractKey, d),
    );
    if (proposals.length) return pickBestDocument(proposals);
  }

  // Orphan uploads (e.g. order forms named after the account, not the vendor):
  // if this is the only active-style contract doc, attach it.
  const unlinkedContractDocs = kindCandidates.filter((d) => !d.contractId);
  if (unlinkedContractDocs.length === 1) {
    return pickBestDocument(unlinkedContractDocs);
  }
  if (kindCandidates.length === 1) {
    return pickBestDocument(kindCandidates);
  }

  return undefined;
}

export function documentViewUrl(doc: CustomerDocument): string | null {
  return customerDocumentUrl(doc);
}
