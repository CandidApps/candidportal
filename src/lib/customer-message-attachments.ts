import type { SupabaseClient } from '@supabase/supabase-js';

export const CUSTOMER_MESSAGE_ATTACHMENT_BUCKET = 'service-bills';

export type CustomerMessageAttachment = {
  name: string;
  path: string;
  type: string;
  url?: string;
};

export function customerMessageAttachmentDownloadUrl(storagePath: string): string {
  return `/api/customer-messages/attachment?path=${encodeURIComponent(storagePath)}`;
}

export function enrichCustomerMessageAttachments<T extends { attachments?: unknown }>(
  messages: T[],
): Array<T & { attachments: CustomerMessageAttachment[] }> {
  return messages.map((m) => {
    const raw = Array.isArray(m.attachments) ? m.attachments : [];
    const attachments: CustomerMessageAttachment[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const path = typeof row.path === 'string' ? row.path : '';
      const name = typeof row.name === 'string' ? row.name : path.split('/').pop() || 'file';
      const type = typeof row.type === 'string' ? row.type : 'application/octet-stream';
      if (!path) continue;
      attachments.push({
        name,
        path,
        type,
        url: customerMessageAttachmentDownloadUrl(path),
      });
    }
    return { ...m, attachments };
  });
}

/** Upload files into service-bills under messages/{ownerUserId}/… */
export async function uploadCustomerMessageAttachments(
  admin: SupabaseClient,
  ownerUserId: string,
  files: File[],
): Promise<CustomerMessageAttachment[]> {
  const attachments: CustomerMessageAttachment[] = [];
  for (const entry of files) {
    if (!(entry instanceof File) || entry.size <= 0) continue;
    const safe = entry.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `messages/${ownerUserId}/${Date.now()}-${safe}`;
    const { error: upErr } = await admin.storage
      .from(CUSTOMER_MESSAGE_ATTACHMENT_BUCKET)
      .upload(path, Buffer.from(await entry.arrayBuffer()), {
        contentType: entry.type || 'application/octet-stream',
      });
    if (!upErr) {
      attachments.push({
        name: entry.name,
        path,
        type: entry.type || 'application/octet-stream',
      });
    }
  }
  return attachments;
}

export function filesFromFormData(form: FormData): File[] {
  const out: File[] = [];
  for (const entry of form.getAll('files')) {
    if (entry instanceof File && entry.size > 0) out.push(entry);
  }
  return out;
}
