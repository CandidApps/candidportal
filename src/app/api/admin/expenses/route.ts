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
  parseExpensePartnerSplits,
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

export type ExpenseCustomerRef = {
  id: string;
  name: string;
  agent?: string;
};

export type AdminExpense = {
  id: string;
  owner_id?: string | null;
  owner_display_name?: string | null;
  owner_email?: string | null;
  merchant: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_agent: string | null;
  commission_customer_ids?: ExpenseCustomerRef[];
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
  commission_target_period?: string | null;
  commission_review_status: string;
  commission_allocation_type: string | null;
  commission_agent_id: string | null;
  commission_charge_mode?: string | null;
  commission_charge_tier_rate?: number | null;
  commission_charge_amount?: number | null;
  commission_deduction_note: string | null;
  commission_rejection_note: string | null;
  resubmitted_from_id?: string | null;
  commission_internal_splits?: ExpensePartnerRef[];
  commission_reimburse_profile_id?: string | null;
  reimburse_display_name?: string | null;
  reimburse_email?: string | null;
  bank_deposit_import_id: number | null;
  created_at: string;
};

type ReviewPatchBody = {
  op?: string;
  id?: string;
  fromDate?: string;
  decision?: 'include' | 'reject' | 'defer' | 'resubmit';
  allocationType?: 'customer' | 'agent_fee' | 'internal_reimburse' | 'internal_partner' | 'charge_and_reimburse' | null;
  customerId?: string | null;
  customerName?: string | null;
  customerAgent?: string | null;
  customers?: ExpenseCustomerRef[] | null;
  commissionAgentId?: string | null;
  chargeMode?: 'full' | 'tier_percent' | null;
  chargeTierRate?: number | null;
  chargeAmount?: number | null;
  deductionNote?: string | null;
  rejectionNote?: string | null;
  commissionPeriod?: string | null;
  targetPeriod?: string | null;
  internalSplits?: ExpensePartnerRef[] | null;
  reimburseProfileId?: string | null;
};

type ExpensePartnerRef = {
  profileId: string;
  name?: string;
  percent: number;
};

function parseCustomerIds(raw: unknown): ExpenseCustomerRef[] {
  if (!Array.isArray(raw)) return [];
  const out: ExpenseCustomerRef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    if (!id) continue;
    out.push({
      id,
      name: typeof row.name === 'string' ? row.name : '',
      agent: typeof row.agent === 'string' ? row.agent : undefined,
    });
  }
  return out;
}

async function attachOwnerNames(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  expenses: AdminExpense[],
): Promise<AdminExpense[]> {
  const profileIds = [
    ...new Set(
      expenses.flatMap((e) => [e.owner_id, e.commission_reimburse_profile_id].filter(Boolean)),
    ),
  ] as string[];
  if (!profileIds.length) return expenses;

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, display_name, email')
    .in('id', profileIds);

  const byId = new Map(
    (profiles ?? []).map((p) => [
      String(p.id),
      {
        name: (p.display_name as string | null)?.trim() || null,
        email: (p.email as string | null)?.trim() || null,
      },
    ]),
  );

  return expenses.map((e) => {
    const owner = e.owner_id ? byId.get(e.owner_id) : undefined;
    const reimbursee = e.commission_reimburse_profile_id
      ? byId.get(e.commission_reimburse_profile_id)
      : undefined;
    return {
      ...e,
      commission_customer_ids: parseCustomerIds(e.commission_customer_ids),
      commission_internal_splits: parseExpensePartnerSplits(e.commission_internal_splits),
      owner_display_name: owner?.name ?? null,
      owner_email: owner?.email ?? null,
      reimburse_display_name: reimbursee?.name ?? null,
      reimburse_email: reimbursee?.email ?? null,
    };
  });
}

async function fetchPeriodExpenses(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  period: string,
  latestPeriod: string,
): Promise<AdminExpense[]> {
  const { data: periodRows, error: periodErr } = await admin
    .from('admin_expenses')
    .select('*')
    .or(`commission_period.eq.${period},commission_target_period.eq.${period}`)
    .order('spent_on', { ascending: false })
    .limit(300);
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
      .in('commission_review_status', ['pending', 'deferred'])
      .order('created_at', { ascending: false })
      .limit(200);
    if (queueErr) throw queueErr;

    const seen = new Set(expenses.map((e) => e.id));
    for (const row of pendingQueue ?? []) {
      if (!seen.has(row.id) && expenseBelongsInPeriodView(row as AdminExpense, period, latestPeriod)) {
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
      (e.commission_review_status === 'pending' || e.commission_review_status === 'deferred')
      && !e.commission_allocation_type
      && !e.customer_id
      && !e.commission_agent_id
      && parseCustomerIds(e.commission_customer_ids).length === 0,
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

  // Prefill in memory only — persist when the reviewer clicks Include.
  return expenses.map((exp) => {
    if (!pending.some((p) => p.id === exp.id)) return exp;
    const tmpl = byFingerprint.get(expenseFingerprint(exp.merchant, exp.category));
    if (!tmpl) return exp;
    return {
      ...exp,
      commission_allocation_type: tmpl.commission_allocation_type,
      customer_id: tmpl.customer_id,
      customer_name: tmpl.customer_name,
      customer_agent: tmpl.customer_agent,
      commission_agent_id: tmpl.commission_agent_id,
      commission_deduction_note: tmpl.commission_deduction_note,
      commission_customer_ids:
        parseCustomerIds(tmpl.commission_customer_ids).length > 0
          ? parseCustomerIds(tmpl.commission_customer_ids)
          : tmpl.customer_id
            ? [
                {
                  id: tmpl.customer_id,
                  name: tmpl.customer_name ?? '',
                  agent: tmpl.customer_agent ?? undefined,
                },
              ]
            : [],
      commission_charge_mode: tmpl.commission_charge_mode,
      commission_charge_tier_rate: tmpl.commission_charge_tier_rate,
      commission_charge_amount: tmpl.commission_charge_amount,
    };
  });
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
      // Templates: only apply in memory when missing allocation — do not PATCH DB on every GET.
      if (expenses.length) {
        expenses = await applyExpenseTemplates(admin, period, expenses);
      }
      expenses = await attachOwnerNames(admin, expenses);
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
  const withOwners = await attachOwnerNames(admin, (data ?? []) as AdminExpense[]);
  return NextResponse.json({ expenses: withOwners });
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
    if (!row || (!row.commission_period && !isPendingManual && row.commission_review_status !== 'rejected')) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
    }

    if (body.decision === 'resubmit') {
      if (row.owner_id !== userId) {
        return NextResponse.json({ error: 'Only the submitter can resubmit this expense.' }, { status: 403 });
      }
      if (row.commission_review_status !== 'rejected') {
        return NextResponse.json({ error: 'Only rejected expenses can be resubmitted.' }, { status: 400 });
      }
      const { data: created, error: createErr } = await admin
        .from('admin_expenses')
        .insert({
          owner_id: userId,
          merchant: row.merchant,
          customer_id: null,
          customer_name: null,
          customer_agent: null,
          commission_customer_ids: [],
          category: row.category,
          amount: row.amount,
          spent_on: row.spent_on,
          note: row.note,
          receipt_storage_path: row.receipt_storage_path,
          pull_from_commission: false,
          queued_for_commission: true,
          commission_period: null,
          commission_target_period: null,
          commission_review_status: 'pending',
          resubmitted_from_id: row.id,
          status: 'logged',
        })
        .select('*')
        .single();
      if (createErr) {
        const upSchemaErr = schemaErrorResponse(createErr.message);
        if (upSchemaErr) return upSchemaErr;
        return NextResponse.json({ error: createErr.message }, { status: 500 });
      }
      return NextResponse.json({ expense: created });
    }

    const reviewPeriod = String(body.commissionPeriod ?? row.commission_period ?? '').trim();
    if ((body.decision === 'include' || body.decision === 'reject' || body.decision === 'defer') && !reviewPeriod) {
      return NextResponse.json({ error: 'Commission period is required for review.' }, { status: 400 });
    }

    const customers = Array.isArray(body.customers) ? body.customers.filter((c) => c?.id) : null;
    const primaryCustomer = customers?.[0] ?? null;

    const update: Record<string, unknown> = {};
    if (body.allocationType !== undefined) update.commission_allocation_type = body.allocationType;
    if (customers) {
      update.commission_customer_ids = customers;
      update.customer_id = primaryCustomer?.id ?? null;
      update.customer_name = primaryCustomer?.name ?? null;
      update.customer_agent = primaryCustomer?.agent ?? null;
    } else {
      if (body.customerId !== undefined) update.customer_id = body.customerId || null;
      if (body.customerName !== undefined) update.customer_name = body.customerName || null;
      if (body.customerAgent !== undefined) update.customer_agent = body.customerAgent || null;
    }
    if (body.commissionAgentId !== undefined) update.commission_agent_id = body.commissionAgentId || null;
    if (body.deductionNote !== undefined) update.commission_deduction_note = body.deductionNote || null;
    if (body.chargeMode !== undefined) update.commission_charge_mode = body.chargeMode;
    if (body.chargeTierRate !== undefined) update.commission_charge_tier_rate = body.chargeTierRate;
    if (body.chargeAmount !== undefined) update.commission_charge_amount = body.chargeAmount;
    if (body.targetPeriod !== undefined) update.commission_target_period = body.targetPeriod || null;
    if (body.internalSplits !== undefined) {
      update.commission_internal_splits = body.internalSplits;
    }
    if (body.reimburseProfileId !== undefined) {
      update.commission_reimburse_profile_id = body.reimburseProfileId || null;
    }

    const allocationType =
      (body.allocationType ?? row.commission_allocation_type) as
        | 'customer'
        | 'agent_fee'
        | 'internal_reimburse'
        | 'internal_partner'
        | 'charge_and_reimburse'
        | null;
    const fromRowCustomers = parseCustomerIds(row.commission_customer_ids);
    const resolvedCustomers =
      customers
      ?? (fromRowCustomers.length
        ? fromRowCustomers
        : row.customer_id
          ? [{ id: row.customer_id, name: row.customer_name ?? '', agent: row.customer_agent ?? undefined }]
          : []);
    const commissionAgentId =
      body.commissionAgentId !== undefined ? body.commissionAgentId : row.commission_agent_id;
    const deductionNote =
      body.deductionNote !== undefined ? body.deductionNote : row.commission_deduction_note;
    const chargeMode = body.chargeMode ?? row.commission_charge_mode ?? 'full';
    const chargeTierRate =
      body.chargeTierRate !== undefined ? body.chargeTierRate : row.commission_charge_tier_rate;
    const chargeAmount =
      body.chargeAmount !== undefined ? body.chargeAmount : row.commission_charge_amount;
    const internalSplits =
      body.internalSplits !== undefined
        ? body.internalSplits
        : parseExpensePartnerSplits(row.commission_internal_splits);
    const reimburseProfileId =
      body.reimburseProfileId !== undefined
        ? body.reimburseProfileId
        : row.commission_reimburse_profile_id ?? row.owner_id;

    if (body.decision === 'include') {
      if (allocationType === 'customer') {
        if (!resolvedCustomers.length || !commissionAgentId) {
          return NextResponse.json(
            { error: 'Select at least one customer (with agent) before including.' },
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
        if (chargeMode === 'tier_percent' && (!(Number(chargeTierRate) > 0) || chargeAmount == null)) {
          return NextResponse.json(
            { error: 'Select a commission tier to charge a partial agent fee.' },
            { status: 400 },
          );
        }
      } else if (allocationType === 'internal_reimburse') {
        if (!row.owner_id) {
          return NextResponse.json(
            { error: 'Internal reimbursement requires an expense submitter.' },
            { status: 400 },
          );
        }
        const reimburseAmt = chargeMode === 'full'
          ? Math.abs(Number(row.amount) || 0)
          : Number(chargeAmount);
        if (!(reimburseAmt > 0)) {
          return NextResponse.json(
            { error: 'Enter a reimbursement amount greater than zero.' },
            { status: 400 },
          );
        }
        update.commission_charge_amount = reimburseAmt;
      } else if (allocationType === 'charge_and_reimburse') {
        if (!commissionAgentId) {
          return NextResponse.json(
            { error: 'Charge & reimburse requires an agent to charge.' },
            { status: 400 },
          );
        }
        if (!reimburseProfileId) {
          return NextResponse.json(
            { error: 'Charge & reimburse requires someone to reimburse.' },
            { status: 400 },
          );
        }
        update.commission_reimburse_profile_id = reimburseProfileId;
        update.commission_charge_amount = Math.abs(Number(row.amount) || 0);
      } else if (allocationType === 'internal_partner') {
        const activeSplits = (internalSplits ?? []).filter((s) => s.profileId && s.percent > 0);
        if (!activeSplits.length) {
          return NextResponse.json(
            { error: 'Select at least one partner with a split % for this expense.' },
            { status: 400 },
          );
        }
        update.commission_internal_splits = activeSplits;
        update.commission_charge_amount = Math.abs(Number(row.amount) || 0);
      } else {
        return NextResponse.json(
          { error: 'Choose an allocation type before including.' },
          { status: 400 },
        );
      }
      update.commission_review_status = 'included';
      update.commission_rejection_note = null;
      update.commission_period = reviewPeriod;
      update.commission_target_period = body.targetPeriod || reviewPeriod;
      update.commission_charge_mode = chargeMode;
      if (chargeMode === 'full') {
        update.commission_charge_tier_rate = null;
        update.commission_charge_amount = Math.abs(Number(row.amount) || 0);
      }
    } else if (body.decision === 'reject') {
      const rejectionNote = String(body.rejectionNote ?? '').trim();
      if (!rejectionNote) {
        return NextResponse.json({ error: 'A rejection note is required.' }, { status: 400 });
      }
      update.commission_review_status = 'rejected';
      update.commission_rejection_note = rejectionNote;
      update.commission_period = reviewPeriod;
      update.queued_for_commission = false;
    } else if (body.decision === 'defer') {
      update.commission_review_status = 'deferred';
      update.commission_period = reviewPeriod;
      update.commission_target_period = body.targetPeriod || null;
      update.queued_for_commission = true;
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
    const [withOwner] = await attachOwnerNames(admin, [updated as AdminExpense]);
    return NextResponse.json({ expense: withOwner });
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
