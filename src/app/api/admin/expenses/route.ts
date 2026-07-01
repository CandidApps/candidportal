import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getActiveConnectionForUserOrShared } from '@/lib/email/zoho-connections';
import { scopeHasExpense } from '@/lib/email/zoho';
import { createZohoExpense, isZohoExpenseConfigured, listZohoExpenses } from '@/lib/expense/zoho-expense';
import { adminExpensesSchemaError } from '@/lib/supabase/schema-errors';
import { currentPeriod } from '@/lib/commissions/commission-store';
import {
  expenseFingerprint,
  expenseBelongsInPeriodView,
  isPendingManualQueueExpense,
} from '@/lib/commissions/expense-review';

export const dynamic = 'force-dynamic';

function schemaErrorResponse(message: string): NextResponse | null {
  const hint = adminExpensesSchemaError(message);
  if (hint) return NextResponse.json({ error: hint }, { status: 503 });
  return null;
}

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
  const { data: existingRows, error: loadErr } = await admin
    .from('admin_expenses')
    .select('zoho_expense_id')
    .eq('owner_id', userId)
    .not('zoho_expense_id', 'is', null);
  const schemaErr = loadErr ? schemaErrorResponse(loadErr.message) : null;
  if (schemaErr) return schemaErr;
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
    const schemaErr = error ? schemaErrorResponse(error.message) : null;
    if (schemaErr) return schemaErr;
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
  queued_for_commission: boolean;
  zoho_expense_id: string | null;
  status: string;
  commission_period: string | null;
  commission_review_status: string;
  commission_allocation_type: string | null;
  commission_agent_id: string | null;
  commission_deduction_note: string | null;
  commission_rejection_note: string | null;
  bank_deposit_import_id: number | null;
  created_at: string;
};

type ReviewPatchBody = {
  op?: string;
  id?: string;
  fromDate?: string;
  decision?: 'include' | 'reject';
  allocationType?: 'customer' | 'agent_fee' | null;
  customerId?: string | null;
  customerName?: string | null;
  customerAgent?: string | null;
  commissionAgentId?: string | null;
  deductionNote?: string | null;
  rejectionNote?: string | null;
  commissionPeriod?: string | null;
};

async function fetchPeriodExpenses(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  period: string,
  latestPeriod: string,
): Promise<AdminExpense[]> {
  const { data: periodRows, error: periodErr } = await admin
    .from('admin_expenses')
    .select('*')
    .eq('commission_period', period)
    .order('spent_on', { ascending: false })
    .limit(200);
  if (periodErr) throw periodErr;

  let expenses = (periodRows ?? []).filter((row) =>
    expenseBelongsInPeriodView(row as AdminExpense, period, latestPeriod),
  );

  if (period === latestPeriod) {
    const { data: pendingQueue, error: queueErr } = await admin
      .from('admin_expenses')
      .select('*')
      .eq('queued_for_commission', true)
      .is('bank_deposit_import_id', null)
      .eq('commission_review_status', 'pending')
      .order('created_at', { ascending: false })
      .limit(200);
    if (queueErr) throw queueErr;

    const seen = new Set(expenses.map((e) => e.id));
    for (const row of pendingQueue ?? []) {
      if (!seen.has(row.id)) {
        expenses.push(row as AdminExpense);
        seen.add(row.id);
      }
    }
  }

  return expenses.sort((a, b) => {
    const da = a.spent_on ?? a.created_at ?? '';
    const db = b.spent_on ?? b.created_at ?? '';
    return db.localeCompare(da);
  });
}

async function applyExpenseTemplates(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  period: string,
  expenses: AdminExpense[],
): Promise<AdminExpense[]> {
  const pending = expenses.filter(
    (e) =>
      e.commission_review_status === 'pending'
      && !e.commission_allocation_type
      && !e.customer_id
      && !e.commission_agent_id,
  );
  if (!pending.length) return expenses;

  const { data: templates, error } = await admin
    .from('admin_expenses')
    .select('*')
    .eq('commission_review_status', 'included')
    .not('commission_period', 'is', null)
    .lt('commission_period', period)
    .order('commission_period', { ascending: false })
    .limit(500);
  if (error || !templates?.length) return expenses;

  const byFingerprint = new Map<string, AdminExpense>();
  for (const row of templates as AdminExpense[]) {
    const fp = expenseFingerprint(row.merchant, row.category);
    if (!byFingerprint.has(fp)) byFingerprint.set(fp, row);
  }

  const updated = new Map(expenses.map((e) => [e.id, { ...e }]));
  for (const exp of pending) {
    const tmpl = byFingerprint.get(expenseFingerprint(exp.merchant, exp.category));
    if (!tmpl) continue;
    const patch = {
      commission_allocation_type: tmpl.commission_allocation_type,
      customer_id: tmpl.customer_id,
      customer_name: tmpl.customer_name,
      customer_agent: tmpl.customer_agent,
      commission_agent_id: tmpl.commission_agent_id,
      commission_deduction_note: tmpl.commission_deduction_note,
    };
    const { error: upErr } = await admin.from('admin_expenses').update(patch).eq('id', exp.id);
    if (upErr) continue;
    updated.set(exp.id, { ...exp, ...patch });
  }
  return [...updated.values()];
}

async function currentUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET(request: Request) {
  if ((await getMyRole()) !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period');
  const latestPeriod = searchParams.get('latestPeriod')?.trim() || period || currentPeriod();

  const admin = createSupabaseAdminClient();
  // Period view (commission workflow step 3): bank-deposit lines use commission_period;
  // manual queued expenses stay unassigned until reviewed and only appear on latestPeriod.
  if (period) {
    try {
      let expenses = await fetchPeriodExpenses(admin, period, latestPeriod);
      if (expenses.length) {
        expenses = await applyExpenseTemplates(admin, period, expenses);
      }
      return NextResponse.json({ expenses });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load expenses';
      const schemaErr = schemaErrorResponse(message);
      if (schemaErr) return schemaErr;
      if (/admin_expenses/.test(message)) return NextResponse.json({ expenses: [] });
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  let query = admin.from('admin_expenses').select('*');
  query = query.eq('owner_id', userId).order('created_at', { ascending: false });
  const { data, error } = await query.limit(200);
  if (error) {
    const schemaErr = schemaErrorResponse(error.message);
    if (schemaErr) return schemaErr;
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
  const queueForCommission = String(form.get('queueForCommission') ?? 'false') === 'true';

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
    pull_from_commission: false,
    queued_for_commission: queueForCommission,
    commission_period: null,
  };

  const { data, error } = await admin.from('admin_expenses').insert(row).select('*').single();
  if (error) {
    const schemaErr = schemaErrorResponse(error.message);
    if (schemaErr) return schemaErr;
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

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

  const body = (await request.json().catch(() => ({}))) as ReviewPatchBody;

  if (body.op === 'import') {
    return importFromZoho(userId, body.fromDate);
  }

  if (body.op === 'review' && body.id) {
    const admin = createSupabaseAdminClient();
    const { data: row, error: loadErr } = await admin
      .from('admin_expenses')
      .select('*')
      .eq('id', body.id)
      .maybeSingle();
    const schemaErr = loadErr ? schemaErrorResponse(loadErr.message) : null;
    if (schemaErr) return schemaErr;
    const isPendingManual = isPendingManualQueueExpense(row as AdminExpense);
    if (!row || (!row.commission_period && !isPendingManual)) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
    }

    const reviewPeriod = String(body.commissionPeriod ?? row.commission_period ?? '').trim();
    if ((body.decision === 'include' || body.decision === 'reject') && !reviewPeriod) {
      return NextResponse.json({ error: 'Commission period is required for review.' }, { status: 400 });
    }

    const update: Record<string, unknown> = {};
    if (body.allocationType !== undefined) update.commission_allocation_type = body.allocationType;
    if (body.customerId !== undefined) update.customer_id = body.customerId || null;
    if (body.customerName !== undefined) update.customer_name = body.customerName || null;
    if (body.customerAgent !== undefined) update.customer_agent = body.customerAgent || null;
    if (body.commissionAgentId !== undefined) update.commission_agent_id = body.commissionAgentId || null;
    if (body.deductionNote !== undefined) update.commission_deduction_note = body.deductionNote || null;

    const allocationType =
      (body.allocationType ?? row.commission_allocation_type) as 'customer' | 'agent_fee' | null;
    const customerId = body.customerId !== undefined ? body.customerId : row.customer_id;
    const commissionAgentId =
      body.commissionAgentId !== undefined ? body.commissionAgentId : row.commission_agent_id;
    const deductionNote =
      body.deductionNote !== undefined ? body.deductionNote : row.commission_deduction_note;

    if (body.decision === 'include') {
      if (allocationType === 'customer') {
        if (!customerId || !commissionAgentId) {
          return NextResponse.json(
            { error: 'Select a customer (with agent) before including.' },
            { status: 400 },
          );
        }
      } else if (allocationType === 'agent_fee') {
        if (!commissionAgentId || !String(deductionNote ?? '').trim()) {
          return NextResponse.json(
            { error: 'Agent fee requires an agent and a description note.' },
            { status: 400 },
          );
        }
      } else {
        return NextResponse.json(
          { error: 'Choose customer or agent fee allocation before including.' },
          { status: 400 },
        );
      }
      update.commission_review_status = 'included';
      update.commission_rejection_note = null;
      update.commission_period = reviewPeriod;
    } else if (body.decision === 'reject') {
      const rejectionNote = String(body.rejectionNote ?? '').trim();
      if (!rejectionNote) {
        return NextResponse.json({ error: 'A rejection note is required.' }, { status: 400 });
      }
      update.commission_review_status = 'rejected';
      update.commission_rejection_note = rejectionNote;
      update.commission_period = reviewPeriod;
    }

    const { data: updated, error: upErr } = await admin
      .from('admin_expenses')
      .update(update)
      .eq('id', body.id)
      .select('*')
      .single();
    const upSchemaErr = upErr ? schemaErrorResponse(upErr.message) : null;
    if (upSchemaErr) return upSchemaErr;
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    return NextResponse.json({ expense: updated });
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
  if (loadErr || !row) {
    const schemaErr = loadErr ? schemaErrorResponse(loadErr.message) : null;
    if (schemaErr) return schemaErr;
    return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
  }
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
  if (error) {
    const schemaErr = schemaErrorResponse(error.message);
    if (schemaErr) return schemaErr;
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
