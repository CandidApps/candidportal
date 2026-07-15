import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  downloadMessageAttachment,
  getMessageAttachments,
  getMessageContent,
} from '@/lib/email/zoho';
import {
  getActiveConnectionForUser,
  getActiveSharedConnection,
} from '@/lib/email/zoho-connections';
import { persistCustomerRecord, upsertCustomerContact } from '@/lib/crm/persist';
import { uploadCustomerDocumentFile } from '@/lib/crm/upload-customer-document-file';
import type { CandidContractRecord, CustomerDocument, RecordKind } from '@/lib/customer-records';
import type { Contact } from '@/components/CustomersView';
import type {
  SmartSyncParticipant,
  SmartSyncRequest,
  SmartSyncTarget,
} from '@/lib/assistant/email-smart-sync';

export const dynamic = 'force-dynamic';

function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.\-()+ ]+/g, '_').trim() || 'attachment';
}

async function zohoConnection(userId: string) {
  return (await getActiveConnectionForUser(userId)) ?? (await getActiveSharedConnection());
}

/** Search CRM accounts + partner suppliers for the smart-sync picker. */
export async function GET(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const q = (new URL(request.url).searchParams.get('q') ?? '').trim().toLowerCase();
  const admin = createSupabaseAdminClient();

  const [customersRes, suppliersRes] = await Promise.all([
    admin.from('customers').select('external_id, company, status').limit(400),
    admin
      .from('partner_suppliers')
      .select('id, display_name, name, contact_name, contact_email')
      .limit(400),
  ]);

  const targets: SmartSyncTarget[] = [];

  for (const row of customersRes.data ?? []) {
    const id = String(row.external_id ?? '').trim();
    const label = String(row.company ?? '').trim() || id;
    if (!id) continue;
    if (
      q &&
      !label.toLowerCase().includes(q) &&
      !id.toLowerCase().includes(q)
    ) {
      continue;
    }
    targets.push({
      id,
      label,
      type: 'account',
      subtitle: row.status ? String(row.status) : null,
    });
  }

  for (const row of suppliersRes.data ?? []) {
    const id = String(row.id ?? '').trim();
    const label = String(row.display_name ?? row.name ?? '').trim() || id;
    if (!id) continue;
    const hay = `${label} ${row.contact_name ?? ''} ${row.contact_email ?? ''}`.toLowerCase();
    if (q && !hay.includes(q)) continue;
    targets.push({
      id,
      label,
      type: 'supplier',
      subtitle: row.contact_email ? String(row.contact_email) : null,
    });
  }

  targets.sort((a, b) => a.label.localeCompare(b.label));
  return NextResponse.json({ targets: targets.slice(0, 60) });
}

export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: SmartSyncRequest;
  try {
    body = (await request.json()) as SmartSyncRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.action || !body.messageId || !body.folderId) {
    return NextResponse.json({ error: 'action, messageId, and folderId required' }, { status: 400 });
  }

  const connection = await zohoConnection(user.id);
  if (!connection) {
    return NextResponse.json({ error: 'Email not connected' }, { status: 400 });
  }

  try {
    switch (body.action) {
      case 'link_email':
        return NextResponse.json(await linkEmail(body, connection, user.email ?? 'admin'));
      case 'add_contacts':
        return NextResponse.json(await addContacts(body));
      case 'import_document':
        return NextResponse.json(await importDocuments(body, connection, user.email ?? 'admin'));
      case 'import_deal':
        return NextResponse.json(await importDeal(body, connection, user.email ?? 'admin'));
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (err) {
    console.error('[email-smart-sync]', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Smart sync failed' },
      { status: 500 },
    );
  }
}

type ZohoConn = { accessToken: string; accountId: string };

async function linkEmail(
  body: SmartSyncRequest,
  connection: ZohoConn,
  uploadedBy: string,
) {
  const customerId = body.customerId?.trim();
  if (!customerId) throw new Error('Choose an account to attach this email to');

  const content = await getMessageContent({
    accessToken: connection.accessToken,
    accountId: connection.accountId,
    folderId: body.folderId,
    messageId: body.messageId,
  });

  const subject = (body.subject || 'Email').trim() || 'Email';
  const safeSubject = sanitizeFilename(subject).slice(0, 80);
  const docId = newId('email');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(subject)}</title></head><body>
<p><strong>From:</strong> ${escapeHtml(body.from || '')}<br/>
<strong>To:</strong> ${escapeHtml(body.to || '')}<br/>
${body.cc ? `<strong>Cc:</strong> ${escapeHtml(body.cc)}<br/>` : ''}
<strong>Subject:</strong> ${escapeHtml(subject)}<br/>
<strong>Zoho message:</strong> ${escapeHtml(body.messageId)}</p>
<hr/>
${content || `<p>${escapeHtml(body.summary || '')}</p>`}
</body></html>`;

  const htmlBytes = Buffer.from(html, 'utf8');
  const filename = `Email — ${safeSubject}.html`;
  const file = new Blob([htmlBytes], { type: 'text/html' });
  const { storagePath } = await uploadCustomerDocumentFile({
    customerExternalId: customerId,
    documentId: docId,
    file,
    filename,
  });

  const document: CustomerDocument = {
    id: docId,
    customerId,
    locationId: '',
    filename,
    recordKind: 'other',
    uploadedBy,
    date: todayIso(),
    size: `${Math.max(1, Math.round(htmlBytes.byteLength / 1024))} KB`,
    docSubtype: 'Email',
    description: [
      `Linked from MyAssistant email`,
      body.from ? `From: ${body.from}` : null,
      `Message ID: ${body.messageId}`,
      body.summary?.trim() || null,
    ]
      .filter(Boolean)
      .join('\n'),
    storagePath,
  };

  await persistCustomerRecord({ customerExternalId: customerId, document });
  return { ok: true, message: `Email attached to account records`, documentIds: [docId] };
}

async function addContacts(body: SmartSyncRequest) {
  const selected = (body.participants ?? []).filter((p) => p.selected !== false && p.email?.includes('@'));
  if (!selected.length) throw new Error('Select at least one person from the thread');

  const targetType = body.targetType ?? 'account';
  if (targetType === 'account') {
    const customerId = body.customerId?.trim();
    if (!customerId) throw new Error('Choose an account for these contacts');
    const contactIds: string[] = [];
    for (const p of selected) {
      const contact = participantToContact(p);
      await upsertCustomerContact(customerId, contact);
      contactIds.push(contact.id);
    }
    return {
      ok: true,
      message: `Added ${contactIds.length} contact${contactIds.length === 1 ? '' : 's'} to the account`,
      contactIds,
    };
  }

  const supplierId = body.supplierId?.trim();
  if (!supplierId) throw new Error('Choose a supplier for these contacts');
  const admin = createSupabaseAdminClient();
  const primary = selected[0]!;
  // partner_suppliers stores a primary contact; keep first selected as primary and
  // append extras into a notes-style field when present on the row.
  const { data: existing, error: loadErr } = await admin
    .from('partner_suppliers')
    .select('id, contact_name, contact_email, notes')
    .eq('id', Number(supplierId))
    .maybeSingle();
  if (loadErr) throw new Error(loadErr.message);
  if (!existing) throw new Error('Supplier not found');

  const extras = selected
    .slice(1)
    .map((p) => `${p.name} <${p.email}>`)
    .join('; ');
  const notesBase = String((existing as { notes?: string | null }).notes ?? '').trim();
  const notes = [notesBase, extras ? `Additional contacts from email: ${extras}` : '']
    .filter(Boolean)
    .join('\n');

  const supplierPk = Number(supplierId);
  if (!Number.isFinite(supplierPk)) throw new Error('Invalid supplier');

  const { error: updErr } = await admin
    .from('partner_suppliers')
    .update({
      contact_name: primary.name || primary.email,
      contact_email: primary.email,
      ...(notes ? { notes } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', supplierPk);
  if (updErr) throw new Error(updErr.message);

  return {
    ok: true,
    message:
      selected.length === 1
        ? 'Supplier contact updated from the email thread'
        : `Primary supplier contact updated; ${selected.length - 1} additional name(s) noted`,
    contactIds: selected.map((p) => p.email),
  };
}

async function importDocuments(
  body: SmartSyncRequest,
  connection: ZohoConn,
  uploadedBy: string,
) {
  const customerId = body.customerId?.trim();
  if (!customerId) throw new Error('Choose an account for the document(s)');
  const ids = body.attachmentIds?.filter(Boolean) ?? [];
  if (!ids.length) throw new Error('Select at least one attachment');

  const attachments = await getMessageAttachments({
    accessToken: connection.accessToken,
    accountId: connection.accountId,
    folderId: body.folderId,
    messageId: body.messageId,
  });
  const kind = (body.recordKind || 'other') as RecordKind;
  const documentIds: string[] = [];

  for (const attachmentId of ids) {
    const meta = attachments.find((a) => a.attachmentId === attachmentId);
    if (!meta) continue;
    const downloaded = await downloadMessageAttachment({
      accessToken: connection.accessToken,
      accountId: connection.accountId,
      folderId: body.folderId,
      messageId: body.messageId,
      attachmentId,
    });
    const filename = sanitizeFilename(meta.attachmentName);
    const docId = newId('doc');
    const buffer = Buffer.from(downloaded.bytes);
    const file = new Blob([buffer], {
      type: downloaded.contentType || 'application/octet-stream',
    });
    const { storagePath } = await uploadCustomerDocumentFile({
      customerExternalId: customerId,
      documentId: docId,
      file,
      filename,
    });
    const document: CustomerDocument = {
      id: docId,
      customerId,
      locationId: '',
      filename,
      recordKind: kind,
      uploadedBy,
      date: todayIso(),
      size: `${Math.max(1, Math.round(meta.attachmentSize / 1024) || Math.round(buffer.byteLength / 1024))} KB`,
      description: `Imported from email: ${body.subject || '(no subject)'}`,
      storagePath,
    };
    await persistCustomerRecord({ customerExternalId: customerId, document });
    documentIds.push(docId);
  }

  if (!documentIds.length) throw new Error('No matching attachments found');
  return {
    ok: true,
    message: `Imported ${documentIds.length} document${documentIds.length === 1 ? '' : 's'}`,
    documentIds,
  };
}

async function importDeal(
  body: SmartSyncRequest,
  connection: ZohoConn,
  uploadedBy: string,
) {
  const customerId = body.customerId?.trim();
  if (!customerId) throw new Error('Choose an account for the deal');
  const attachmentId = body.attachmentIds?.[0];
  if (!attachmentId) throw new Error('Select an attachment to import as a deal');

  const attachments = await getMessageAttachments({
    accessToken: connection.accessToken,
    accountId: connection.accountId,
    folderId: body.folderId,
    messageId: body.messageId,
  });
  const meta = attachments.find((a) => a.attachmentId === attachmentId);
  if (!meta) throw new Error('Attachment not found');

  const downloaded = await downloadMessageAttachment({
    accessToken: connection.accessToken,
    accountId: connection.accountId,
    folderId: body.folderId,
    messageId: body.messageId,
    attachmentId,
  });

  const filename = sanitizeFilename(meta.attachmentName);
  const dealExtId = newId('deal');
  const docId = newId('doc');
  const vendor = (body.vendorName || '').trim() || guessVendor(body.from || '', filename);
  const product = (body.productName || '').trim() || filename.replace(/\.[^.]+$/, '');

  const buffer = Buffer.from(downloaded.bytes);
  const file = new Blob([buffer], {
    type: downloaded.contentType || 'application/octet-stream',
  });
  const { storagePath } = await uploadCustomerDocumentFile({
    customerExternalId: customerId,
    documentId: docId,
    file,
    filename,
  });

  const contract: CandidContractRecord = {
    id: dealExtId,
    customerId,
    locationId: '',
    vendor,
    product,
    solution: vendor,
    service: product,
    dealNote:
      body.dealNote?.trim() ||
      `Imported from email «${body.subject || '(no subject)'}» (${todayIso()})`,
    dealStatus: 'pending',
    monthly: 0,
    expires: '',
    autoRenews: false,
    contractStartDate: todayIso(),
  };

  const document: CustomerDocument = {
    id: docId,
    customerId,
    locationId: '',
    filename,
    recordKind: 'candid_contract',
    uploadedBy,
    date: todayIso(),
    size: `${Math.max(1, Math.round(buffer.byteLength / 1024))} KB`,
    contractId: dealExtId,
    provider: vendor,
    description: `Deal document imported from email attachment`,
    storagePath,
  };

  await persistCustomerRecord({
    customerExternalId: customerId,
    document,
    contract,
  });

  return {
    ok: true,
    message: `Created deal on ${vendor || 'account'} and attached ${filename}`,
    dealId: dealExtId,
    documentIds: [docId],
  };
}

function participantToContact(p: SmartSyncParticipant): Contact {
  return {
    id: newId('ct'),
    name: (p.name || p.email).trim(),
    role: '',
    email: p.email.trim(),
    phone: '',
    isPrimary: false,
    crmNotes: 'Added from MyAssistant email thread',
  };
}

function guessVendor(from: string, filename: string): string {
  const email = from.match(/[\w.+-]+@([\w.-]+)/)?.[1] ?? '';
  const domain = email.split('.')[0] ?? '';
  if (domain && domain !== 'gmail' && domain !== 'outlook' && domain !== 'yahoo') {
    return domain.charAt(0).toUpperCase() + domain.slice(1);
  }
  const base = filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  return base.slice(0, 40) || 'Unknown';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
