import 'server-only';

import path from 'path';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { resolveUploadContentType } from '@/lib/file-mime';

const BUCKET = 'candid_documents';

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'file';
}

/** Upload a CRM customer document into the candid_documents bucket. */
export async function uploadCustomerDocumentFile(params: {
  customerExternalId: string;
  documentId: string;
  file: File | Blob;
  filename: string;
}): Promise<{ storagePath: string; contentType: string }> {
  const admin = createSupabaseAdminClient();
  const safeName = safeSegment(path.basename(params.filename));
  const storagePath = `customers/${safeSegment(params.customerExternalId)}/${safeSegment(params.documentId)}/${safeName}`;
  const reported =
    (params.file instanceof File && params.file.type) ||
    (typeof (params.file as Blob).type === 'string' ? (params.file as Blob).type : '');
  const contentType = resolveUploadContentType(params.filename, reported);
  const buffer = Buffer.from(await params.file.arrayBuffer());
  const { error } = await admin.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType,
    upsert: true,
  });
  if (error) throw new Error(error.message);
  return { storagePath, contentType };
}
