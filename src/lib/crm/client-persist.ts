import type { Contact, Location } from '@/components/CustomersView';
import type { CandidContractRecord, CustomerDocument } from '@/lib/customer-records';
import type { CustomerProfilePatch } from '@/lib/customer-document-extract';

async function parseError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

export async function saveCustomerProfile(params: {
  customerId: string;
  website?: string;
  mccCode?: string;
  location?: Location;
}): Promise<void> {
  const res = await fetch('/api/admin/crm/customers', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(await parseError(res));
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
}): Promise<void> {
  const res = await fetch('/api/admin/crm/records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(await parseError(res));
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
