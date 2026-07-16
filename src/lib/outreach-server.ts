import 'server-only';

import { listAdminTeamMembers } from '@/lib/admin-team-members';
import {
  normalizeOutreachHelp,
  normalizeOutreachStatus,
  type OutreachAccount,
  type OutreachAssignPreset,
  type OutreachContact,
  type OutreachOwnerOption,
} from '@/lib/outreach';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export type OutreachDbRow = {
  id: string;
  owner_user_id: string;
  customer_external_id: string;
  status: string;
  contact_id?: string | null;
  last_contacted_at?: string | null;
  next_follow_up_at?: string | null;
  follow_up_owner_user_id?: string | null;
  how_can_we_help?: string | null;
  how_else_help?: string | null;
  current_provider?: string | null;
  pain_points?: string | null;
  notes?: string | null;
  assigned_user_ids?: string[] | null;
  linked_reminder_id?: string | null;
  linked_lead_id?: string | null;
  knows_candid?: boolean | null;
  knows_what_we_do?: boolean | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type ContactDb = {
  id: string;
  customer_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  is_primary: boolean | null;
};

export function mapOutreachContact(row: ContactDb): OutreachContact {
  return {
    id: row.id,
    name: row.name?.trim() || 'Contact',
    email: row.email?.trim() || '',
    phone: row.phone?.trim() || '',
    role: row.role?.trim() || '',
    isPrimary: Boolean(row.is_primary),
  };
}

export async function resolveOutreachAssignUserIds(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  currentId: string,
  preset: OutreachAssignPreset,
  otherUserId?: string,
): Promise<{ ids: string[]; error?: string }> {
  const team = await listAdminTeamMembers(admin);
  const teamIds = new Set(team.map((m) => m.id));
  if (!teamIds.has(currentId)) {
    return { ids: [], error: 'Current user is not an authorized admin' };
  }

  if (preset === 'me') return { ids: [currentId] };
  if (preset === 'other') {
    const other = otherUserId?.trim() || '';
    if (!other) return { ids: [], error: 'Pick another authorized user' };
    if (!teamIds.has(other)) return { ids: [], error: 'Assignee must be an authorized admin' };
    return { ids: [other] };
  }

  const byFirst = (name: string) =>
    team.find((m) => m.displayName.trim().toLowerCase().startsWith(name))?.id ?? null;
  const joe = byFirst('joe');
  const bryan = byFirst('bryan');
  if (preset === 'joe') {
    return joe ? { ids: [joe] } : { ids: [], error: 'Could not find Joe on the admin roster' };
  }
  if (preset === 'bryan') {
    return bryan ? { ids: [bryan] } : { ids: [], error: 'Could not find Bryan on the admin roster' };
  }
  if (preset === 'joe_bryan') {
    const ids = [joe, bryan].filter((id): id is string => Boolean(id));
    if (ids.length < 2) {
      return { ids: [], error: 'Could not find both Joe and Bryan on the admin roster' };
    }
    return { ids };
  }
  return { ids: [], error: 'Invalid assign option' };
}

/** Ensure user ids are authorized admins (drops unknown ids). */
export async function filterAuthorizedAdminIds(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userIds: string[],
): Promise<string[]> {
  if (!userIds.length) return [];
  const team = await listAdminTeamMembers(admin);
  const teamIds = new Set(team.map((m) => m.id));
  return userIds.filter((id) => teamIds.has(id));
}

export async function assertContactBelongsToCustomer(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  customerExternalId: string,
  contactId: string,
): Promise<boolean> {
  const { data: customer } = await admin
    .from('customers')
    .select('id')
    .eq('external_id', customerExternalId)
    .maybeSingle();
  if (!customer?.id) return false;
  const { data: contact } = await admin
    .from('customer_contacts')
    .select('id')
    .eq('id', contactId)
    .eq('customer_id', customer.id)
    .maybeSingle();
  return Boolean(contact?.id);
}

export async function loadOutreachCompanyAndContacts(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  externalIds: string[],
): Promise<{
  companyByExternalId: Map<string, string>;
  customerUuidByExternalId: Map<string, string>;
  contactsByExternalId: Map<string, OutreachContact[]>;
}> {
  const companyByExternalId = new Map<string, string>();
  const customerUuidByExternalId = new Map<string, string>();
  const contactsByExternalId = new Map<string, OutreachContact[]>();
  if (!externalIds.length) {
    return { companyByExternalId, customerUuidByExternalId, contactsByExternalId };
  }

  const { data: customers } = await admin
    .from('customers')
    .select('id, external_id, company')
    .in('external_id', externalIds);

  const uuidToExternal = new Map<string, string>();
  for (const row of customers ?? []) {
    const ext = String(row.external_id ?? '');
    const uuid = String(row.id ?? '');
    if (!ext || !uuid) continue;
    companyByExternalId.set(ext, String(row.company ?? ext));
    customerUuidByExternalId.set(ext, uuid);
    uuidToExternal.set(uuid, ext);
  }

  const uuids = [...uuidToExternal.keys()];
  if (uuids.length) {
    const { data: contacts } = await admin
      .from('customer_contacts')
      .select('id, customer_id, name, email, phone, role, is_primary')
      .in('customer_id', uuids)
      .order('is_primary', { ascending: false });
    for (const raw of contacts ?? []) {
      const row = raw as ContactDb;
      const ext = uuidToExternal.get(row.customer_id);
      if (!ext) continue;
      const list = contactsByExternalId.get(ext) ?? [];
      list.push(mapOutreachContact(row));
      contactsByExternalId.set(ext, list);
    }
  }

  return { companyByExternalId, customerUuidByExternalId, contactsByExternalId };
}

export function outreachRowToItem(
  row: OutreachDbRow,
  companyByExternalId: Map<string, string>,
  contactsByExternalId: Map<string, OutreachContact[]>,
  ownersById: Map<string, OutreachOwnerOption>,
): OutreachAccount {
  const owner = ownersById.get(row.owner_user_id);
  const contacts = contactsByExternalId.get(row.customer_external_id) ?? [];
  const contact =
    (row.contact_id ? contacts.find((c) => c.id === row.contact_id) : null) ??
    contacts.find((c) => c.isPrimary) ??
    contacts[0] ??
    null;
  const assignedUserIds = Array.isArray(row.assigned_user_ids) ? row.assigned_user_ids : [];
  const followUpOwner = row.follow_up_owner_user_id
    ? ownersById.get(row.follow_up_owner_user_id)
    : undefined;

  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    ownerEmail: owner?.email,
    ownerDisplayName: owner?.displayName,
    customerExternalId: row.customer_external_id,
    company: companyByExternalId.get(row.customer_external_id) ?? row.customer_external_id,
    contactId: row.contact_id ?? contact?.id ?? null,
    contact,
    contacts,
    status: normalizeOutreachStatus(row.status),
    lastContactedAt: row.last_contacted_at ?? null,
    nextFollowUpAt: row.next_follow_up_at ?? null,
    followUpOwnerUserId: row.follow_up_owner_user_id ?? null,
    followUpOwnerDisplayName: followUpOwner?.displayName,
    howCanWeHelp: normalizeOutreachHelp(row.how_can_we_help),
    howElseHelp: row.how_else_help ?? '',
    currentProvider: row.current_provider ?? '',
    painPoints: row.pain_points ?? '',
    notes: row.notes ?? '',
    assignedUserIds,
    assignedDisplayNames: assignedUserIds
      .map((id) => ownersById.get(id)?.displayName)
      .filter((n): n is string => Boolean(n)),
    linkedReminderId: row.linked_reminder_id ?? null,
    linkedLeadId: row.linked_lead_id ?? null,
    knowsCandid: row.knows_candid ?? null,
    knowsWhatWeDo: row.knows_what_we_do ?? null,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function logOutreachToCustomerAccount(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  input: {
    authorId: string;
    customerExternalId: string;
    company: string;
    item: OutreachAccount;
    activityNote?: string;
  },
) {
  const statusLabel = input.item.status.replace(/_/g, ' ');
  const help = input.item.howCanWeHelp.replace(/_/g, ' ');
  const contactLine = input.item.contact
    ? `${input.item.contact.name}${input.item.contact.email ? ` <${input.item.contact.email}>` : ''}`
    : '—';
  const assignee =
    input.item.assignedDisplayNames?.join(', ') ||
    input.item.followUpOwnerDisplayName ||
    input.item.ownerDisplayName ||
    '—';
  const body = [
    `Outreach update — ${input.company}`,
    input.activityNote?.trim() || null,
    `Status: ${statusLabel}`,
    `Contact: ${contactLine}`,
    `User: ${assignee}`,
    `Last contacted: ${input.item.lastContactedAt || '—'}`,
    `Next follow-up: ${input.item.nextFollowUpAt || '—'}`,
    `How can we help: ${help}`,
    input.item.currentProvider ? `Current provider: ${input.item.currentProvider}` : null,
    input.item.painPoints ? `Pain points: ${input.item.painPoints}` : null,
    input.item.notes ? `Notes: ${input.item.notes}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const { error } = await admin.from('team_notes').insert({
    context_type: 'customer',
    context_key: input.customerExternalId,
    author_id: input.authorId,
    body,
    mention_user_ids: input.item.assignedUserIds ?? [],
  });
  if (error) {
    throw new Error(`Failed to save outreach activity to account: ${error.message}`);
  }
}
