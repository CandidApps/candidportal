import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import {
  defaultAdminSidebarPreferences,
  normalizeAdminSidebarPreferences,
} from '@/lib/admin-sidebar-order';
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

  const defaults = defaultAdminSidebarPreferences();
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('admin_sidebar_preferences')
    .select('order, hidden')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    if (/admin_sidebar_preferences|does not exist|schema cache/i.test(error.message)) {
      return NextResponse.json(defaults);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) return NextResponse.json(defaults);
  return NextResponse.json(normalizeAdminSidebarPreferences(data.order, data.hidden));
}

export async function PUT(request: Request) {
  if ((await getMyRole()) !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { order?: unknown; hidden?: unknown };
  const prefs = normalizeAdminSidebarPreferences(body.order, body.hidden);

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from('admin_sidebar_preferences').upsert(
    {
      user_id: userId,
      order: prefs.order,
      hidden: prefs.hidden,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) {
    if (/admin_sidebar_preferences|does not exist|schema cache/i.test(error.message)) {
      return NextResponse.json(
        { error: 'Sidebar preferences table is not set up yet. Run migration 0077_admin_sidebar_preferences.sql.' },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(prefs);
}

export async function PATCH(request: Request) {
  return PUT(request);
}
