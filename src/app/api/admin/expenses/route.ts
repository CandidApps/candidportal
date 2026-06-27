import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const BUCKET = 'service-bills';

export type AdminExpense = {
  id: string;
  merchant: string | null;
  customer_id: string | null;
  customer_name: string | null;
  category: string | null;
  amount: number;
  spent_on: string | null;
  note: string | null;
  receipt_storage_path: string | null;
  pull_from_commission: boolean;
  zoho_expense_id: string | null;
  status: string;
  created_at: string;
};

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
    .from('admin_expenses')
    .select('*')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) {
    if (/admin_expenses/.test(error.message)) return NextResponse.json({ expenses: [] });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ expenses: data ?? [] });
}

export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  let receiptPath: string | null = null;
  const receipt = form.get('receipt');
  if (receipt instanceof File && receipt.size > 0) {
    const safe = receipt.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `expenses/${userId}/${Date.now()}-${safe}`;
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, Buffer.from(await receipt.arrayBuffer()), {
        contentType: receipt.type || 'application/octet-stream',
      });
    if (!upErr) receiptPath = path;
  }

  const amountRaw = Number(form.get('amount'));
  const row = {
    owner_id: userId,
    merchant: String(form.get('merchant') ?? '') || null,
    customer_id: String(form.get('customerId') ?? '') || null,
    customer_name: String(form.get('customerName') ?? '') || null,
    category: String(form.get('category') ?? '') || null,
    amount: Number.isFinite(amountRaw) ? amountRaw : 0,
    spent_on: String(form.get('spentOn') ?? '') || null,
    note: String(form.get('note') ?? '') || null,
    receipt_storage_path: receiptPath,
    pull_from_commission: String(form.get('pullFromCommission') ?? 'false') === 'true',
  };

  const { data, error } = await admin.from('admin_expenses').insert(row).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ expense: data });
}

export async function DELETE(request: Request) {
  if ((await getMyRole()) !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from('admin_expenses').delete().eq('id', id).eq('owner_id', userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
