import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import {
  deleteInternalDealSplit,
  loadInternalDealSplits,
  normalizeDealUid,
  upsertInternalDealSplit,
  type DealEmployeeSplit,
  type PartnerSplitShare,
} from '@/lib/services/internal-deal-splits-db';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const role = await getMyRole();
  if (role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const admin = createSupabaseAdminClient();
    const splits = await loadInternalDealSplits(admin);
    return NextResponse.json({ splits });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load deal splits';
    if (/internal_deal_splits/.test(message)) {
      return NextResponse.json({ splits: [], migrationRequired: true });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function parsePartnerSplits(raw: unknown): PartnerSplitShare[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const profileId = typeof row.profileId === 'string' ? row.profileId.trim() : '';
      const percent = typeof row.percent === 'number' ? row.percent : Number(row.percent);
      if (!profileId || !Number.isFinite(percent)) return null;
      return { profileId, percent: Math.min(100, Math.max(0, percent)) };
    })
    .filter((s): s is PartnerSplitShare => s != null);
}

function parseEmployeeSplits(raw: unknown): DealEmployeeSplit[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const profileId = typeof row.profileId === 'string' ? row.profileId.trim() : '';
      const percent = typeof row.percent === 'number' ? row.percent : Number(row.percent);
      if (!profileId || !Number.isFinite(percent)) return null;
      return { profileId, percent: Math.min(100, Math.max(0, percent)) };
    })
    .filter((s): s is DealEmployeeSplit => s != null);
}

export async function PUT(request: Request) {
  const role = await getMyRole();
  if (role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const dealUid = typeof raw.dealUid === 'string' ? raw.dealUid.trim() : '';
  if (!normalizeDealUid(dealUid)) {
    return NextResponse.json({ error: 'dealUid is required' }, { status: 400 });
  }

  const partnerSplits = parsePartnerSplits(raw.partnerSplits);
  const employeeSplits = parseEmployeeSplits(raw.employeeSplits);
  if (!partnerSplits.length && !employeeSplits.some((s) => s.percent > 0)) {
    return NextResponse.json(
      { error: 'Enter at least one partner or employee split.' },
      { status: 400 },
    );
  }

  try {
    const admin = createSupabaseAdminClient();
    await upsertInternalDealSplit(admin, {
      dealUid,
      label: typeof raw.label === 'string' ? raw.label.trim() : null,
      partnerSplits,
      employeeSplits,
    });
    const splits = await loadInternalDealSplits(admin);
    return NextResponse.json({ splits });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save deal split';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const role = await getMyRole();
  if (role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const dealUid = searchParams.get('dealUid')?.trim() ?? '';
  if (!normalizeDealUid(dealUid)) {
    return NextResponse.json({ error: 'dealUid is required' }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    await deleteInternalDealSplit(admin, dealUid);
    const splits = await loadInternalDealSplits(admin);
    return NextResponse.json({ splits });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete deal split';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
