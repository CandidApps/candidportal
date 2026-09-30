import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const NAME_MAX = 200;

type Row = { supplier_name: string; category: string | null; provider_id: number | null; created_at: string };

function toItem(r: Row) {
  return {
    name: r.supplier_name,
    category: r.category ?? undefined,
    providerId: r.provider_id ?? undefined,
    addedAt: r.created_at,
  };
}

async function currentUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ items: [] }, { status: 401 });
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('member_interested_suppliers')
    .select('supplier_name, category, provider_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ items: [], error: error.message }, { status: 500 });
  return NextResponse.json({ items: ((data ?? []) as Row[]).map(toItem) });
}

/** Body: { action: 'add' | 'remove', name, category?, providerId? } */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    action?: string;
    name?: unknown;
    category?: unknown;
    providerId?: unknown;
  } | null;
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, NAME_MAX) : '';
  if (!name || (body?.action !== 'add' && body?.action !== 'remove')) {
    return NextResponse.json({ error: 'action and name are required' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  if (body.action === 'remove') {
    const { error } = await admin
      .from('member_interested_suppliers')
      .delete()
      .eq('user_id', userId)
      .eq('supplier_name', name);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const providerId = Number(body.providerId);
  const { error } = await admin.from('member_interested_suppliers').upsert(
    {
      user_id: userId,
      supplier_name: name,
      category: typeof body.category === 'string' ? body.category.slice(0, 60) : null,
      provider_id: Number.isInteger(providerId) && providerId > 0 ? providerId : null,
    },
    { onConflict: 'user_id,supplier_name', ignoreDuplicates: true },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
