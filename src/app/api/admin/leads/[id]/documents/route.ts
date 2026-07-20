import { NextResponse } from 'next/server';
import type { Lead } from '@/components/LeadsView';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { RecordKind } from '@/lib/customer-records';
import { resolveUploadContentType } from '@/lib/file-mime';
import path from 'path';

export const dynamic = 'force-dynamic';

const BUCKET = 'candid_documents';

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'file';
}

function todayLabel(): string {
  return new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Stream a lead document for in-app viewing. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: leadRowId } = await params;
  const docId = new URL(request.url).searchParams.get('docId')?.trim();
  if (!docId) {
    return NextResponse.json({ error: 'docId required' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: existing, error: readErr } = await admin
    .from('portal_leads')
    .select('id, lead_data')
    .eq('id', leadRowId)
    .maybeSingle();

  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  const leadData = (existing.lead_data ?? {}) as Lead;
  const doc = (leadData.documents ?? []).find((d) => d.id === docId);
  if (!doc?.storagePath) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  const { data: file, error: dlErr } = await admin.storage
    .from(BUCKET)
    .download(doc.storagePath);
  if (dlErr || !file) {
    return NextResponse.json({ error: dlErr?.message ?? 'Download failed' }, { status: 404 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = resolveUploadContentType(doc.filename, null);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${doc.filename.replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=120',
    },
  });
}

/** Upload a document (or email HTML snapshot) onto a portal lead. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: leadRowId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ error: 'file required' }, { status: 400 });
  }

  const recordKind = String(form.get('recordKind') || 'other') as RecordKind | 'email';
  const description = String(form.get('description') || '').trim() || undefined;
  const contractJson = form.get('contract');
  let contract: Record<string, unknown> | undefined;
  if (typeof contractJson === 'string' && contractJson.trim()) {
    try {
      contract = JSON.parse(contractJson) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Invalid contract JSON' }, { status: 400 });
    }
  }

  const admin = createSupabaseAdminClient();
  const { data: existing, error: readErr } = await admin
    .from('portal_leads')
    .select('id, lead_data')
    .eq('id', leadRowId)
    .maybeSingle();

  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  const leadData = (existing.lead_data ?? {}) as Lead;
  const docId = `ldoc-${crypto.randomUUID().slice(0, 10)}`;
  const filename = file.name || `document-${docId}`;
  const safeName = safeSegment(path.basename(filename));
  const storagePath = `leads/${safeSegment(leadRowId)}/${safeSegment(docId)}/${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = resolveUploadContentType(filename, file.type);

  const { error: upErr } = await admin.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType,
    upsert: true,
  });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const document = {
    id: docId,
    filename,
    recordKind,
    uploadedBy: user?.email ?? 'admin',
    date: todayLabel(),
    size: `${Math.max(1, Math.round(buffer.byteLength / 1024))} KB`,
    storagePath,
    description,
    contractId: contract?.id ? String(contract.id) : undefined,
  };

  const documents = Array.isArray(leadData.documents) ? [...leadData.documents] : [];
  documents.unshift(document);

  const contracts = Array.isArray((leadData as { contracts?: unknown[] }).contracts)
    ? [...((leadData as { contracts: unknown[] }).contracts)]
    : [];
  if (contract) {
    contracts.unshift({ ...contract, leadId: leadRowId });
  }

  const nextLead: Lead = {
    ...leadData,
    portalLeadRowId: leadRowId,
    documents,
    ...(contracts.length ? { contracts: contracts as Lead['contracts'] } : {}),
  };

  const { error: updErr } = await admin
    .from('portal_leads')
    .update({ lead_data: nextLead })
    .eq('id', leadRowId);

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ document, lead: nextLead });
}
