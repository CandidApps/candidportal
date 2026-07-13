import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  normalizeCallContactKey,
  type AssistantDismissal,
  type AssistantDismissalRefType,
} from '@/lib/assistant/dismissals';

export const dynamic = 'force-dynamic';

const REF_TYPES = new Set<AssistantDismissalRefType>([
  'call',
  'call_contact',
  'action',
  'email',
  'mention',
  'priority_title',
  'missed_title',
]);

async function currentUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function mapRow(row: Record<string, unknown>): AssistantDismissal {
  return {
    id: String(row.id),
    refType: row.ref_type as AssistantDismissalRefType,
    refId: String(row.ref_id),
    title: (row.title as string | null) ?? null,
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
  const { data, error } = await admin
    .from('assistant_dismissals')
    .select('*')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    if (/assistant_dismissals/.test(error.message)) {
      return NextResponse.json({ dismissals: [], needsMigration: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ dismissals: (data ?? []).map((r) => mapRow(r as Record<string, unknown>)) });
}

type PostBody = {
  title?: string;
  refType?: string;
  refId?: string;
  /** Extra rows to upsert (e.g. call + call_contact + title keys). */
  items?: { refType: string; refId: string; title?: string }[];
  contactPhone?: string;
  contactName?: string;
};

export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const rows: { owner_id: string; ref_type: string; ref_id: string; title: string | null }[] = [];
  const push = (refType: string, refId: string, title?: string | null) => {
    if (!REF_TYPES.has(refType as AssistantDismissalRefType) || !refId.trim()) return;
    rows.push({
      owner_id: userId,
      ref_type: refType,
      ref_id: refId.trim(),
      title: title?.trim() || null,
    });
  };

  if (body.items?.length) {
    for (const item of body.items) {
      push(item.refType, item.refId, item.title ?? body.title);
    }
  } else if (body.refType && body.refId) {
    push(body.refType, body.refId, body.title);
  }

  const title = body.title?.trim();
  if (title) {
    push('priority_title', title.toLowerCase(), title);
    push('missed_title', title.toLowerCase(), title);
  }

  if (body.refType === 'call' || body.items?.some((i) => i.refType === 'call')) {
    if (body.contactPhone) {
      push('call_contact', normalizeCallContactKey(body.contactPhone), title);
    } else if (body.contactName) {
      push('call_contact', normalizeCallContactKey(body.contactName), title);
    }
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Nothing to dismiss' }, { status: 400 });
  }

  // Dedupe within request
  const seen = new Set<string>();
  const unique = rows.filter((r) => {
    const k = `${r.ref_type}:${r.ref_id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('assistant_dismissals')
    .upsert(unique, { onConflict: 'owner_id,ref_type,ref_id' })
    .select('*');

  if (error) {
    if (/assistant_dismissals/.test(error.message)) {
      return NextResponse.json(
        { error: 'Apply assistant_dismissals migration first' },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    dismissals: (data ?? []).map((r) => mapRow(r as Record<string, unknown>)),
  });
}

export async function DELETE(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const refType = url.searchParams.get('refType');
  const refId = url.searchParams.get('refId');
  if (!refType || !refId) {
    return NextResponse.json({ error: 'refType and refId required' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from('assistant_dismissals')
    .delete()
    .eq('owner_id', userId)
    .eq('ref_type', refType)
    .eq('ref_id', refId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
