import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { normalizeStoredManualImport, type StoredManualImport } from '@/lib/commissions/manual-import-batch';
import { SUPPLIER_IDS, type SupplierId } from '@/lib/commissions/supplier-config';
import {
  loadManualCommissionImports,
  upsertManualCommissionImport,
} from '@/lib/services/manual-commission-imports-db';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

function isSupplierId(value: unknown): value is SupplierId {
  return typeof value === 'string' && (SUPPLIER_IDS as string[]).includes(value);
}

function parseStoredManualImport(body: unknown): StoredManualImport | null {
  if (!body || typeof body !== 'object') return null;
  const raw = body as Record<string, unknown>;
  if (!isSupplierId(raw.supplier)) return null;
  if (typeof raw.period !== 'string' || !/^\d{4}-\d{2}$/.test(raw.period)) return null;
  if (typeof raw.amountField !== 'string' || !raw.amountField.trim()) return null;
  if (!Array.isArray(raw.rows)) return null;

  return normalizeStoredManualImport({
    supplier: raw.supplier,
    period: raw.period,
    amountField: raw.amountField,
    filename: typeof raw.filename === 'string' ? raw.filename : '',
    importedAt: typeof raw.importedAt === 'string' ? raw.importedAt : new Date().toISOString(),
    rows: raw.rows as Record<string, unknown>[],
  });
}

export async function GET() {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const imports = await loadManualCommissionImports(admin);
    return NextResponse.json({ imports });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load manual imports';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const entry = parseStoredManualImport(body);
  if (!entry) {
    return NextResponse.json({ error: 'Invalid manual import payload' }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    await upsertManualCommissionImport(admin, entry);
    return NextResponse.json({ ok: true, import: entry });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save manual import';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
