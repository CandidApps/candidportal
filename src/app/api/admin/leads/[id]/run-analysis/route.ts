import { NextResponse } from 'next/server';
import type { Lead, LeadDocument } from '@/components/LeadsView';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { finalizeBillParseResult } from '@/lib/bill-parse';
import type { BillParseResult } from '@/lib/bill-parse-types';
import { looksLikeGarbageVendorName } from '@/lib/bill-vendor-resolve';
import { mapReviewRow } from '@/lib/services/analysis-reviews';
import { serviceBillStoragePath } from '@/lib/storage-paths';
import { resolveUploadContentType } from '@/lib/file-mime';
import { logoKeyFromLabel } from '@/lib/services/account-services';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Queue a bill analysis review from a lead document (Statement for Analysis),
 * linking the existing lead into the Action Center analysis pipeline.
 */
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
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { documentId?: string; parseResult?: BillParseResult };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const documentId = body.documentId?.trim();
  if (!documentId || !body.parseResult) {
    return NextResponse.json({ error: 'documentId and parseResult required' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: existing, error: readErr } = await admin
    .from('portal_leads')
    .select('id, user_id, lead_data, analysis_review_id, lead_source, lifecycle')
    .eq('id', leadRowId)
    .maybeSingle();

  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  const leadData = (existing.lead_data ?? {}) as Lead;
  const documents = Array.isArray(leadData.documents) ? [...leadData.documents] : [];
  const doc = documents.find((d) => d.id === documentId) as LeadDocument | undefined;
  if (!doc?.storagePath) {
    return NextResponse.json({ error: 'Document not found on lead' }, { status: 404 });
  }

  const kind = String(doc.recordKind || '').toLowerCase();
  if (kind !== 'statement_for_analysis' && kind !== 'statement') {
    return NextResponse.json(
      { error: 'Only Statement / Statement for Analysis documents can be analyzed' },
      { status: 400 },
    );
  }

  if (doc.analysisReviewId || existing.analysis_review_id) {
    const reviewId = doc.analysisReviewId || existing.analysis_review_id;
    return NextResponse.json({
      ok: true,
      reviewId,
      alreadyQueued: true,
      message: 'Analysis already linked to this lead',
    });
  }

  const { data: fileBlob, error: dlErr } = await admin.storage
    .from('candid_documents')
    .download(doc.storagePath);
  if (dlErr || !fileBlob) {
    return NextResponse.json({ error: dlErr?.message ?? 'Could not download document' }, { status: 500 });
  }

  const bytes = Buffer.from(await fileBlob.arrayBuffer());
  const contentType = resolveUploadContentType(doc.filename, null);
  const ownerUserId = (existing.user_id as string | null) || user.id;
  const primaryContact =
    leadData.contacts?.find((c) => c.isPrimary) ?? leadData.contacts?.[0];
  const companyName = leadData.companyFriendly || leadData.companyLegal || 'Lead';

  const parseResult = finalizeBillParseResult(body.parseResult, {
    filename: doc.filename,
    userLabel: companyName,
  });
  const vendorName =
    parseResult.vendorName && !looksLikeGarbageVendorName(parseResult.vendorName)
      ? parseResult.vendorName
      : companyName;
  const storedParse = { ...parseResult, vendorName };
  const category = String(parseResult.category ?? 'other');
  const categoryLabel = String(parseResult.categoryLabel ?? category);
  const logoKey = logoKeyFromLabel(vendorName);

  const { data: serviceRow, error: svcErr } = await admin
    .from('account_services')
    .insert({
      user_id: ownerUserId,
      name: vendorName,
      vendor: 'Bill submitted — analysis in progress',
      status: 'pending_analysis',
      logo_key: logoKey,
      service_type: category === 'merchant_services' ? 'merchant' : null,
      candid_managed: false,
      savings_opportunity_only: true,
    })
    .select('id')
    .single();

  if (svcErr || !serviceRow) {
    return NextResponse.json(
      { error: svcErr?.message ?? 'Could not create analysis service row' },
      { status: 500 },
    );
  }

  const serviceId = String(serviceRow.id);
  const billStoragePath = serviceBillStoragePath(ownerUserId, serviceId, doc.filename);
  const { error: upErr } = await admin.storage.from('service-bills').upload(billStoragePath, bytes, {
    contentType,
    upsert: true,
  });
  if (upErr) {
    await admin.from('account_services').delete().eq('id', serviceId);
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  await admin
    .from('account_services')
    .update({ bill_storage_path: billStoragePath })
    .eq('id', serviceId);

  const { data: reviewRow, error: reviewErr } = await admin
    .from('bill_analysis_reviews')
    .insert({
      user_id: ownerUserId,
      account_service_id: serviceId,
      crm_customer_id: null,
      customer_email: primaryContact?.email || user.email || null,
      customer_name: primaryContact?.name || companyName,
      vendor_name: vendorName,
      filename: doc.filename,
      bill_storage_path: billStoragePath,
      detected_category: category,
      category_label: categoryLabel,
      detected_categories: [category],
      parse_result: storedParse,
      status: 'pending_review',
    })
    .select('*')
    .single();

  if (reviewErr || !reviewRow) {
    await admin.from('account_services').delete().eq('id', serviceId);
    return NextResponse.json(
      { error: reviewErr?.message ?? 'Could not create analysis review' },
      { status: 500 },
    );
  }

  await admin
    .from('account_services')
    .update({ analysis_review_id: reviewRow.id })
    .eq('id', serviceId);

  const review = mapReviewRow(reviewRow);
  const nextDocuments = documents.map((d) =>
    d.id === documentId
      ? { ...d, analysisReviewId: review.id, description: d.description || 'Queued for bill analysis' }
      : d,
  );
  const nextLead: Lead = {
    ...leadData,
    portalLeadRowId: leadRowId,
    analysisReviewId: review.id,
    source: leadData.source ?? 'manual',
    lifecycle: leadData.lifecycle ?? 'open',
    documents: nextDocuments,
    helpWith:
      leadData.helpWith?.trim() ||
      `Bill analysis — ${vendorName} (${categoryLabel})`,
    currentTechnology: leadData.currentTechnology?.trim() || vendorName,
  };

  const { error: leadUpdErr } = await admin
    .from('portal_leads')
    .update({
      analysis_review_id: review.id,
      user_id: ownerUserId,
      // Keep source if already set; manual leads become bill-linked but stay on this row.
      lead_source: existing.lead_source === 'quote_request' ? 'quote_request' : 'bill_analysis',
      lifecycle: existing.lifecycle === 'closed' ? 'closed' : 'open',
      lead_data: nextLead,
    })
    .eq('id', leadRowId);

  if (leadUpdErr) {
    console.error('[run-analysis] lead update failed', leadUpdErr.message);
  }

  return NextResponse.json({
    ok: true,
    reviewId: review.id,
    review,
    lead: nextLead,
    message: 'Analysis queued — opening in Action Center',
  });
}
