/** Client helpers + shared types for MyAssistant email → CRM smart sync. */

import type { Customer } from '@/components/CustomersView';
import type { Lead } from '@/components/LeadsView';
import type { RecordKind } from '@/lib/customer-records';
import { resolveUploadContentType } from '@/lib/file-mime';

export type EmailAttachmentInfo = {
  attachmentId: string;
  attachmentName: string;
  attachmentSize: number;
};

export type SmartSyncAction =
  | 'link_email'
  | 'link_email_to_lead'
  | 'add_contacts'
  | 'add_lead_contacts'
  | 'import_document'
  | 'import_deal';

export type SmartSyncTargetType = 'account' | 'supplier' | 'lead';

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
  /** portal_leads.id when targeting a lead. */
  leadId?: string;
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
  /** Extra text used for matching (not shown). */
  searchText?: string;
};

export const SMART_SYNC_TYPE_LABEL: Record<SmartSyncTargetType, string> = {
  account: 'Account',
  lead: 'Lead',
  supplier: 'Partner',
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

export async function searchSmartSyncTargets(
  q: string,
  type?: SmartSyncTargetType | 'all',
): Promise<SmartSyncTarget[]> {
  const params = new URLSearchParams();
  if (q.trim()) params.set('q', q.trim());
  if (type) params.set('type', type);
  const res = await fetch(`/api/admin/assistant/email-smart-sync?${params.toString()}`);
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

function blob(...parts: (string | null | undefined | false)[]): string {
  return parts.filter(Boolean).join(' ');
}

function scoreMatch(query: string, label: string, searchText: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const labelL = label.toLowerCase();
  const hay = `${labelL} ${searchText.toLowerCase()}`;
  if (labelL === q) return 100;
  if (labelL.startsWith(q)) return 80;
  if (labelL.includes(q)) return 60;
  if (hay.includes(q)) return 40;
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && tokens.every((t) => hay.includes(t))) return 30;
  return 0;
}

/** Build searchable account targets from in-app CRM customers (matches top-bar search coverage). */
export function accountsToSmartSyncTargets(customers: Customer[]): SmartSyncTarget[] {
  return customers.map((c) => {
    const contacts = (c.contacts ?? [])
      .map((ct) => blob(ct.name, ct.email, ct.phone, ct.role))
      .join(' ');
    const locations = (c.locations ?? [])
      .map((l) => blob(l.label, l.street, l.city, l.state, l.zip))
      .join(' ');
    return {
      id: c.id,
      label: c.company || c.companyLegal || c.id,
      type: 'account' as const,
      subtitle: c.status || null,
      searchText: blob(
        c.company,
        c.companyLegal,
        c.industry,
        c.website,
        c.agent,
        c.notes,
        c.status,
        contacts,
        locations,
      ),
    };
  });
}

/** Build searchable lead targets from portal + seed leads (same pool as top-bar search). */
export function leadsToSmartSyncTargets(leads: Lead[]): SmartSyncTarget[] {
  const seen = new Set<string>();
  const out: SmartSyncTarget[] = [];
  for (const lead of leads) {
    const id = (lead.portalLeadRowId || lead.id).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const primary = lead.contacts.find((c) => c.isPrimary) ?? lead.contacts[0];
    out.push({
      id,
      label: lead.companyFriendly || lead.companyLegal || primary?.name || 'Lead',
      type: 'lead',
      subtitle: blob(lead.lifecycle, primary?.email || primary?.name) || null,
      searchText: blob(
        lead.companyFriendly,
        lead.companyLegal,
        lead.website,
        lead.helpWith,
        lead.currentTechnology,
        lead.contacts.map((c) => blob(c.name, c.email, c.phone, c.role)).join(' '),
        lead.locations.map((l) => blob(l.city, l.state, l.zip)).join(' '),
      ),
    });
  }
  return out;
}

export function filterSmartSyncTargets(
  targets: SmartSyncTarget[],
  query: string,
  opts?: {
    type?: SmartSyncTargetType | 'all';
    limit?: number;
    /** When query is empty, still return browse results (sorted by label). */
    browseWhenEmpty?: boolean;
  },
): SmartSyncTarget[] {
  const type = opts?.type ?? 'all';
  const limit = opts?.limit ?? 40;
  const browseWhenEmpty = opts?.browseWhenEmpty ?? true;
  const scoped =
    type === 'all' ? targets : targets.filter((t) => t.type === type);
  const q = query.trim();

  if (!q) {
    if (!browseWhenEmpty) return [];
    return [...scoped]
      .sort((a, b) => a.label.localeCompare(b.label))
      .slice(0, limit);
  }

  return scoped
    .map((t) => ({
      t,
      score: scoreMatch(q, t.label, t.searchText ?? t.subtitle ?? ''),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.t.label.localeCompare(b.t.label))
    .slice(0, limit)
    .map((row) => row.t);
}

export function findSuggestedSmartSyncTarget(
  targets: SmartSyncTarget[],
  emails: string[],
  type?: SmartSyncTargetType,
): SmartSyncTarget | null {
  const norms = emails.map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!norms.length) return null;
  for (const email of norms) {
    const match = targets.find((t) => {
      if (type && t.type !== type) return false;
      const hay = `${t.searchText ?? ''} ${t.subtitle ?? ''}`.toLowerCase();
      return hay.includes(email);
    });
    if (match) return match;
  }
  return null;
}

/** Download a Zoho attachment as a File for parse/upload in the All records wizard. */
export async function downloadEmailAttachmentAsFile(params: {
  messageId: string;
  folderId: string;
  attachmentId: string;
  filename: string;
}): Promise<File> {
  const url = emailAttachmentDownloadUrl(
    params.messageId,
    params.folderId,
    params.attachmentId,
  );
  const res = await fetch(url);
  if (!res.ok) throw new Error('Could not download attachment');
  const blob = await res.blob();
  const filename = params.filename || 'attachment';
  const type = resolveUploadContentType(
    filename,
    res.headers.get('content-type') || blob.type,
  );
  return new File([blob], filename, { type });
}

export async function uploadLeadDocument(params: {
  leadId: string;
  file: File;
  recordKind: string;
  description?: string;
  contract?: Record<string, unknown>;
}): Promise<{ ok: boolean; error?: string }> {
  const form = new FormData();
  form.set('file', params.file, params.file.name);
  form.set('recordKind', params.recordKind);
  if (params.description) form.set('description', params.description);
  if (params.contract) form.set('contract', JSON.stringify(params.contract));
  const res = await fetch(`/api/admin/leads/${encodeURIComponent(params.leadId)}/documents`, {
    method: 'POST',
    body: form,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) return { ok: false, error: data.error || 'Lead document upload failed' };
  return { ok: true };
}
