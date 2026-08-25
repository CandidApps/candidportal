import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  createContractSignedUrl,
  persistSupplierContractUpload,
} from '@/lib/quotes/persist-supplier-contract';
import {
  assignContractSubmitAction,
  mapContractSubmitActionRow,
} from '@/lib/services/contract-submit-actions';
import { advanceContractDealStage, insertDealActivityEvent } from '@/lib/services/deal-activity';

export const dynamic = 'force-dynamic';

/**
 * Shareable/admin view for an imported supplier contract.
 * Redirects to a fresh signed URL (attachment) or the saved external link.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data: action, error } = await admin
    .from('contract_submit_actions')
    .select('contract_url, contract_filename, contract_storage_path')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!action) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const storagePath = (action.contract_storage_path as string | null)?.trim();
  if (storagePath) {
    const signed = await createContractSignedUrl(storagePath);
    if (!signed) {
      return NextResponse.json({ error: 'Could not create share link' }, { status: 500 });
    }
    return NextResponse.redirect(signed);
  }

  const url = (action.contract_url as string | null)?.trim();
  if (url && /^https?:\/\//i.test(url)) {
    return NextResponse.redirect(url);
  }

  return NextResponse.json(
    { error: 'No contract link or file on this deal yet' },
    { status: 404 },
  );
}

/**
 * Upload a supplier contract file onto the deal (admin already has the contract).
 * Optional form field `advance=1` skips supplier email and marks contract received.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data: existing, error: loadErr } = await admin
    .from('contract_submit_actions')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (loadErr || !existing) {
    return NextResponse.json({ error: loadErr?.message ?? 'Not found' }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart form upload' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  const advance =
    String(form.get('advance') ?? '').trim() === '1' ||
    String(form.get('advance') ?? '').toLowerCase() === 'true';
  const siteOrigin = new URL(request.url).origin;

  try {
    const persisted = await persistSupplierContractUpload({
      actionId: id,
      file,
      filename: file.name,
      contentType: file.type,
      crmCustomerExternalId: (existing.crm_customer_external_id as string | null) ?? null,
      accountName: (existing.account_name as string | null) ?? null,
      vendorName: (existing.vendor_name as string | null) ?? null,
      siteOrigin,
      keepContractUrl: (existing.contract_url as string | null) ?? null,
    });

    const stage = String(existing.status ?? '');
    const canAdvance =
      advance &&
      (stage === 'quote_accepted' || stage === 'supplier_contract_requested');

    if (canAdvance) {
      const result = await advanceContractDealStage({
        actionId: id,
        toStatus: 'supplier_contract_received',
        createdBy: user.id,
        payload: {
          note: 'Admin attached supplier contract and skipped supplier request',
          source: 'upload',
          url: persisted.contractUrl,
          name: persisted.contractFilename,
          storagePath: persisted.contractStoragePath,
        },
        extraUpdates: {
          contract_url: persisted.contractUrl,
          contract_filename: persisted.contractFilename,
          contract_storage_path: persisted.contractStoragePath,
        },
      });
      if (result.error || !result.action) {
        return NextResponse.json({ error: result.error ?? 'Update failed' }, { status: 500 });
      }
      await assignContractSubmitAction({
        actionId: id,
        userIds: [user.id],
        autoClaim: false,
        actionKind: 'submit_contract_to_customer',
      }).catch(() => undefined);
      return NextResponse.json({
        action: mapContractSubmitActionRow(result.action),
        advanced: true,
      });
    }

    const now = new Date().toISOString();
    const { data, error } = await admin
      .from('contract_submit_actions')
      .update({
        contract_url: persisted.contractUrl,
        contract_filename: persisted.contractFilename,
        contract_storage_path: persisted.contractStoragePath,
        updated_at: now,
      })
      .eq('id', id)
      .select('*')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await insertDealActivityEvent({
      leadId: existing.lead_id ? String(existing.lead_id) : null,
      contractSubmitActionId: id,
      crmCustomerExternalId: existing.crm_customer_external_id
        ? String(existing.crm_customer_external_id)
        : null,
      eventType: 'note',
      toStatus: stage,
      createdBy: user.id,
      payload: {
        note: 'Supplier contract file uploaded',
        url: persisted.contractUrl,
        name: persisted.contractFilename,
        storagePath: persisted.contractStoragePath,
      },
    });

    return NextResponse.json({
      action: mapContractSubmitActionRow(data as Record<string, unknown>),
      advanced: false,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 },
    );
  }
}
