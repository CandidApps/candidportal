import { NextResponse } from 'next/server';
import type { Lead, LeadContact } from '@/components/LeadsView';
import type { Contact } from '@/components/CustomersView';
import { getMyRole } from '@/lib/auth/roles';
import type {
  AdminRecordAddProposal,
  AdminRecordContactDraft,
} from '@/lib/admin-hank-record-actions';
import { upsertCustomerContact } from '@/lib/crm/persist';
import { replaceAccountTags } from '@/lib/outreach-server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function newContactId(): string {
  return `ct-${crypto.randomUUID().slice(0, 8)}`;
}

function draftToCrmContact(draft: AdminRecordContactDraft, primaryFallback: boolean): Contact {
  return {
    id: newContactId(),
    name: draft.name.trim(),
    role: draft.role?.trim() ?? '',
    email: draft.email?.trim() ?? '',
    altEmail: draft.altEmail?.trim() || undefined,
    phone: draft.phone?.trim() ?? '',
    isPrimary: draft.isPrimary ?? primaryFallback,
    crmNotes: draft.notes?.trim() || undefined,
  };
}

async function resolveCustomerExternalId(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  targetId: string | undefined,
  targetLabel: string,
): Promise<string> {
  if (targetId?.trim()) {
    const id = targetId.trim();
    const { data: byExternal } = await admin
      .from('customers')
      .select('external_id')
      .eq('external_id', id)
      .maybeSingle();
    if (byExternal?.external_id) return byExternal.external_id as string;

    if (/^[0-9a-f-]{36}$/i.test(id)) {
      const { data: byUuid } = await admin
        .from('customers')
        .select('external_id')
        .eq('id', id)
        .maybeSingle();
      if (byUuid?.external_id) return byUuid.external_id as string;
    }
    return id;
  }

  const label = targetLabel.trim();
  if (!label) throw new Error('Account target is required');
  const { data: byName } = await admin
    .from('customers')
    .select('external_id, company')
    .ilike('company', label)
    .is('archived_at', null)
    .limit(5);
  if (byName?.length === 1 && byName[0]?.external_id) return byName[0].external_id as string;
  if (byName && byName.length > 1) {
    throw new Error(
      `Multiple accounts match "${label}". Specify targetId (external_id) and try again.`,
    );
  }
  const { data: fuzzy } = await admin
    .from('customers')
    .select('external_id, company')
    .ilike('company', `%${label}%`)
    .is('archived_at', null)
    .limit(5);
  if (fuzzy?.length === 1 && fuzzy[0]?.external_id) return fuzzy[0].external_id as string;
  if (fuzzy && fuzzy.length > 1) {
    throw new Error(
      `Multiple accounts match "${label}". Specify targetId (external_id) and try again.`,
    );
  }
  throw new Error(`Could not find account "${label}". Provide targetId and approve again.`);
}

async function applyAccountContacts(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  proposal: AdminRecordAddProposal,
): Promise<string> {
  const customerId = await resolveCustomerExternalId(admin, proposal.targetId, proposal.targetLabel);
  for (let i = 0; i < proposal.contacts.length; i++) {
    const draft = proposal.contacts[i]!;
    await upsertCustomerContact(
      customerId,
      draftToCrmContact(draft, i === 0 && proposal.contacts.length === 1),
    );
  }
  return `Added ${proposal.contacts.length} contact${proposal.contacts.length === 1 ? '' : 's'} to ${proposal.targetLabel}.`;
}

async function applyLeadContacts(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  proposal: AdminRecordAddProposal,
): Promise<string> {
  let leadId = proposal.targetId?.trim();
  if (!leadId) {
    const label = proposal.targetLabel.trim();
    const { data } = await admin.from('portal_leads').select('id, lead_data').limit(200);
    const matches = (data ?? []).filter((row) => {
      const lead = row.lead_data as Lead | null;
      const friendly = String(lead?.companyFriendly ?? '').toLowerCase();
      const legal = String(lead?.companyLegal ?? '').toLowerCase();
      const q = label.toLowerCase();
      return friendly === q || legal === q || friendly.includes(q) || legal.includes(q);
    });
    if (matches.length === 1) leadId = matches[0]!.id as string;
    else if (matches.length > 1) {
      throw new Error(`Multiple leads match "${label}". Provide targetId (portal lead uuid).`);
    } else {
      throw new Error(`Could not find lead "${label}". Provide targetId and approve again.`);
    }
  }

  const { data: existing, error } = await admin
    .from('portal_leads')
    .select('id, lead_data')
    .eq('id', leadId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!existing) throw new Error('Lead not found');

  const leadData = { ...((existing.lead_data as Lead) ?? {}) } as Lead;
  const contacts = [...(leadData.contacts ?? [])];
  for (const draft of proposal.contacts) {
    contacts.push({
      id: newContactId(),
      name: draft.name.trim(),
      email: draft.email?.trim() ?? '',
      phone: draft.phone?.trim() ?? '',
      role: draft.role?.trim() ?? '',
      isDecisionMaker: false,
      isPrimary: Boolean(draft.isPrimary) || contacts.length === 0,
    } satisfies LeadContact);
  }
  leadData.contacts = contacts;

  const { error: updErr } = await admin
    .from('portal_leads')
    .update({ lead_data: leadData })
    .eq('id', leadId);
  if (updErr) throw new Error(updErr.message);

  return `Added ${proposal.contacts.length} contact${proposal.contacts.length === 1 ? '' : 's'} to lead ${proposal.targetLabel}.`;
}

async function applyPartnerContacts(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  proposal: AdminRecordAddProposal,
): Promise<string> {
  type ProviderRow = { id: number; name: string; display_name: string | null };

  const pickProvider = (rows: ProviderRow[], label: string): ProviderRow => {
    if (rows.length === 1) return rows[0]!;
    const q = label.trim().toLowerCase();
    const exact = rows.filter(
      (r) =>
        String(r.name ?? '').toLowerCase() === q ||
        String(r.display_name ?? '').toLowerCase() === q,
    );
    if (exact.length === 1) return exact[0]!;
    const names = rows.map((r) => `${r.name} (#${r.id})`).join(', ');
    throw new Error(
      `Multiple partners match "${label}" (${names}). Provide targetId (solution_providers id) and try again.`,
    );
  };

  let provider: ProviderRow | null = null;
  const partnerId = proposal.targetId?.trim();

  if (partnerId && Number.isFinite(Number(partnerId))) {
    const { data, error } = await admin
      .from('solution_providers')
      .select('id, name, display_name')
      .eq('id', Number(partnerId))
      .maybeSingle();
    if (error) throw new Error(error.message);
    provider = (data as ProviderRow | null) ?? null;
  }

  if (!provider) {
    const label = proposal.targetLabel.trim();
    if (!label) throw new Error('Partner target is required');

    const { data: byName } = await admin
      .from('solution_providers')
      .select('id, name, display_name')
      .ilike('name', `%${label}%`)
      .limit(10);
    const { data: byDisplay } = await admin
      .from('solution_providers')
      .select('id, name, display_name')
      .ilike('display_name', `%${label}%`)
      .limit(10);
    const merged = new Map<number, ProviderRow>();
    for (const row of [...(byName ?? []), ...(byDisplay ?? [])]) {
      merged.set(Number(row.id), row as ProviderRow);
    }
    const rows = [...merged.values()];
    if (!rows.length) {
      throw new Error(
        `Could not find partner/supplier "${label}" in Partners (solution_providers). Provide targetId and approve again.`,
      );
    }
    provider = pickProvider(rows, label);
  }

  const { count: existingCount } = await admin
    .from('solution_provider_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('provider_id', provider.id);
  const hasPrimary = (existingCount ?? 0) > 0;

  for (let i = 0; i < proposal.contacts.length; i++) {
    const c = proposal.contacts[i]!;
    const { error } = await admin.from('solution_provider_contacts').insert({
      provider_id: provider.id,
      name: c.name.trim(),
      role: c.role?.trim() ?? '',
      email: c.email?.trim() ?? '',
      phone: c.phone?.trim() ?? '',
      is_primary: Boolean(c.isPrimary) || (!hasPrimary && i === 0),
      client_facing: false,
      notes: c.notes?.trim() || null,
    });
    if (error) throw new Error(error.message);
  }

  return `Added ${proposal.contacts.length} contact${proposal.contacts.length === 1 ? '' : 's'} to partner ${provider.name}.`;
}

async function applyOutreachContacts(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  proposal: AdminRecordAddProposal,
  userId: string,
): Promise<string> {
  const customerId = await resolveCustomerExternalId(admin, proposal.targetId, proposal.targetLabel);
  const savedExternalIds: string[] = [];
  for (let i = 0; i < proposal.contacts.length; i++) {
    const contact = draftToCrmContact(proposal.contacts[i]!, i === 0);
    await upsertCustomerContact(customerId, contact);
    savedExternalIds.push(contact.id);
  }

  if (proposal.setAsOutreachContact && savedExternalIds[0]) {
    const { data: cust } = await admin
      .from('customers')
      .select('id')
      .eq('external_id', customerId)
      .maybeSingle();
    const { data: contactRow } = await admin
      .from('customer_contacts')
      .select('id')
      .eq('customer_id', cust?.id)
      .eq('external_id', savedExternalIds[0])
      .maybeSingle();

    const { data: row } = await admin
      .from('admin_outreach_accounts')
      .select('id')
      .eq('customer_external_id', customerId)
      .maybeSingle();

    if (row?.id && contactRow?.id) {
      await admin
        .from('admin_outreach_accounts')
        .update({
          contact_id: contactRow.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      if (proposal.outreachTagNames?.length) {
        await replaceAccountTags(admin, row.id as string, proposal.outreachTagNames, userId);
      }
    }
  }

  return `Added ${proposal.contacts.length} contact${proposal.contacts.length === 1 ? '' : 's'} for outreach on ${proposal.targetLabel}.`;
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

  let proposal: AdminRecordAddProposal;
  try {
    proposal = (await request.json()) as AdminRecordAddProposal;
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  if (!proposal?.target || !Array.isArray(proposal.contacts) || !proposal.contacts.length) {
    return NextResponse.json({ error: 'Invalid proposal' }, { status: 400 });
  }
  if (!['account', 'lead', 'partner', 'outreach'].includes(proposal.target)) {
    return NextResponse.json({ error: 'Unsupported target' }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    let message = '';
    if (proposal.target === 'account') message = await applyAccountContacts(admin, proposal);
    else if (proposal.target === 'lead') message = await applyLeadContacts(admin, proposal);
    else if (proposal.target === 'partner') message = await applyPartnerContacts(admin, proposal);
    else message = await applyOutreachContacts(admin, proposal, user.id);

    return NextResponse.json({ ok: true, message });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to apply' },
      { status: 500 },
    );
  }
}
