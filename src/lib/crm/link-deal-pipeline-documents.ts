import 'server-only';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { crmRecordExternalId, documentToRecordRow } from '@/lib/crm/db-mapper';
import { uploadCustomerDocumentFile } from '@/lib/crm/upload-customer-document-file';
import type { CustomerDocument, RecordKind } from '@/lib/customer-records';
import type { PublishedQuoteSnapshot, QuoteProposalDocument } from '@/lib/quotes/types';
import type { PublishedAnalysisSnapshot } from '@/lib/bill-parse-types';

const PROPOSAL_BUCKET = 'service-bills';
const DOCS_BUCKET = 'candid_documents';

type ProposalCandidate = {
  key: string;
  name: string;
  storagePath?: string;
  kind: RecordKind;
  description?: string;
};

function collectFromProposalDoc(
  key: string,
  doc: QuoteProposalDocument | undefined,
  kind: RecordKind,
  description?: string,
): ProposalCandidate[] {
  if (!doc) return [];
  const name = (doc.name || doc.filename || 'Proposal').trim();
  const storagePath = doc.storagePath?.trim();
  if (!storagePath && !name) return [];
  return [{ key, name, storagePath, kind, description }];
}

function collectFromQuoteSnapshot(
  snapshot: PublishedQuoteSnapshot | null | undefined,
  prefix: string,
): ProposalCandidate[] {
  if (!snapshot) return [];
  const out: ProposalCandidate[] = [];
  out.push(
    ...collectFromProposalDoc(
      `${prefix}-root`,
      snapshot.proposalDocument,
      'proposal',
      'Won quote / proposal',
    ),
  );
  for (const item of snapshot.quoteItems ?? []) {
    out.push(
      ...collectFromProposalDoc(
        `${prefix}-item-${item.id}`,
        item.proposalDocument,
        'proposal',
        item.label ? `Quote: ${item.label}` : 'Quote item proposal',
      ),
    );
    out.push(
      ...collectFromProposalDoc(
        `${prefix}-response-${item.id}`,
        item.responseQuote,
        'proposal',
        'Supplier quote response',
      ),
    );
  }
  return out;
}

async function ensureCandidDocumentsPath(params: {
  customerExternalId: string;
  documentId: string;
  filename: string;
  sourcePath: string;
}): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  // Already in CRM docs layout — reuse as-is.
  if (params.sourcePath.startsWith('customers/') || params.sourcePath.startsWith('deal-contracts/')) {
    return params.sourcePath;
  }

  let blob: Blob | null = null;
  for (const bucket of [PROPOSAL_BUCKET, DOCS_BUCKET]) {
    const { data, error } = await admin.storage.from(bucket).download(params.sourcePath);
    if (!error && data) {
      blob = data;
      break;
    }
  }
  if (!blob) {
    console.warn('[link-deal-pipeline-documents] could not download', params.sourcePath);
    return null;
  }

  const { storagePath } = await uploadCustomerDocumentFile({
    customerExternalId: params.customerExternalId,
    documentId: params.documentId,
    file: blob,
    filename: params.filename,
  });
  return storagePath;
}

async function upsertLinkedDocument(params: {
  customerUuid: string;
  customerExternalId: string;
  dealUuid: string;
  dealExternalId: string;
  locationId: string;
  doc: CustomerDocument;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const recordExternalId = crmRecordExternalId(params.customerExternalId, params.doc.id);
  const { customer_id: _c, external_id: _e, ...recordRow } = documentToRecordRow(
    params.customerUuid,
    params.doc,
    params.dealUuid,
  );
  const { error } = await admin.from('customer_records').upsert(
    {
      ...recordRow,
      customer_id: params.customerUuid,
      external_id: recordExternalId,
      deal_id: params.dealUuid,
    },
    { onConflict: 'external_id' },
  );
  if (error) throw new Error(error.message);
}

/**
 * After deal convert: attach quote/proposal (+ signed contract file) to the deal
 * so multi-file deal UI shows the won package (CR-0032).
 */
export async function linkPipelineDocumentsToDeal(params: {
  customerExternalId: string;
  customerUuid: string;
  dealExternalId: string;
  dealUuid: string;
  locationId?: string;
  quoteRequestId?: string | null;
  analysisReviewId?: string | null;
  contractStoragePath?: string | null;
  contractFilename?: string | null;
  vendorName?: string | null;
  actionId?: string | null;
}): Promise<number> {
  const admin = createSupabaseAdminClient();
  const locationId = params.locationId ?? '';
  const candidates: ProposalCandidate[] = [];
  let linked = 0;

  if (params.quoteRequestId) {
    const { data: quote } = await admin
      .from('quote_requests')
      .select('published_quote_snapshot, draft_quote_snapshot')
      .eq('id', params.quoteRequestId)
      .maybeSingle();
    const published = (quote?.published_quote_snapshot as PublishedQuoteSnapshot | null) ?? null;
    const draft = (quote?.draft_quote_snapshot as PublishedQuoteSnapshot | null) ?? null;
    candidates.push(...collectFromQuoteSnapshot(published, `qr-${params.quoteRequestId}-pub`));
    if (!published?.proposalDocument && !(published?.quoteItems?.length)) {
      candidates.push(...collectFromQuoteSnapshot(draft, `qr-${params.quoteRequestId}-draft`));
    }
  }

  if (params.analysisReviewId) {
    const { data: review } = await admin
      .from('bill_analysis_reviews')
      .select('published_snapshot, draft_snapshot')
      .eq('id', params.analysisReviewId)
      .maybeSingle();
    const snap =
      ((review?.published_snapshot as PublishedAnalysisSnapshot | null) ?? null) ||
      ((review?.draft_snapshot as PublishedAnalysisSnapshot | null) ?? null);
    const proposal = snap?.proposalDocument;
    if (proposal) {
      candidates.push({
        key: `ar-${params.analysisReviewId}-proposal`,
        name: proposal.filename || 'Analysis proposal',
        storagePath: proposal.storagePath,
        kind: 'proposal',
        description: 'Won analysis proposal',
      });
    }
  }

  if (params.contractStoragePath?.trim()) {
    candidates.push({
      key: params.actionId
        ? `deal-contract-${params.actionId}`
        : `deal-contract-${params.dealExternalId}`,
      name: params.contractFilename?.trim() || 'Signed contract',
      storagePath: params.contractStoragePath.trim(),
      kind: 'candid_contract',
      description: 'Signed / supplier contract',
    });
  }

  // Deduplicate by storage path or key
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const dedupe = candidate.storagePath || candidate.key;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    const documentId = candidate.key.startsWith('deal-contract-')
      ? candidate.key
      : `pipeline-${candidate.key}`;

    let storagePath = candidate.storagePath ?? null;
    if (storagePath) {
      try {
        storagePath = await ensureCandidDocumentsPath({
          customerExternalId: params.customerExternalId,
          documentId,
          filename: candidate.name,
          sourcePath: storagePath,
        });
      } catch (err) {
        console.warn('[link-deal-pipeline-documents] copy failed', err);
        storagePath = null;
      }
    }

    // Never create CRM document rows without file bytes.
    if (!storagePath) {
      console.warn(
        `[link-deal-pipeline-documents] skip ${candidate.name}: no storage path`,
      );
      continue;
    }

    const doc: CustomerDocument = {
      id: documentId,
      customerId: params.customerExternalId,
      locationId,
      filename: candidate.name,
      displayName: candidate.name,
      recordKind: candidate.kind,
      uploadedBy: 'Deal conversion',
      date: new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      size: '—',
      contractId: params.dealExternalId,
      provider: params.vendorName ?? undefined,
      description: candidate.description,
      storagePath,
    };

    try {
      await upsertLinkedDocument({
        customerUuid: params.customerUuid,
        customerExternalId: params.customerExternalId,
        dealUuid: params.dealUuid,
        dealExternalId: params.dealExternalId,
        locationId,
        doc,
      });
      linked += 1;
    } catch (err) {
      console.warn('[link-deal-pipeline-documents] upsert failed', err);
    }
  }

  // Relink any pre-existing supplier-import row for this action
  if (params.actionId) {
    const legacyId = `deal-contract-${params.actionId}`;
    const { data: legacy } = await admin
      .from('customer_records')
      .select('id, document_data, storage_path, filename, record_kind')
      .eq('customer_id', params.customerUuid)
      .eq('external_id', legacyId)
      .maybeSingle();
    if (legacy?.id) {
      const prior = (legacy.document_data as Record<string, unknown> | null) ?? {};
      await admin
        .from('customer_records')
        .update({
          deal_id: params.dealUuid,
          document_data: {
            ...prior,
            id: legacyId,
            contractId: params.dealExternalId,
            customerId: params.customerExternalId,
            locationId,
            filename: legacy.filename,
            recordKind: legacy.record_kind ?? 'external_contract',
            storagePath: legacy.storage_path,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', legacy.id);
      linked += 1;
    }
  }

  return linked;
}
