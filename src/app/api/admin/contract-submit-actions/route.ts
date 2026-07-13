import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  activateConvertedContractDeal,
  assignContractSubmitAction,
  mapContractSubmitActionRow,
  normalizeContractDealStage,
  type ContractDealStage,
} from '@/lib/services/contract-submit-actions';
import { advanceContractDealStage, insertDealActivityEvent } from '@/lib/services/deal-activity';

export const dynamic = 'force-dynamic';

export async function GET() {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('contract_submit_actions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    if (/contract_submit_actions/.test(error.message)) {
      return NextResponse.json({ actions: [] });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    actions: (data ?? []).map((r) => mapContractSubmitActionRow(r as Record<string, unknown>)),
  });
}

export async function PATCH(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let body: {
    id?: string;
    status?: string;
    op?:
      | 'mark_supplier_sent'
      | 'mark_supplier_received'
      | 'log_supplier_reply'
      | 'mark_customer_sent'
      | 'mark_signed'
      | 'convert'
      | 'update_contract_link';
    paySource?: string | null;
    paysourcePartnerId?: string | null;
    providerId?: string | null;
    vendorName?: string | null;
    supplierContactEmail?: string | null;
    contractUrl?: string | null;
    contractFilename?: string | null;
    crmCustomerExternalId?: string | null;
    email?: { to?: string; cc?: string; subject?: string; body?: string };
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  if (!body.id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  if (body.op === 'mark_supplier_sent') {
    const result = await advanceContractDealStage({
      actionId: body.id,
      toStatus: 'supplier_contract_requested',
      createdBy: user?.id ?? null,
        payload: {
          note: 'Supplier contract request emailed',
          intent: 'supplier',
          ...(body.email ?? {}),
        },
      extraUpdates: {
        pay_source: body.paySource?.trim() || null,
        paysource_partner_id: body.paysourcePartnerId || null,
        provider_id: body.providerId?.trim() || null,
        vendor_name: body.vendorName?.trim() || null,
        supplier_contact_email:
          // Always prefer who was actually emailed in compose, not the catalog primary contact.
          body.email?.to?.trim() || body.supplierContactEmail?.trim() || null,
      },
    });
    if (result.error || !result.action) {
      return NextResponse.json({ error: result.error ?? 'Update failed' }, { status: 500 });
    }
    if (body.email) {
      await insertDealActivityEvent({
        leadId: result.action.lead_id ? String(result.action.lead_id) : null,
        contractSubmitActionId: body.id,
        crmCustomerExternalId: result.action.crm_customer_external_id
          ? String(result.action.crm_customer_external_id)
          : null,
        eventType: 'email_sent',
        toStatus: 'supplier_contract_requested',
        payload: {
          intent: 'supplier',
          to: body.email.to,
          cc: body.email.cc,
          subject: body.email.subject,
          body: body.email.body ?? '',
          bodyExcerpt: (body.email.body ?? '').slice(0, 500),
          paySource: body.paySource,
        },
        createdBy: user?.id ?? null,
      });
    }
    return NextResponse.json({
      action: mapContractSubmitActionRow(result.action),
    });
  }

  if (body.op === 'mark_customer_sent') {
    const result = await advanceContractDealStage({
      actionId: body.id,
      toStatus: 'customer_contract_sent',
      createdBy: user?.id ?? null,
      payload: { note: 'Contract sent to customer to sign', intent: 'customer', ...(body.email ?? {}) },
    });
    if (result.error || !result.action) {
      return NextResponse.json({ error: result.error ?? 'Update failed' }, { status: 500 });
    }
    if (body.email) {
      await insertDealActivityEvent({
        leadId: result.action.lead_id ? String(result.action.lead_id) : null,
        contractSubmitActionId: body.id,
        eventType: 'email_sent',
        toStatus: 'customer_contract_sent',
        payload: {
          intent: 'customer',
          to: body.email.to,
          cc: body.email.cc,
          subject: body.email.subject,
          body: body.email.body ?? '',
          bodyExcerpt: (body.email.body ?? '').slice(0, 500),
        },
        createdBy: user?.id ?? null,
      });
    }
    return NextResponse.json({
      action: mapContractSubmitActionRow(result.action),
    });
  }

  if (body.op === 'log_supplier_reply') {
    const { data: existing, error: loadErr } = await admin
      .from('contract_submit_actions')
      .select('*')
      .eq('id', body.id)
      .maybeSingle();
    if (loadErr || !existing) {
      return NextResponse.json({ error: loadErr?.message ?? 'Not found' }, { status: 404 });
    }
    // Keep stage; only log the outbound reply + refresh supplier To if needed.
    if (body.email?.to?.trim()) {
      await admin
        .from('contract_submit_actions')
        .update({
          supplier_contact_email: body.email.to.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', body.id);
    }
    await insertDealActivityEvent({
      leadId: existing.lead_id ? String(existing.lead_id) : null,
      contractSubmitActionId: body.id,
      crmCustomerExternalId: existing.crm_customer_external_id
        ? String(existing.crm_customer_external_id)
        : null,
      eventType: 'email_sent',
      toStatus: String(existing.status),
      payload: {
        intent: 'supplier_reply',
        note: 'Reply sent to supplier',
        to: body.email?.to,
        cc: body.email?.cc,
        subject: body.email?.subject,
        body: body.email?.body ?? '',
        bodyExcerpt: (body.email?.body ?? '').slice(0, 500),
      },
      createdBy: user?.id ?? null,
    });
    const { data: refreshed } = await admin
      .from('contract_submit_actions')
      .select('*')
      .eq('id', body.id)
      .maybeSingle();
    return NextResponse.json({
      action: mapContractSubmitActionRow((refreshed ?? existing) as Record<string, unknown>),
    });
  }

  if (body.op === 'update_contract_link') {
    const { data: existing, error: loadErr } = await admin
      .from('contract_submit_actions')
      .select('*')
      .eq('id', body.id)
      .maybeSingle();
    if (loadErr || !existing) {
      return NextResponse.json({ error: loadErr?.message ?? 'Not found' }, { status: 404 });
    }

    const nextUrl =
      body.contractUrl === undefined
        ? ((existing.contract_url as string | null) ?? null)
        : body.contractUrl?.trim() || null;
    const nextFilename =
      body.contractFilename === undefined
        ? ((existing.contract_filename as string | null) ?? null)
        : body.contractFilename?.trim() || null;

    const { data, error } = await admin
      .from('contract_submit_actions')
      .update({
        contract_url: nextUrl,
        contract_filename: nextFilename,
        updated_at: new Date().toISOString(),
      })
      .eq('id', body.id)
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const prevUrl = (existing.contract_url as string | null) ?? null;
    if (prevUrl !== nextUrl) {
      await insertDealActivityEvent({
        leadId: existing.lead_id ? String(existing.lead_id) : null,
        contractSubmitActionId: body.id,
        crmCustomerExternalId: existing.crm_customer_external_id
          ? String(existing.crm_customer_external_id)
          : null,
        eventType: 'note',
        toStatus: String(existing.status),
        createdBy: user?.id ?? null,
        payload: {
          note: nextUrl
            ? `Contract link updated${prevUrl ? ' (replaced previous link)' : ''}`
            : 'Contract link cleared',
          previousUrl: prevUrl,
          url: nextUrl,
        },
      });
    }

    return NextResponse.json({
      action: mapContractSubmitActionRow(data as Record<string, unknown>),
    });
  }

  if (body.op === 'mark_supplier_received') {
    const result = await advanceContractDealStage({
      actionId: body.id,
      toStatus: 'supplier_contract_received',
      createdBy: user?.id ?? null,
      payload: {
        note: 'Admin marked supplier contract as received',
        url: body.contractUrl ?? null,
        name: body.contractFilename ?? null,
      },
      extraUpdates: {
        ...(body.contractUrl !== undefined ? { contract_url: body.contractUrl } : {}),
        ...(body.contractFilename !== undefined
          ? { contract_filename: body.contractFilename }
          : {}),
      },
    });
    if (result.error || !result.action) {
      return NextResponse.json({ error: result.error ?? 'Update failed' }, { status: 500 });
    }
    await assignContractSubmitAction({
      actionId: body.id,
      userIds: user?.id ? [user.id] : [],
      autoClaim: false,
      actionKind: 'submit_contract_to_customer',
    }).catch(() => undefined);
    return NextResponse.json({
      action: mapContractSubmitActionRow(result.action),
    });
  }

  if (body.op === 'mark_signed') {
    const result = await advanceContractDealStage({
      actionId: body.id,
      toStatus: 'customer_contract_signed',
      createdBy: user?.id ?? null,
      payload: { note: 'Admin marked customer contract as signed' },
    });
    if (result.error || !result.action) {
      return NextResponse.json({ error: result.error ?? 'Update failed' }, { status: 500 });
    }
    return NextResponse.json({
      action: mapContractSubmitActionRow(result.action),
    });
  }

  if (body.op === 'convert') {
    const result = await advanceContractDealStage({
      actionId: body.id,
      toStatus: 'converted',
      createdBy: user?.id ?? null,
      payload: { note: 'Lead converted to active customer / service' },
      extraUpdates: {
        ...(body.crmCustomerExternalId?.trim()
          ? { crm_customer_external_id: body.crmCustomerExternalId.trim() }
          : {}),
      },
    });
    if (result.error || !result.action) {
      return NextResponse.json({ error: result.error ?? 'Update failed' }, { status: 500 });
    }

    const mapped = mapContractSubmitActionRow(result.action);
    const activated = await activateConvertedContractDeal({
      action: mapped,
      createdBy: user?.id ?? null,
    }).catch((err) => {
      console.error('[contract-submit] activate on convert failed', err);
      return null;
    });

    await assignContractSubmitAction({
      actionId: body.id,
      userIds: user?.id ? [user.id] : [],
      autoClaim: true,
      actionKind: 'submit_contract_to_customer',
    }).catch(() => undefined);

    const refreshed =
      activated?.crmCustomerExternalId &&
      activated.crmCustomerExternalId !== mapped.crm_customer_external_id
        ? mapContractSubmitActionRow({
            ...result.action,
            crm_customer_external_id: activated.crmCustomerExternalId,
          })
        : mapped;

    return NextResponse.json({ action: refreshed });
  }

  if (body.status) {
    const stage = normalizeContractDealStage(body.status);
    const extra: Record<string, unknown> = {};
    if (body.contractUrl !== undefined) extra.contract_url = body.contractUrl;
    if (body.contractFilename !== undefined) extra.contract_filename = body.contractFilename;
    if (body.paySource !== undefined) extra.pay_source = body.paySource;
    if (body.vendorName !== undefined) extra.vendor_name = body.vendorName;

    const result = await advanceContractDealStage({
      actionId: body.id,
      toStatus: stage as ContractDealStage,
      createdBy: user?.id ?? null,
      extraUpdates: extra,
    });
    if (result.error || !result.action) {
      return NextResponse.json({ error: result.error ?? 'Update failed' }, { status: 500 });
    }
    return NextResponse.json({
      action: mapContractSubmitActionRow(result.action),
    });
  }

  // Partial field update without stage change
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.paySource !== undefined) updates.pay_source = body.paySource;
  if (body.paysourcePartnerId !== undefined) updates.paysource_partner_id = body.paysourcePartnerId;
  if (body.providerId !== undefined) updates.provider_id = body.providerId;
  if (body.vendorName !== undefined) updates.vendor_name = body.vendorName;
  if (body.supplierContactEmail !== undefined) {
    updates.supplier_contact_email = body.supplierContactEmail;
  }
  if (body.contractUrl !== undefined) updates.contract_url = body.contractUrl;
  if (body.contractFilename !== undefined) updates.contract_filename = body.contractFilename;
  if (body.crmCustomerExternalId !== undefined) {
    updates.crm_customer_external_id = body.crmCustomerExternalId;
  }

  if (Object.keys(updates).length <= 1) {
    return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
  }

  const { data, error } = await admin
    .from('contract_submit_actions')
    .update(updates)
    .eq('id', body.id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    action: mapContractSubmitActionRow(data as Record<string, unknown>),
  });
}
