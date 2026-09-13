import type { CustomerDocument, RecordKind } from '@/lib/customer-records';

/** Simplified document type shown in admin upload/edit UI. */
export type DocumentTypeUi =
  | 'contract_agreement'
  | 'proposal'
  | 'invoice'
  | 'statement'
  | 'other';

export const DOCUMENT_TYPE_UI_OPTIONS: { value: DocumentTypeUi; label: string }[] = [
  { value: 'contract_agreement', label: 'Contract / Agreement' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'statement', label: 'Statement' },
  { value: 'other', label: 'Other' },
];

/** Candid-managed document service status. */
export type CandidDocumentServiceStatus = 'active' | 'needs_renewal' | 'needs_requote';

/** Non-Candid document service status. */
export type ExternalDocumentServiceStatus = 'prospecting' | 'tracking_only';

export type DocumentServiceStatus = CandidDocumentServiceStatus | ExternalDocumentServiceStatus;

export const CANDID_DOCUMENT_STATUS_OPTIONS: { value: CandidDocumentServiceStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'needs_renewal', label: 'Needs Renewal' },
  { value: 'needs_requote', label: 'Needs Requote (expired)' },
];

export const EXTERNAL_DOCUMENT_STATUS_OPTIONS: { value: ExternalDocumentServiceStatus; label: string }[] = [
  { value: 'prospecting', label: 'Prospecting (trying to win this business)' },
  { value: 'tracking_only', label: 'Tracking Only (customer just wants a record)' },
];

export type DocumentMetadataForm = {
  documentTypeUi: DocumentTypeUi;
  otherDocumentKind: string;
  displayName: string;
  shareInPortal: boolean;
  isCandidAgreement: boolean | null;
  serviceStatus: DocumentServiceStatus | '';
  previousProvider: string;
  previousMrc: string;
  candidMrc: string;
};

export function emptyDocumentMetadataForm(): DocumentMetadataForm {
  return {
    documentTypeUi: 'statement',
    otherDocumentKind: '',
    displayName: '',
    shareInPortal: true,
    isCandidAgreement: null,
    serviceStatus: '',
    previousProvider: '',
    previousMrc: '',
    candidMrc: '',
  };
}

export function recordKindToDocumentTypeUi(kind: RecordKind): DocumentTypeUi {
  if (kind === 'proposal') return 'proposal';
  if (kind === 'invoice') return 'invoice';
  if (kind === 'statement' || kind === 'statement_for_analysis') return 'statement';
  if (kind === 'candid_contract' || kind === 'external_contract') return 'contract_agreement';
  return 'other';
}

export function documentTypeUiToRecordKind(
  ui: DocumentTypeUi,
  isCandidAgreement: boolean | null,
): RecordKind {
  if (ui === 'proposal') return 'proposal';
  if (ui === 'invoice') return 'invoice';
  if (ui === 'statement') return 'statement';
  if (ui === 'contract_agreement') {
    return isCandidAgreement ? 'candid_contract' : 'external_contract';
  }
  return 'other';
}

export function candidMrcFieldLabel(status: DocumentServiceStatus | ''): string {
  switch (status) {
    case 'needs_renewal':
      return 'Renewal MRC with Candid ($)';
    case 'needs_requote':
      return 'Requoted MRC with Candid ($)';
    case 'prospecting':
      return 'Target MRC with Candid ($)';
    case 'active':
    default:
      return 'New MRC with Candid ($)';
  }
}

export function showMrcComparisonFields(
  serviceStatus: DocumentServiceStatus | '',
): boolean {
  return Boolean(serviceStatus && serviceStatus !== 'tracking_only');
}

export function validateDocumentMetadata(form: DocumentMetadataForm): string | null {
  if (form.documentTypeUi === 'other' && !form.otherDocumentKind.trim()) {
    return 'Enter what kind of document this is when type is Other.';
  }
  if (form.isCandidAgreement == null) {
    return 'Select whether this is a Candid document/agreement.';
  }
  if (!form.serviceStatus) {
    return 'Select a status for this document.';
  }
  return null;
}

export type DocumentMetadataPatch = {
  documentTypeUi?: DocumentTypeUi;
  otherDocumentKind?: string;
  displayName?: string;
  visibleInPortal?: boolean;
  isCandidAgreement?: boolean;
  documentServiceStatus?: DocumentServiceStatus;
  previousProvider?: string;
  previousMrc?: number | null;
  candidMrc?: number | null;
  linkedServiceId?: string;
};

export function parseMoneyInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function documentMetadataFromDocument(doc: CustomerDocument): DocumentMetadataForm {
  const meta = doc.documentMetadata;
  const documentTypeUi = meta?.documentTypeUi ?? recordKindToDocumentTypeUi(doc.recordKind);
  const isCandid =
    meta?.isCandidAgreement ??
    (doc.recordKind === 'candid_contract' ? true : doc.recordKind === 'external_contract' ? false : null);

  return {
    documentTypeUi,
    otherDocumentKind: meta?.otherDocumentKind ?? doc.docSubtype ?? '',
    displayName: meta?.displayName ?? doc.description ?? '',
    shareInPortal: meta?.visibleInPortal ?? true,
    isCandidAgreement: isCandid,
    serviceStatus: meta?.documentServiceStatus ?? '',
    previousProvider: meta?.previousProvider ?? doc.provider ?? '',
    previousMrc:
      meta?.previousMrc != null
        ? String(meta.previousMrc)
        : '',
    candidMrc:
      meta?.candidMrc != null
        ? String(meta.candidMrc)
        : doc.amount != null
          ? String(doc.amount)
          : '',
  };
}

export function applyDocumentMetadataToDocument(
  doc: CustomerDocument,
  form: DocumentMetadataForm,
): CustomerDocument {
  const recordKind =
    form.documentTypeUi === 'statement' && doc.recordKind === 'statement_for_analysis'
      ? 'statement_for_analysis'
      : documentTypeUiToRecordKind(form.documentTypeUi, form.isCandidAgreement);
  const previousMrc = parseMoneyInput(form.previousMrc);
  const candidMrc = parseMoneyInput(form.candidMrc);
  const displayName = form.displayName.trim();
  const otherKind = form.otherDocumentKind.trim();

  return {
    ...doc,
    recordKind,
    filename: displayName || doc.filename,
    description: displayName || doc.description,
    provider: form.previousProvider.trim() || doc.provider,
    docSubtype: form.documentTypeUi === 'other' ? otherKind : doc.docSubtype,
    amount: candidMrc ?? doc.amount,
    documentMetadata: {
      documentTypeUi: form.documentTypeUi,
      otherDocumentKind: form.documentTypeUi === 'other' ? otherKind : undefined,
      displayName: displayName || undefined,
      visibleInPortal: form.shareInPortal,
      isCandidAgreement: form.isCandidAgreement === true,
      documentServiceStatus: (form.serviceStatus || undefined) as DocumentServiceStatus | undefined,
      previousProvider: form.previousProvider.trim() || undefined,
      previousMrc: previousMrc ?? undefined,
      candidMrc: candidMrc ?? undefined,
    },
  };
}
