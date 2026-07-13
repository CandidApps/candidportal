import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type { ContractDealStage } from '@/lib/services/contract-submit-actions';

export type DealActivityEventType =
  | 'status_change'
  | 'email_sent'
  | 'email_received'
  | 'note'
  | 'converted';

export type DealActivityEventRow = {
  id: string;
  lead_id: string | null;
  contract_submit_action_id: string | null;
  crm_customer_external_id: string | null;
  event_type: DealActivityEventType;
  from_status: string | null;
  to_status: string | null;
  payload: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
};

export function mapDealActivityEventRow(row: Record<string, unknown>): DealActivityEventRow {
  return {
    id: String(row.id),
    lead_id: row.lead_id ? String(row.lead_id) : null,
    contract_submit_action_id: row.contract_submit_action_id
      ? String(row.contract_submit_action_id)
      : null,
    crm_customer_external_id: (row.crm_customer_external_id as string | null) ?? null,
    event_type: row.event_type as DealActivityEventType,
    from_status: (row.from_status as string | null) ?? null,
    to_status: (row.to_status as string | null) ?? null,
    payload: (row.payload as Record<string, unknown>) ?? {},
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at),
  };
}

export async function insertDealActivityEvent(params: {
  leadId?: string | null;
  contractSubmitActionId?: string | null;
  crmCustomerExternalId?: string | null;
  eventType: DealActivityEventType;
  fromStatus?: string | null;
  toStatus?: string | null;
  payload?: Record<string, unknown>;
  createdBy?: string | null;
}): Promise<DealActivityEventRow | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('deal_activity_events')
    .insert({
      lead_id: params.leadId ?? null,
      contract_submit_action_id: params.contractSubmitActionId ?? null,
      crm_customer_external_id: params.crmCustomerExternalId ?? null,
      event_type: params.eventType,
      from_status: params.fromStatus ?? null,
      to_status: params.toStatus ?? null,
      payload: params.payload ?? {},
      created_by: params.createdBy ?? null,
    })
    .select('*')
    .single();

  if (error) {
    console.error('[deal-activity] insert failed', error.message);
    return null;
  }
  return mapDealActivityEventRow(data as Record<string, unknown>);
}

export async function advanceContractDealStage(params: {
  actionId: string;
  toStatus: ContractDealStage;
  createdBy?: string | null;
  payload?: Record<string, unknown>;
  extraUpdates?: Record<string, unknown>;
}): Promise<{ action: Record<string, unknown> | null; error?: string }> {
  const admin = createSupabaseAdminClient();
  const { data: existing, error: loadErr } = await admin
    .from('contract_submit_actions')
    .select('*')
    .eq('id', params.actionId)
    .maybeSingle();

  if (loadErr || !existing) {
    return { action: null, error: loadErr?.message ?? 'Action not found' };
  }

  const fromStatus = String(existing.status ?? '');
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('contract_submit_actions')
    .update({
      status: params.toStatus,
      updated_at: now,
      ...(params.extraUpdates ?? {}),
    })
    .eq('id', params.actionId)
    .select('*')
    .single();

  if (error) return { action: null, error: error.message };

  const leadId = data.lead_id ? String(data.lead_id) : null;
  if (leadId) {
    const leadPatch: Record<string, string> = { deal_stage: params.toStatus };
    if (params.toStatus === 'converted') leadPatch.lifecycle = 'converted';
    await admin.from('portal_leads').update(leadPatch).eq('id', leadId);
  }

  await insertDealActivityEvent({
    leadId,
    contractSubmitActionId: params.actionId,
    crmCustomerExternalId: data.crm_customer_external_id
      ? String(data.crm_customer_external_id)
      : null,
    eventType: params.toStatus === 'converted' ? 'converted' : 'status_change',
    fromStatus,
    toStatus: params.toStatus,
    payload: params.payload ?? {},
    createdBy: params.createdBy,
  });

  return { action: data as Record<string, unknown> };
}

export function formatDealActivitySummary(event: DealActivityEventRow): string {
  const payload = event.payload ?? {};
  if (
    event.event_type === 'email_sent' ||
    (event.event_type === 'status_change' &&
      typeof payload.subject === 'string' &&
      (typeof payload.body === 'string' || typeof payload.to === 'string'))
  ) {
    const to = typeof payload.to === 'string' ? payload.to : '';
    const subject = typeof payload.subject === 'string' ? payload.subject : 'Email';
    const intent = typeof payload.intent === 'string' ? payload.intent : '';
    const kind =
      intent === 'supplier_reply'
        ? 'Reply sent to supplier'
        : intent === 'customer'
          ? 'Contract emailed to customer'
          : intent === 'supplier'
            ? 'Supplier contract request emailed'
            : 'Email sent';
    return `${kind}${to ? ` to ${to}` : ''}: ${subject}`;
  }
  if (event.event_type === 'email_received') {
    const from = typeof payload.from === 'string' ? payload.from : 'supplier';
    return `Email received from ${from}`;
  }
  if (event.event_type === 'converted') {
    return 'Lead converted to active customer / service';
  }
  if (event.event_type === 'note') {
    return typeof payload.note === 'string' ? payload.note : 'Note added';
  }
  if (event.to_status) {
    return `Status → ${String(event.to_status).replace(/_/g, ' ')}`;
  }
  return 'Activity';
}
