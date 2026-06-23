import type {
  RegistryDocument,
  RegistryDocumentType,
  RegistryEntityType,
} from '@/lib/registry-documents-types';

async function parseError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

export function registryDocumentViewUrl(documentId: string): string {
  return `/api/admin/registry-documents?documentId=${encodeURIComponent(documentId)}`;
}

export async function listRegistryDocuments(
  entityType: RegistryEntityType,
  entityKey: string,
): Promise<RegistryDocument[]> {
  const params = new URLSearchParams({ entityType, entityKey });
  const res = await fetch(`/api/admin/registry-documents?${params.toString()}`);
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { documents?: RegistryDocument[] };
  return data.documents ?? [];
}

export async function uploadRegistryDocument(params: {
  entityType: RegistryEntityType;
  entityKey: string;
  file: File;
  documentType: RegistryDocumentType;
  uploadedBy: string;
  signedDate?: string;
  notes?: string;
}): Promise<RegistryDocument> {
  const form = new FormData();
  form.set('entityType', params.entityType);
  form.set('entityKey', params.entityKey);
  form.set('documentType', params.documentType);
  form.set('uploadedBy', params.uploadedBy);
  if (params.signedDate) form.set('signedDate', params.signedDate);
  if (params.notes) form.set('notes', params.notes);
  form.set('file', params.file);

  const res = await fetch('/api/admin/registry-documents', { method: 'POST', body: form });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { document?: RegistryDocument };
  if (!data.document) throw new Error('Upload failed');
  return data.document;
}

export async function deleteRegistryDocument(documentId: string): Promise<void> {
  const params = new URLSearchParams({ documentId });
  const res = await fetch(`/api/admin/registry-documents?${params.toString()}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await parseError(res));
}
