import 'server-only';

import { listAdminTeamMembers } from '@/lib/admin-team-members';
import {
  normalizeOutreachHelp,
  normalizeOutreachStatus,
  normalizeOutreachTagName,
  normalizeOutreachTagNames,
  type OutreachAccount,
  type OutreachAssignPreset,
  type OutreachContact,
  type OutreachOwnerOption,
  type OutreachTag,
  type OutreachTagCatalogItem,
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
  tagsByAccountId?: Map<string, OutreachTag[]>,
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
    tags: tagsByAccountId?.get(row.id) ?? [],
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

type TagDbRow = {
  id: string;
  name: string;
  batch_follow_up_at?: string | null;
};

type AccountTagJoinRow = {
  outreach_account_id: string;
  tag_id: string;
  admin_outreach_tags?: TagDbRow | TagDbRow[] | null;
};

function mapTagRow(row: TagDbRow): OutreachTag {
  return {
    id: row.id,
    name: row.name,
    batchFollowUpAt: row.batch_follow_up_at ?? null,
  };
}

/** Load tags for many outreach accounts. Returns empty map if tables are missing. */
export async function loadTagsByAccountId(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  accountIds: string[],
): Promise<Map<string, OutreachTag[]>> {
  const out = new Map<string, OutreachTag[]>();
  if (!accountIds.length) return out;
  const { data, error } = await admin
    .from('admin_outreach_account_tags')
    .select('outreach_account_id, tag_id, admin_outreach_tags(id, name, batch_follow_up_at)')
    .in('outreach_account_id', accountIds);
  if (error) {
    if (/admin_outreach_account_tags|admin_outreach_tags|does not exist|schema cache/i.test(error.message)) {
      return out;
    }
    throw new Error(error.message);
  }
  for (const raw of (data ?? []) as AccountTagJoinRow[]) {
    const tagRaw = raw.admin_outreach_tags;
    const tag = Array.isArray(tagRaw) ? tagRaw[0] : tagRaw;
    if (!tag?.id) continue;
    const list = out.get(raw.outreach_account_id) ?? [];
    list.push(mapTagRow(tag));
    out.set(raw.outreach_account_id, list);
  }
  for (const [id, list] of out) {
    list.sort((a, b) => a.name.localeCompare(b.name));
    out.set(id, list);
  }
  return out;
}

/** Catalog of all tags with how many outreach accounts use each. */
export async function loadOutreachTagCatalog(
  admin: ReturnType<typeof createSupabaseAdminClient>,
): Promise<OutreachTagCatalogItem[]> {
  const { data: tags, error } = await admin
    .from('admin_outreach_tags')
    .select('id, name, batch_follow_up_at')
    .order('name', { ascending: true });
  if (error) {
    if (/admin_outreach_tags|does not exist|schema cache/i.test(error.message)) return [];
    throw new Error(error.message);
  }
  const { data: joins, error: joinError } = await admin
    .from('admin_outreach_account_tags')
    .select('tag_id');
  if (joinError) {
    if (/admin_outreach_account_tags|does not exist|schema cache/i.test(joinError.message)) {
      return ((tags ?? []) as TagDbRow[]).map((t) => ({ ...mapTagRow(t), accountCount: 0 }));
    }
    throw new Error(joinError.message);
  }
  const counts = new Map<string, number>();
  for (const row of joins ?? []) {
    const id = String(row.tag_id ?? '');
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return ((tags ?? []) as TagDbRow[]).map((t) => ({
    ...mapTagRow(t),
    accountCount: counts.get(t.id) ?? 0,
  }));
}

/** Ensure tags exist (create missing), return ordered tag records. */
export async function ensureOutreachTags(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  names: string[],
  createdBy: string,
): Promise<OutreachTag[]> {
  const normalized = normalizeOutreachTagNames(names);
  if (!normalized.length) return [];

  const keys = normalized.map((n) => n.toLowerCase());
  const { data: existing, error: existingError } = await admin
    .from('admin_outreach_tags')
    .select('id, name, batch_follow_up_at, name_normalized')
    .in('name_normalized', keys);
  if (existingError) throw new Error(existingError.message);

  const byKey = new Map(
    ((existing ?? []) as Array<TagDbRow & { name_normalized: string }>).map((t) => [
      t.name_normalized,
      mapTagRow(t),
    ]),
  );

  const missing = normalized.filter((n) => !byKey.has(n.toLowerCase()));
  if (missing.length) {
    const { data: inserted, error: insertError } = await admin
      .from('admin_outreach_tags')
      .insert(
        missing.map((name) => ({
          name,
          name_normalized: name.toLowerCase(),
          created_by: createdBy,
        })),
      )
      .select('id, name, batch_follow_up_at, name_normalized');
    if (insertError) throw new Error(insertError.message);
    for (const row of (inserted ?? []) as Array<TagDbRow & { name_normalized: string }>) {
      byKey.set(row.name_normalized, mapTagRow(row));
    }
  }

  return normalized
    .map((name) => byKey.get(name.toLowerCase()))
    .filter((t): t is OutreachTag => Boolean(t));
}

/** Replace all tags on an outreach account. */
export async function replaceAccountTags(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  accountId: string,
  tagNames: string[],
  userId: string,
): Promise<OutreachTag[]> {
  const tags = await ensureOutreachTags(admin, tagNames, userId);
  const { error: delError } = await admin
    .from('admin_outreach_account_tags')
    .delete()
    .eq('outreach_account_id', accountId);
  if (delError) throw new Error(delError.message);
  if (tags.length) {
    const { error: insError } = await admin.from('admin_outreach_account_tags').insert(
      tags.map((t) => ({
        outreach_account_id: accountId,
        tag_id: t.id,
      })),
    );
    if (insError) throw new Error(insError.message);
  }
  return tags;
}

export { normalizeOutreachTagName };

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
