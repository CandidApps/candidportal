/** Client helpers + shared types for MyAssistant email → CRM smart sync. */

import type { RecordKind } from '@/lib/customer-records';

export type EmailAttachmentInfo = {
  attachmentId: string;
  attachmentName: string;
  attachmentSize: number;
};

export type SmartSyncAction =
  | 'link_email'
  | 'add_contacts'
  | 'import_document'
  | 'import_deal';

export type SmartSyncTargetType = 'account' | 'supplier';

export type SmartSyncParticipant = {
  name: string;
  email: string;
  selected?: boolean;
};

export type SmartSyncRequest = {
  action: SmartSyncAction;
  messageId: string;
  folderId: string;
  subject?: string;
  from?: string;
  to?: string;
  cc?: string;
  summary?: string;
  /** Account external id (customers.id in app / external_id). */
  customerId?: string;
  /** partner_suppliers.id when adding supplier contacts. */
  supplierId?: string;
  targetType?: SmartSyncTargetType;
  participants?: SmartSyncParticipant[];
  attachmentIds?: string[];
  recordKind?: RecordKind;
  vendorName?: string;
  productName?: string;
  dealNote?: string;
};

export type SmartSyncResult = {
  ok: boolean;
  message?: string;
  error?: string;
  documentIds?: string[];
  contactIds?: string[];
  dealId?: string;
};

export type SmartSyncTarget = {
  id: string;
  label: string;
  type: SmartSyncTargetType;
  subtitle?: string | null;
};

export async function fetchEmailAttachments(
  messageId: string,
  folderId: string,
): Promise<EmailAttachmentInfo[]> {
  const res = await fetch(
    `/api/admin/email/attachments?messageId=${encodeURIComponent(messageId)}&folderId=${encodeURIComponent(folderId)}`,
  );
  const json = (await res.json()) as { attachments?: EmailAttachmentInfo[]; error?: string };
  if (!res.ok) throw new Error(json.error || 'Could not load attachments');
  return Array.isArray(json.attachments) ? json.attachments : [];
}

export function emailAttachmentDownloadUrl(
  messageId: string,
  folderId: string,
  attachmentId: string,
): string {
  return `/api/admin/email/attachments?messageId=${encodeURIComponent(messageId)}&folderId=${encodeURIComponent(folderId)}&attachmentId=${encodeURIComponent(attachmentId)}&download=1`;
}

export async function searchSmartSyncTargets(q: string): Promise<SmartSyncTarget[]> {
  const res = await fetch(
    `/api/admin/assistant/email-smart-sync?q=${encodeURIComponent(q.trim())}`,
  );
  const json = (await res.json()) as { targets?: SmartSyncTarget[]; error?: string };
  if (!res.ok) throw new Error(json.error || 'Search failed');
  return Array.isArray(json.targets) ? json.targets : [];
}

export async function runEmailSmartSync(body: SmartSyncRequest): Promise<SmartSyncResult> {
  const res = await fetch('/api/admin/assistant/email-smart-sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as SmartSyncResult;
  if (!res.ok || !json.ok) {
    return { ok: false, error: json.error || 'Smart sync failed' };
  }
  return json;
}

export function formatAttachmentSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
