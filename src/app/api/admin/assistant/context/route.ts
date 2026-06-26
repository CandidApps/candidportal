import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { AssistantContextItem } from '@/lib/assistant/types';

export const dynamic = 'force-dynamic';

async function currentUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function mapRow(row: Record<string, unknown>): AssistantContextItem {
  return {
    id: String(row.id),
    subject: String(row.subject),
    info: String(row.info),
    source: String(row.source ?? 'manual'),
    scope: row.scope === 'team' ? 'team' : 'personal',
    createdAt: String(row.created_at),
  };
}

export async function GET() {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createSupabaseAdminClient();
  // Return facts the user trained privately ('personal' + owned) plus every
  // team-wide fact, so Hank shares team knowledge across the whole crew.
  const { data, error } = await admin
    .from('assistant_context')
    .select('*')
    .or(`owner_id.eq.${userId},scope.eq.team`)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: (data ?? []).map((r) => mapRow(r as Record<string, unknown>)) });
}

export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json()) as { subject?: string; info?: string; scope?: string };
  const subject = body.subject?.trim();
  const info = body.info?.trim();
  const scope = body.scope === 'team' ? 'team' : 'personal';
  if (!subject || !info) {
    return NextResponse.json({ error: 'Subject and info required' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('assistant_context')
    .insert({ owner_id: userId, subject, info, source: 'manual', scope })
    .select('*')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 });
  }
  return NextResponse.json({ item: mapRow(data as Record<string, unknown>) });
}
