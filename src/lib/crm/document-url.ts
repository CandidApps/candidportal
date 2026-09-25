import type { CustomerDocument } from '@/lib/customer-records';
import { isPortalDocumentAvailable, portalDocumentUrl } from '@/lib/portal-import/merge';

/** Resolve a view/download URL for a customer document (Storage, local portal, or CRM API). */
export function customerDocumentUrl(doc: CustomerDocument): string | null {
  // Prefer storage-backed records — these actually have bytes.
  if (doc.storagePath) {
    const recordKey = doc.customerId ? `${doc.customerId}::${doc.id}` : doc.id;
    return `/api/admin/crm/documents?recordId=${encodeURIComponent(recordKey)}`;
  }
  if (isPortalDocumentAvailable(doc.filename)) {
    return portalDocumentUrl(doc.filename);
  }
  // Metadata-only CRM rows (no storage_path) still get a record URL so Replace
  // flows / Open can hit the API — callers should treat missing bytes via storagePath.
  if (doc.id) {
    const recordKey = doc.customerId ? `${doc.customerId}::${doc.id}` : doc.id;
    return `/api/admin/crm/documents?recordId=${encodeURIComponent(recordKey)}`;
  }
  return `/api/admin/crm/documents?file=${encodeURIComponent(doc.filename)}`;
}

/** True when we expect bytes to exist (storage upload or known portal local file). */
export function isCustomerDocumentAvailable(doc: CustomerDocument): boolean {
  return Boolean(doc.storagePath || isPortalDocumentAvailable(doc.filename));
}

/** Member-accessible document URL (auth-scoped portal API). Requires cloud storage. */
export function portalCustomerDocumentUrl(doc: CustomerDocument): string | null {
  if (!doc.storagePath) return null;
  const recordKey = doc.customerId ? `${doc.customerId}::${doc.id}` : doc.id;
  const params = new URLSearchParams({ recordId: recordKey });
  if (doc.customerId) params.set('customerId', doc.customerId);
  return `/api/portal/crm/documents?${params.toString()}`;
}

/** True when the customer portal can actually serve file bytes. */
export function isPortalDocumentViewable(doc: CustomerDocument): boolean {
  return Boolean(doc.storagePath);
}
