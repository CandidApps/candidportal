import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json()) as { channelId?: string };
  if (!body.channelId) {
    return NextResponse.json({ error: 'channelId required' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from('team_channel_members')
    .upsert(
      {
        channel_id: body.channelId,
        user_id: user.id,
        last_read_at: new Date().toISOString(),
      },
      { onConflict: 'channel_id,user_id' },
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
