'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { AppIcon } from '@/components/AppIcon';
import { SupplierLogo } from '@/components/SupplierLogo';
import { TECH_CATEGORY_LABELS, type TechSpendCategory } from '@/lib/plaid/categorize';
import { buildTechSpendFlags, type TechSpendFlag } from '@/lib/plaid/spend-flags';
import {
  ensurePortalApiCustomerCookie,
  ensurePortalPreviewSession,
  getPortalSessionScope,
  syncPortalPreviewCookieFromScope,
} from '@/lib/portal-access';
import type { ServiceCardModel } from '@/lib/services/account-services';

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
  techMonthly?: number;
  techYearly?: number;
  txnCount: number;
  byCategory: Array<{
    category: string;
    label: string;
    total: number;
    monthly?: number;
    yearly?: number;
  }>;
};

function money(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

const FETCH_TIMEOUT_MS = 20_000;

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Request timed out — refresh the page and try again.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function requestLinkToken(customerId?: string | null): Promise<string> {
  ensurePortalPreviewSession();
  syncPortalPreviewCookieFromScope();
  const scopedId = scopedCustomerId(customerId);
  ensurePortalApiCustomerCookie(scopedId);
  const res = await fetchWithTimeout('/api/portal/plaid/link-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerId: scopedId ?? undefined }),
  });
  const data = (await res.json()) as { linkToken?: string; error?: string };
  if (!res.ok || !data.linkToken) {
    throw new Error(data.error ?? 'Could not start Plaid Link');
  }
  return data.linkToken;
}

function ConnectButton({
  onLinked,
  customerId,
  configured,
  hasConnection,
}: {
  onLinked: () => void;
  customerId?: string | null;
  configured: boolean;
  hasConnection: boolean;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [exchanging, setExchanging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onLinkedRef = useRef(onLinked);
  const customerIdRef = useRef(customerId);
  const openedByUserRef = useRef(false);
  const prefetchStartedRef = useRef(false);

  useEffect(() => {
    onLinkedRef.current = onLinked;
  }, [onLinked]);

  useEffect(() => {
    customerIdRef.current = customerId;
  }, [customerId]);

  const mintToken = useCallback(async () => {
    if (!configured) return null;
    setPreparing(true);
    setError(null);
    try {
      const linkToken = await requestLinkToken(customerIdRef.current);
      setToken(linkToken);
      return linkToken;
    } catch (err) {
      setToken(null);
      setError(err instanceof Error ? err.message : 'Could not start bank connection');
      return null;
    } finally {
      setPreparing(false);
    }
  }, [configured]);

  // Prefetch once for first connect. After they already have a bank linked, wait
  // until they click so the toolbar doesn't sit on “Preparing…” forever.
  useEffect(() => {
    if (!configured || hasConnection || prefetchStartedRef.current) return;
    prefetchStartedRef.current = true;
    let cancelled = false;
    void (async () => {
      setPreparing(true);
      setError(null);
      try {
        const linkToken = await requestLinkToken(customerId);
        if (!cancelled) setToken(linkToken);
      } catch (err) {
        if (!cancelled) {
          setToken(null);
          setError(err instanceof Error ? err.message : 'Could not start bank connection');
        }
      } finally {
        if (!cancelled) setPreparing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, customerId, hasConnection]);

  const { open, ready, error: linkError } = usePlaidLink({
    token,
    onSuccess: async (publicToken, metadata) => {
      openedByUserRef.current = false;
      setExchanging(true);
      setError(null);
      try {
        const scopedId = scopedCustomerId(customerIdRef.current);
        ensurePortalApiCustomerCookie(scopedId);
        const res = await fetchWithTimeout('/api/portal/plaid/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            publicToken,
            customerId: scopedId ?? undefined,
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
        // Do not remint immediately — keeps the UI calm after a successful link.
        setToken(null);
        onLinkedRef.current();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Connection failed');
      } finally {
        setExchanging(false);
      }
    },
    onExit: () => {
      if (!openedByUserRef.current) return;
      openedByUserRef.current = false;
      setToken(null);
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

  const onClickConnect = () => {
    setError(null);
    if (!configured) {
      setError('Plaid is not configured on this environment yet.');
      return;
    }
    if (ready && token) {
      openedByUserRef.current = true;
      open();
      return;
    }
    if (!preparing) void mintToken();
  };

  const connectLabel = hasConnection ? 'Add another account' : 'Connect bank or card';
  const label = exchanging
    ? 'Saving…'
    : preparing
      ? 'Preparing…'
      : token && !ready
        ? 'Almost ready…'
        : connectLabel;

  const canOpen = Boolean(ready && token);
  const busy = exchanging || preparing;

  return (
    <div>
      <button
        type="button"
        className="admin-ticket-btn primary"
        disabled={!configured || busy || (Boolean(token) && !ready)}
        onClick={onClickConnect}
        title={canOpen ? 'Open Plaid Link' : preparing ? 'Preparing Plaid…' : 'Prepare connection'}
      >
        {label}
      </button>
      {error && <div className="tech-spend-inline-error">{error}</div>}
    </div>
  );
}

function FlagCard({
  flag,
  onReviewBill,
  onFindSolutions,
  onSubmitReview,
}: {
  flag: TechSpendFlag;
  onReviewBill?: (flag: TechSpendFlag) => void;
  onFindSolutions?: () => void;
  onSubmitReview?: (flag: TechSpendFlag) => void;
}) {
  return (
    <div className={`tech-spend-flag tech-spend-flag--${flag.severity}`}>
      <div className="tech-spend-flag-head">
        <span className={`tech-spend-flag-sev tech-spend-flag-sev--${flag.severity}`}>
          {flag.severity === 'high' ? 'Action needed' : flag.severity === 'medium' ? 'Review' : 'Opportunity'}
        </span>
        {flag.categoryLabel && <span className="tech-spend-flag-cat">{flag.categoryLabel}</span>}
      </div>
      <div className="tech-spend-flag-vendor">
        <SupplierLogo vendor={flag.vendorLabel} size={32} variant="row" />
        <div className="tech-spend-flag-title">{flag.title}</div>
      </div>
      <p className="tech-spend-flag-detail">{flag.detail}</p>
      <div className="tech-spend-flag-metrics">
        {flag.contractMonthly != null && (
          <span>
            Contract <strong>{money(flag.contractMonthly)}</strong>/mo
          </span>
        )}
        {flag.priorMonthly != null && (
          <span>
            Prior 30d <strong>{money(flag.priorMonthly)}</strong>
          </span>
        )}
        <span>
          Last 30d <strong>{money(flag.observedMonthly)}</strong>
        </span>
        {flag.delta != null && flag.delta !== 0 && (
          <span className={flag.delta > 0 ? 'tech-spend-flag-delta' : 'tech-spend-flag-delta-down'}>
            {flag.delta > 0 ? '+' : ''}
            {money(flag.delta)}
          </span>
        )}
        {flag.savingsPct != null && flag.estimatedMonthlySavings != null && (
          <span className="tech-spend-flag-savings">
            ~{flag.savingsPct}% avg save · {money(flag.estimatedMonthlySavings)}/mo
          </span>
        )}
      </div>
      <div className="tech-spend-flag-actions">
        {flag.action === 'review_bill' && onReviewBill && (
          <button type="button" className="admin-ticket-btn primary" onClick={() => onReviewBill(flag)}>
            Flag for Candid / upload bill
          </button>
        )}
        {(flag.action === 'submit_review' || flag.action === 'review_services') && onSubmitReview && (
          <button type="button" className="admin-ticket-btn primary" onClick={() => onSubmitReview(flag)}>
            Submit to Candid for review
          </button>
        )}
        {(flag.action === 'find_solutions' || flag.action === 'submit_review') && onFindSolutions && (
          <button type="button" className="admin-ticket-btn" onClick={onFindSolutions}>
            Browse solutions
          </button>
        )}
      </div>
    </div>
  );
}

export function MemberTechSpendView({
  customerId = null,
  services = [],
  onFindSolutions,
  onReviewBillFlag,
  onSubmitReviewFlag,
}: {
  customerId?: string | null;
  services?: ServiceCardModel[];
  onFindSolutions?: () => void;
  onReviewBillFlag?: (flag: TechSpendFlag) => void;
  onSubmitReviewFlag?: (flag: TechSpendFlag) => void;
}) {
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [items, setItems] = useState<PlaidItem[]>([]);
  const [accounts, setAccounts] = useState<PlaidAccount[]>([]);
  const [transactions, setTransactions] = useState<PlaidTxn[]>([]);
  const [summary, setSummary] = useState<Summary>({
    techTotal: 0,
    techMonthly: 0,
    techYearly: 0,
    txnCount: 0,
    byCategory: [],
  });
  const [filter, setFilter] = useState<'tech' | 'all'>('tech');
  const [expandedInstitutions, setExpandedInstitutions] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const refreshSeqRef = useRef(0);
  const hasLoadedRef = useRef(false);
  const autoSyncedRef = useRef(false);
  const resolvedCustomerId = scopedCustomerId(customerId);

  useEffect(() => {
    ensurePortalPreviewSession();
    syncPortalPreviewCookieFromScope();
    ensurePortalApiCustomerCookie(scopedCustomerId(customerId));
  }, [customerId]);

  const refresh = useCallback(
    async (opts?: { soft?: boolean }) => {
      const soft = opts?.soft === true || hasLoadedRef.current;
      const seq = ++refreshSeqRef.current;
      if (soft) setRefreshing(true);
      else setInitialLoading(true);
      setError(null);
      try {
        ensurePortalPreviewSession();
        syncPortalPreviewCookieFromScope();
        const scopedId = scopedCustomerId(customerId);
        ensurePortalApiCustomerCookie(scopedId);
        const qs = new URLSearchParams({ days: '90' });
        if (scopedId) qs.set('customerId', scopedId);
        const res = await fetchWithTimeout(`/api/portal/plaid/transactions?${qs.toString()}`);
        const data = (await res.json()) as {
          configured?: boolean;
          items?: PlaidItem[];
          accounts?: PlaidAccount[];
          transactions?: PlaidTxn[];
          summary?: Summary;
          error?: string;
          unresolvedCustomer?: boolean;
        };
        if (seq !== refreshSeqRef.current) return;
        if (!res.ok) throw new Error(data.error ?? 'Failed to load spend data');
        if (data.unresolvedCustomer) {
          setConfigured(data.configured !== false);
          setItems([]);
          setAccounts([]);
          setTransactions([]);
          setSummary({ techTotal: 0, techMonthly: 0, techYearly: 0, txnCount: 0, byCategory: [] });
          setError(
            'Could not resolve this customer for Tech Spend. Exit and use Login as customer again, or sign in with a portal-enabled contact.',
          );
          return;
        }
        setConfigured(data.configured !== false);
        setItems(data.items ?? []);
        setAccounts(data.accounts ?? []);
        setTransactions(data.transactions ?? []);
        setSummary(
          data.summary ?? { techTotal: 0, techMonthly: 0, techYearly: 0, txnCount: 0, byCategory: [] },
        );
      } catch (err) {
        if (seq !== refreshSeqRef.current) return;
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (seq === refreshSeqRef.current) {
          hasLoadedRef.current = true;
          setInitialLoading(false);
          setRefreshing(false);
        }
      }
    },
    [customerId],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const scopedId = scopedCustomerId(customerId);
      ensurePortalApiCustomerCookie(scopedId);
      const res = await fetchWithTimeout('/api/portal/plaid/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: scopedId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Sync failed');
      await refresh({ soft: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }, [customerId, refresh]);

  // One quiet background sync after first connect so sandbox txns appear without
  // looking like the page is stuck loading.
  useEffect(() => {
    if (initialLoading || autoSyncedRef.current) return;
    if (items.length === 0) return;
    if (transactions.length > 0) {
      autoSyncedRef.current = true;
      return;
    }
    autoSyncedRef.current = true;
    void syncNow();
  }, [initialLoading, items.length, transactions.length, syncNow]);

  const flags = useMemo(
    () => buildTechSpendFlags(transactions, services),
    [transactions, services],
  );

  const visibleTxns = useMemo(() => {
    if (filter === 'all') return transactions;
    return transactions.filter((t) => t.tech_category && t.tech_category !== 'non_tech');
  }, [transactions, filter]);

  const categoryTotals = useMemo(() => {
    const monthly = summary.byCategory.reduce((sum, row) => sum + (row.monthly ?? 0), 0);
    const yearly = summary.byCategory.reduce((sum, row) => sum + (row.yearly ?? (row.monthly ?? 0) * 12), 0);
    return { monthly, yearly };
  }, [summary.byCategory]);

  const toggleInstitution = (id: string) => {
    setExpandedInstitutions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (initialLoading) {
    return (
      <div className="tech-spend-view">
        <p className="tech-spend-status">Loading tech spend…</p>
      </div>
    );
  }

  return (
    <div className="tech-spend-view">
      <div className="card tech-spend-card">
        <div className="card-body">
          <div className="tech-spend-hero">
            <div>
              <div className="card-title">Tech spend monitoring</div>
              <p className="tech-spend-lede">
                Think of Hank and Candid as your spend concierge — we watch bank &amp; card activity so you
                are not overcharged, flag month-over-month jumps, dispute surprises, and point you to
                solutions where Candid typically saves customers money (e.g. ~25% on phone bills).
              </p>
            </div>
            <div className="tech-spend-hero-actions">
              {items.length > 0 && (
                <button
                  type="button"
                  className="admin-ticket-btn"
                  disabled={syncing || !configured || refreshing}
                  onClick={() => void syncNow()}
                >
                  {syncing ? 'Syncing…' : 'Sync now'}
                </button>
              )}
              <ConnectButton
                onLinked={() => void refresh({ soft: true })}
                customerId={resolvedCustomerId}
                configured={configured}
                hasConnection={items.length > 0}
              />
            </div>
          </div>

          <div className="tech-spend-connected">
            <div className="tech-spend-connected-label">Connected accounts</div>
            {items.length === 0 ? (
              <p className="tech-spend-empty tech-spend-empty--tight">
                No banks or cards connected yet. Use <strong>Connect bank or card</strong> to get started.
              </p>
            ) : (
              <div className="tech-spend-inst-list">
                {items.map((item) => {
                  const itemAccounts = accounts.filter((a) => a.item_row_id === item.id);
                  const open = expandedInstitutions.has(item.id);
                  return (
                    <div key={item.id} className="tech-spend-inst">
                      <button
                        type="button"
                        className="tech-spend-inst-summary"
                        onClick={() => toggleInstitution(item.id)}
                        aria-expanded={open}
                      >
                        <AppIcon name="card" size={14} />
                        <span className="tech-spend-inst-name">
                          {item.institution_name || 'Linked institution'}
                        </span>
                        <span className="tech-spend-inst-meta">
                          {itemAccounts.length} account{itemAccounts.length === 1 ? '' : 's'}
                          {item.status === 'active' ? '' : ` · ${item.status}`}
                        </span>
                        <span className="tech-spend-inst-chevron" aria-hidden>
                          {open ? '▾' : '▸'}
                        </span>
                      </button>
                      {open && (
                        <div className="tech-spend-inst-body">
                          {item.error_message && (
                            <div className="tech-spend-inline-error">{item.error_message}</div>
                          )}
                          {item.last_synced_at && (
                            <div className="tech-spend-inst-sync">
                              Last synced {new Date(item.last_synced_at).toLocaleString()}
                            </div>
                          )}
                          <div className="tech-spend-account-chips">
                            {itemAccounts.map((a) => (
                              <span key={a.id} className="tech-spend-chip">
                                {a.name || a.official_name || a.type}
                                {a.mask ? ` ••${a.mask}` : ''}
                                {a.subtype ? ` (${a.subtype})` : ''}
                              </span>
                            ))}
                            {itemAccounts.length === 0 && (
                              <span className="tech-spend-empty tech-spend-empty--tight">
                                No account details yet — try Sync now.
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {(refreshing || syncing) && (
            <p className="tech-spend-status tech-spend-status--quiet">Updating transactions…</p>
          )}
          {!configured && (
            <div className="tech-spend-inline-warn">Plaid is not configured on this environment yet.</div>
          )}
          {error && <div className="tech-spend-inline-error">{error}</div>}
        </div>
      </div>

      <div className="tech-spend-kpis">
        <div className="card tech-spend-card">
          <div className="card-body tech-spend-kpi">
            <div className="tech-spend-kpi-label">Tech spend / mo</div>
            <div className="tech-spend-kpi-value">{money(summary.techMonthly ?? 0)}</div>
          </div>
        </div>
        <div className="card tech-spend-card">
          <div className="card-body tech-spend-kpi">
            <div className="tech-spend-kpi-label">Est. yearly</div>
            <div className="tech-spend-kpi-value">{money(summary.techYearly ?? (summary.techMonthly ?? 0) * 12)}</div>
          </div>
        </div>
        <div className="card tech-spend-card">
          <div className="card-body tech-spend-kpi">
            <div className="tech-spend-kpi-label">Last 90 days</div>
            <div className="tech-spend-kpi-value">{money(summary.techTotal)}</div>
          </div>
        </div>
        <div className="card tech-spend-card">
          <div className="card-body tech-spend-kpi">
            <div className="tech-spend-kpi-label">Flags</div>
            <div className="tech-spend-kpi-value">{flags.length}</div>
          </div>
        </div>
      </div>

      <div className="card tech-spend-card">
        <div className="card-body">
          <div className="card-title" style={{ marginBottom: 6 }}>
            Action flags
          </div>
          <p className="tech-spend-lede" style={{ marginBottom: 14 }}>
            Spikes vs contract, month-over-month flux by vendor, and Candid solution opportunities (with
            average savings) land here so you can submit for review, dispute a charge, or change services.
          </p>
          {flags.length === 0 ? (
            <p className="tech-spend-empty">
              {items.length === 0
                ? 'Connect a bank or card to start monitoring.'
                : transactions.length === 0
                  ? 'No transactions yet — try Sync now (sandbox data can take a moment).'
                  : 'No contract mismatches, spend flux, or orphan tech vendors right now. Looking good.'}
            </p>
          ) : (
            <div className="tech-spend-flag-list">
              {flags.map((flag) => (
                <FlagCard
                  key={flag.id}
                  flag={flag}
                  onReviewBill={onReviewBillFlag}
                  onFindSolutions={onFindSolutions}
                  onSubmitReview={onSubmitReviewFlag ?? onReviewBillFlag}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {summary.byCategory.length > 0 && (
        <div className="card tech-spend-card">
          <div className="card-body">
            <div className="card-title" style={{ marginBottom: 6 }}>
              By category
            </div>
            <p className="tech-spend-lede" style={{ marginBottom: 12 }}>
              Identified tech &amp; utility spend rolled up by category.
            </p>
            <div className="tech-spend-cat-list">
              <div className="tech-spend-cat-row tech-spend-cat-row--head">
                <span>Category</span>
                <span>Monthly</span>
                <span>Yearly</span>
                <span>90d</span>
              </div>
              {summary.byCategory.map((row) => {
                const monthly = row.monthly ?? 0;
                const yearly = row.yearly ?? monthly * 12;
                return (
                  <div key={row.category} className="tech-spend-cat-row">
                    <span>{row.label}</span>
                    <span className="tech-spend-mono">{money(monthly)}</span>
                    <span className="tech-spend-mono">{money(yearly)}</span>
                    <span className="tech-spend-mono">{money(row.total)}</span>
                  </div>
                );
              })}
              <div className="tech-spend-cat-row tech-spend-cat-row--total">
                <span>Total</span>
                <span className="tech-spend-mono">{money(categoryTotals.monthly)}</span>
                <span className="tech-spend-mono">{money(categoryTotals.yearly)}</span>
                <span className="tech-spend-mono">{money(summary.techTotal)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="card tech-spend-card">
        <div className="card-body">
          <div className="tech-spend-section-head">
            <div className="card-title" style={{ margin: 0 }}>
              Recent activity
            </div>
            <div className="tech-spend-filter">
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
            <p className="tech-spend-empty">
              {items.length
                ? 'No matching transactions in the last 90 days yet.'
                : 'Connect an account to see spend.'}
            </p>
          ) : (
            <div className="tech-spend-table-wrap">
              <table className="admin-mini-table tech-spend-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Merchant</th>
                    <th>Category</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTxns.map((t) => {
                    const merchant = t.merchant_name || t.name || '—';
                    return (
                      <tr key={t.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{t.date}</td>
                        <td>
                          <div className="tech-spend-merchant">
                            <SupplierLogo vendor={merchant === '—' ? null : merchant} size={28} variant="row" />
                            <div className="tech-spend-merchant-text">
                              <div style={{ fontWeight: 600 }}>{merchant}</div>
                              {t.matched_service_hint && (
                                <div className="tech-spend-txn-hint">{t.matched_service_hint}</div>
                              )}
                              {t.pending && <div className="tech-spend-pending">PENDING</div>}
                            </div>
                          </div>
                        </td>
                        <td>
                          {TECH_CATEGORY_LABELS[(t.tech_category as TechSpendCategory) ?? 'non_tech'] ??
                            t.tech_category ??
                            '—'}
                        </td>
                        <td className="tech-spend-mono" style={{ textAlign: 'right' }}>
                          {money(Math.abs(Number(t.amount) || 0))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MemberTechSpendView;
