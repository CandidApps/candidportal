import 'server-only';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  downloadMessageAttachment,
  getMessageAttachments,
} from '@/lib/email/zoho';
import { getCrmCustomerUuid } from '@/lib/crm/load-from-db';

const BUCKET = 'candid_documents';
const SIGNED_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function guessContentType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (lower.endsWith('.doc')) return 'application/msword';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.\-()+ ]+/g, '_').trim() || 'contract.pdf';
}

export type PersistedSupplierContract = {
  contractUrl: string | null;
  contractFilename: string | null;
  contractStoragePath: string | null;
  source: 'link' | 'attachment' | 'body';
};

/**
 * Store the supplier contract into deal fields:
 * - link → save external URL
 * - attachment → download from Zoho, upload to candid_documents, create shareable signed URL
 * Also upserts a customer_records row when the deal is CRM-linked.
 */
export async function persistSupplierContractArtifact(input: {
  actionId: string;
  crmCustomerExternalId?: string | null;
  accountName?: string | null;
  vendorName?: string | null;
  source: 'link' | 'attachment' | 'body';
  url?: string | null;
  name?: string | null;
  hasAttachment?: boolean;
  messageId?: string | null;
  folderId?: string | null;
  accessToken?: string | null;
  accountId?: string | null;
  siteOrigin?: string | null;
}): Promise<PersistedSupplierContract> {
  const admin = createSupabaseAdminClient();
  let contractUrl = input.url?.trim() || null;
  let contractFilename = input.name?.trim() || null;
  let contractStoragePath: string | null = null;
  let source = input.source;

  const canPullAttachment =
    Boolean(input.hasAttachment || input.source === 'attachment') &&
    Boolean(input.messageId && input.folderId && input.accessToken && input.accountId);

  if (canPullAttachment) {
    try {
      const attachments = await getMessageAttachments({
        accessToken: input.accessToken!,
        accountId: input.accountId!,
        folderId: input.folderId!,
        messageId: input.messageId!,
      });
      const preferred =
        attachments.find((a) => /\.(pdf|docx?)$/i.test(a.attachmentName)) ??
        attachments[0] ??
        null;

      if (preferred) {
        const downloaded = await downloadMessageAttachment({
          accessToken: input.accessToken!,
          accountId: input.accountId!,
          folderId: input.folderId!,
          messageId: input.messageId!,
          attachmentId: preferred.attachmentId,
        });
        const filename = sanitizeFilename(preferred.attachmentName || 'supplier-contract.pdf');
        const storagePath = `deal-contracts/${input.actionId}/${Date.now()}-${filename}`;
        const contentType =
          downloaded.contentType && downloaded.contentType !== 'application/octet-stream'
            ? downloaded.contentType
            : guessContentType(filename);

        const { error: uploadErr } = await admin.storage.from(BUCKET).upload(
          storagePath,
          Buffer.from(downloaded.bytes),
          { contentType, upsert: true },
        );
        if (uploadErr) throw new Error(uploadErr.message);

        const { data: signed, error: signErr } = await admin.storage
          .from(BUCKET)
          .createSignedUrl(storagePath, SIGNED_TTL_SECONDS);
        if (signErr) throw new Error(signErr.message);

        contractStoragePath = storagePath;
        contractFilename = filename;
        // Prefer durable app share URL when origin is known; signed URL as fallback.
        contractUrl = input.siteOrigin
          ? `${input.siteOrigin.replace(/\/$/, '')}/api/admin/contract-submit-actions/${input.actionId}/contract`
          : signed?.signedUrl ?? null;
        source = 'attachment';
      }
    } catch (err) {
      console.error('[persist-supplier-contract] attachment import failed', err);
      // Fall through to URL/body if attachment pull fails.
    }
  }

  if (!contractUrl && input.url?.trim()) {
    contractUrl = input.url.trim();
    contractFilename = contractFilename || 'Contract link';
    source = 'link';
  }

  if (!contractUrl && !contractStoragePath && input.source === 'body') {
    contractFilename = contractFilename || 'Contract noted in email';
  }

  await upsertCustomerRecordDocument({
    crmCustomerExternalId: input.crmCustomerExternalId,
    actionId: input.actionId,
    accountName: input.accountName,
    vendorName: input.vendorName,
    contractUrl,
    contractFilename,
    contractStoragePath,
    source,
  });

  return {
    contractUrl,
    contractFilename,
    contractStoragePath,
    source,
  };
}

async function upsertCustomerRecordDocument(input: {
  crmCustomerExternalId?: string | null;
  actionId: string;
  accountName?: string | null;
  vendorName?: string | null;
  contractUrl: string | null;
  contractFilename: string | null;
  contractStoragePath: string | null;
  source: string;
}): Promise<void> {
  const external = input.crmCustomerExternalId?.trim();
  if (!external) return;
  if (!input.contractUrl && !input.contractStoragePath) return;

  try {
    const customerUuid = await getCrmCustomerUuid(external);
    if (!customerUuid) return;

    const admin = createSupabaseAdminClient();
    const recordExternalId = `deal-contract-${input.actionId}`;
    const filename = input.contractFilename || 'Supplier contract';
    const now = new Date().toISOString();

    await admin.from('customer_records').upsert(
      {
        customer_id: customerUuid,
        external_id: recordExternalId,
        record_kind: 'external_contract',
        filename,
        storage_path: input.contractStoragePath,
        local_filename: filename,
        uploaded_by: 'Supplier email import',
        display_date: now.slice(0, 10),
        provider: input.vendorName ?? null,
        doc_subtype: 'Supplier contract',
        description:
          input.source === 'link'
            ? `Supplier contract link${input.contractUrl ? `: ${input.contractUrl}` : ''}`
            : 'Supplier contract imported from email attachment',
        onedrive_path: input.source === 'link' ? input.contractUrl : null,
        visible_in_portal: true,
        document_data: {
          id: recordExternalId,
          source: 'supplier_email',
          contractUrl: input.contractUrl,
          contractStoragePath: input.contractStoragePath,
          accountName: input.accountName,
          vendorName: input.vendorName,
        },
        updated_at: now,
      },
      { onConflict: 'external_id' },
    );
  } catch (err) {
    console.error('[persist-supplier-contract] customer_records upsert failed', err);
  }
}

/** Fresh signed URL for a stored attachment (used by download/share endpoint). */
export async function createContractSignedUrl(storagePath: string): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_TTL_SECONDS);
  if (error) {
    console.error('[persist-supplier-contract] signed url failed', error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}
