import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { canonicalPaySource, commissionSourceKey } from '@/lib/commission-partners';
import type { PaySourceVerifiedEntry } from '@/lib/commissions/verify-commissions-types';
import {
  loadVerifiedPaySourceCommissions,
  upsertVerifiedPaySourceCommission,
} from '@/lib/services/verified-pay-source-commissions-db';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

function parseEntry(body: unknown): PaySourceVerifiedEntry | null {
  if (!body || typeof body !== 'object') return null;
  const raw = body as Record<string, unknown>;
  if (typeof raw.sourceKey !== 'string' || !raw.sourceKey.trim()) return null;
  if (typeof raw.period !== 'string' || !/^\d{4}-\d{2}$/.test(raw.period)) return null;
  if (!Array.isArray(raw.lines)) return null;

  const lines = raw.lines
    .map((line) => {
      if (!line || typeof line !== 'object') return null;
      const row = line as Record<string, unknown>;
      const dealUid = String(row.dealUid ?? '').trim();
      const merchant = String(row.merchant ?? '').trim();
      const amount = Number(row.amount);
      if (!dealUid || !Number.isFinite(amount)) return null;
      return { dealUid, merchant, amount };
    })
    .filter((line): line is PaySourceVerifiedEntry['lines'][number] => Boolean(line));

  return {
    sourceKey: commissionSourceKey(raw.sourceKey),
    sourceLabel: canonicalPaySource(
      typeof raw.sourceLabel === 'string' && raw.sourceLabel.trim()
        ? raw.sourceLabel
        : raw.sourceKey,
    ),
    period: raw.period,
    depositAmount: Number(raw.depositAmount) || 0,
    lines,
    verifiedAt:
      typeof raw.verifiedAt === 'string' && raw.verifiedAt
        ? raw.verifiedAt
        : new Date().toISOString(),
  };
}

export async function GET() {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const entries = await loadVerifiedPaySourceCommissions(admin);
    return NextResponse.json({ entries });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load verified pay-source commissions';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const entry = parseEntry(body);
  if (!entry) {
    return NextResponse.json({ error: 'Invalid verified pay-source payload' }, { status: 400 });
  }
  if (entry.lines.length === 0) {
    return NextResponse.json({ error: 'At least one line is required' }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    await upsertVerifiedPaySourceCommission(admin, entry);
    return NextResponse.json({ ok: true, entry });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save verified pay-source commissions';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
