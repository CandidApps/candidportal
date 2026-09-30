'use client';

import { useEffect, useState } from 'react';
import type {
  MemberCashbackLedgerStatus,
  MemberCashbackSummary,
} from '@/lib/services/member-cashback';

export const CASHBACK_STATUS_LABEL: Record<MemberCashbackLedgerStatus, string> = {
  pending: 'Pending',
  earned: 'Earned',
  paid: 'Paid',
  deposited: 'Deposited',
};

export const CASHBACK_STATUS_HINT: Record<MemberCashbackLedgerStatus, string> = {
  pending: 'Waiting for your new service to go live',
  earned: 'Your service is live — cash back is accruing',
  paid: 'Sent to you',
  deposited: 'In your account',
};

export function formatCashbackMoney(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function cashbackTotalCount(s: MemberCashbackSummary | null): number {
  if (!s) return 0;
  return s.pendingCount + s.earnedCount + s.paidCount + (s.depositedCount ?? 0);
}

/** Pending + earned monthly (what's actively accruing). */
export function cashbackActiveMonthly(s: MemberCashbackSummary | null): number {
  if (!s) return 0;
  return s.pendingMonthly + s.earnedMonthly;
}

export function useMemberCashbackSummary(customerId: string | null | undefined): {
  summary: MemberCashbackSummary | null;
  loading: boolean;
} {
  const [summary, setSummary] = useState<MemberCashbackSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetch('/api/portal/cashback-summary')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { summary?: MemberCashbackSummary | null } | null) => {
        if (!cancelled) setSummary(data?.summary ?? null);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  return { summary, loading };
}
