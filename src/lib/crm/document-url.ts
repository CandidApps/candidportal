import type { CustomerDocument } from '@/lib/customer-records';
import { isPortalDocumentAvailable, portalDocumentUrl } from '@/lib/portal-import/merge';

/** Resolve a view/download URL for a customer document (Storage, local portal, or CRM API). */
export function customerDocumentUrl(doc: CustomerDocument): string | null {
  if (doc.storagePath || doc.id) {
    const recordKey = doc.customerId ? `${doc.customerId}::${doc.id}` : doc.id;
    return `/api/admin/crm/documents?recordId=${encodeURIComponent(recordKey)}`;
  }
  if (isPortalDocumentAvailable(doc.filename)) {
    return portalDocumentUrl(doc.filename);
  }
  return `/api/admin/crm/documents?file=${encodeURIComponent(doc.filename)}`;
}

/** Member-accessible document URL (auth-scoped portal API). */
export function portalCustomerDocumentUrl(doc: CustomerDocument): string | null {
  // Prefer stored files — metadata-only uploads have no bytes for the customer viewer.
  if (doc.storagePath || isPortalDocumentAvailable(doc.filename)) {
    if (doc.storagePath || doc.id) {
      const recordKey = doc.customerId ? `${doc.customerId}::${doc.id}` : doc.id;
      const params = new URLSearchParams({ recordId: recordKey });
      if (doc.customerId) params.set('customerId', doc.customerId);
      return `/api/portal/crm/documents?${params.toString()}`;
    }
    return portalDocumentUrl(doc.filename);
  }
  return null;
}

export function isCustomerDocumentAvailable(doc: CustomerDocument): boolean {
  return Boolean(doc.storagePath || doc.id || isPortalDocumentAvailable(doc.filename));
}

/** True when the customer portal can actually serve file bytes. */
export function isPortalDocumentViewable(doc: CustomerDocument): boolean {
  return Boolean(doc.storagePath || isPortalDocumentAvailable(doc.filename));
}
