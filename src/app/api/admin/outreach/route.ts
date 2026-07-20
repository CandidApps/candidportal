import { NextResponse } from 'next/server';
import { listAdminTeamMembers } from '@/lib/admin-team-members';
import { getMyRole } from '@/lib/auth/roles';
import {
  normalizeColumnPrefs,
  normalizeOutreachHelp,
  normalizeOutreachStatus,
  normalizeOutreachTagNames,
  type OutreachAssignPreset,
  type OutreachHelpOption,
  type OutreachOwnerOption,
  type OutreachStatus,
  type OutreachTag,
  type OutreachTagCatalogItem,
} from '@/lib/outreach';
import {
  assertContactBelongsToCustomer,
  filterAuthorizedAdminIds,
  loadOutreachCompanyAndContacts,
  loadOutreachTagCatalog,
  loadTagsByAccountId,
  logOutreachToCustomerAccount,
  outreachRowToItem,
  replaceAccountTags,
  resolveOutreachAssignUserIds,
  type OutreachDbRow,
} from '@/lib/outreach-server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

async function currentUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function loadColumnPrefs(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
) {
  const { data } = await admin
    .from('admin_outreach_column_prefs')
    .select('visible_columns, column_order')
    .eq('user_id', userId)
    .maybeSingle();
  return normalizeColumnPrefs({
    visibleColumns: data?.visible_columns,
    columnOrder: data?.column_order,
  });
}

export async function GET(request: Request) {
  if ((await getMyRole()) !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ownerParam = new URL(request.url).searchParams.get('owner')?.trim() || 'me';
  const admin = createSupabaseAdminClient();
  const team = await listAdminTeamMembers(admin);
  const owners: OutreachOwnerOption[] = team.map((m) => ({
    id: m.id,
    email: m.email,
    displayName: m.displayName,
  }));
  const ownersById = new Map(owners.map((o) => [o.id, o]));

  let query = admin
    .from('admin_outreach_accounts')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (ownerParam === 'me') query = query.eq('owner_user_id', userId);
  else if (ownerParam !== 'all') query = query.eq('owner_user_id', ownerParam);

  const { data, error } = await query;
  if (error) {
    if (/admin_outreach_accounts|does not exist|schema cache/i.test(error.message)) {
      return NextResponse.json({
        items: [],
        owners,
        currentUserId: userId,
        columnPrefs: normalizeColumnPrefs(null),
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as OutreachDbRow[];
  const { companyByExternalId, contactsByExternalId } = await loadOutreachCompanyAndContacts(
    admin,
    rows.map((r) => r.customer_external_id),
  );
  const columnPrefs = await loadColumnPrefs(admin, userId);
  let tagsByAccountId = new Map<string, OutreachTag[]>();
  let tagCatalog: OutreachTagCatalogItem[] = [];
  try {
    tagsByAccountId = await loadTagsByAccountId(
      admin,
      rows.map((r) => r.id),
    );
    tagCatalog = await loadOutreachTagCatalog(admin);
  } catch {
    tagsByAccountId = new Map();
    tagCatalog = [];
  }

  return NextResponse.json({
    items: rows.map((row) =>
      outreachRowToItem(row, companyByExternalId, contactsByExternalId, ownersById, tagsByAccountId),
    ),
    owners,
    currentUserId: userId,
    columnPrefs,
    tagCatalog,
  });
}

export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    customerExternalIds?: unknown;
    customerExternalId?: unknown;
    tagNames?: unknown;
  };
  const ids = new Set<string>();
  if (typeof body.customerExternalId === 'string' && body.customerExternalId.trim()) {
    ids.add(body.customerExternalId.trim());
  }
  if (Array.isArray(body.customerExternalIds)) {
    for (const id of body.customerExternalIds) {
      if (typeof id === 'string' && id.trim()) ids.add(id.trim());
    }
  }
  if (!ids.size) return NextResponse.json({ error: 'customerExternalIds required' }, { status: 400 });
  const tagNames = normalizeOutreachTagNames(body.tagNames);

  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin
    .from('admin_outreach_accounts')
    .select('customer_external_id')
    .eq('owner_user_id', userId)
    .in('customer_external_id', [...ids]);
  const already = new Set((existing ?? []).map((r) => String(r.customer_external_id)));
  const toInsert = [...ids].filter((id) => !already.has(id));
  if (!toInsert.length) return NextResponse.json({ items: [] });

  const { count } = await admin
    .from('admin_outreach_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('owner_user_id', userId);
  let sortBase = count ?? 0;

  const { contactsByExternalId } = await loadOutreachCompanyAndContacts(admin, toInsert);

  const payload = toInsert.map((customer_external_id) => {
    const primary =
      contactsByExternalId.get(customer_external_id)?.find((c) => c.isPrimary) ??
      contactsByExternalId.get(customer_external_id)?.[0];
    return {
      owner_user_id: userId,
      customer_external_id,
      status: 'not_started' as OutreachStatus,
      how_can_we_help: 'no_current_need' as OutreachHelpOption,
      contact_id: primary?.id ?? null,
      follow_up_owner_user_id: userId,
      assigned_user_ids: [userId],
      sort_order: sortBase++,
    };
  });

  const { data, error } = await admin.from('admin_outreach_accounts').insert(payload).select('*');
  if (error) {
    if (/admin_outreach_accounts|does not exist|schema cache/i.test(error.message)) {
      return NextResponse.json(
        { error: 'Outreach table is not set up yet. Run migration 0076/0078.' },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as OutreachDbRow[];
  if (tagNames.length) {
    for (const row of rows) {
      try {
        await replaceAccountTags(admin, row.id, tagNames, userId);
      } catch {
        // Account row is saved; tagging is best-effort if migration not applied.
      }
    }
  }
  const { companyByExternalId, contactsByExternalId: contactsMap } =
    await loadOutreachCompanyAndContacts(
      admin,
      rows.map((r) => r.customer_external_id),
    );
  const team = await listAdminTeamMembers(admin);
  const ownersById = new Map(
    team.map((m) => [m.id, { id: m.id, email: m.email, displayName: m.displayName }]),
  );
  let tagsByAccountId = new Map<string, OutreachTag[]>();
  try {
    tagsByAccountId = await loadTagsByAccountId(
      admin,
      rows.map((r) => r.id),
    );
  } catch {
    tagsByAccountId = new Map();
  }

  const items = rows.map((row) =>
    outreachRowToItem(row, companyByExternalId, contactsMap, ownersById, tagsByAccountId),
  );
  for (const item of items) {
    try {
      await logOutreachToCustomerAccount(admin, {
        authorId: userId,
        customerExternalId: item.customerExternalId,
        company: item.company,
        item,
        activityNote: 'Account added to Outreach list.',
      });
    } catch {
      // Row is saved; activity note is best-effort on add.
    }
  }

  return NextResponse.json({ items });
}

export async function PATCH(request: Request) {
  if ((await getMyRole()) !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (body.status !== undefined) patch.status = normalizeOutreachStatus(body.status);
  if (body.contactId !== undefined) {
    patch.contact_id = body.contactId === null || body.contactId === '' ? null : String(body.contactId);
  }
  if (body.lastContactedAt !== undefined) {
    patch.last_contacted_at =
      body.lastContactedAt === null || body.lastContactedAt === ''
        ? null
        : String(body.lastContactedAt).slice(0, 10);
  }
  if (body.nextFollowUpAt !== undefined) {
    patch.next_follow_up_at =
      body.nextFollowUpAt === null || body.nextFollowUpAt === ''
        ? null
        : String(body.nextFollowUpAt).slice(0, 10);
  }
  if (body.followUpOwnerUserId !== undefined) {
    patch.follow_up_owner_user_id =
      body.followUpOwnerUserId === null || body.followUpOwnerUserId === ''
        ? null
        : String(body.followUpOwnerUserId);
  }
  if (body.howCanWeHelp !== undefined) patch.how_can_we_help = normalizeOutreachHelp(body.howCanWeHelp);
  if (typeof body.howElseHelp === 'string') patch.how_else_help = body.howElseHelp;
  if (typeof body.currentProvider === 'string') patch.current_provider = body.currentProvider;
  if (typeof body.painPoints === 'string') patch.pain_points = body.painPoints;
  if (typeof body.notes === 'string') patch.notes = body.notes;
  if (body.knowsCandid !== undefined) {
    patch.knows_candid = body.knowsCandid === null ? null : Boolean(body.knowsCandid);
  }
  if (body.knowsWhatWeDo !== undefined) {
    patch.knows_what_we_do = body.knowsWhatWeDo === null ? null : Boolean(body.knowsWhatWeDo);
  }
  if (typeof body.sortOrder === 'number' && Number.isFinite(body.sortOrder)) {
    patch.sort_order = Math.trunc(body.sortOrder);
  }

  const admin = createSupabaseAdminClient();

  // Load owned row first so we can validate contact/assignee against the account.
  const { data: existingRow, error: existingErr } = await admin
    .from('admin_outreach_accounts')
    .select('*')
    .eq('id', id)
    .eq('owner_user_id', userId)
    .maybeSingle();
  if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 500 });
  if (!existingRow) return NextResponse.json({ error: 'Not found or not owned by you' }, { status: 404 });
  const existing = existingRow as OutreachDbRow;

  if (patch.contact_id) {
    const ok = await assertContactBelongsToCustomer(
      admin,
      existing.customer_external_id,
      String(patch.contact_id),
    );
    if (!ok) {
      return NextResponse.json({ error: 'Contact does not belong to this account' }, { status: 400 });
    }
  }

  if (patch.follow_up_owner_user_id) {
    const allowed = await filterAuthorizedAdminIds(admin, [String(patch.follow_up_owner_user_id)]);
    if (!allowed.length) {
      return NextResponse.json({ error: 'Follow-up owner must be an authorized admin' }, { status: 400 });
    }
  }

  if (typeof body.assignPreset === 'string') {
    const resolved = await resolveOutreachAssignUserIds(
      admin,
      userId,
      body.assignPreset as OutreachAssignPreset,
      typeof body.otherUserId === 'string' ? body.otherUserId : undefined,
    );
    if (resolved.error || !resolved.ids.length) {
      return NextResponse.json({ error: resolved.error ?? 'Could not resolve assignees' }, { status: 400 });
    }
    patch.assigned_user_ids = resolved.ids;
    if (!patch.follow_up_owner_user_id && resolved.ids[0]) {
      patch.follow_up_owner_user_id = resolved.ids[0];
    }
  } else if (Array.isArray(body.assignedUserIds)) {
    const requested = body.assignedUserIds.filter((v): v is string => typeof v === 'string');
    const allowed = await filterAuthorizedAdminIds(admin, requested);
    if (requested.length && !allowed.length) {
      return NextResponse.json({ error: 'Assignees must be authorized admins' }, { status: 400 });
    }
    patch.assigned_user_ids = allowed;
  }

  if (!Object.keys(patch).length && body.logActivity !== true && body.tagNames === undefined) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  let row: OutreachDbRow = existing;
  if (Object.keys(patch).length) {
    const { data, error } = await admin
      .from('admin_outreach_accounts')
      .update(patch)
      .eq('id', id)
      .eq('owner_user_id', userId)
      .select('*')
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Not found or not owned by you' }, { status: 404 });
    row = data as OutreachDbRow;
  }

  let accountTags: OutreachTag[] | undefined;
  if (body.tagNames !== undefined) {
    try {
      accountTags = await replaceAccountTags(
        admin,
        id,
        normalizeOutreachTagNames(body.tagNames),
        userId,
      );
    } catch (err) {
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? err.message
              : 'Failed to update tags. Run migration 0079_admin_outreach_tags.sql.',
        },
        { status: 500 },
      );
    }
  }

  const { companyByExternalId, contactsByExternalId } = await loadOutreachCompanyAndContacts(admin, [
    row.customer_external_id,
  ]);
  const team = await listAdminTeamMembers(admin);
  const ownersById = new Map(
    team.map((m) => [m.id, { id: m.id, email: m.email, displayName: m.displayName }]),
  );
  let tagsByAccountId = new Map<string, OutreachTag[]>();
  if (accountTags) {
    tagsByAccountId.set(row.id, accountTags);
  } else {
    try {
      tagsByAccountId = await loadTagsByAccountId(admin, [row.id]);
    } catch {
      tagsByAccountId = new Map();
    }
  }
  const item = outreachRowToItem(
    row,
    companyByExternalId,
    contactsByExternalId,
    ownersById,
    tagsByAccountId,
  );

  // Only write account activity when the client explicitly asks (avoids note spam on no-op blurs).
  if (body.logActivity === true) {
    try {
      await logOutreachToCustomerAccount(admin, {
        authorId: userId,
        customerExternalId: item.customerExternalId,
        company: item.company,
        item,
        activityNote: typeof body.activityNote === 'string' ? body.activityNote : undefined,
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Failed to log account activity' },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ item });
}

export async function DELETE(request: Request) {
  if ((await getMyRole()) !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = new URL(request.url).searchParams.get('id')?.trim();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from('admin_outreach_accounts')
    .delete()
    .eq('id', id)
    .eq('owner_user_id', userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
