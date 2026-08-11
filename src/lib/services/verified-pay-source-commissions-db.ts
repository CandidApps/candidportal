import type { SupabaseClient } from '@supabase/supabase-js';
import { canonicalPaySource, commissionSourceKey } from '@/lib/commission-partners';
import type { PaySourceVerifiedEntry } from '@/lib/commissions/verify-commissions-types';

type DbRow = {
  source_key: string;
  source_label: string;
  period: string;
  deposit_amount: number | string;
  lines: PaySourceVerifiedEntry['lines'] | null;
  verified_at: string;
};

function normalizeLines(lines: unknown): PaySourceVerifiedEntry['lines'] {
  if (!Array.isArray(lines)) return [];
  return lines
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
}

export function rowToPaySourceVerified(row: DbRow): PaySourceVerifiedEntry {
  return {
    sourceKey: commissionSourceKey(row.source_key),
    sourceLabel: canonicalPaySource(row.source_label || row.source_key),
    period: row.period,
    depositAmount: Number(row.deposit_amount) || 0,
    lines: normalizeLines(row.lines),
    verifiedAt: row.verified_at || new Date().toISOString(),
  };
}

export async function loadVerifiedPaySourceCommissions(
  admin: SupabaseClient,
): Promise<PaySourceVerifiedEntry[]> {
  const { data, error } = await admin
    .from('verified_pay_source_commissions')
    .select('source_key, source_label, period, deposit_amount, lines, verified_at')
    .order('verified_at', { ascending: false });

  if (error) throw new Error(error.message);

  return ((data as DbRow[] | null) ?? []).map(rowToPaySourceVerified);
}

export async function upsertVerifiedPaySourceCommission(
  admin: SupabaseClient,
  entry: PaySourceVerifiedEntry,
): Promise<void> {
  const sourceKey = commissionSourceKey(entry.sourceKey);
  const sourceLabel = canonicalPaySource(entry.sourceLabel || entry.sourceKey);
  const { error } = await admin.from('verified_pay_source_commissions').upsert(
    {
      source_key: sourceKey,
      source_label: sourceLabel,
      period: entry.period,
      deposit_amount: entry.depositAmount,
      lines: entry.lines,
      verified_at: entry.verifiedAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'source_key,period' },
  );
  if (error) throw new Error(error.message);
}
