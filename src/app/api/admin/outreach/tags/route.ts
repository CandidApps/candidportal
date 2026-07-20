import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { loadOutreachTagCatalog } from '@/lib/outreach-server';
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

/** List outreach tags with account counts. */
export async function GET() {
  if ((await getMyRole()) !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const admin = createSupabaseAdminClient();
    const tags = await loadOutreachTagCatalog(admin);
    return NextResponse.json({ tags });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load tags' },
      { status: 500 },
    );
  }
}

/** Update tag-level batch planning fields (e.g. batch follow-up date). */
export async function PATCH(request: Request) {
  if ((await getMyRole()) !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    tagId?: unknown;
    batchFollowUpAt?: unknown;
  };
  const tagId = typeof body.tagId === 'string' ? body.tagId.trim() : '';
  if (!tagId) return NextResponse.json({ error: 'tagId required' }, { status: 400 });

  const batchFollowUpAt =
    body.batchFollowUpAt === null || body.batchFollowUpAt === ''
      ? null
      : typeof body.batchFollowUpAt === 'string'
        ? body.batchFollowUpAt.trim().slice(0, 10) || null
        : undefined;
  if (batchFollowUpAt === undefined) {
    return NextResponse.json({ error: 'batchFollowUpAt required' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('admin_outreach_tags')
    .update({ batch_follow_up_at: batchFollowUpAt })
    .eq('id', tagId)
    .select('id, name, batch_follow_up_at')
    .maybeSingle();

  if (error) {
    if (/admin_outreach_tags|does not exist|schema cache/i.test(error.message)) {
      return NextResponse.json(
        { error: 'Outreach tags table is not set up yet. Run migration 0079.' },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Tag not found' }, { status: 404 });

  const catalog = await loadOutreachTagCatalog(admin);
  const tag = catalog.find((t) => t.id === data.id);
  return NextResponse.json({
    tag: tag ?? {
      id: data.id,
      name: data.name,
      batchFollowUpAt: data.batch_follow_up_at ?? null,
      accountCount: 0,
    },
  });
}
