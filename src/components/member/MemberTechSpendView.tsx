'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { AppIcon } from '@/components/AppIcon';
import { TECH_CATEGORY_LABELS, type TechSpendCategory } from '@/lib/plaid/categorize';
import {
  ensurePortalApiCustomerCookie,
  ensurePortalPreviewSession,
  getPortalSessionScope,
  syncPortalPreviewCookieFromScope,
} from '@/lib/portal-access';

function scopedCustomerId(propCustomerId?: string | null): string | null {
  const fromProp = propCustomerId?.trim();
  if (fromProp) return fromProp;
  if (typeof window === 'undefined') return null;
  ensurePortalPreviewSession();
  return getPortalSessionScope()?.customerId?.trim() || null;
}

type PlaidItem = {
  id: string;
  institution_name: string | null;
  status: string;
  last_synced_at: string | null;
  connected_at: string;
  error_message: string | null;
};

type PlaidAccount = {
  id: string;
  item_row_id: string;
  name: string | null;
  official_name: string | null;
  mask: string | null;
  type: string | null;
  subtype: string | null;
};

type PlaidTxn = {
  id: string;
  amount: number;
  date: string;
  name: string | null;
  merchant_name: string | null;
  pending: boolean;
  tech_category: string | null;
  candid_related: boolean | null;
  matched_service_hint: string | null;
};

type Summary = {
  techTotal: number;
  txnCount: number;
  byCategory: Array<{ category: string; label: string; total: number }>;
};

function money(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function ConnectButton({
  onLinked,
  disabled,
  customerId,
}: {
  onLinked: () => void;
  disabled?: boolean;
  customerId?: string | null;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [fetchingToken, setFetchingToken] = useState(false);
  const [exchanging, setExchanging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // If the user clicks while the token is still loading, open as soon as ready.
  const openWhenReadyRef = useRef(false);

  const fetchLinkToken = useCallback(async (): Promise<string | null> => {
    setError(null);
    setFetchingToken(true);
    try {
      ensurePortalPreviewSession();
      syncPortalPreviewCookieFromScope();
      const scopedId = scopedCustomerId(customerId);
      ensurePortalApiCustomerCookie(scopedId);
      if (!scopedId) {
        throw new Error(
          'No portal customer is linked to this login. Exit and use Login as customer again, or enable portal access on a contact for this account.',
        );
      }
      const res = await fetch('/api/portal/plaid/link-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: scopedId }),
      });
      const data = (await res.json()) as { linkToken?: string; error?: string };
      if (!res.ok || !data.linkToken) throw new Error(data.error ?? 'Could not start Plaid Link');
      setToken(data.linkToken);
      return data.linkToken;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start bank connection');
      setToken(null);
      openWhenReadyRef.current = false;
      return null;
    } finally {
      setFetchingToken(false);
    }
  }, [customerId]);

  // Prefetch so the click can open Link inside the user-gesture (avoids popup blockers).
  useEffect(() => {
    if (disabled) return;
    if (!scopedCustomerId(customerId)) {
      setError(
        'No portal customer is linked. Exit customer view and use Login as customer again.',
      );
      return;
    }
    void fetchLinkToken();
  }, [disabled, fetchLinkToken, customerId]);

  const { open, ready, error: linkError } = usePlaidLink({
    token,
    onSuccess: async (publicToken, metadata) => {
      setExchanging(true);
      setError(null);
      openWhenReadyRef.current = false;
      try {
        const scopedId = scopedCustomerId(customerId);
        ensurePortalApiCustomerCookie(scopedId);
        const res = await fetch('/api/portal/plaid/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            publicToken,
            customerId: scopedId,
            institution: metadata.institution
              ? {
                  institution_id: metadata.institution.institution_id,
                  name: metadata.institution.name,
                }
              : undefined,
          }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? 'Could not save connection');
        setToken(null);
        onLinked();
        // Warm a fresh token for a second connection.
        void fetchLinkToken();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Connection failed');
        void fetchLinkToken();
      } finally {
        setExchanging(false);
      }
    },
    onExit: () => {
      openWhenReadyRef.current = false;
      setExchanging(false);
      // Link tokens are single-use after exit; mint a fresh one.
      setToken(null);
      void fetchLinkToken();
    },
  });

  useEffect(() => {
    if (linkError) {
      setError(
        (linkError as ErrorEvent).message ||
          'Plaid Link failed to load. Check network access to cdn.plaid.com and try again.',
      );
    }
  }, [linkError]);

  useEffect(() => {
    if (!openWhenReadyRef.current || !token || !ready) return;
    openWhenReadyRef.current = false;
    open();
  }, [token, ready, open]);

  const onClickConnect = () => {
    setError(null);
    if (ready && token) {
      open();
      return;
    }
    // Token still loading / was cleared — open once Plaid reports ready.
    openWhenReadyRef.current = true;
    if (!fetchingToken && !token) void fetchLinkToken();
  };

  const busy = fetchingToken || exchanging;
  const missingCustomer = !scopedCustomerId(customerId);

  return (
    <div>
      <button
        type="button"
        className="admin-ticket-btn primary"
        disabled={disabled || exchanging || missingCustomer}
        onClick={onClickConnect}
      >
        {exchanging ? 'Saving…' : busy && !ready ? 'Preparing…' : 'Connect bank or card'}
      </button>
      {error && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--red)' }}>{error}</div>
      )}
    </div>
  );
}

export function MemberTechSpendView({ customerId = null }: { customerId?: string | null }) {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [items, setItems] = useState<PlaidItem[]>([]);
  const [accounts, setAccounts] = useState<PlaidAccount[]>([]);
  const [transactions, setTransactions] = useState<PlaidTxn[]>([]);
  const [summary, setSummary] = useState<Summary>({ techTotal: 0, txnCount: 0, byCategory: [] });
  const [filter, setFilter] = useState<'tech' | 'all'>('tech');
  const [error, setError] = useState<string | null>(null);
  const resolvedCustomerId = scopedCustomerId(customerId);

  useEffect(() => {
    ensurePortalPreviewSession();
    syncPortalPreviewCookieFromScope();
    ensurePortalApiCustomerCookie(scopedCustomerId(customerId));
  }, [customerId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      ensurePortalPreviewSession();
      syncPortalPreviewCookieFromScope();
      const scopedId = scopedCustomerId(customerId);
      ensurePortalApiCustomerCookie(scopedId);
      if (!scopedId) {
        setConfigured(true);
        setItems([]);
        setAccounts([]);
        setTransactions([]);
        setSummary({ techTotal: 0, txnCount: 0, byCategory: [] });
        setError(
          'No portal customer is linked. Exit and use Login as customer again, or sign in with a portal-enabled contact.',
        );
        return;
      }
      const qs = new URLSearchParams({ days: '90', customerId: scopedId });
      const res = await fetch(`/api/portal/plaid/transactions?${qs.toString()}`);
      const data = (await res.json()) as {
        configured?: boolean;
        items?: PlaidItem[];
        accounts?: PlaidAccount[];
        transactions?: PlaidTxn[];
        summary?: Summary;
        error?: string;
        unresolvedCustomer?: boolean;
      };
      if (!res.ok) throw new Error(data.error ?? 'Failed to load spend data');
      if (data.unresolvedCustomer) {
        setConfigured(data.configured !== false);
        setItems([]);
        setAccounts([]);
        setTransactions([]);
        setSummary({ techTotal: 0, txnCount: 0, byCategory: [] });
        setError(
          'Could not resolve this customer for Tech Spend. Exit and use Login as customer again.',
        );
        return;
      }
      setConfigured(data.configured !== false);
      setItems(data.items ?? []);
      setAccounts(data.accounts ?? []);
      setTransactions(data.transactions ?? []);
      setSummary(data.summary ?? { techTotal: 0, txnCount: 0, byCategory: [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const syncNow = async () => {
    setSyncing(true);
    setError(null);
    try {
      const scopedId = scopedCustomerId(customerId);
      ensurePortalApiCustomerCookie(scopedId);
      const res = await fetch('/api/portal/plaid/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: scopedId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Sync failed');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const visibleTxns = useMemo(() => {
    if (filter === 'all') return transactions;
    return transactions.filter((t) => t.tech_category && t.tech_category !== 'non_tech');
  }, [transactions, filter]);

  if (loading) {
    return <p style={{ fontSize: 13, color: 'var(--gray)' }}>Loading tech spend…</p>;
  }

  return (
    <div className="tech-spend-view">
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <div className="card-title" style={{ marginBottom: 6 }}>Tech spend monitoring</div>
            <p style={{ fontSize: 13, color: 'var(--gray)', margin: 0, maxWidth: 520 }}>
              Connect corporate bank accounts and cards to surface IT, telecom, software, payments,
              and utility spend — both with Candid and outside it.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {items.length > 0 && (
              <button
                type="button"
                className="admin-ticket-btn"
                disabled={syncing || !configured}
                onClick={() => void syncNow()}
              >
                {syncing ? 'Syncing…' : 'Sync now'}
              </button>
            )}
            <ConnectButton
              onLinked={() => void refresh()}
              disabled={!configured || !resolvedCustomerId}
              customerId={resolvedCustomerId}
            />
          </div>
        </div>
        {!configured && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--amber)' }}>
            Plaid is not configured on this environment yet.
          </div>
        )}
        {error && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--red)' }}>{error}</div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--gray)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Tech spend (90d)
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, fontFamily: 'var(--font-mono)' }}>
            {money(summary.techTotal)}
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--gray)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Tech transactions
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>{summary.txnCount}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--gray)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Connected institutions
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>{items.length}</div>
        </div>
      </div>

      {summary.byCategory.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title" style={{ marginBottom: 12 }}>By category</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {summary.byCategory.map((row) => (
              <div key={row.category} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                <span>{row.label}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{money(row.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 12 }}>Connected accounts</div>
        {items.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--gray)', margin: 0 }}>
            No banks or cards connected yet. Use <strong>Connect bank or card</strong> to get started.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {items.map((item) => {
              const itemAccounts = accounts.filter((a) => a.item_row_id === item.id);
              return (
                <div
                  key={item.id}
                  style={{
                    border: '1px solid var(--gray-border)',
                    borderRadius: 10,
                    padding: 12,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14 }}>
                      <AppIcon name="card" size={14} />
                      {item.institution_name || 'Linked institution'}
                    </div>
                    <div style={{ fontSize: 11, color: item.status === 'active' ? 'var(--green)' : 'var(--amber)' }}>
                      {item.status}
                      {item.last_synced_at
                        ? ` · synced ${new Date(item.last_synced_at).toLocaleString()}`
                        : ''}
                    </div>
                  </div>
                  {item.error_message && (
                    <div style={{ marginTop: 6, fontSize: 12, color: 'var(--red)' }}>{item.error_message}</div>
                  )}
                  <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {itemAccounts.map((a) => (
                      <span
                        key={a.id}
                        style={{
                          fontSize: 12,
                          background: 'var(--surface-muted)',
                          border: '1px solid var(--gray-border)',
                          borderRadius: 8,
                          padding: '4px 8px',
                        }}
                      >
                        {a.name || a.official_name || a.type}
                        {a.mask ? ` ••${a.mask}` : ''}
                        {a.subtype ? ` (${a.subtype})` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <div className="card-title" style={{ margin: 0 }}>Recent activity</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className={`admin-ticket-btn${filter === 'tech' ? ' primary' : ''}`}
              onClick={() => setFilter('tech')}
            >
              Tech only
            </button>
            <button
              type="button"
              className={`admin-ticket-btn${filter === 'all' ? ' primary' : ''}`}
              onClick={() => setFilter('all')}
            >
              All
            </button>
          </div>
        </div>
        {visibleTxns.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--gray)', margin: 0 }}>
            {items.length ? 'No matching transactions in the last 90 days yet.' : 'Connect an account to see spend.'}
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-mini-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Merchant</th>
                  <th>Category</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {visibleTxns.map((t) => (
                  <tr key={t.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{t.date}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{t.merchant_name || t.name || '—'}</div>
                      {t.matched_service_hint && (
                        <div style={{ fontSize: 11, color: 'var(--gray)' }}>{t.matched_service_hint}</div>
                      )}
                      {t.pending && (
                        <div style={{ fontSize: 10, color: 'var(--amber)', fontWeight: 700 }}>PENDING</div>
                      )}
                    </td>
                    <td>
                      {TECH_CATEGORY_LABELS[(t.tech_category as TechSpendCategory) ?? 'non_tech'] ??
                        t.tech_category ??
                        '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {money(Math.abs(Number(t.amount) || 0))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default MemberTechSpendView;
