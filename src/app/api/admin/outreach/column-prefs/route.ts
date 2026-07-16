import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { normalizeColumnPrefs, type OutreachColumnPrefs } from '@/lib/outreach';
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

export async function GET() {
  if ((await getMyRole()) !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('admin_outreach_column_prefs')
    .select('visible_columns, column_order')
    .eq('user_id', userId)
    .maybeSingle();

  if (error && !/admin_outreach_column_prefs|does not exist|schema cache/i.test(error.message)) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    prefs: normalizeColumnPrefs({
      visibleColumns: data?.visible_columns,
      columnOrder: data?.column_order,
    }),
  });
}

export async function PUT(request: Request) {
  if ((await getMyRole()) !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Partial<OutreachColumnPrefs>;
  const prefs = normalizeColumnPrefs(body);
  const admin = createSupabaseAdminClient();

  const { error } = await admin.from('admin_outreach_column_prefs').upsert({
    user_id: userId,
    visible_columns: prefs.visibleColumns,
    column_order: prefs.columnOrder,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    if (/admin_outreach_column_prefs|does not exist|schema cache/i.test(error.message)) {
      return NextResponse.json(
        { error: 'Column preferences table not set up. Run migration 0078_admin_outreach_fields.sql.' },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ prefs });
}
