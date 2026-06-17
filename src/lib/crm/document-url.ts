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

export function isCustomerDocumentAvailable(doc: CustomerDocument): boolean {
  return Boolean(doc.storagePath || doc.id || isPortalDocumentAvailable(doc.filename));
}
