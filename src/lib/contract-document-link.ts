import type { CandidContractRecord, CustomerDocument } from '@/lib/customer-records';
import { customerDocumentUrl, isCustomerDocumentAvailable } from '@/lib/crm/document-url';

const CONTRACT_KINDS = new Set(['candid_contract', 'external_contract']);

/** Preferred display order for deal-linked files (CR-0032). */
const KIND_RANK: Record<string, number> = {
  candid_contract: 0,
  external_contract: 1,
  proposal: 2,
  other: 3,
};

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

function kindRank(kind: string): number {
  return KIND_RANK[kind] ?? 40;
}

export function sortDealDocuments(docs: CustomerDocument[]): CustomerDocument[] {
  return [...docs].sort((a, b) => {
    const kr = kindRank(a.recordKind) - kindRank(b.recordKind);
    if (kr !== 0) return kr;
    const av = isCustomerDocumentAvailable(a) ? 0 : 1;
    const bv = isCustomerDocumentAvailable(b) ? 0 : 1;
    if (av !== bv) return av - bv;
    return (a.displayName || a.filename).localeCompare(b.displayName || b.filename);
  });
}

function pickBestDocument(candidates: CustomerDocument[]): CustomerDocument | undefined {
  const sorted = sortDealDocuments(candidates);
  return (
    sorted.find(
      (d) => d.recordKind === 'candid_contract' && isCustomerDocumentAvailable(d),
    ) ??
    sorted.find((d) => Boolean(d.storagePath) && isCustomerDocumentAvailable(d)) ??
    sorted.find((d) => isCustomerDocumentAvailable(d)) ??
    sorted.find((d) => d.recordKind === 'candid_contract') ??
    sorted[0]
  );
}

/**
 * All documents explicitly linked to this deal (`contractId`).
 * Does not include heuristic orphan matches — those only feed the primary helper.
 */
export function findDocumentsForContract(
  contract: CandidContractRecord,
  documents: CustomerDocument[],
): CustomerDocument[] {
  return sortDealDocuments(documents.filter((d) => d.contractId === contract.id));
}

/** Best-effort primary document for portal / single-icon UI (CR-0009 / member cards). */
export function findDocumentForContract(
  contract: CandidContractRecord,
  documents: CustomerDocument[],
): CustomerDocument | undefined {
  const linked = findDocumentsForContract(contract, documents);
  if (linked.length) return pickBestDocument(linked);

  const contractKey = normalizeProviderKey(
    [contract.solution, contract.vendor, contract.product].filter(Boolean).join(' '),
  );

  const kindCandidates = documents.filter((d) => CONTRACT_KINDS.has(d.recordKind));
  if (contractKey.trim()) {
    const matched = kindCandidates.filter((d) => providerMatches(contractKey, d));
    if (matched.length === 1) return pickBestDocument(matched);

    // Fall back to proposals when no signed contract file is tagged
    const proposals = documents.filter(
      (d) => d.recordKind === 'proposal' && providerMatches(contractKey, d),
    );
    if (proposals.length === 1) return pickBestDocument(proposals);
  }

  // Orphan uploads: only when a single unambiguous candidate exists
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
