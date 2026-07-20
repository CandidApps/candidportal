import type { Contact, Location } from '@/components/CustomersView';
import type { CandidContractRecord, CustomerDocument } from '@/lib/customer-records';
import type { CustomerProfilePatch } from '@/lib/customer-document-extract';
import type { CustomerEnrichmentFields } from '@/lib/crm/customer-enrichment';

async function parseError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

export async function createCrmCustomerAccount(params: {
  customer: import('@/components/CustomersView').Customer;
  document?: CustomerDocument;
  contract?: CandidContractRecord;
}): Promise<void> {
  const res = await fetch('/api/admin/crm/customers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function saveCustomerProfile(params: {
  customerId: string;
  website?: string;
  altWebsite?: string | null;
  linkedinUrl?: string;
  mccCode?: string;
  companyLegal?: string | null;
  corpType?: string | null;
  location?: Location;
  company?: string;
  industry?: string | null;
  description?: string | null;
  taxId?: string | null;
  agent?: string;
  status?: import('@/components/CustomersView').Customer['status'];
  notes?: string | null;
  savings?: number;
  since?: string;
} & CustomerEnrichmentFields): Promise<void> {
  const res = await fetch('/api/admin/crm/customers', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function saveCrmLocation(customerId: string, location: Location): Promise<void> {
  await saveCustomerProfile({ customerId, location });
}

export async function saveCustomerProfileFromPatch(
  customerId: string,
  patch: CustomerProfilePatch,
  primaryLocation?: Location | null,
): Promise<Location | undefined> {
  let location: Location | undefined;
  if (patch.primaryLocation) {
    const primary = primaryLocation;
    if (primary) {
      location = {
        ...primary,
        street: primary.street.trim() || patch.primaryLocation.street || primary.street,
        city: primary.city.trim() || patch.primaryLocation.city || primary.city,
        state: primary.state.trim() || patch.primaryLocation.state || primary.state,
        zip: primary.zip.trim() || patch.primaryLocation.zip || primary.zip,
      };
    } else {
      location = {
        id: `loc-${customerId}-primary`,
        label: 'Primary',
        street: patch.primaryLocation.street ?? '',
        city: patch.primaryLocation.city ?? '',
        state: patch.primaryLocation.state ?? '',
        zip: patch.primaryLocation.zip ?? '',
        isPrimary: true,
      };
    }
  }

  if (!patch.website && !patch.mccCode && !location) return location;

  await saveCustomerProfile({
    customerId,
    website: patch.website,
    mccCode: patch.mccCode,
    location,
  });
  return location;
}

export async function saveCrmRecord(params: {
  customerId: string;
  document: CustomerDocument;
  contract?: CandidContractRecord;
  /** When provided, file bytes are stored in candid_documents (required for customer portal viewing). */
  file?: File | null;
}): Promise<CustomerDocument> {
  if (params.file && params.file.size > 0) {
    const form = new FormData();
    form.append('customerId', params.customerId);
    form.append('document', JSON.stringify(params.document));
    if (params.contract) form.append('contract', JSON.stringify(params.contract));
    form.append('file', params.file, params.document.filename || params.file.name);
    const res = await fetch('/api/admin/crm/documents', { method: 'POST', body: form });
    if (!res.ok) throw new Error(await parseError(res));
    const data = (await res.json()) as { document?: CustomerDocument };
    return data.document ?? { ...params.document, storagePath: params.document.storagePath };
  }

  const res = await fetch('/api/admin/crm/records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerId: params.customerId,
      document: params.document,
      contract: params.contract,
    }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return params.document;
}

/** Replace the binary file for an existing CRM document (keeps the same record id). */
export async function replaceCrmDocumentFile(params: {
  customerId: string;
  document: CustomerDocument;
  file: File;
}): Promise<CustomerDocument> {
  const form = new FormData();
  form.append('customerId', params.customerId);
  form.append(
    'document',
    JSON.stringify({
      ...params.document,
      filename: params.file.name || params.document.filename,
    }),
  );
  form.append('file', params.file, params.file.name || params.document.filename);
  form.append('replaceOnly', '1');
  const res = await fetch('/api/admin/crm/documents', { method: 'POST', body: form });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { document?: CustomerDocument };
  if (!data.document) throw new Error('Upload succeeded but document missing from response');
  return data.document;
}

export async function updateCrmDeal(
  customerId: string,
  contract: CandidContractRecord,
): Promise<void> {
  const res = await fetch('/api/admin/crm/records', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerId, contract }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function updateCrmDocument(
  customerId: string,
  document: CustomerDocument,
): Promise<void> {
  const res = await fetch('/api/admin/crm/records', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerId, document }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function deleteCrmDeal(contractId: string): Promise<void> {
  const res = await fetch(
    `/api/admin/crm/records?contractId=${encodeURIComponent(contractId)}`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(await parseError(res));
}

export async function deleteCrmDocument(customerId: string, documentId: string): Promise<void> {
  const params = new URLSearchParams({
    customerId,
    documentId,
  });
  const res = await fetch(`/api/admin/crm/records?${params.toString()}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function saveCrmContact(customerId: string, contact: Contact): Promise<void> {
  const res = await fetch('/api/admin/crm/contacts', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerId, contact }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function deleteCrmContact(customerId: string, contactId: string): Promise<void> {
  const params = new URLSearchParams({ customerId, contactId });
  const res = await fetch(`/api/admin/crm/contacts?${params.toString()}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function archiveCrmCustomer(customerId: string): Promise<void> {
  const res = await fetch('/api/admin/crm/customers', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerId, op: 'archive' }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function restoreCrmCustomer(customerId: string): Promise<void> {
  const res = await fetch('/api/admin/crm/customers', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerId, op: 'restore' }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}
