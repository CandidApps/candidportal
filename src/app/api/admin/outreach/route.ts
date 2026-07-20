import { NextResponse } from 'next/server';
import { listAdminTeamMembers } from '@/lib/admin-team-members';
import { getMyRole } from '@/lib/auth/roles';
import {
  normalizeOutreachStatus,
  type OutreachAccount,
  type OutreachOwnerOption,
  type OutreachStatus,
} from '@/lib/outreach';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type DbRow = {
  id: string;
  owner_user_id: string;
  customer_external_id: string;
  status: string;
  knows_candid: boolean | null;
  knows_what_we_do: boolean | null;
  how_else_help: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

async function currentUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function rowToItem(
  row: DbRow,
  companyByExternalId: Map<string, string>,
  ownersById: Map<string, OutreachOwnerOption>,
): OutreachAccount {
  const owner = ownersById.get(row.owner_user_id);
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    ownerEmail: owner?.email,
    ownerDisplayName: owner?.displayName,
    customerExternalId: row.customer_external_id,
    company: companyByExternalId.get(row.customer_external_id) ?? row.customer_external_id,
    status: normalizeOutreachStatus(row.status),
    knowsCandid: row.knows_candid,
    knowsWhatWeDo: row.knows_what_we_do,
    howElseHelp: row.how_else_help ?? '',
    notes: row.notes ?? '',
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadCompanyMap(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  externalIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!externalIds.length) return map;
  const { data } = await admin.from('customers').select('external_id, company').in('external_id', externalIds);
  for (const row of data ?? []) {
    const ext = String(row.external_id ?? '');
    if (ext) map.set(ext, String(row.company ?? ext));
  }
  return map;
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
    // Only gracefully degrade to an empty list when the table itself is missing
    // (e.g. migration 0076 not yet applied). Any other error — including a
    // partial migration that leaves a column/function missing — must surface as
    // a 500 so the UI shows an error rather than a misleading empty state.
    const tableMissing =
      /relation .*admin_outreach_accounts.* does not exist/i.test(error.message) ||
      /Could not find the table .*admin_outreach_accounts.* in the schema cache/i.test(error.message);
    if (tableMissing) {
      return NextResponse.json({ items: [], owners, currentUserId: userId });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as DbRow[];
  const companyByExternalId = await loadCompanyMap(
    admin,
    rows.map((r) => r.customer_external_id),
  );

  return NextResponse.json({
    items: rows.map((row) => rowToItem(row, companyByExternalId, ownersById)),
    owners,
    currentUserId: userId,
  });
}

export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    customerExternalIds?: unknown;
    customerExternalId?: unknown;
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

  const payload = toInsert.map((customer_external_id) => ({
    owner_user_id: userId,
    customer_external_id,
    status: 'not_contacted' as OutreachStatus,
    sort_order: sortBase++,
  }));

  const { data, error } = await admin.from('admin_outreach_accounts').insert(payload).select('*');
  if (error) {
    if (/admin_outreach_accounts|does not exist|schema cache/i.test(error.message)) {
      return NextResponse.json(
        { error: 'Outreach table is not set up yet. Run migration 0076_admin_outreach.sql.' },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as DbRow[];
  const companyByExternalId = await loadCompanyMap(
    admin,
    rows.map((r) => r.customer_external_id),
  );
  const team = await listAdminTeamMembers(admin);
  const ownersById = new Map(
    team.map((m) => [m.id, { id: m.id, email: m.email, displayName: m.displayName }]),
  );

  return NextResponse.json({
    items: rows.map((row) => rowToItem(row, companyByExternalId, ownersById)),
  });
}

export async function PATCH(request: Request) {
  if ((await getMyRole()) !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    id?: unknown;
    status?: unknown;
    knowsCandid?: unknown;
    knowsWhatWeDo?: unknown;
    howElseHelp?: unknown;
    notes?: unknown;
    sortOrder?: unknown;
  };
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (body.status !== undefined) patch.status = normalizeOutreachStatus(body.status);
  if (body.knowsCandid !== undefined) {
    patch.knows_candid = body.knowsCandid === null ? null : Boolean(body.knowsCandid);
  }
  if (body.knowsWhatWeDo !== undefined) {
    patch.knows_what_we_do = body.knowsWhatWeDo === null ? null : Boolean(body.knowsWhatWeDo);
  }
  if (typeof body.howElseHelp === 'string') patch.how_else_help = body.howElseHelp;
  if (typeof body.notes === 'string') patch.notes = body.notes;
  if (typeof body.sortOrder === 'number' && Number.isFinite(body.sortOrder)) {
    patch.sort_order = Math.trunc(body.sortOrder);
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('admin_outreach_accounts')
    .update(patch)
    .eq('id', id)
    .eq('owner_user_id', userId)
    .select('*')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found or not owned by you' }, { status: 404 });

  const row = data as DbRow;
  const companyByExternalId = await loadCompanyMap(admin, [row.customer_external_id]);
  const team = await listAdminTeamMembers(admin);
  const ownersById = new Map(
    team.map((m) => [m.id, { id: m.id, email: m.email, displayName: m.displayName }]),
  );

  return NextResponse.json({ item: rowToItem(row, companyByExternalId, ownersById) });
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
