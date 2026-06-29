import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getActiveConnectionForUserOrShared } from '@/lib/email/zoho-connections';
import { scopeHasExpense } from '@/lib/email/zoho';
import { createZohoExpense, isZohoExpenseConfigured, listZohoExpenses } from '@/lib/expense/zoho-expense';

export const dynamic = 'force-dynamic';

const BUCKET = 'service-bills';

/** Best-effort push of a logged expense to Zoho Expense. Returns the Zoho
 *  expense id, or null when not configured / not connected / on any failure. */
async function syncExpenseToZoho(
  userId: string,
  row: { merchant: string | null; customer_name: string | null; category: string | null; amount: number; spent_on: string | null; note: string | null },
): Promise<string | null> {
  if (!isZohoExpenseConfigured()) return null;
  try {
    const conn = await getActiveConnectionForUserOrShared(userId);
    if (!conn || !scopeHasExpense(conn.scope)) return null;
    return await createZohoExpense({
      accessToken: conn.accessToken,
      amount: row.amount,
      date: row.spent_on,
      category: row.category,
      merchant: row.merchant,
      description: row.note,
      customerName: row.customer_name,
    });
  } catch {
    return null;
  }
}

/** Pulls expenses created directly in Zoho Expense back into the portal,
 *  deduping on zoho_expense_id so re-running is safe. */
async function importFromZoho(userId: string, fromDate?: string): Promise<NextResponse> {
  if (!isZohoExpenseConfigured()) {
    return NextResponse.json({ error: 'Zoho Expense is not configured.' }, { status: 409 });
  }
  const conn = await getActiveConnectionForUserOrShared(userId);
  if (!conn || !scopeHasExpense(conn.scope)) {
    return NextResponse.json(
      { error: 'Zoho Expense access not granted. Reconnect Zoho to enable expense sync.' },
      { status: 409 },
    );
  }

  let remote;
  try {
    remote = await listZohoExpenses({ accessToken: conn.accessToken, fromDate: fromDate || null });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Zoho import failed' },
      { status: 502 },
    );
  }

  const admin = createSupabaseAdminClient();
  const { data: existingRows } = await admin
    .from('admin_expenses')
    .select('zoho_expense_id')
    .eq('owner_id', userId)
    .not('zoho_expense_id', 'is', null);
  const existingIds = new Set((existingRows ?? []).map((r) => String(r.zoho_expense_id)));

  const toInsert = remote
    .filter((e) => !existingIds.has(e.expenseId))
    .map((e) => ({
      owner_id: userId,
      merchant: e.merchant,
      customer_id: null,
      customer_name: null,
      customer_agent: null,
      category: e.category,
      amount: e.amount,
      spent_on: e.date,
      note: e.description,
      receipt_storage_path: null,
      pull_from_commission: false,
      zoho_expense_id: e.expenseId,
      status: 'synced',
    }));

  if (toInsert.length > 0) {
    const { error } = await admin.from('admin_expenses').insert(toInsert);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ imported: toInsert.length, scanned: remote.length });
}

export type AdminExpense = {
  id: string;
  merchant: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_agent: string | null;
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
    customer_agent: String(form.get('customerAgent') ?? '') || null,
    category: String(form.get('category') ?? '') || null,
    amount: Number.isFinite(amountRaw) ? amountRaw : 0,
    spent_on: String(form.get('spentOn') ?? '') || null,
    note: String(form.get('note') ?? '') || null,
    receipt_storage_path: receiptPath,
    pull_from_commission: String(form.get('pullFromCommission') ?? 'false') === 'true',
  };

  const { data, error } = await admin.from('admin_expenses').insert(row).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Auto-sync to Zoho Expense (best-effort); persist the returned id when it works.
  const zohoExpenseId = await syncExpenseToZoho(userId, row);
  if (zohoExpenseId) {
    await admin
      .from('admin_expenses')
      .update({ zoho_expense_id: zohoExpenseId, status: 'synced' })
      .eq('id', data.id);
    return NextResponse.json({ expense: { ...data, zoho_expense_id: zohoExpenseId, status: 'synced' } });
  }
  return NextResponse.json({ expense: data });
}

export async function PATCH(request: Request) {
  if ((await getMyRole()) !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { id?: string; op?: string; fromDate?: string };

  if (body.op === 'import') {
    return importFromZoho(userId, body.fromDate);
  }

  if (body.op !== 'sync' || !body.id) {
    return NextResponse.json({ error: 'Unsupported operation' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: row, error: loadErr } = await admin
    .from('admin_expenses')
    .select('*')
    .eq('id', body.id)
    .eq('owner_id', userId)
    .maybeSingle();
  if (loadErr || !row) return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
  if (row.zoho_expense_id) return NextResponse.json({ expense: row });

  if (!isZohoExpenseConfigured()) {
    return NextResponse.json({ error: 'Zoho Expense is not configured.' }, { status: 409 });
  }
  const conn = await getActiveConnectionForUserOrShared(userId);
  if (!conn || !scopeHasExpense(conn.scope)) {
    return NextResponse.json(
      { error: 'Zoho Expense access not granted. Reconnect Zoho to enable expense sync.' },
      { status: 409 },
    );
  }

  try {
    const zohoExpenseId = await createZohoExpense({
      accessToken: conn.accessToken,
      amount: Number(row.amount) || 0,
      date: row.spent_on,
      category: row.category,
      merchant: row.merchant,
      description: row.note,
      customerName: row.customer_name,
    });
    const { data: updated } = await admin
      .from('admin_expenses')
      .update({ zoho_expense_id: zohoExpenseId, status: 'synced' })
      .eq('id', row.id)
      .select('*')
      .single();
    return NextResponse.json({ expense: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Zoho sync failed' },
      { status: 502 },
    );
  }
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
