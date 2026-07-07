import { NextResponse } from 'next/server';
import type { Lead, LeadCloseReason, LeadLifecycle } from '@/components/LeadsView';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type PatchBody = {
  lifecycle?: LeadLifecycle;
  closeReason?: LeadCloseReason;
  closeNote?: string;
  convertedCustomerId?: string;
  leadData?: Lead;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: existing, error: readErr } = await admin
    .from('portal_leads')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (readErr) {
    if (/portal_leads|lifecycle|quote_request_id/.test(readErr.message)) {
      return NextResponse.json({ error: 'Apply migration 0060 first' }, { status: 503 });
    }
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }

  const update: Record<string, unknown> = {};
  if (body.lifecycle) update.lifecycle = body.lifecycle;
  if (body.closeReason !== undefined) update.close_reason = body.closeReason;
  if (body.closeNote !== undefined) update.close_note = body.closeNote;
  if (body.convertedCustomerId !== undefined) {
    update.converted_customer_id = body.convertedCustomerId;
  }
  if (body.leadData) {
    update.lead_data = body.leadData;
  } else if (body.lifecycle || body.closeReason || body.convertedCustomerId) {
    const merged = {
      ...(existing.lead_data as Lead),
      lifecycle: body.lifecycle ?? (existing.lead_data as Lead).lifecycle,
      closeReason: body.closeReason ?? (existing.lead_data as Lead).closeReason,
      closeNote: body.closeNote ?? (existing.lead_data as Lead).closeNote,
      convertedCustomerId:
        body.convertedCustomerId ?? (existing.lead_data as Lead).convertedCustomerId,
      status: body.lifecycle === 'closed' ? 'inactive' : (existing.lead_data as Lead).status,
    };
    update.lead_data = merged;
  }

  const { data, error } = await admin.from('portal_leads').update(update).eq('id', id).select('*').single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ lead: data });
}
