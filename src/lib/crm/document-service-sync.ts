import type { CandidContractRecord, DealStatus } from '@/lib/customer-records';
import type { CustomerDocument } from '@/lib/customer-records';
import type { DocumentServiceStatus } from '@/lib/crm/document-metadata';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getCrmCustomerUuid } from '@/lib/crm/load-from-db';
import type { PortalNonCandidService } from '@/lib/portal-import/merge';

function newServiceId() {
  return `doc-svc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function mapCandidStatusToDealStatus(status: DocumentServiceStatus): DealStatus {
  if (status === 'needs_renewal') return 'expiring';
  if (status === 'needs_requote') return 'expired';
  return 'active';
}

function serviceTitle(doc: CustomerDocument): string {
  const name =
    doc.documentMetadata?.displayName?.trim() ||
    doc.description?.trim() ||
    doc.filename.replace(/\.[^.]+$/, '');
  return name || 'Service';
}

function buildCandidContractFromDocument(
  doc: CustomerDocument,
  contractId: string,
  customerExternalId: string,
): CandidContractRecord {
  const meta = doc.documentMetadata;
  const status = meta?.documentServiceStatus ?? 'active';
  const candidMrc = meta?.candidMrc ?? doc.amount ?? 0;
  const provider = meta?.previousProvider ?? doc.provider ?? 'Provider';

  return {
    id: contractId,
    customerId: customerExternalId,
    locationId: doc.locationId,
    vendor: provider,
    solution: provider,
    product: serviceTitle(doc),
    monthly: Number(candidMrc) || 0,
    mrc: Number(candidMrc) || 0,
    dealStatus: mapCandidStatusToDealStatus(status as DocumentServiceStatus),
    expires: '—',
    autoRenews: false,
    isCandid: true,
    documentMetadataSourceId: doc.id,
    previousProviderMrc: meta?.previousMrc ?? undefined,
  };
}

function buildNonCandidPortalService(doc: CustomerDocument): PortalNonCandidService {
  const meta = doc.documentMetadata;
  const prospecting = meta?.documentServiceStatus === 'prospecting';
  const provider = meta?.previousProvider ?? doc.provider ?? serviceTitle(doc);
  const mrc = meta?.candidMrc ?? doc.amount ?? null;

  return {
    provider,
    product: serviceTitle(doc),
    accountNum: doc.id.slice(0, 8),
    mrc: mrc != null ? Number(mrc) : null,
    isCandid: false,
    note: prospecting
      ? 'Prospecting — Candid pursuing this business'
      : 'Tracking only — record for customer reference',
    lines: {
      documentId: doc.id,
      prospecting,
      trackingOnly: meta?.documentServiceStatus === 'tracking_only',
      previousMrc: meta?.previousMrc ?? null,
    },
  };
}

/**
 * After a document is saved, upsert linked deal or portal non-Candid service per routing rules.
 */
export async function syncDocumentToMemberService(params: {
  customerExternalId: string;
  document: CustomerDocument;
}): Promise<{ contractId?: string }> {
  const meta = params.document.documentMetadata;
  if (!meta?.documentServiceStatus || meta.isCandidAgreement == null) {
    return {};
  }

  const customerUuid = await getCrmCustomerUuid(params.customerExternalId);
  if (!customerUuid) return {};

  const admin = createSupabaseAdminClient();
  const status = meta.documentServiceStatus as DocumentServiceStatus;

  if (meta.isCandidAgreement) {
    const contractId = params.document.contractId ?? newServiceId();
    const contract = buildCandidContractFromDocument(
      params.document,
      contractId,
      params.customerExternalId,
    );
    const { error } = await admin.from('deals').upsert(
      {
        customer_id: customerUuid,
        external_id: contractId,
        location_external_id: params.document.locationId || null,
        deal_status: contract.dealStatus,
        provider: contract.vendor,
        product: contract.product,
        monthly_cost: contract.mrc ?? contract.monthly,
        contract_data: contract,
        service_lifecycle: 'active',
      },
      { onConflict: 'external_id' },
    );
    if (error) throw new Error(error.message);

    return { contractId };
  }

  // Non-Candid: merge into customer portal_data.nonCandidServices
  const { data: customerRow, error: loadErr } = await admin
    .from('customers')
    .select('portal_data')
    .eq('id', customerUuid)
    .maybeSingle();
  if (loadErr) throw new Error(loadErr.message);

  const portal = (customerRow?.portal_data as Record<string, unknown>) ?? {};
  const existing = (portal.nonCandidServices as PortalNonCandidService[]) ?? [];
  const nextService = buildNonCandidPortalService(params.document);
  const idx = existing.findIndex(
    (s) =>
      typeof s.lines === 'object' &&
      s.lines != null &&
      (s.lines as { documentId?: string }).documentId === params.document.id,
  );
  const merged =
    idx >= 0
      ? existing.map((s, i) => (i === idx ? { ...s, ...nextService } : s))
      : [...existing, nextService];

  const { error: updErr } = await admin
    .from('customers')
    .update({
      portal_data: { ...portal, nonCandidServices: merged },
    })
    .eq('id', customerUuid);
  if (updErr) throw new Error(updErr.message);

  return {};
}

/** Append a custom "Other" document label for future suggestions. */
export async function rememberDocumentOtherType(
  customerExternalId: string,
  label: string,
): Promise<void> {
  const trimmed = label.trim();
  if (!trimmed) return;
  const customerUuid = await getCrmCustomerUuid(customerExternalId);
  if (!customerUuid) return;

  const admin = createSupabaseAdminClient();
  const { data, error: loadErr } = await admin
    .from('customers')
    .select('document_other_type_labels')
    .eq('id', customerUuid)
    .maybeSingle();
  if (loadErr) throw new Error(loadErr.message);

  const existing = Array.isArray(data?.document_other_type_labels)
    ? (data!.document_other_type_labels as string[])
    : [];
  if (existing.some((x) => x.toLowerCase() === trimmed.toLowerCase())) return;

  const { error } = await admin
    .from('customers')
    .update({ document_other_type_labels: [...existing, trimmed].slice(-50) })
    .eq('id', customerUuid);
  if (error) throw new Error(error.message);
}

export async function fetchDocumentOtherTypeLabels(
  customerExternalId: string,
): Promise<string[]> {
  const customerUuid = await getCrmCustomerUuid(customerExternalId);
  if (!customerUuid) return [];
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('customers')
    .select('document_other_type_labels')
    .eq('id', customerUuid)
    .maybeSingle();
  if (error) return [];
  return Array.isArray(data?.document_other_type_labels)
    ? (data!.document_other_type_labels as string[])
    : [];
}
